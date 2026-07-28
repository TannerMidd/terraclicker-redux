"""
The company runabout — ASSET_UPLIFT.md 3.1, authored in Blender.

Run headless:

    blender --background --factory-startup --python runabout.py -- \
        --blend runabout.blend --glb ../../../public/assets/uplift/meshes/ships/runabout.glb

or, from the repo root, `npm run assets:ship`.

────────────────────────────────────────────────────────────────────────────
What the game does with this file, and therefore what it constrains
────────────────────────────────────────────────────────────────────────────

`kitGeometry()` in src/ui/scene/uplift/upliftAssets.ts finds a node BY NAME,
merges every mesh beneath it into ONE BufferGeometry, and bakes each part's
material colour into a vertex-colour attribute. Consequences, all load-bearing:

  * Two names are read by the game and may not be renamed here:
    `runabout` (the whole ship) and `hull-nose` (the prow alone — RunaboutHull
    puts it in front of the cockpit camera as the pilot's scale reference).
  * Only material BASE COLOUR survives. Roughness, metalness and textures are
    set on the shared `shipMaterial()`; the values below are for the .blend's
    own viewport, not for the game.
  * Colours must be authored LINEAR (glTF baseColorFactor is linear, and three
    reads it straight into material.color). `srgb()` does that conversion so
    the palette can be written as the sRGB hex the rest of the kit uses.
  * mergeGeometries refuses a mixed attribute set, so EVERY mesh needs UVs and
    none may carry a colour attribute or tangents. UVs here are a deterministic
    box projection at a fixed metres-per-tile, which also keeps texel density
    even across parts — the atlas is grain, not decoration.
  * Flat shading throughout: this is a faceted, low-poly kit, and the hull
    reads as folded plate rather than blown vinyl.

Orientation, and why EVERY OBJECT HERE SITS AT IDENTITY. The loader poses
parts in the ASSET ROOT's frame, so whatever transform the root carries
cancels out — what reaches the game is each mesh's transform relative to the
root, times its mesh data. Blender's +Y-up export converts the vertex data as
well as the node transforms, so with every object left at identity and its
geometry authored in absolute coordinates, the conversion lands entirely in
the vertex data, survives the root-cancel, and the ship arrives nose on +Z
and up on +Y with nothing baked by hand.

Put a rotation on the `runabout` empty and that stops being true: the root
transform is cancelled but the children's are not, and the ship arrives on its
side. (Measured, not assumed — the build refused it at 17× fit skew.) So:
author Z up with the nose toward -Y, keep object transforms at identity, and
put position into the geometry. A plain File → Export → glTF 2.0 with stock
settings then produces exactly what this script does.

Proportions. All three call sites box-fit this model into a fixed envelope,
NON-uniformly. The chase and landed envelopes are both ≈ 0.92 W : 0.25 H : 1 L,
so the model is authored to that ratio and arrives undistorted; the prow is
authored to the cockpit envelope's ≈ 0.47 : 0.16 : 1 for the same reason.
Change the silhouette and you change what the flight-scale checks were tuned
against — see `npm run assets:ship -- --report` for the fitted mapping.
"""

import argparse
import math
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

# ————— The envelope this model is cut to fit —————
# Mirrors RunaboutExterior.tsx's chase fit; the report at the end measures
# against it so a drifting silhouette is noticed here, not on screen.
FIT_MIN = (-0.76, -0.12, -0.85)
FIT_MAX = (0.76, 0.26, 0.79)

# ————— Overall dimensions, metres —————
Y_NOSE = -8.00   # prow tip (forward is -Y in Blender; +Z once exported)
Y_TAIL = 6.00    # engine bell mouths
X_TIP = 6.44     # wingtip
Z_PAD = -1.30    # landing pads: the model's floor, so a landed ship sits flat
Z_TOP = 2.20     # comms whip

TRI_BUDGET = 4000
UV_METRES_PER_TILE = 2.5


# ————— Palette —————
# sRGB hex, in the register the rest of the ship kit already uses. Two greys
# and a pale: a working hull is mostly one colour with the repairs showing.
HULL_DARK = 0x2A3242   # primary plating
HULL_MID = 0x39445A    # upper plating, nacelle bodies
HULL_PALE = 0xB9C2D2   # replaced panels — deliberately the wrong shade
TRIM_STEEL = 0x8C96AF  # struts, rails, gear, handrails
TRIM_DARK = 0x171C26   # recesses, intakes, exhaust throats
GLASS = 0x5AD7E8       # canopy
GOLD = 0xF5C84C        # service markings, airlock frame, tie-downs
RUST = 0x8A5F34        # weld beads and the fittings nobody has replaced
CRATE = 0x6E7A5A       # the cargo nobody has unloaded either


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


HULL = lambda: mat(HULL_DARK, "runabout-hull", 0.52, 0.62)          # noqa: E731
UPPER = lambda: mat(HULL_MID, "runabout-upper", 0.48, 0.6)          # noqa: E731
PALE = lambda: mat(HULL_PALE, "runabout-replacement", 0.44, 0.45)   # noqa: E731
STEEL = lambda: mat(TRIM_STEEL, "runabout-steel", 0.38, 0.85)       # noqa: E731
DARK = lambda: mat(TRIM_DARK, "runabout-recess", 0.7, 0.3)          # noqa: E731
CANOPY = lambda: mat(GLASS, "runabout-canopy", 0.12, 0.25)          # noqa: E731
MARK = lambda: mat(GOLD, "runabout-markings", 0.35, 0.4)            # noqa: E731
OLD = lambda: mat(RUST, "runabout-corrosion", 0.85, 0.2)            # noqa: E731
CARGO = lambda: mat(CRATE, "runabout-cargo", 0.9, 0.05)             # noqa: E731


# ————— Geometry helpers —————


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
    """A chamfered-corner rectangle across the ship at station `y`.

    The chamfer is why the hull reads as folded plate under a hard light: eight
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
    """Break every hard edge. Small, but it is what catches a rim light."""
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
    except (TypeError, RuntimeError) as exc:  # API drift must not lose the ship
        print(f"  bevel skipped ({exc})")


def box_uvs(bm):
    """Deterministic triplanar-ish box projection at a fixed metres-per-tile."""
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


_root = None
_parts = []


def emit(name, bm, material, bevel_amount=0.0):
    """Finish a bmesh into a flat-shaded child of the asset root."""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bevel(bm, bevel_amount)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    box_uvs(bm)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material)
    for poly in me.polygons:
        poly.use_smooth = False
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = _root  # identity local transform: see the orientation note
    _parts.append(obj)
    return obj


def part(name, material, bevel_amount=0.0):
    """Decorator-free convenience: `with part(...)` would be neater, but this
    keeps every builder a plain function that fills a bmesh."""
    bm = bmesh.new()
    return bm, (lambda: emit(name, bm, material, bevel_amount))


# ————— The ship —————


def build_prow():
    """`hull-nose`: the sensor snout. Also the cockpit view's whole world, so
    its proportions are cut to that envelope rather than to taste."""
    bm, done = part("hull-nose", HULL(), 0.02)
    rings = [
        plate_profile(-8.00, 0.10, -0.10, 0.04, 0.04),
        plate_profile(-7.20, 0.32, -0.16, 0.14, 0.09),
        plate_profile(-6.20, 0.56, -0.21, 0.24, 0.13),
        plate_profile(-5.20, 0.76, -0.245, 0.31, 0.16),
        plate_profile(-4.40, 0.875, -0.26, 0.34, 0.18),
    ]
    add_loft(bm, rings)
    done()

    # A ranging blister under the snout, and the cap that was clearly sourced
    # from a different ship.
    bm, done = part("nose-sensor-blister", DARK(), 0.015)
    add_box(bm, (0.0, -6.55, -0.22), (0.42, 1.30, 0.16))
    done()
    bm, done = part("nose-cap", PALE(), 0.012)
    add_box(bm, (0.0, -7.62, -0.03), (0.30, 0.34, 0.20))
    done()


def build_fuselage():
    """The pressure hull: seven stations, widest just aft of the cabin."""
    bm, done = part("hull-core", HULL(), 0.03)
    stations = [
        (-4.55, 1.00, -0.30, 0.44, 0.20),
        (-3.20, 1.48, -0.40, 0.66, 0.26),
        (-1.30, 1.88, -0.48, 0.88, 0.30),
        (0.90, 2.06, -0.50, 0.94, 0.32),
        (2.90, 1.98, -0.46, 0.88, 0.30),
        (4.40, 1.76, -0.38, 0.74, 0.26),
        (5.35, 1.52, -0.28, 0.58, 0.22),
    ]
    add_loft(bm, [plate_profile(*s) for s in stations])
    done()

    # Frame ribs: short sleeves a few centimetres proud of the plating, which
    # is what stops a long hull reading as an extruded lozenge.
    for i, (y, hw, z0, z1, c) in enumerate(
        [(-2.40, 1.72, -0.45, 0.80, 0.29),
         (1.90, 2.04, -0.49, 0.92, 0.32),
         (3.90, 1.86, -0.43, 0.82, 0.28)]
    ):
        bm, done = part(f"hull-rib-{i}", UPPER(), 0.012)
        add_loft(bm, [
            plate_profile(y - 0.09, hw + 0.05, z0 - 0.03, z1 + 0.03, c),
            plate_profile(y + 0.09, hw + 0.05, z0 - 0.03, z1 + 0.03, c),
        ], cap_first=False, cap_last=False)
        done()

    # Tail: a flat plate with a recessed service panel.
    bm, done = part("tail-plate", UPPER(), 0.02)
    add_box(bm, (0.0, 5.42, 0.14), (2.60, 0.16, 0.78))
    done()
    bm, done = part("tail-hatch", DARK(), 0.01)
    add_box(bm, (0.35, 5.52, 0.10), (1.05, 0.06, 0.52))
    done()


def build_cabin():
    """Canopy and the roof it interrupts."""
    bm, done = part("canopy", CANOPY(), 0.02)
    add_loft(bm, [
        plate_profile(-4.50, 0.60, 0.28, 0.50, 0.10),
        plate_profile(-3.95, 0.86, 0.34, 0.92, 0.16),
        plate_profile(-3.15, 0.98, 0.42, 1.16, 0.18),
        plate_profile(-2.35, 0.92, 0.50, 1.10, 0.16),
    ])
    done()

    # The canopy's frame members — the ship is old enough to still have them.
    for i, y in enumerate((-4.10, -3.30, -2.55)):
        bm, done = part(f"canopy-frame-{i}", STEEL(), 0.008)
        add_box(bm, (0.0, y, 0.86), (2.02, 0.07, 0.62))
        done()

    # Dorsal working deck: a pale plate, because it was replaced.
    bm, done = part("deck-plate", PALE(), 0.02)
    add_box(bm, (0.0, 0.90, 0.93), (2.30, 4.90, 0.10))
    done()


def build_wings():
    """A thick, low, swept plank per side — this ship's lift is structural."""
    sections = [
        (2.00, -0.55, 3.05, 0.05, 0.52),
        (3.55, -0.20, 2.95, 0.10, 0.42),
        (5.10, 0.55, 2.85, 0.15, 0.28),
        (6.44, 1.05, 2.70, 0.18, 0.18),
    ]
    for side in (-1, 1):
        name = "port" if side < 0 else "starboard"
        bm, done = part(f"wing-{name}", HULL(), 0.025)
        rings = []
        for x, y_le, y_te, z_mid, thick in sections:
            ring = wing_section(x * side, y_le, y_te, z_mid, thick)
            rings.append(ring if side > 0 else list(reversed(ring)))
        add_loft(bm, rings)
        done()

        # Leading-edge intake and the tip housing the nav lamp sits on.
        bm, done = part(f"wing-intake-{name}", DARK(), 0.01)
        add_box(bm, (side * 3.30, -0.16, 0.10), (1.30, 0.22, 0.26))
        done()
        bm, done = part(f"wingtip-pod-{name}", STEEL(), 0.02)
        add_box(bm, (side * 6.28, 1.35, 0.19), (0.34, 0.86, 0.24))
        done()

        # Two hardpoints per wing, empty. A working ship advertises capacity.
        for i, y in enumerate((1.10, 2.20)):
            bm, done = part(f"hardpoint-{name}-{i}", STEEL(), 0.008)
            add_box(bm, (side * 4.55, y, -0.02), (0.30, 0.34, 0.20))
            done()


def build_engines():
    """Two nacelles sat on the wing roots, one of them not originally hers."""
    for side in (-1, 1):
        name = "port" if side < 0 else "starboard"
        x = side * 2.88
        z = 0.26
        # Replacing an engine cowl is the cheapest big repair, and it never
        # matches: the port nacelle wears a pale body and a corroded collar.
        body = PALE() if side < 0 else UPPER()

        bm, done = part(f"nacelle-{name}", body)
        add_tube(bm, (x, 1.20, z), (x, 5.30, z), 0.60, 0.70, 12)
        done()

        bm, done = part(f"nacelle-bell-{name}", UPPER())
        add_tube(bm, (x, 5.30, z), (x, 6.00, z), 0.70, 0.54, 12, cap1=False)
        done()

        bm, done = part(f"nacelle-throat-{name}", DARK())
        add_tube(bm, (x, 5.55, z), (x, 5.98, z), 0.44, 0.44, 12)
        done()

        bm, done = part(f"nacelle-intake-{name}", STEEL())
        add_tube(bm, (x, 1.02, z), (x, 1.26, z), 0.66, 0.62, 12)
        done()

        bm, done = part(f"nacelle-intake-face-{name}", DARK())
        add_tube(bm, (x, 1.06, z), (x, 1.14, z), 0.56, 0.56, 12)
        done()

        collar = OLD() if side < 0 else STEEL()
        bm, done = part(f"nacelle-collar-{name}", collar)
        add_tube(bm, (x, 3.05, z), (x, 3.30, z), 0.74, 0.74, 12)
        done()

        # Fairing down onto the wing, and a coolant run along the top.
        bm, done = part(f"nacelle-fairing-{name}", HULL(), 0.02)
        add_box(bm, (x, 2.40, -0.14), (0.72, 2.90, 0.62))
        done()
        bm, done = part(f"nacelle-conduit-{name}", STEEL())
        add_tube(bm, (x - side * 0.30, 1.60, z + 0.60),
                 (x - side * 0.30, 5.10, z + 0.62), 0.09, 0.09, 6)
        done()


def build_gear():
    """Three legs, pads flat on Z_PAD so a landed ship rests on the ground."""
    legs = [
        ("nose", 0.0, -3.60, -0.40, 0.10, (0.55, 0.85)),
        ("port", -2.30, 1.70, -0.46, 0.13, (0.72, 0.98)),
        ("starboard", 2.30, 1.70, -0.46, 0.13, (0.72, 0.98)),
    ]
    for name, x, y, z_top, radius, (pad_x, pad_y) in legs:
        bm, done = part(f"gear-strut-{name}", STEEL())
        add_tube(bm, (x, y, z_top), (x, y, Z_PAD + 0.20), radius, radius * 0.82, 8)
        done()
        bm, done = part(f"gear-shock-{name}", DARK())
        add_tube(bm, (x, y, z_top - 0.30), (x, y, z_top - 0.62),
                 radius * 1.25, radius * 1.25, 8)
        done()
        bm, done = part(f"gear-pad-{name}", HULL(), 0.02)
        add_box(bm, (x, y, Z_PAD + 0.09), (pad_x, pad_y, 0.18))
        done()
        # Drag link back to the hull: gear that reads as gear needs the brace.
        bm, done = part(f"gear-link-{name}", STEEL())
        add_tube(bm, (x, y, Z_PAD + 0.34), (x * 0.55, y + 0.85, z_top + 0.02),
                 0.05, 0.05, 6)
        done()


def build_dorsal():
    """Spine, service stripe, comms, and the cargo nobody has unloaded."""
    bm, done = part("spine-rail", STEEL(), 0.012)
    add_box(bm, (0.0, 0.90, 1.05), (0.34, 5.40, 0.14))
    done()
    # Below roughly a hand's width, a bevel costs 32 triangles and returns
    # nothing at any distance the ship is ever drawn — these stay hard-edged.
    bm, done = part("service-stripe", MARK())
    add_box(bm, (0.0, 0.60, 1.13), (0.13, 4.20, 0.04))
    done()

    # Strapped-down crate, sat off-centre and slightly askew, because it was
    # loaded by someone in a hurry.
    yaw = Matrix.Rotation(0.10, 3, "Z")
    bm, done = part("deck-crate", CARGO(), 0.02)
    add_box(bm, (-0.72, 1.55, 1.24), (1.10, 1.46, 0.52), yaw)
    done()
    for i, y in enumerate((1.10, 2.00)):
        bm, done = part(f"crate-strap-{i}", MARK())
        add_box(bm, (-0.72, y, 1.25), (1.20, 0.10, 0.60), yaw)
        done()

    # Comms whip to port, sensor dish to starboard. Nothing on this ship is
    # mirrored if it did not have to be.
    bm, done = part("comms-whip", STEEL())
    add_tube(bm, (-0.74, 3.10, 1.00), (-0.90, 3.34, Z_TOP), 0.045, 0.022, 6)
    done()
    bm, done = part("comms-base", DARK(), 0.008)
    add_box(bm, (-0.74, 3.10, 1.02), (0.26, 0.26, 0.14))
    done()

    bm, done = part("sensor-mast", STEEL())
    add_tube(bm, (0.92, -1.85, 0.92), (0.92, -1.85, 1.62), 0.07, 0.06, 6)
    done()
    bm, done = part("sensor-dish", PALE())
    add_tube(bm, (0.92, -1.85, 1.62), (0.98, -2.05, 1.78), 0.14, 0.40, 10)
    done()

    for i, (x, y) in enumerate(((-0.95, -0.60), (0.95, -0.60), (-0.95, 3.10), (0.95, 3.10))):
        bm, done = part(f"tie-down-{i}", MARK())
        add_box(bm, (x, y, 0.99), (0.16, 0.16, 0.14))
        done()


def build_flanks():
    """The airlock, the ladder up to it, and the repairs."""
    # Port flank: airlock in a gold frame, with a grab rail and rungs.
    bm, done = part("airlock-frame", MARK(), 0.012)
    add_box(bm, (-1.86, -0.60, 0.16), (0.10, 1.32, 1.10))
    done()
    bm, done = part("airlock-door", DARK(), 0.01)
    add_box(bm, (-1.92, -0.60, 0.16), (0.08, 1.10, 0.92))
    done()
    bm, done = part("airlock-handle", STEEL())
    add_tube(bm, (-1.99, -0.95, 0.16), (-1.99, -0.30, 0.16), 0.035, 0.035, 6)
    done()
    for i in range(3):
        bm, done = part(f"ladder-rung-{i}", STEEL())
        add_tube(bm, (-1.80, -0.86 + i * 0.02, -0.30 - i * 0.30),
                 (-1.80, -0.34 + i * 0.02, -0.30 - i * 0.30), 0.032, 0.032, 6)
        done()

    # Starboard flank: a plate welded over something that went wrong, one
    # size too big and a few degrees off square.
    tilt = Matrix.Rotation(0.06, 3, "X")
    bm, done = part("weld-backing", OLD(), 0.01)
    add_box(bm, (1.80, -0.25, 0.16), (0.07, 2.05, 1.00), tilt)
    done()
    bm, done = part("patch-plate", PALE(), 0.012)
    add_box(bm, (1.86, -0.28, 0.18), (0.08, 1.86, 0.84), tilt)
    done()

    # Forward intakes, both sides, and belly vents.
    for side in (-1, 1):
        name = "port" if side < 0 else "starboard"
        bm, done = part(f"forward-intake-{name}", DARK(), 0.01)
        add_box(bm, (side * 1.42, -3.45, 0.12), (0.30, 1.05, 0.44))
        done()
    for i, y in enumerate((-1.60, 0.30, 2.20)):
        bm, done = part(f"belly-vent-{i}", DARK(), 0.008)
        add_box(bm, (0.0, y, -0.48), (1.15, 0.42, 0.10))
        done()

    # Attitude thrusters at the four corners of the pressure hull.
    for i, (x, y) in enumerate(((-1.70, -2.60), (1.70, -2.60), (-1.86, 3.60), (1.86, 3.60))):
        bm, done = part(f"rcs-{i}", STEEL())
        add_tube(bm, (x, y, 0.30), (x * 1.10, y, 0.30), 0.13, 0.15, 6)
        done()


# ————— Export —————


def triangles():
    total = 0
    for obj in _parts:
        obj.data.calc_loop_triangles()
        total += len(obj.data.loop_triangles)
    return total


def bounds():
    lo = [float("inf")] * 3
    hi = [float("-inf")] * 3
    for obj in _parts:
        for v in obj.data.vertices:
            for i in range(3):
                lo[i] = min(lo[i], v.co[i])
                hi[i] = max(hi[i], v.co[i])
    return lo, hi


def report(lo, hi):
    """Measure the authored silhouette against the envelope it must fit."""
    size = [hi[i] - lo[i] for i in range(3)]
    want = [FIT_MAX[i] - FIT_MIN[i] for i in range(3)]
    # Blender X→fit X, Blender Z→fit Y (up), Blender Y→fit Z (length).
    got_ratio = (size[0] / size[1], size[2] / size[1], 1.0)
    want_ratio = (want[0] / want[2], want[1] / want[2], 1.0)
    print(f"  bounds     x {lo[0]:+.2f}..{hi[0]:+.2f}  "
          f"y {lo[1]:+.2f}..{hi[1]:+.2f}  z {lo[2]:+.2f}..{hi[2]:+.2f}")
    print(f"  size       {size[0]:.2f} w × {size[2]:.2f} h × {size[1]:.2f} l")
    print(f"  authored   {got_ratio[0]:.3f} : {got_ratio[1]:.3f} : 1")
    print(f"  envelope   {want_ratio[0]:.3f} : {want_ratio[1]:.3f} : 1")
    for label, got, want_v in (("width", got_ratio[0], want_ratio[0]),
                               ("height", got_ratio[1], want_ratio[1])):
        skew = want_v / got - 1.0
        flag = "  <-- distorts" if abs(skew) > 0.08 else ""
        print(f"  fit {label:<7}{skew:+.1%}{flag}")


def main():
    global _root

    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--blend")
    ap.add_argument("--glb")
    args = ap.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"

    _root = bpy.data.objects.new("runabout", None)
    _root.empty_display_size = 3.0
    # Parity with the three.js-generated kits, which carry the same extras.
    _root["assetId"] = "runabout"
    _root["atlas"] = "../../textures/ships/runabout-pbr.ktx2"
    _root["decalAtlas"] = "../../textures/ships/hull-decals.ktx2"
    scene.collection.objects.link(_root)

    build_prow()
    build_fuselage()
    build_cabin()
    build_wings()
    build_engines()
    build_gear()
    build_dorsal()
    build_flanks()

    tris = triangles()
    lo, hi = bounds()
    print(f"runabout: {len(_parts)} parts, {tris} triangles (budget {TRI_BUDGET})")
    report(lo, hi)
    if tris > TRI_BUDGET:
        print(f"  OVER BUDGET by {tris - TRI_BUDGET}")

    if args.blend:
        bpy.ops.wm.save_as_mainfile(filepath=bpy.path.abspath(args.blend))
        print(f"  wrote {args.blend}")

    if args.glb:
        # Stock settings on purpose: the .blend must export correctly from the
        # GUI too, so this script may not rely on anything the File → Export
        # dialog cannot do. The orientation is rigged, not baked.
        bpy.ops.export_scene.gltf(
            filepath=bpy.path.abspath(args.glb),
            export_format="GLB",
            export_yup=True,
            export_apply=True,
            export_texcoords=True,
            export_normals=True,
            export_tangents=False,     # merge needs a uniform attribute set
            export_materials="EXPORT",
            export_extras=True,
            export_cameras=False,
            export_lights=False,
            export_animations=False,
        )
        print(f"  wrote {args.glb}")


if __name__ == "__main__":
    main()
