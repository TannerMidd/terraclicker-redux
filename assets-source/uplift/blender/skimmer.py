"""
The survey skimmer — ASSET_UPLIFT.md 3.4.

    npm run assets:ship

The name the game reads is `survey-skimmer` (shipKit.tsx). One asset, one call
site: SkimmerSled in SurfaceScene.tsx draws it parked; ridden, it is not drawn
at all — the dash viewmodel carries the rider's share, which spends zero
polygons on your own hull.

Scale. Unlike the runabout, this one is fitted at WORLD SCALE — the envelope is
1.86 m wide x 2.05 m tall x 3.25 m long, in metres, and nothing multiplies it
afterwards. So it is authored at exactly 1:1 against that envelope: the numbers
below are the real dimensions of the machine, and the box fit comes out uniform
because the model already is the box. A one-person hover sled you stand on.

Three emissive parts are NOT in this file — the scanner ball and two running
strips are basic-material meshes in SkimmerSled, because the merged kit shares
one lit material and cannot glow. Their seats are on this hull: the mast head
is built to meet the scanner at (0, 2.1, 1.2) in the fitted frame.

Author Z up, nose toward -Y, every object at identity. See kitlib.py.
"""

import os
import sys

# Blender does not put a --python script's own directory on the path.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kitlib as k  # noqa: E402
from mathutils import Matrix  # noqa: E402

# SkimmerSled's fit in SurfaceScene.tsx. Authored 1:1 against it.
FIT_MIN = (-0.93, 0, -1.9)
FIT_MAX = (0.93, 2.05, 1.35)

Y_NOSE = -1.90
Y_TAIL = 1.35
X_EDGE = 0.93
Z_FLOOR = 0.0   # the pods rest on the ground; min.y = 0 in the envelope
Z_TOP = 2.05    # the sensor pin

# ————— Palette —————
# The runabout's own colours: this came out of the same company's stores, and
# on the ground the two are seen together.
HULL = lambda: k.mat(0x2A3242, "skimmer-hull", 0.52, 0.62)          # noqa: E731
UPPER = lambda: k.mat(0x39445A, "skimmer-upper", 0.48, 0.6)         # noqa: E731
PALE = lambda: k.mat(0xB9C2D2, "skimmer-replacement", 0.44, 0.45)   # noqa: E731
STEEL = lambda: k.mat(0x8C96AF, "skimmer-steel", 0.38, 0.85)        # noqa: E731
DARK = lambda: k.mat(0x171C26, "skimmer-recess", 0.7, 0.3)          # noqa: E731
SCREEN = lambda: k.mat(0x5AD7E8, "skimmer-screen", 0.12, 0.25)      # noqa: E731
MARK = lambda: k.mat(0xF5C84C, "skimmer-markings", 0.35, 0.4)       # noqa: E731
OLD = lambda: k.mat(0x8A5F34, "skimmer-corrosion", 0.85, 0.2)       # noqa: E731
CARGO = lambda: k.mat(0x6E7A5A, "skimmer-cargo", 0.9, 0.05)         # noqa: E731


def build_pods():
    """The two lift pods. They are the undercarriage: their bottoms ARE Z=0,
    which is what lets a parked skimmer sit on the ground rather than in it."""
    for side in (-1, 1):
        name = k.side_name(side)
        x = side * 0.62

        bm, done = k.part(f"pod-{name}", HULL())
        k.add_tube(bm, (x, -1.42, 0.30), (x, 1.06, 0.30), 0.27, 0.30, 10)
        done()

        bm, done = k.part(f"pod-nose-{name}", UPPER())
        k.add_tube(bm, (x, -1.74, 0.30), (x, -1.42, 0.30), 0.13, 0.27, 10)
        done()

        # Intake collar forward, efflux ring aft — a hover pod has to breathe
        # somewhere, and saying where is most of what makes it read as one.
        bm, done = k.part(f"pod-intake-{name}", STEEL())
        k.add_tube(bm, (x, -1.20, 0.30), (x, -1.04, 0.30), 0.31, 0.31, 10)
        done()
        bm, done = k.part(f"pod-efflux-{name}", DARK())
        k.add_tube(bm, (x, 0.82, 0.30), (x, 1.02, 0.30), 0.31, 0.31, 10)
        done()

        # The running board you actually stand on, over the pod's shoulder.
        bm, done = k.part(f"running-board-{name}", STEEL(), 0.012)
        k.add_box(bm, (side * 0.68, -0.15, 0.60), (0.17, 2.10, 0.06))
        done()
        bm, done = k.part(f"grip-strip-{name}", DARK())
        k.add_box(bm, (side * 0.68, -0.15, 0.638), (0.13, 1.90, 0.02))
        done()

    # One pod has been off and back on again, and the collar shows it.
    bm, done = k.part("pod-clamp-starboard", OLD())
    k.add_tube(bm, (-0.62, 0.18, 0.30), (-0.62, 0.36, 0.30), 0.32, 0.32, 10)
    done()
    bm, done = k.part("pod-patch-port", PALE(), 0.01)
    k.add_box(bm, (0.62, -0.30, 0.60), (0.34, 0.72, 0.06))
    done()


def build_deck():
    """The plate between the pods, and the prow that cuts the dust."""
    bm, done = k.part("skimmer-deck", HULL(), 0.02)
    k.add_box(bm, (0.0, -0.15, 0.49), (1.24, 2.30, 0.14))
    done()

    bm, done = k.part("skimmer-prow", UPPER(), 0.015)
    k.add_loft(bm, [
        k.plate_profile(-1.90, 0.15, 0.32, 0.42, 0.04),
        k.plate_profile(-1.62, 0.37, 0.28, 0.50, 0.09),
        k.plate_profile(-1.24, 0.60, 0.25, 0.58, 0.14),
    ])
    done()

    # Underslung power cell — the heavy thing, carried low, where it belongs.
    bm, done = k.part("power-cell", DARK(), 0.015)
    k.add_box(bm, (0.0, 0.28, 0.36), (0.72, 0.86, 0.20))
    done()
    bm, done = k.part("cell-clamp", STEEL())
    k.add_box(bm, (0.0, 0.28, 0.36), (0.78, 0.12, 0.24))
    done()

    # Deck grip where the boots go.
    bm, done = k.part("deck-grip", DARK())
    k.add_box(bm, (0.0, -0.20, 0.565), (1.02, 1.30, 0.02))
    done()


def build_console():
    """What the rider holds and reads. Canted back, because they are standing."""
    lean = Matrix.Rotation(-0.38, 3, "X")

    bm, done = k.part("console-cowl", UPPER(), 0.015)
    k.add_box(bm, (0.0, -0.92, 0.88), (0.98, 0.60, 0.14), lean)
    done()
    bm, done = k.part("console-screen", SCREEN())
    k.add_box(bm, (0.0, -0.90, 0.92), (0.66, 0.40, 0.10), lean)
    done()
    bm, done = k.part("console-stalk", STEEL())
    k.add_tube(bm, (0.0, -0.86, 0.56), (0.0, -0.92, 0.82), 0.09, 0.07, 6)
    done()

    # Handlebar, with grips, and a survey lamp clamped to it off to one side.
    bm, done = k.part("handlebar", STEEL())
    k.add_tube(bm, (-0.52, -0.74, 1.14), (0.52, -0.74, 1.14), 0.035, 0.035, 8)
    done()
    for side in (-1, 1):
        name = k.side_name(side)
        bm, done = k.part(f"grip-{name}", DARK())
        k.add_tube(bm, (side * 0.34, -0.74, 1.14), (side * 0.52, -0.74, 1.14),
                   0.05, 0.05, 8)
        done()
    bm, done = k.part("survey-lamp", PALE())
    k.add_tube(bm, (0.40, -0.80, 1.20), (0.40, -0.96, 1.22), 0.09, 0.11, 8)
    done()


def build_mast():
    """The sensor mast, aft so it does not sit in the rider's eyeline. Its head
    is built to meet the scanner ball SkimmerSled draws at 2.1."""
    bm, done = k.part("mast-column", STEEL())
    k.add_tube(bm, (0.0, 1.15, 0.56), (0.0, 1.18, 1.86), 0.075, 0.05, 6)
    done()
    bm, done = k.part("mast-collar", DARK())
    k.add_tube(bm, (0.0, 1.155, 0.72), (0.0, 1.16, 0.86), 0.11, 0.11, 6)
    done()
    bm, done = k.part("sensor-head", PALE(), 0.01)
    k.add_tube(bm, (0.0, 1.18, 1.80), (0.0, 1.19, 1.97), 0.19, 0.15, 10)
    done()
    bm, done = k.part("sensor-pin", STEEL())
    k.add_tube(bm, (0.0, 1.19, 1.95), (0.0, 1.19, 2.05), 0.028, 0.018, 6)
    done()
    # A guy wire down to the deck, because the mast is thin and the ride is not.
    bm, done = k.part("mast-stay", STEEL())
    k.add_tube(bm, (0.0, 1.17, 1.62), (0.0, 0.72, 0.58), 0.018, 0.018, 5)
    done()


def build_rack():
    """The tail rack, and the samples that never came off it."""
    bm, done = k.part("rack-plate", STEEL(), 0.012)
    k.add_box(bm, (0.0, 1.02, 0.60), (0.94, 0.60, 0.06))
    done()
    for i, (x, y) in enumerate(((-0.40, 0.78), (0.40, 0.78), (-0.40, 1.26), (0.40, 1.26))):
        bm, done = k.part(f"rack-post-{i}", STEEL())
        k.add_tube(bm, (x, y, 0.56), (x, y, 0.74), 0.03, 0.03, 5)
        done()

    yaw = Matrix.Rotation(0.14, 3, "Z")
    bm, done = k.part("sample-crate", CARGO(), 0.015)
    k.add_box(bm, (0.10, 1.02, 0.78), (0.54, 0.44, 0.30), yaw)
    done()
    bm, done = k.part("crate-strap", MARK())
    k.add_box(bm, (0.10, 1.02, 0.79), (0.62, 0.08, 0.36), yaw)
    done()

    # Spare canister clipped where there was room for it, which is not level.
    bm, done = k.part("spare-canister", OLD())
    k.add_tube(bm, (-0.66, 0.62, 0.74), (-0.66, 1.14, 0.78), 0.11, 0.11, 8)
    done()
    bm, done = k.part("canister-clip", STEEL())
    k.add_box(bm, (-0.66, 0.88, 0.74), (0.06, 0.10, 0.26))
    done()

    # Registration plate on the tail: the one place the company writes on it.
    bm, done = k.part("tail-plate", PALE(), 0.01)
    k.add_box(bm, (0.0, 1.33, 0.48), (0.52, 0.05, 0.20))
    done()


def build():
    k.asset("survey-skimmer", {"atlas": "../../textures/ships/runabout-pbr.ktx2"})
    build_pods()
    build_deck()
    build_console()
    build_mast()
    build_rack()


k.run("survey-skimmer", build, FIT_MIN, FIT_MAX, tri_budget=1500)
