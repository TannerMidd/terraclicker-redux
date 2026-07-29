"""
Bespoke surface landmark silhouettes.

    Blender:
      blender --background --factory-startup --python surface_landmarks.py -- \
        --blend surface_landmarks.blend \
        --glb public/assets/uplift/meshes/surface/landmark-kit.glb

The roots intentionally match the landmark ids in surfaceLandmarks.ts.  Every
root is independently instanced and remains below the shared 900-triangle
ceiling.  Geometry is authored Z-up, objects stay at identity, and kitlib adds
uniform UV0/normals for the runtime merge.
"""

import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kitlib as k  # noqa: E402


STONE = lambda: k.mat(0x746F68, "landmark-stone", 0.94, 0.02)       # noqa: E731
STONE_DARK = lambda: k.mat(0x3E4142, "landmark-stone-dark", 0.98)   # noqa: E731
STONE_PALE = lambda: k.mat(0xA9A89F, "landmark-stone-pale", 0.90)   # noqa: E731
BASALT = lambda: k.mat(0x24272C, "landmark-basalt", 0.91, 0.03)     # noqa: E731
CINDER = lambda: k.mat(0x542F2A, "landmark-cinder", 0.97)           # noqa: E731
ICE = lambda: k.mat(0xBBD8E7, "landmark-ice", 0.32, 0.02)           # noqa: E731
ICE_DARK = lambda: k.mat(0x66879A, "landmark-ice-dark", 0.48)       # noqa: E731
SULFUR = lambda: k.mat(0xC6A849, "landmark-sulfur", 0.86)           # noqa: E731
WET = lambda: k.mat(0x344B56, "landmark-wet", 0.38, 0.02)           # noqa: E731


def _rng(label):
    seed = 2166136261
    for byte in label.encode("utf8"):
        seed = ((seed ^ byte) * 16777619) & 0xFFFFFFFF
    return random.Random(seed)


def rock(name, center, radii, material, seed, segments=7):
    """A deterministic, faceted boulder with three irregular rings."""
    cx, cy, cz = center
    rx, ry, rz = radii
    r = _rng(seed)
    rings = []
    for zf, radial in ((-0.42, 0.64), (-0.15, 1.0), (0.32, 0.83), (0.50, 0.28)):
        ring = []
        for i in range(segments):
            a = 2 * math.pi * i / segments
            jitter = 0.87 + r.random() * 0.24
            ring.append((
                cx + math.cos(a) * rx * radial * jitter,
                cy + math.sin(a) * ry * radial * (0.9 + r.random() * 0.18),
                cz + zf * 2 * rz + (r.random() - 0.5) * rz * 0.08,
            ))
        rings.append(ring)
    bm, done = k.part(name, material)
    k.add_loft(bm, rings)
    done()


def column(name, x, y, height, radius, material, sides=6, lean=(0.0, 0.0)):
    bm, done = k.part(name, material)
    k.add_tube(
        bm,
        (x, y, 0.0),
        (x + lean[0], y + lean[1], height),
        radius * 1.08,
        radius * 0.82,
        sides,
    )
    done()


def arch(name, radius, height, depth, material, segments=9, broken=None):
    """Two low-poly ribs joined across depth, producing a readable stone arch."""
    for side in (-1, 1):
        y = side * depth * 0.5
        points = []
        for i in range(segments + 1):
            a = math.pi - math.pi * i / segments
            points.append((math.cos(a) * radius, y, math.sin(a) * height))
        for i, (a, b) in enumerate(zip(points, points[1:])):
            if broken is not None and i in broken:
                continue
            bm, done = k.part(f"{name}-{side:+d}-{i}", material)
            k.add_tube(bm, a, b, 0.20, 0.18, 5)
            done()
    for i in range(1, segments):
        if broken is not None and i in broken:
            continue
        a = math.pi - math.pi * i / segments
        x = math.cos(a) * radius
        z = math.sin(a) * height
        bm, done = k.part(f"{name}-bridge-{i}", material)
        k.add_tube(bm, (x, -depth * 0.5, z), (x, depth * 0.5, z), 0.18, 0.18, 5)
        done()


def standing_ring():
    k.asset("standing-ring", {"atlas": "../../textures/surface/landmark-atlas.ktx2"})
    for i in range(9):
        a = i * 2 * math.pi / 9
        radius = 2.15 + 0.13 * math.sin(i * 2.4)
        x, y = math.cos(a) * radius, math.sin(a) * radius
        height = 2.05 + 0.38 * math.sin(i * 1.7)
        column(f"monolith-{i}", x, y, height, 0.20, STONE(), 5,
               (math.cos(a) * -0.08, math.sin(a) * -0.08))
        rock(f"foot-{i}", (x, y, 0.13), (0.43, 0.32, 0.24), STONE_DARK(), f"ring-{i}", 6)
    rock("altar", (0, 0, 0.18), (0.68, 0.56, 0.34), STONE_PALE(), "ring-altar", 7)


def stone_arch():
    k.asset("stone-arch", {"atlas": "../../textures/surface/landmark-atlas.ktx2"})
    arch("great-arch", 2.15, 2.75, 0.72, STONE(), 9)
    for i, x in enumerate((-2.2, 2.2)):
        rock(f"buttress-{i}", (x, 0, 0.42), (0.68, 0.65, 0.78), STONE_DARK(), f"arch-{i}")


def perched_boulder():
    k.asset("perched-boulder", {"atlas": "../../textures/surface/landmark-atlas.ktx2"})
    rock("pedestal-base", (0, 0, 0.62), (0.74, 0.68, 1.12), STONE_DARK(), "perch-base")
    rock("pedestal-neck", (0.08, -0.02, 1.60), (0.43, 0.46, 0.72), STONE(), "perch-neck")
    rock("balanced-cap", (-0.18, 0.04, 2.75), (1.36, 0.92, 0.78), STONE_PALE(), "perch-cap", 8)
    for i, (x, y) in enumerate(((-0.8, -0.65), (0.72, -0.52), (0.58, 0.70))):
        rock(f"talus-{i}", (x, y, 0.17), (0.34, 0.28, 0.28), STONE_DARK(), f"perch-talus-{i}", 6)


def hoodoo_court():
    k.asset("hoodoo-court", {"atlas": "../../textures/surface/landmark-atlas.ktx2"})
    seats = ((-1.4, -0.8, 2.5), (0.15, -1.25, 3.2), (1.45, -0.40, 2.2),
             (-1.05, 0.95, 3.0), (0.65, 1.15, 2.65))
    for i, (x, y, h) in enumerate(seats):
        column(f"stem-{i}", x, y, h, 0.25 + i % 2 * 0.05, CINDER(), 6,
               ((i % 3 - 1) * 0.07, (i % 2 - 0.5) * 0.08))
        rock(f"cap-{i}", (x, y, h + 0.12), (0.64, 0.52, 0.34), STONE_DARK(), f"hoodoo-{i}", 7)


def ice_organ():
    k.asset("ice-organ", {"atlas": "../../textures/surface/landmark-atlas.ktx2"})
    heights = (1.4, 2.2, 3.5, 4.1, 3.25, 2.55, 1.65, 2.9, 2.1)
    for i, h in enumerate(heights):
        x = (i - 4) * 0.43
        y = 0.22 * math.sin(i * 1.9)
        column(f"ice-pipe-{i}", x, y, h, 0.25, ICE() if i % 2 else ICE_DARK(), 6)
        if i % 3 == 0:
            column(f"icicle-{i}", x + 0.18, y + 0.18, h * 0.56, 0.08, ICE(), 5)


def pressure_ridge():
    k.asset("pressure-ridge", {"atlas": "../../textures/surface/landmark-atlas.ktx2"})
    for i in range(11):
        x = (i - 5) * 0.46
        y = 0.32 * math.sin(i * 1.4)
        h = 0.65 + 0.62 * (1 - abs(i - 5) / 6) + 0.16 * (i % 2)
        bm, done = k.part(f"thrust-slab-{i}", ICE() if i % 2 else ICE_DARK())
        k.add_loft(bm, [
            [(x - 0.31, y - 0.28, 0), (x + 0.31, y - 0.28, 0),
             (x + 0.22, y + 0.22, 0), (x - 0.22, y + 0.22, 0)],
            [(x - 0.19, y - 0.05, h), (x + 0.20, y - 0.05, h * 0.94),
             (x + 0.13, y + 0.11, h * 0.88), (x - 0.12, y + 0.12, h)],
        ])
        done()


def basalt_choir():
    k.asset("basalt-choir", {"atlas": "../../textures/surface/landmark-atlas.ktx2"})
    heights = (1.2, 2.5, 3.7, 2.9, 4.25, 3.3, 2.15, 3.85, 2.45, 1.55, 2.9)
    for i, h in enumerate(heights):
        angle = i * 2.39996
        radius = 0.34 * math.sqrt(i)
        column(f"basalt-column-{i}", math.cos(angle) * radius, math.sin(angle) * radius,
               h, 0.31, BASALT() if i % 3 else STONE_DARK(), 6)


def cinder_cone():
    k.asset("cinder-cone", {"atlas": "../../textures/surface/landmark-atlas.ktx2"})
    bm, done = k.part("cone-flank", CINDER())
    k.add_tube(bm, (0, 0, -0.12), (0, 0, 1.85), 2.45, 0.70, 12)
    done()
    # A dark, raised broken rim reads as a crater after the world-material tint.
    for i in range(10):
        a0 = i * 2 * math.pi / 10
        a1 = (i + 0.72) * 2 * math.pi / 10
        bm, done = k.part(f"crater-rim-{i}", BASALT())
        k.add_tube(bm, (math.cos(a0) * 0.72, math.sin(a0) * 0.72, 1.82),
                   (math.cos(a1) * 0.72, math.sin(a1) * 0.72, 1.82),
                   0.16, 0.14, 5)
        done()


def fumarole_field():
    k.asset("fumarole-field", {"atlas": "../../textures/surface/landmark-atlas.ktx2"})
    seats = ((-1.3, -0.8, 1.0), (-0.25, -1.1, 1.5), (0.95, -0.7, 0.9),
             (-1.05, 0.55, 1.25), (0.10, 0.45, 1.9), (1.25, 0.72, 1.3))
    for i, (x, y, h) in enumerate(seats):
        bm, done = k.part(f"chimney-{i}", BASALT())
        k.add_tube(bm, (x, y, 0), (x + 0.06 * (i % 2), y, h), 0.35, 0.18, 7)
        done()
        bm, done = k.part(f"sulfur-lip-{i}", SULFUR())
        k.add_tube(bm, (x, y, h - 0.06), (x, y, h + 0.08), 0.23, 0.19, 7)
        done()
    rock("field-matrix", (0, 0, 0.10), (2.1, 1.65, 0.22), STONE_DARK(), "fumarole-matrix", 9)


def sea_stacks():
    k.asset("sea-stacks", {"atlas": "../../textures/surface/landmark-atlas.ktx2"})
    seats = ((-1.55, -0.55, 2.6, 0.55), (-0.35, 0.15, 3.6, 0.66),
             (0.95, -0.40, 2.25, 0.50), (1.60, 0.75, 1.55, 0.40))
    for i, (x, y, h, radius) in enumerate(seats):
        rock(f"stack-{i}", (x, y, h * 0.48), (radius, radius * 0.78, h * 0.52),
             WET() if i % 2 else STONE_DARK(), f"sea-stack-{i}", 7)
        rock(f"stack-cap-{i}", (x, y, h), (radius * 1.12, radius, radius * 0.25),
             STONE(), f"sea-cap-{i}", 7)


def tide_arch():
    k.asset("tide-arch", {"atlas": "../../textures/surface/landmark-atlas.ktx2"})
    arch("wave-arch", 2.65, 1.72, 1.05, WET(), 10, broken={4})
    for i, x in enumerate((-2.6, 2.6)):
        rock(f"wave-foot-{i}", (x, 0, 0.34), (0.84, 0.84, 0.65), STONE_DARK(), f"tide-foot-{i}", 8)


def blowhole():
    k.asset("blowhole", {"atlas": "../../textures/surface/landmark-atlas.ktx2"})
    for i in range(12):
        a = i * 2 * math.pi / 12
        radius = 1.18 + 0.16 * math.sin(i * 2.1)
        bm, done = k.part(f"rim-slab-{i}", WET() if i % 2 else STONE_DARK())
        k.add_tube(
            bm,
            (math.cos(a) * radius, math.sin(a) * radius, 0.05),
            (math.cos(a) * (radius + 0.18), math.sin(a) * (radius + 0.18),
             0.42 + 0.16 * (i % 3)),
            0.26,
            0.20,
            5,
        )
        done()
    # Crossed dark vanes make the central negative space obvious at distance.
    for i in range(4):
        a = i * math.pi / 4
        bm, done = k.part(f"shaft-wall-{i}", BASALT())
        k.add_box(bm, (math.cos(a) * 0.63, math.sin(a) * 0.63, -0.06),
                  (1.10, 0.13, 0.16))
        done()


def award_fjords():
    k.asset("award-fjords", {"atlas": "../../textures/surface/landmark-atlas.ktx2"})
    for bank in (-1, 1):
        for i in range(6):
            y = (i - 2.5) * 0.72
            inset = 0.28 * math.sin(i * 1.6)
            x = bank * (0.74 + abs(y) * 0.22 + inset)
            h = 1.05 + 0.28 * (i % 3)
            rock(f"fjord-bank-{bank:+d}-{i}", (x, y, h * 0.46),
                 (0.55, 0.55, h * 0.55),
                 STONE_PALE() if i % 2 else STONE(), f"fjord-{bank}-{i}", 6)
    bm, done = k.part("fjord-channel", WET())
    k.add_box(bm, (0, 0, 0.03), (1.20, 4.25, 0.08))
    done()


def build():
    standing_ring()
    stone_arch()
    perched_boulder()
    hoodoo_court()
    ice_organ()
    pressure_ridge()
    basalt_choir()
    cinder_cone()
    fumarole_field()
    sea_stacks()
    tide_arch()
    blowhole()
    award_fjords()


k.run("surface-landmark-kit", build, tri_budget=11700, per_asset=900)
