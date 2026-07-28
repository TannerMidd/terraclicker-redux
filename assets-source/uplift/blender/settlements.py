"""
The settlement kit — ASSET_UPLIFT.md 2.3.

    npm run assets:ship

Names the game reads (Settlements.tsx): `hab-shell`, `roof`, `mast`, `dome`,
`pad`, `stilt`, `works`, `banner`, `scaffold` — plus the `-b`/`-c` variants,
which are optional: a family falls back to its base asset if a variant is
missing, so this file can grow without touching the TSX.

────────────────────────────────────────────────────────────────────────────
Two rules specific to this kit
────────────────────────────────────────────────────────────────────────────

1. AUTHORED PROPORTIONS DO NOT SURVIVE. Every family is box-fit into a unit
   frame — the exact bounding box of the primitive it replaces — and the seat
   matrix supplies the real dimensions afterwards. A hab authored twice as tall
   is normalised straight back to the same box. So variation has to live in the
   SHAPE INSIDE the box: where the door is, what is bolted to the side, how the
   roof folds, what has been patched. Variants within a family are therefore
   authored to an IDENTICAL bounding box (the FRAME constants below), so they
   normalise identically and a village reads as one settlement rather than as
   buildings of randomly different heights.

2. COLOUR IS A MULTIPLIER HERE, not a colour. Settlements.tsx builds one
   palette-derived material per family and switches `vertexColors` on, so the
   final surface is family colour x vertex colour x atlas. A part authored
   near-white takes the world's palette; a dark part reads as trim against it.
   This is the opposite of the ship kit, where the vertex colour IS the paint.
   Author bodies pale, ironwork dark.

Author Z up, every object at identity. See kitlib.py.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kitlib as k  # noqa: E402
from mathutils import Matrix  # noqa: E402

# Identical bounding frames per family, so variants normalise the same way.
# (half-x, half-y, top-z) — every asset in a family must reach all three.
FRAME = {
    "hab": (1.60, 1.20, 2.40),
    "roof": (1.70, 1.30, 1.00),
    "works": (1.40, 1.20, 3.00),
    "dome": (1.60, 1.60, 1.70),
    "stilt": (0.50, 0.50, 3.20),
}

# ————— Palette —————
# Pale bodies take the world's palette; dark parts read as ironwork. See rule 2.
SHELL = lambda: k.mat(0xE9EEF9, "settle-shell", 0.86, 0.05)      # noqa: E731
PLASTER = lambda: k.mat(0xD8DCE4, "settle-plaster", 0.9, 0.02)   # noqa: E731
TRIM = lambda: k.mat(0x202535, "settle-trim", 0.62, 0.65)        # noqa: E731
METAL = lambda: k.mat(0x8C96AF, "settle-metal", 0.52, 0.75)      # noqa: E731
STONE = lambda: k.mat(0x77746F, "settle-stone", 0.92, 0.02)      # noqa: E731
DARKSTONE = lambda: k.mat(0x34343B, "settle-darkstone", 0.94, 0)  # noqa: E731
GLASS = lambda: k.mat(0x5AD7E8, "settle-glass", 0.15, 0.2)       # noqa: E731
GOLD = lambda: k.mat(0xF5C84C, "settle-gold", 0.4, 0.5)          # noqa: E731
RUST = lambda: k.mat(0x8A5F34, "settle-rust", 0.88, 0.2)         # noqa: E731


# ————— Shared pieces —————


def corner_posts(hx, hy, z0, z1, r=0.075, material=None):
    """Four uprights. What makes a prefab read as assembled rather than moulded."""
    for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        bm, done = k.part(f"post-{k.current_name()}-{i}", material or TRIM())
        k.add_tube(bm, (sx * hx, sy * hy, z0), (sx * hx, sy * hy, z1), r, r, 5)
        done()


def hab_body(hx, hy, top, chamfer=0.16):
    """The pressure shell every hab variant is a version of."""
    bm, done = k.part("shell", SHELL(), 0.03)
    k.add_loft(bm, [
        k.plate_profile(-hy, hx, 0.0, top, chamfer),
        k.plate_profile(hy, hx, 0.0, top, chamfer),
    ])
    done()


def door(x, y, z, width=0.62, height=1.35, facing_y=True):
    bm, done = k.part("door-frame", METAL(), 0.01)
    size = (width + 0.14, 0.09, height + 0.12) if facing_y else (0.09, width + 0.14, height + 0.12)
    k.add_box(bm, (x, y, z + height / 2), size)
    done()
    bm, done = k.part("door-leaf", TRIM())
    size = (width, 0.06, height) if facing_y else (0.06, width, height)
    k.add_box(bm, (x, y - 0.02 if facing_y else y, z + height / 2), size)
    done()


def vent_stack(x, y, z0, z1, r=0.17):
    bm, done = k.part("vent", TRIM())
    k.add_tube(bm, (x, y, z0), (x, y, z1), r, r * 0.92, 6)
    done()
    bm, done = k.part("vent-cowl", METAL())
    k.add_tube(bm, (x, y, z1 - 0.02), (x, y, z1 + 0.13), r * 1.35, r * 0.7, 6)
    done()


def ladder(x, y, z0, z1, rungs=5):
    for i in range(2):
        bm, done = k.part(f"ladder-rail-{i}", METAL())
        k.add_tube(bm, (x + (i - 0.5) * 0.34, y, z0), (x + (i - 0.5) * 0.34, y, z1), 0.03, 0.03, 4)
        done()
    for i in range(rungs):
        t = z0 + (z1 - z0) * (i + 0.5) / rungs
        bm, done = k.part(f"ladder-rung-{i}", METAL())
        k.add_tube(bm, (x - 0.17, y, t), (x + 0.17, y, t), 0.022, 0.022, 4)
        done()


# ————— Habs: three shells, one frame —————


def hab_a():
    """The issued prefab, as delivered and never altered."""
    hx, hy, top = FRAME["hab"]
    k.asset("hab-shell")
    hab_body(hx, hy, top)
    corner_posts(hx - 0.02, hy - 0.02, 0.0, top)
    door(0.0, -hy - 0.02, 0.0)
    vent_stack(hx - 0.42, hy - 0.45, top - 0.1, top + 0.0)
    # Panel breaks: the seams a delivered building arrives in.
    for i, z in enumerate((0.82, 1.64)):
        bm, done = k.part(f"panel-break-{i}", TRIM())
        k.add_box(bm, (0.0, 0.0, z), (hx * 2 + 0.05, hy * 2 + 0.05, 0.07))
        done()
    bm, done = k.part("window", GLASS())
    k.add_box(bm, (-0.78, -hy - 0.03, 1.55), (0.72, 0.06, 0.52))
    done()
    bm, done = k.part("sill", METAL())
    k.add_box(bm, (-0.78, -hy - 0.05, 1.26), (0.86, 0.1, 0.07))
    done()


def hab_b():
    """The same shell with a lean-to bolted on, because one room was not enough."""
    hx, hy, top = FRAME["hab"]
    k.asset("hab-shell-b")
    hab_body(hx - 0.34, hy, top)
    corner_posts(hx - 0.36, hy - 0.02, 0.0, top)

    # Lean-to down the flank, roofed with a sloped plate.
    bm, done = k.part("lean-to", PLASTER(), 0.02)
    k.add_box(bm, (hx - 0.17, 0.1, 0.72), (0.68, hy * 1.5, 1.44))
    done()
    bm, done = k.part("lean-roof", DARKSTONE(), 0.015)
    k.add_box(bm, (hx - 0.15, 0.1, 1.50), (0.86, hy * 1.6, 0.1), Matrix.Rotation(-0.22, 3, "Y"))
    done()
    # The frame's outer corner still has to be reached, or this variant
    # normalises differently from its siblings — see rule 1.
    bm, done = k.part("lean-post", TRIM())
    k.add_tube(bm, (hx, -hy, 0.0), (hx, -hy, 1.55), 0.07, 0.07, 5)
    done()
    bm, done = k.part("lean-post-b", TRIM())
    k.add_tube(bm, (hx, hy, 0.0), (hx, hy, 1.55), 0.07, 0.07, 5)
    done()

    door(-0.55, -hy - 0.02, 0.0)
    vent_stack(-hx + 0.40, 0.0, top - 0.1, top)
    bm, done = k.part("panel-break", TRIM())
    k.add_box(bm, (-0.17, 0.0, 1.28), (hx * 2 - 0.6, hy * 2 + 0.05, 0.07))
    done()
    bm, done = k.part("window", GLASS())
    k.add_box(bm, (0.42, -hy - 0.03, 1.72), (0.5, 0.06, 0.46))
    done()
    # A patched plate, one shade off, over whatever happened here.
    bm, done = k.part("patch", METAL(), 0.01)
    k.add_box(bm, (-0.72, hy + 0.02, 0.9), (1.05, 0.07, 0.8), Matrix.Rotation(0.07, 3, "Y"))
    done()


def hab_c():
    """Raised on a plinth, with an outside stair — the one on the wet ground."""
    hx, hy, top = FRAME["hab"]
    k.asset("hab-shell-c")
    bm, done = k.part("plinth", STONE(), 0.03)
    k.add_box(bm, (0.0, 0.0, 0.24), (hx * 2, hy * 2, 0.48))
    done()

    bm, done = k.part("shell", SHELL(), 0.03)
    k.add_loft(bm, [
        k.plate_profile(-hy + 0.1, hx - 0.12, 0.48, top, 0.16),
        k.plate_profile(hy - 0.1, hx - 0.12, 0.48, top, 0.16),
    ])
    done()
    corner_posts(hx - 0.14, hy - 0.12, 0.48, top)

    # Stair up to the door, three treads and a rail.
    for i in range(3):
        bm, done = k.part(f"tread-{i}", STONE())
        k.add_box(bm, (0.55, -hy - 0.18 + i * 0.16, 0.10 + i * 0.13),
                  (0.85, 0.34, 0.1))
        done()
    bm, done = k.part("stair-rail", METAL())
    k.add_tube(bm, (0.98, -hy - 0.3, 0.42), (0.98, -hy + 0.18, 0.88), 0.028, 0.028, 4)
    done()
    door(0.55, -hy + 0.02, 0.48)

    vent_stack(-hx + 0.5, hy - 0.5, top - 0.1, top)
    bm, done = k.part("window", GLASS())
    k.add_box(bm, (-0.62, -hy + 0.08, 1.62), (0.9, 0.06, 0.5))
    done()
    bm, done = k.part("under-store", RUST(), 0.01)
    k.add_box(bm, (-0.8, hy - 0.3, 0.26), (0.9, 0.5, 0.42))
    done()
    # Reach the frame corners the plinth does not: the eaves.
    bm, done = k.part("eave", METAL())
    k.add_box(bm, (0.0, 0.0, top - 0.08), (hx * 2, hy * 2, 0.1))
    done()


# ————— Roofs —————


def roof_a():
    """A pitched wedge with a ridge cap."""
    hx, hy, top = FRAME["roof"]
    k.asset("roof")
    bm, done = k.part("pitch", DARKSTONE(), 0.02)
    k.add_loft(bm, [
        [(-hx, -hy, 0.0), (hx, -hy, 0.0), (hx, -hy, 0.34), (0.0, -hy, top), (-hx, -hy, 0.34)],
        [(-hx, hy, 0.0), (hx, hy, 0.0), (hx, hy, 0.34), (0.0, hy, top), (-hx, hy, 0.34)],
    ])
    done()
    bm, done = k.part("ridge", TRIM())
    k.add_box(bm, (0.0, 0.0, top - 0.04), (0.17, hy * 2 + 0.08, 0.12))
    done()
    for i, x in enumerate((-hx + 0.12, hx - 0.12)):
        bm, done = k.part(f"gutter-{i}", METAL())
        k.add_tube(bm, (x, -hy, 0.06), (x, hy, 0.06), 0.055, 0.055, 4)
        done()


def roof_b():
    """A shallow barrel, because the second batch shipped differently."""
    hx, hy, top = FRAME["roof"]
    k.asset("roof-b")
    ring = []
    steps = 7
    import math
    for i in range(steps):
        t = i / (steps - 1)
        ring.append((-hx + 2 * hx * t, 0.0, math.sin(t * math.pi) * top))
    bm, done = k.part("barrel", DARKSTONE())
    k.add_loft(bm, [
        [(x, -hy, max(z, 0.02)) for x, _, z in ring] + [(hx, -hy, 0.0), (-hx, -hy, 0.0)],
        [(x, hy, max(z, 0.02)) for x, _, z in ring] + [(hx, hy, 0.0), (-hx, hy, 0.0)],
    ])
    done()
    for i, y in enumerate((-hy + 0.2, 0.0, hy - 0.2)):
        bm, done = k.part(f"hoop-{i}", METAL())
        k.add_box(bm, (0.0, y, top * 0.42), (hx * 2 + 0.04, 0.09, top * 0.9))
        done()


def roof_c():
    """Flat, with a parapet and the collectors everyone eventually bolts up."""
    hx, hy, top = FRAME["roof"]
    k.asset("roof-c")
    bm, done = k.part("deck", DARKSTONE(), 0.02)
    k.add_box(bm, (0.0, 0.0, 0.19), (hx * 2, hy * 2, 0.38))
    done()
    for i, (sx, sy, w, d) in enumerate((
        (0, -hy + 0.06, hx * 2, 0.12), (0, hy - 0.06, hx * 2, 0.12),
        (-hx + 0.06, 0, 0.12, hy * 2), (hx - 0.06, 0, 0.12, hy * 2),
    )):
        bm, done = k.part(f"parapet-{i}", PLASTER())
        k.add_box(bm, (sx, sy, 0.52), (w, d, 0.28))
        done()
    for i, x in enumerate((-0.62, 0.62)):
        bm, done = k.part(f"collector-{i}", GLASS(), 0.01)
        k.add_box(bm, (x, 0.0, 0.62), (0.92, hy * 1.3, 0.06), Matrix.Rotation(0.3, 3, "Y"))
        done()
    bm, done = k.part("hatch", TRIM(), 0.01)
    k.add_box(bm, (0.0, hy - 0.5, 0.46), (0.5, 0.5, 0.16))
    done()
    # Reach the frame's top: the aerial the flat roof exists to carry.
    bm, done = k.part("aerial", METAL())
    k.add_tube(bm, (hx - 0.3, -hy + 0.3, 0.4), (hx - 0.3, -hy + 0.3, top), 0.035, 0.02, 4)
    done()


# ————— The rest of the village —————


def mast():
    k.asset("mast")
    bm, done = k.part("column", METAL())
    k.add_tube(bm, (0.0, 0.0, 0.0), (0.0, 0.0, 4.6), 0.13, 0.08, 6)
    done()
    for i, z in enumerate((1.1, 2.4, 3.6)):
        bm, done = k.part(f"collar-{i}", TRIM())
        k.add_tube(bm, (0.0, 0.0, z), (0.0, 0.0, z + 0.1), 0.17, 0.17, 6)
        done()
    # Guys out to the frame corners — also what reaches the fit box.
    for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        bm, done = k.part(f"guy-{i}", METAL())
        k.add_tube(bm, (0.0, 0.0, 3.4), (sx * 0.6, sy * 0.6, 0.0), 0.018, 0.018, 4)
        done()
    bm, done = k.part("equipment-box", PLASTER(), 0.015)
    k.add_box(bm, (0.0, 0.24, 1.9), (0.46, 0.34, 0.62))
    done()
    bm, done = k.part("dish", SHELL())
    k.add_tube(bm, (0.0, 0.0, 4.6), (0.16, 0.0, 5.0), 0.1, 0.38, 10)
    done()
    bm, done = k.part("lamp-housing", GOLD())
    k.add_tube(bm, (0.0, 0.0, 4.44), (0.0, 0.0, 4.6), 0.1, 0.1, 6)
    done()


def dome_a():
    hx, hy, top = FRAME["dome"]
    k.asset("dome")
    import math
    rings = []
    for i in range(4):
        t = i / 3
        rings.append([
            (math.cos(a * math.pi / 4) * hx * math.cos(t * math.pi / 2.05),
             math.sin(a * math.pi / 4) * hy * math.cos(t * math.pi / 2.05),
             0.08 + math.sin(t * math.pi / 2.05) * (top - 0.1))
            for a in range(8)
        ])
    bm, done = k.part("shell", GLASS())
    k.add_loft(bm, rings, cap_first=False)
    done()
    bm, done = k.part("skirt", METAL())
    k.add_tube(bm, (0.0, 0.0, 0.0), (0.0, 0.0, 0.16), hx, hx * 0.99, 8)
    done()
    for i in range(4):
        a = i * math.pi / 4
        bm, done = k.part(f"rib-{i}", TRIM())
        k.add_box(bm, (0.0, 0.0, top * 0.52), (hx * 2, 0.09, 0.09),
                  Matrix.Rotation(a, 3, "Z"))
        done()
    bm, done = k.part("crown", METAL())
    k.add_tube(bm, (0.0, 0.0, top - 0.14), (0.0, 0.0, top), 0.22, 0.16, 8)
    done()


def dome_b():
    """Half-buried, ribbed, with an airlock trunk — the older pattern."""
    hx, hy, top = FRAME["dome"]
    k.asset("dome-b")
    import math
    rings = []
    for i in range(4):
        t = i / 3
        rings.append([
            (math.cos(a * math.pi / 4) * hx * math.cos(t * math.pi / 2.4),
             math.sin(a * math.pi / 4) * hy * math.cos(t * math.pi / 2.4),
             0.05 + math.sin(t * math.pi / 2.4) * (top - 0.55))
            for a in range(8)
        ])
    bm, done = k.part("shell", PLASTER())
    k.add_loft(bm, rings, cap_first=False)
    done()
    bm, done = k.part("berm", STONE())
    k.add_tube(bm, (0.0, 0.0, 0.0), (0.0, 0.0, 0.3), hx, hx * 0.86, 8)
    done()
    bm, done = k.part("trunk", METAL(), 0.02)
    k.add_box(bm, (hx * 0.55, 0.0, 0.55), (0.8, 0.86, 1.1))
    done()
    bm, done = k.part("trunk-hatch", TRIM())
    k.add_box(bm, (hx * 0.55 + 0.4, 0.0, 0.5), (0.06, 0.6, 0.86))
    done()
    for i in range(3):
        bm, done = k.part(f"port-{i}", GLASS())
        a = (i - 1) * 0.9
        k.add_box(bm, (math.cos(a) * hx * 0.62, math.sin(a) * hy * 0.62, 0.72),
                  (0.42, 0.42, 0.3), Matrix.Rotation(a, 3, "Z"))
        done()
    # The vent that reaches the frame's top.
    vent_stack(-hx * 0.4, hy * 0.4, top - 0.7, top - 0.13, 0.16)


def pad():
    k.asset("pad")
    import math
    bm, done = k.part("disc", DARKSTONE())
    k.add_tube(bm, (0.0, 0.0, 0.0), (0.0, 0.0, 0.18), 2.6, 2.6, 20)
    done()
    bm, done = k.part("ring", GOLD())
    k.add_tube(bm, (0.0, 0.0, 0.18), (0.0, 0.0, 0.21), 1.8, 1.72, 20)
    done()
    for i in range(4):
        a = i * math.pi / 2
        bm, done = k.part(f"tick-{i}", SHELL())
        k.add_box(bm, (math.cos(a) * 2.1, math.sin(a) * 2.1, 0.20),
                  (0.7, 0.16, 0.04), Matrix.Rotation(a, 3, "Z"))
        done()
        bm, done = k.part(f"lamp-{i}", GOLD())
        k.add_tube(bm, (math.cos(a + 0.78) * 2.35, math.sin(a + 0.78) * 2.35, 0.18),
                   (math.cos(a + 0.78) * 2.35, math.sin(a + 0.78) * 2.35, 0.35),
                   0.09, 0.07, 5)
        done()
    bm, done = k.part("kerb", METAL())
    k.add_tube(bm, (0.0, 0.0, 0.0), (0.0, 0.0, 0.1), 2.62, 2.62, 20)
    done()


def stilt_a():
    hx, hy, top = FRAME["stilt"]
    k.asset("stilt")
    bm, done = k.part("column", METAL())
    k.add_tube(bm, (0.0, 0.0, 0.1), (0.0, 0.0, top), 0.2, 0.15, 6)
    done()
    bm, done = k.part("foot", DARKSTONE(), 0.015)
    k.add_box(bm, (0.0, 0.0, 0.06), (hx * 2, hy * 2, 0.12))
    done()
    for i, (sx, sy) in enumerate(((-1, 0), (1, 0), (0, -1), (0, 1))):
        bm, done = k.part(f"brace-{i}", METAL())
        k.add_tube(bm, (0.0, 0.0, top - 0.5), (sx * hx, sy * hy, 0.12), 0.045, 0.045, 4)
        done()


def stilt_b():
    """Braced pair — the footing they used where the ground moves."""
    hx, hy, top = FRAME["stilt"]
    k.asset("stilt-b")
    for i, sx in enumerate((-1, 1)):
        bm, done = k.part(f"leg-{i}", METAL())
        k.add_tube(bm, (sx * hx * 0.7, 0.0, 0.1), (sx * hx * 0.25, 0.0, top), 0.14, 0.11, 6)
        done()
    bm, done = k.part("foot", STONE(), 0.015)
    k.add_box(bm, (0.0, 0.0, 0.06), (hx * 2, hy * 2, 0.12))
    done()
    for i, z in enumerate((1.1, 2.2)):
        bm, done = k.part(f"tie-{i}", METAL())
        k.add_tube(bm, (-hx * 0.6, 0.0, z), (hx * 0.6, 0.0, z), 0.04, 0.04, 4)
        done()
    bm, done = k.part("cap", TRIM())
    k.add_box(bm, (0.0, 0.0, top - 0.06), (hx * 1.4, hy * 2, 0.12))
    done()


def works_a():
    """The processing shed: stacks, a wheel, and a tank."""
    hx, hy, top = FRAME["works"]
    k.asset("works")
    bm, done = k.part("body", PLASTER(), 0.03)
    k.add_loft(bm, [
        k.plate_profile(-hy, hx, 0.0, 1.6, 0.14),
        k.plate_profile(hy, hx, 0.0, 1.6, 0.14),
    ])
    done()
    bm, done = k.part("stack-main", RUST())
    k.add_tube(bm, (-0.6, 0.2, 1.4), (-0.6, 0.2, top), 0.26, 0.21, 8)
    done()
    bm, done = k.part("stack-cap", TRIM())
    k.add_tube(bm, (-0.6, 0.2, top - 0.06), (-0.6, 0.2, top), 0.3, 0.26, 8)
    done()
    bm, done = k.part("stack-second", RUST())
    k.add_tube(bm, (0.42, -0.34, 1.4), (0.42, -0.34, 2.5), 0.2, 0.17, 8)
    done()
    bm, done = k.part("wheel", GOLD())
    k.add_tube(bm, (hx - 0.04, 0.0, 0.85), (hx + 0.16, 0.0, 0.85), 0.5, 0.5, 10)
    done()
    bm, done = k.part("wheel-hub", TRIM())
    k.add_tube(bm, (hx - 0.06, 0.0, 0.85), (hx + 0.2, 0.0, 0.85), 0.14, 0.12, 6)
    done()
    bm, done = k.part("tank", METAL())
    k.add_tube(bm, (-hx + 0.3, -hy - 0.02, 0.55), (-hx + 0.3, -hy - 0.02, 1.75), 0.32, 0.32, 8)
    done()
    door(0.7, -hy - 0.02, 0.0, 0.8, 1.5)
    ladder(-0.05, hy + 0.06, 0.2, 1.62)


def works_b():
    """The same trade, run out of a gantry and two tanks instead of a shed."""
    hx, hy, top = FRAME["works"]
    k.asset("works-b")
    bm, done = k.part("base", DARKSTONE(), 0.02)
    k.add_box(bm, (0.0, 0.0, 0.16), (hx * 2, hy * 2, 0.32))
    done()
    for i, x in enumerate((-0.62, 0.62)):
        bm, done = k.part(f"tank-{i}", PLASTER())
        k.add_tube(bm, (x, 0.0, 0.32), (x, 0.0, 2.15), 0.52, 0.48, 10)
        done()
        bm, done = k.part(f"tank-cap-{i}", METAL())
        k.add_tube(bm, (x, 0.0, 2.1), (x, 0.0, 2.32), 0.5, 0.34, 10)
        done()
        bm, done = k.part(f"tank-band-{i}", RUST())
        k.add_tube(bm, (x, 0.0, 1.15), (x, 0.0, 1.32), 0.55, 0.55, 10)
        done()
    # Gantry over the top, which is what reaches the frame's ceiling.
    for i, sx in enumerate((-1, 1)):
        bm, done = k.part(f"gantry-leg-{i}", METAL())
        k.add_tube(bm, (sx * hx * 0.9, -hy * 0.7, 0.3), (sx * hx * 0.9, -hy * 0.7, top - 0.12),
                   0.075, 0.06, 5)
        done()
    bm, done = k.part("gantry-beam", METAL())
    k.add_box(bm, (0.0, -hy * 0.7, top - 0.08), (hx * 2, 0.17, 0.16))
    done()
    bm, done = k.part("hoist", TRIM())
    k.add_box(bm, (0.35, -hy * 0.7, top - 0.42), (0.3, 0.26, 0.5))
    done()
    bm, done = k.part("pipe-run", RUST())
    k.add_tube(bm, (-0.62, hy * 0.55, 1.62), (0.62, hy * 0.55, 1.62), 0.11, 0.11, 6)
    done()
    bm, done = k.part("valve", GOLD())
    k.add_tube(bm, (0.0, hy * 0.55, 1.62), (0.0, hy * 0.9, 1.62), 0.16, 0.14, 6)
    done()


def banner():
    k.asset("banner")
    bm, done = k.part("pole", METAL())
    k.add_tube(bm, (0.0, 0.0, 0.0), (0.0, 0.0, 3.2), 0.08, 0.055, 6)
    done()
    bm, done = k.part("base", DARKSTONE(), 0.01)
    k.add_box(bm, (0.0, 0.0, 0.07), (0.44, 0.44, 0.14))
    done()
    bm, done = k.part("cloth", GOLD(), 0.01)
    k.add_box(bm, (0.52, 0.0, 2.32), (0.9, 0.05, 1.2))
    done()
    bm, done = k.part("cloth-edge", RUST())
    k.add_box(bm, (0.95, 0.0, 2.32), (0.08, 0.06, 1.2))
    done()
    bm, done = k.part("halyard", TRIM())
    k.add_tube(bm, (0.06, 0.0, 3.1), (0.06, 0.0, 1.1), 0.012, 0.012, 4)
    done()
    bm, done = k.part("finial", SHELL())
    k.add_tube(bm, (0.0, 0.0, 3.2), (0.0, 0.0, 3.4), 0.075, 0.02, 6)
    done()


def scaffold():
    k.asset("scaffold")
    hx, hy, top = 1.5, 1.5, 3.4
    for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        bm, done = k.part(f"upright-{i}", METAL())
        k.add_tube(bm, (sx * hx, sy * hy, 0.0), (sx * hx, sy * hy, top), 0.075, 0.075, 5)
        done()
    for i, z in enumerate((1.15, 2.3, 3.35)):
        for j, (ax, ay, bx, by) in enumerate((
            (-hx, -hy, hx, -hy), (-hx, hy, hx, hy),
            (-hx, -hy, -hx, hy), (hx, -hy, hx, hy),
        )):
            bm, done = k.part(f"rail-{i}-{j}", METAL())
            k.add_tube(bm, (ax, ay, z), (bx, by, z), 0.04, 0.04, 4)
            done()
    for i, z in enumerate((1.15, 2.3)):
        bm, done = k.part(f"plank-{i}", RUST())
        k.add_box(bm, (0.0, 0.0, z + 0.06), (hx * 2 - 0.1, 0.86, 0.09))
        done()
    bm, done = k.part("brace", METAL())
    k.add_tube(bm, (-hx, -hy, 0.1), (hx, -hy, 2.25), 0.035, 0.035, 4)
    done()
    bm, done = k.part("sheet", PLASTER(), 0.01)
    k.add_box(bm, (0.0, hy + 0.02, 1.75), (hx * 1.7, 0.04, 1.5))
    done()
    ladder(0.0, -hy - 0.12, 0.1, 2.3, 6)


def build():
    hab_a()
    hab_b()
    hab_c()
    roof_a()
    roof_b()
    roof_c()
    mast()
    dome_a()
    dome_b()
    pad()
    stilt_a()
    stilt_b()
    works_a()
    works_b()
    banner()
    scaffold()


# Per-asset budget is 900 (ASSET_UPLIFT 2.3); this total covers 16 of them.
k.run("settlement-kit", build, tri_budget=14400, per_asset=900)
