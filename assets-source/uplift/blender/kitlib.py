"""
Shared machinery for the game's Blender-authored kits.

Every asset script in this directory is the same shape: a palette, a handful of
builder functions that fill bmeshes, and a call to `run()`. Everything that is
true of *all* of them — the constraints the loader imposes, the export settings,
the self-measurement — lives here so the asset scripts stay readable as models
rather than as build systems.

────────────────────────────────────────────────────────────────────────────
What the game does with these files, and therefore what it constrains
────────────────────────────────────────────────────────────────────────────

`kitGeometry()` in src/ui/scene/uplift/upliftAssets.ts finds a node BY NAME,
merges every mesh beneath it into ONE BufferGeometry, and bakes each part's
material colour into a vertex-colour attribute. Consequences, all load-bearing:

  * Asset node names are an API. The TSX looks them up as strings; rename one
    and that part of the game silently draws nothing. Each script lists the
    names the game reads, and `build-ship.mjs` asserts they exist.
  * Only material BASE COLOUR survives. Roughness, metalness and textures are
    set on the shared material in code; the values here are for the .blend's
    own viewport.
  * Colours must be authored LINEAR (glTF baseColorFactor is linear, and three
    reads it straight into material.color). `srgb()` does that conversion so
    palettes can be written as the sRGB hex the rest of the kit uses.
  * mergeGeometries refuses a mixed attribute set, so EVERY mesh needs UVs and
    none may carry a colour attribute or tangents. UVs here are a deterministic
    box projection at a fixed metres-per-tile, which also keeps texel density
    even across parts — the atlas is grain, not decoration.
  * Flat shading throughout: these are faceted, low-poly kits, and a hull should
    read as folded plate rather than blown vinyl.

Orientation, and why EVERY OBJECT SITS AT IDENTITY. The loader poses parts in
the ASSET ROOT's frame, so whatever transform the root carries cancels out —
what reaches the game is each mesh's transform relative to the root, times its
mesh data. Blender's +Y-up export converts the vertex data as well as the node
transforms, so with every object left at identity and its geometry authored in
absolute coordinates, the conversion lands entirely in the vertex data,
survives the root-cancel, and the asset arrives up on +Y with nothing baked.

Put a rotation on the root empty and that stops being true: the root transform
is cancelled but the children's are not, and the model arrives on its side.
(Measured, not assumed — the build refused it at 17x fit skew.) So: author Z
up, keep object transforms at identity, and put position into the geometry. A
plain File -> Export -> glTF 2.0 with stock settings then produces exactly what
these scripts do.

Proportions. Call sites box-fit a model into a fixed envelope, NON-uniformly,
so absolute size is free but SHAPE is not: author to the envelope's own ratio
or be squashed into it. `run()` measures that and complains past 8%.
"""

import argparse
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

UV_METRES_PER_TILE = 2.5


# ————— Colour —————


def srgb(hex_value):
    """sRGB hex → linear RGB, the space glTF baseColorFactor is defined in."""
    out = []
    for shift in (16, 8, 0):
        c = ((hex_value >> shift) & 0xFF) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (out[0], out[1], out[2], 1.0)


_materials = {}


def mat(hex_value, name, roughness=0.5, metallic=0.6):
    """One Blender material per palette entry. Only base colour reaches the game."""
    key = (hex_value, name)
    if key in _materials:
        return _materials[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = srgb(hex_value)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    m.diffuse_color = srgb(hex_value)
    _materials[key] = m
    return m


# ————— Geometry verbs —————


def add_box(bm, center, size, rot=None):
    """An axis-aligned box, optionally rotated about its own centre."""
    cx, cy, cz = center
    sx, sy, sz = size
    verts = []
    for dz in (-0.5, 0.5):
        for dy in (-0.5, 0.5):
            for dx in (-0.5, 0.5):
                v = Vector((dx * sx, dy * sy, dz * sz))
                if rot is not None:
                    v = rot @ v
                verts.append(bm.verts.new((cx + v.x, cy + v.y, cz + v.z)))
    for quad in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1),
                 (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
        bm.faces.new([verts[i] for i in quad])
    return verts


def add_loft(bm, rings, cap_first=True, cap_last=True):
    """Bridge equal-length rings of points into a tube — the hull-building verb."""
    vs = [[bm.verts.new(p) for p in ring] for ring in rings]
    n = len(rings[0])
    for a, b in zip(vs, vs[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap_first:
        bm.faces.new(tuple(vs[0]))
    if cap_last:
        bm.faces.new(tuple(reversed(vs[-1])))
    return vs


def plate_profile(y, half_width, z0, z1, chamfer, cx=0.0):
    """A chamfered-corner rectangle across the model at station `y`.

    The chamfer is why a hull reads as folded plate under a hard light: eight
    points cost almost nothing and give every station four bevel facets.
    """
    c = min(chamfer, half_width * 0.9, (z1 - z0) * 0.45)
    return [
        (cx - half_width + c, y, z0), (cx + half_width - c, y, z0),
        (cx + half_width, y, z0 + c), (cx + half_width, y, z1 - c),
        (cx + half_width - c, y, z1), (cx - half_width + c, y, z1),
        (cx - half_width, y, z1 - c), (cx - half_width, y, z0 + c),
    ]


def add_tube(bm, p0, p1, r0, r1, segments=12, cap0=True, cap1=True, roll=0.0):
    """A cylinder/cone between two arbitrary points."""
    p0, p1 = Vector(p0), Vector(p1)
    axis = (p1 - p0).normalized()
    ref = Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))
    u = axis.cross(ref).normalized()
    v = axis.cross(u).normalized()
    rings = []
    for point, radius in ((p0, r0), (p1, r1)):
        rings.append([
            tuple(point + u * (math.cos(roll + 2 * math.pi * i / segments) * radius)
                  + v * (math.sin(roll + 2 * math.pi * i / segments) * radius))
            for i in range(segments)
        ])
    return add_loft(bm, rings, cap0, cap1)


def side_name(side):
    """Which beam a +/-1 X multiplier actually is.

    Authoring with the nose on -Y and up on +Z, the pilot's right hand — the
    STARBOARD side — is -X, not +X. Worth a helper because getting it backwards
    puts the red lamp on the green side, and because a .blend whose "port
    nacelle" is on the starboard beam is a small lie that outlives whoever
    wrote it.
    """
    return "starboard" if side < 0 else "port"


def wing_section(x, y_le, y_te, z_mid, thickness):
    """Six points of a wing rib: a flat-bottomed plank with a rounded entry."""
    chord = y_te - y_le
    t = thickness * 0.5
    return [
        (x, y_le, z_mid),
        (x, y_le + chord * 0.28, z_mid + t),
        (x, y_te - chord * 0.20, z_mid + t),
        (x, y_te, z_mid + t * 0.18),
        (x, y_te - chord * 0.20, z_mid - t),
        (x, y_le + chord * 0.28, z_mid - t),
    ]


def bevel(bm, amount, segments=1):
    """Break every hard edge. Small, but it is what catches a rim light.

    Costs 32 triangles on a box, so it is worth skipping below roughly a hand's
    width — at the distances these are drawn, nothing is returned for it.
    """
    if amount <= 0:
        return
    try:
        bmesh.ops.bevel(
            bm,
            geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
            offset=amount,
            offset_type="OFFSET",
            segments=segments,
            profile=0.5,
            affect="EDGES",
            clamp_overlap=True,
        )
    except (TypeError, RuntimeError) as exc:  # API drift must not lose the model
        print(f"  bevel skipped ({exc})")


def box_uvs(bm):
    """Deterministic box projection at a fixed metres-per-tile."""
    layer = bm.loops.layers.uv.verify()
    scale = 1.0 / UV_METRES_PER_TILE
    for face in bm.faces:
        n = face.normal
        axis = max(range(3), key=lambda i: abs(n[i]))
        for loop in face.loops:
            co = loop.vert.co
            if axis == 0:
                u, v = co.y, co.z
            elif axis == 1:
                u, v = co.x, co.z
            else:
                u, v = co.x, co.y
            loop[layer].uv = (u * scale, v * scale)


def motion_uvs(bm, weight, phase):
    """Bake a part's MOTION MASK into a second UV layer (glTF TEXCOORD_1).

    A creature cannot be animated the way Blender would normally do it: the
    loader merges every mesh under an asset into one static geometry and
    discards the hierarchy, so there is nothing left to key, and armatures
    would cost instancing besides. Instead the SHAPE is authored here and the
    MOTION is a vertex-stage function of this mask — which keeps a herd at one
    draw call and one shader.

        u = weight  how much this vertex is displaced, 0 (rigid) .. 1 (tip)
        v = phase   which limb it belongs to, as a turn: 0, 0.5 = opposed pair

    Weight is graded along the part rather than flat, so a wing bends from the
    shoulder instead of hinging off the body like a door.
    """
    layer = bm.loops.layers.uv.new("motion") if "motion" not in bm.loops.layers.uv else bm.loops.layers.uv["motion"]
    for face in bm.faces:
        for loop in face.loops:
            loop[layer].uv = (weight(loop.vert.co) if callable(weight) else weight, phase)


# ————— Assembly —————

_roots = {}
_parts = []
_asset_parts = {}
_current = None
_motion_layer = False


def current_name():
    """The asset currently being filled — for naming parts uniquely."""
    return _current.name if _current else "?"


def asset(name, extras=None):
    """Open a named asset root. Every `part()` after this hangs off it.

    One .blend may hold several — the settlement and prop kits are a dozen
    assets in one file, each fetched by name.
    """
    global _current
    root = bpy.data.objects.new(name, None)
    root.empty_display_size = 1.5
    root["assetId"] = name
    for key, value in (extras or {}).items():
        root[key] = value
    bpy.context.scene.collection.objects.link(root)
    _roots[name] = root
    _asset_parts[name] = []
    _current = root
    return root


def part(name, material, bevel_amount=0.0, motion=None):
    """Start a mesh. Returns (bmesh, finish) — fill the first, call the second.

    `motion` is (weight, phase) for an animated kit; weight may be a callable
    taking the vertex position, for a graded mask. See motion_uvs().
    """
    bm = bmesh.new()
    return bm, (lambda: _emit(name, bm, material, bevel_amount, motion))


def _emit(name, bm, material, bevel_amount, motion=None):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bevel(bm, bevel_amount)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    box_uvs(bm)
    # Uniform attributes or mergeGeometries returns null, so once any part in a
    # kit carries a motion mask, every part must — rigid ones at weight 0.
    if _motion_layer:
        motion_uvs(bm, *(motion or (0.0, 0.0)))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material)
    for poly in me.polygons:
        poly.use_smooth = False
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = _current  # identity local transform: see the orientation note
    _parts.append(obj)
    _asset_parts[_current.name].append(obj)
    return obj


# ————— Measurement and export —————


def triangles(parts=None):
    total = 0
    for obj in parts or _parts:
        obj.data.calc_loop_triangles()
        total += len(obj.data.loop_triangles)
    return total


def bounds(parts=None):
    lo = [float("inf")] * 3
    hi = [float("-inf")] * 3
    for obj in parts or _parts:
        for v in obj.data.vertices:
            for i in range(3):
                lo[i] = min(lo[i], v.co[i])
                hi[i] = max(hi[i], v.co[i])
    return lo, hi


def _report(lo, hi, fit_min, fit_max):
    """Measure the authored silhouette against the envelope it must fit."""
    size = [hi[i] - lo[i] for i in range(3)]
    print(f"  bounds     x {lo[0]:+.2f}..{hi[0]:+.2f}  "
          f"y {lo[1]:+.2f}..{hi[1]:+.2f}  z {lo[2]:+.2f}..{hi[2]:+.2f}")
    print(f"  size       {size[0]:.2f} w x {size[2]:.2f} h x {size[1]:.2f} l")
    if not fit_min:
        return
    want = [fit_max[i] - fit_min[i] for i in range(3)]
    # Blender X→fit X, Blender Z→fit Y (up), Blender Y→fit Z (length).
    got_ratio = (size[0] / size[1], size[2] / size[1])
    want_ratio = (want[0] / want[2], want[1] / want[2])
    print(f"  authored   {got_ratio[0]:.3f} : {got_ratio[1]:.3f} : 1")
    print(f"  envelope   {want_ratio[0]:.3f} : {want_ratio[1]:.3f} : 1")
    for label, got, want_v in (("width", got_ratio[0], want_ratio[0]),
                               ("height", got_ratio[1], want_ratio[1])):
        skew = want_v / got - 1.0
        flag = "  <-- distorts" if abs(skew) > 0.08 else ""
        print(f"  fit {label:<7}{skew:+.1%}{flag}")


def run(label, build, fit_min=None, fit_max=None, tri_budget=4000, per_asset=None,
        motion=False):
    """Reset the scene, build, measure, and write whatever was asked for.

    Called at the bottom of every asset script. Args after `--`:
    `--blend <path>` and/or `--glb <path>`.
    """
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--blend")
    ap.add_argument("--glb")
    args = ap.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    global _motion_layer
    _motion_layer = motion
    _materials.clear()
    _roots.clear()
    _parts.clear()
    _asset_parts.clear()

    build()

    tris = triangles()
    lo, hi = bounds()
    print(f"{label}: {len(_roots)} asset(s), {len(_parts)} parts, "
          f"{tris} triangles (budget {tri_budget})")
    _report(lo, hi, fit_min, fit_max)
    if tris > tri_budget:
        print(f"  OVER BUDGET by {tris - tri_budget}")

    # A multi-asset kit is instanced per asset, so the budget that matters is
    # the per-asset one, not the file total.
    if per_asset:
        for name, objs in _asset_parts.items():
            n = triangles(objs)
            flag = f"  OVER by {n - per_asset}" if n > per_asset else ""
            print(f"  asset {name:<16}{len(objs):>3} parts  {n:>4} tris{flag}")

    if args.blend:
        bpy.ops.wm.save_as_mainfile(filepath=bpy.path.abspath(args.blend))
        print(f"  wrote {args.blend}")

    if args.glb:
        # Stock settings on purpose: the .blend must export correctly from the
        # GUI too, so nothing here may rely on an option the File -> Export
        # dialog cannot do. The orientation is authored, not baked.
        bpy.ops.export_scene.gltf(
            filepath=bpy.path.abspath(args.glb),
            export_format="GLB",
            export_yup=True,
            export_apply=True,
            export_texcoords=True,
            export_normals=True,
            export_tangents=False,   # merge needs a uniform attribute set
            export_materials="EXPORT",
            export_extras=True,
            export_cameras=False,
            export_lights=False,
            export_animations=False,
        )
        print(f"  wrote {args.glb}")
