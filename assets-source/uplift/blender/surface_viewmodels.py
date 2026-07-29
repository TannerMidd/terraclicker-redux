"""
First-person surface equipment.

Build directly:

    blender --background --python surface_viewmodels.py -- \
      --blend surface_viewmodels.blend \
      --glb ../../../public/assets/uplift/meshes/viewmodels/surface-viewmodels.glb

The runtime asks for each root independently.  That is deliberate: the game's
kit loader flattens every root it reads, so rigid roots are the durable way to
let SurfaceScene swap heads, spin the drill, steer the bars and move the
throttle without a rig.

Authoring convention is the same as the other scripted kits: +Z is up, -Y is
forward, transforms remain identity, and every mesh receives deterministic
box UVs through kitlib.
"""

import math
import os
import sys

# Blender does not put a --python script's own directory on the path.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kitlib as k  # noqa: E402
from mathutils import Matrix  # noqa: E402


# ---------------------------------------------------------------------------
# Palette.  These are flat part colours; the runtime's shared node material
# supplies the PBR response.  Deliberately related to the runabout/skimmer kit.

HULL = lambda: k.mat(0x29344A, "vm-hull", 0.52, 0.58)              # noqa: E731
UPPER = lambda: k.mat(0x44516A, "vm-upper", 0.48, 0.54)            # noqa: E731
STEEL = lambda: k.mat(0xAAB7C8, "vm-steel", 0.34, 0.84)            # noqa: E731
DARK = lambda: k.mat(0x151B26, "vm-recess", 0.72, 0.26)            # noqa: E731
GRIP = lambda: k.mat(0x2C2928, "vm-grip", 0.92, 0.02)              # noqa: E731
MARK = lambda: k.mat(0xE4A73D, "vm-service-mark", 0.42, 0.32)      # noqa: E731
SCREEN = lambda: k.mat(0x58D8EC, "vm-screen", 0.12, 0.20)          # noqa: E731
ALERT = lambda: k.mat(0xF66C4A, "vm-alert", 0.18, 0.18)            # noqa: E731
SUIT = lambda: k.mat(0xC4CAD1, "vm-suit", 0.78, 0.05)              # noqa: E731
SUIT_DARK = lambda: k.mat(0x39404B, "vm-suit-joint", 0.86, 0.03)   # noqa: E731
GLOVE = lambda: k.mat(0x242A31, "vm-glove", 0.90, 0.02)            # noqa: E731
GLOVE_PAD = lambda: k.mat(0x697381, "vm-glove-pad", 0.72, 0.08)    # noqa: E731


def ring_y(y, radius, z=0.0, count=10, phase=0.0):
    """A ring in the X/Z plane, for low-poly shapes running along Y."""
    return [
        (
            math.cos(phase + math.tau * i / count) * radius,
            y,
            z + math.sin(phase + math.tau * i / count) * radius,
        )
        for i in range(count)
    ]


def rect_ring_y(y, half_x, half_z, z=0.0):
    return [
        (-half_x, y, z - half_z),
        (half_x, y, z - half_z),
        (half_x, y, z + half_z),
        (-half_x, y, z + half_z),
    ]


def build_tool_body():
    """Powered field-tool haft.  Origin is at the heel of the lower grip."""
    k.asset("field-tool-body", {"role": "surface-viewmodel"})

    bm, done = k.part("tool-spine", STEEL())
    k.add_tube(bm, (0, 0, -0.02), (0, 0, 0.61), 0.027, 0.022, 10)
    done()

    bm, done = k.part("lower-grip", GRIP())
    k.add_tube(bm, (0, 0, 0.0), (0, 0, 0.18), 0.039, 0.036, 10)
    done()
    # Four raised bands make the rubber read at first-person distance.
    for i in range(4):
        z = 0.025 + i * 0.041
        bm, done = k.part(f"grip-band-{i}", GLOVE_PAD())
        k.add_tube(bm, (0, 0, z), (0, 0, z + 0.009), 0.041, 0.041, 10)
        done()

    bm, done = k.part("power-cell", HULL(), 0.006)
    k.add_box(bm, (0.048, 0.0, 0.25), (0.055, 0.065, 0.18))
    done()
    bm, done = k.part("power-cell-mark", MARK())
    k.add_box(bm, (0.078, -0.001, 0.26), (0.005, 0.048, 0.09))
    done()

    bm, done = k.part("thumb-control", SCREEN(), 0.003)
    k.add_box(bm, (-0.032, -0.035, 0.20), (0.035, 0.018, 0.055))
    done()

    bm, done = k.part("upper-grip", GRIP())
    k.add_tube(bm, (0, 0, 0.34), (0, 0, 0.46), 0.032, 0.029, 10)
    done()
    bm, done = k.part("head-coupler", HULL())
    k.add_tube(bm, (0, 0, 0.55), (0, 0, 0.64), 0.052, 0.048, 10)
    done()
    bm, done = k.part("coupler-ring", MARK())
    k.add_tube(bm, (0, 0, 0.565), (0, 0, 0.59), 0.055, 0.055, 10)
    done()


def build_pick_head():
    """Quick-break head: forward spike, rear adze, visible shock block."""
    k.asset("field-head-pick", {"verb": "break"})

    bm, done = k.part("pick-shock-block", HULL(), 0.006)
    k.add_box(bm, (0, -0.015, 0), (0.105, 0.18, 0.09))
    done()
    bm, done = k.part("pick-collar", STEEL())
    k.add_tube(bm, (0, -0.07, 0), (0, 0.08, 0), 0.065, 0.058, 8)
    done()
    bm, done = k.part("pick-spike", STEEL())
    k.add_loft(
        bm,
        [
            ring_y(-0.06, 0.062, count=8),
            ring_y(-0.22, 0.040, count=8, phase=0.15),
            ring_y(-0.38, 0.014, count=8, phase=0.3),
            ring_y(-0.44, 0.003, count=8, phase=0.45),
        ],
    )
    done()
    bm, done = k.part("pick-adze", STEEL())
    k.add_loft(
        bm,
        [
            rect_ring_y(0.05, 0.052, 0.035),
            rect_ring_y(0.20, 0.076, 0.025),
            rect_ring_y(0.34, 0.12, 0.012),
        ],
    )
    done()
    bm, done = k.part("pick-warning", ALERT())
    k.add_box(bm, (0, -0.104, 0.048), (0.055, 0.07, 0.008))
    done()


def build_drill_head():
    """Core head: stout motor and a faceted, stepped coring bit."""
    k.asset("field-head-drill", {"verb": "core"})

    bm, done = k.part("drill-motor", HULL(), 0.008)
    k.add_tube(bm, (0, 0.10, 0), (0, -0.09, 0), 0.082, 0.074, 10)
    done()
    bm, done = k.part("drill-motor-collar", MARK())
    k.add_tube(bm, (0, -0.06, 0), (0, -0.11, 0), 0.086, 0.086, 10)
    done()
    bm, done = k.part("drill-bit", STEEL())
    k.add_loft(
        bm,
        [
            ring_y(-0.10, 0.070, count=10),
            ring_y(-0.21, 0.066, count=10, phase=0.22),
            ring_y(-0.32, 0.052, count=10, phase=0.44),
            ring_y(-0.43, 0.035, count=10, phase=0.66),
            ring_y(-0.51, 0.004, count=10, phase=0.88),
        ],
    )
    done()
    # Alternating carbide ribs suggest the helix without spending on a curve.
    for i, (y, phase) in enumerate(((-0.17, 0.0), (-0.27, 0.7), (-0.37, 1.4))):
        x = math.cos(phase) * 0.054
        z = math.sin(phase) * 0.054
        bm, done = k.part(f"drill-cutter-{i}", DARK())
        k.add_box(bm, (x, y, z), (0.024, 0.09, 0.024), Matrix.Rotation(phase, 3, "Y"))
        done()


def build_scanner_head():
    """Non-contact scanner paddle; the lens is a separately emissive root."""
    k.asset("field-head-scanner", {"verb": "scan"})

    bm, done = k.part("scanner-neck", STEEL())
    k.add_tube(bm, (0, 0.10, 0), (0, -0.02, 0), 0.055, 0.047, 8)
    done()
    bm, done = k.part("scanner-back", HULL(), 0.008)
    k.add_box(bm, (0, -0.15, 0), (0.26, 0.24, 0.075))
    done()
    for side in (-1, 1):
        bm, done = k.part(f"scanner-fork-{'l' if side < 0 else 'r'}", STEEL(), 0.004)
        k.add_box(bm, (side * 0.12, -0.29, 0), (0.035, 0.25, 0.055))
        done()
        bm, done = k.part(f"scanner-tip-{'l' if side < 0 else 'r'}", MARK())
        k.add_tube(bm, (side * 0.12, -0.37, 0), (side * 0.12, -0.43, 0),
                   0.032, 0.018, 6)
        done()
    bm, done = k.part("scanner-guard", DARK())
    k.add_box(bm, (0, -0.16, 0.042), (0.20, 0.15, 0.016))
    done()

    k.asset("field-scanner-emitter", {"verb": "scan", "emissive": True})
    bm, done = k.part("scanner-lens", SCREEN(), 0.004)
    k.add_box(bm, (0, -0.16, 0), (0.17, 0.14, 0.018))
    done()
    for x in (-0.058, 0, 0.058):
        bm, done = k.part(f"scanner-readout-{x:+.3f}", SCREEN())
        k.add_box(bm, (x, -0.242, 0), (0.026, 0.018, 0.023))
        done()


def build_sample_head():
    """Gentle sampling jaws and a transparent-in-fiction collection cartridge."""
    k.asset("field-head-sample", {"verb": "prospect-preserve"})

    bm, done = k.part("sample-neck", HULL(), 0.006)
    k.add_box(bm, (0, 0.02, 0), (0.105, 0.19, 0.085))
    done()
    bm, done = k.part("sample-cartridge", SCREEN())
    k.add_tube(bm, (0, -0.05, 0), (0, -0.25, 0), 0.046, 0.046, 8)
    done()
    bm, done = k.part("sample-cartridge-cap", MARK())
    k.add_tube(bm, (0, -0.20, 0), (0, -0.26, 0), 0.051, 0.051, 8)
    done()
    for side in (-1, 1):
        bm, done = k.part(f"sample-jaw-{'l' if side < 0 else 'r'}", STEEL())
        k.add_loft(
            bm,
            [
                rect_ring_y(-0.06, 0.025, 0.028, side * 0.05),
                rect_ring_y(-0.29, 0.022, 0.024, side * 0.07),
                rect_ring_y(-0.41, 0.010, 0.015, side * 0.035),
            ],
        )
        done()
    bm, done = k.part("sample-spatula", STEEL())
    k.add_loft(
        bm,
        [
            rect_ring_y(-0.12, 0.035, 0.018, -0.035),
            rect_ring_y(-0.35, 0.065, 0.012, -0.045),
        ],
    )
    done()


def build_field_hand(name, side, upper):
    """A chunky expedition glove already posed around the vertical haft."""
    k.asset(name, {"role": "field-hand"})
    side_word = "left" if side < 0 else "right"

    # Sleeve approaches the grip from below and outboard.
    bm, done = k.part(f"{side_word}-sleeve", SUIT())
    k.add_tube(
        bm,
        (side * (0.24 if upper else 0.20), 0.055, -0.22),
        (side * 0.055, 0.015, -0.015),
        0.085,
        0.067,
        8,
    )
    done()
    bm, done = k.part(f"{side_word}-cuff", SUIT_DARK())
    k.add_tube(
        bm,
        (side * 0.085, 0.025, -0.045),
        (side * 0.045, 0.010, 0.005),
        0.076,
        0.071,
        8,
    )
    done()
    bm, done = k.part(f"{side_word}-palm", GLOVE(), 0.005)
    k.add_box(bm, (side * 0.018, 0.0, 0.045), (0.13, 0.095, 0.14))
    done()
    bm, done = k.part(f"{side_word}-knuckle", GLOVE_PAD(), 0.003)
    k.add_box(bm, (side * 0.012, -0.050, 0.074), (0.105, 0.018, 0.060))
    done()

    # Four curled fingers form a readable clamp around the shaft.
    for i in range(4):
        x = -0.044 + i * 0.029
        bm, done = k.part(f"{side_word}-finger-{i}", GLOVE())
        k.add_tube(bm, (x, -0.044, 0.068), (x, 0.028, 0.030),
                   0.015, 0.014, 6)
        done()
    bm, done = k.part(f"{side_word}-thumb", GLOVE())
    k.add_tube(
        bm,
        (side * 0.060, -0.038, 0.020),
        (side * 0.012, -0.020, 0.092),
        0.019,
        0.016,
        6,
    )
    done()


def build_skimmer_cowl():
    """Folded survey-sled nose, close enough to show its fasteners."""
    k.asset("skimmer-cowl", {"role": "skimmer-viewmodel"})

    left_rot = Matrix.Rotation(-0.16, 3, "Z") @ Matrix.Rotation(-0.26, 3, "X")
    right_rot = Matrix.Rotation(0.16, 3, "Z") @ Matrix.Rotation(-0.26, 3, "X")
    for side, rot in ((-1, left_rot), (1, right_rot)):
        word = "left" if side < 0 else "right"
        bm, done = k.part(f"cowl-{word}", UPPER(), 0.008)
        k.add_box(bm, (side * 0.25, -0.03, 0.01), (0.46, 0.36, 0.075), rot)
        done()
        bm, done = k.part(f"cowl-edge-{word}", STEEL())
        k.add_box(bm, (side * 0.44, -0.02, 0.025), (0.035, 0.38, 0.055), rot)
        done()
        bm, done = k.part(f"knee-pad-{word}", DARK(), 0.005)
        k.add_box(bm, (side * 0.34, 0.07, -0.035), (0.18, 0.18, 0.035), rot)
        done()

    bm, done = k.part("cowl-centre-spine", HULL(), 0.008)
    k.add_loft(
        bm,
        [
            rect_ring_y(-0.22, 0.075, 0.035, -0.01),
            rect_ring_y(0.0, 0.105, 0.055, 0.005),
            rect_ring_y(0.20, 0.075, 0.04, -0.01),
        ],
    )
    done()
    bm, done = k.part("display-bezel", DARK(), 0.005)
    k.add_box(bm, (0, -0.10, 0.075), (0.27, 0.15, 0.045),
              Matrix.Rotation(-0.42, 3, "X"))
    done()
    bm, done = k.part("service-stripe", MARK())
    k.add_box(bm, (0, 0.165, 0.0), (0.50, 0.025, 0.016))
    done()

    # Six bright fastener heads reward the close camera without a texture.
    for i, x in enumerate((-0.40, -0.24, -0.08, 0.08, 0.24, 0.40)):
        bm, done = k.part(f"cowl-fastener-{i}", STEEL())
        k.add_tube(bm, (x, 0.105, 0.045), (x, 0.105, 0.058), 0.010, 0.010, 6)
        done()


def build_skimmer_bars():
    """Handlebar assembly kept separate so SurfaceScene can steer it."""
    k.asset("skimmer-bars", {"role": "steering"})
    bm, done = k.part("bar-crossbeam", STEEL())
    k.add_tube(bm, (-0.47, 0, 0.03), (0.47, 0, 0.03), 0.026, 0.026, 10)
    done()
    for side in (-1, 1):
        word = "left" if side < 0 else "right"
        bm, done = k.part(f"bar-stem-{word}", STEEL())
        k.add_tube(bm, (side * 0.18, 0.12, -0.06), (side * 0.32, 0.0, 0.03),
                   0.026, 0.026, 8)
        done()
        bm, done = k.part(f"bar-grip-{word}", GRIP())
        k.add_tube(bm, (side * 0.33, 0, 0.03), (side * 0.49, 0, 0.03),
                   0.042, 0.042, 8)
        done()
        bm, done = k.part(f"bar-pod-{word}", HULL(), 0.004)
        k.add_box(bm, (side * 0.28, -0.025, 0.055), (0.105, 0.095, 0.075))
        done()
    bm, done = k.part("bar-centre-clamp", MARK())
    k.add_tube(bm, (-0.045, 0, 0.03), (0.045, 0, 0.03), 0.044, 0.044, 8)
    done()


def build_skimmer_display():
    """Emissive display plate; rendered with a speed-driven material."""
    k.asset("skimmer-display", {"role": "emissive-display"})
    bm, done = k.part("display-glass", SCREEN(), 0.004)
    k.add_box(bm, (0, 0, 0), (0.26, 0.13, 0.018),
              Matrix.Rotation(-0.42, 3, "X"))
    done()
    for i, x in enumerate((-0.09, -0.045, 0, 0.045, 0.09)):
        bm, done = k.part(f"speed-tick-{i}", SCREEN())
        k.add_box(bm, (x, -0.066, 0.006), (0.018, 0.006, 0.014))
        done()


def build_skimmer_throttle():
    """Right-thumb throttle, a rigid root that tilts with speed."""
    k.asset("skimmer-throttle", {"role": "throttle"})
    bm, done = k.part("throttle-base", DARK(), 0.003)
    k.add_box(bm, (0, 0, 0), (0.095, 0.075, 0.055))
    done()
    bm, done = k.part("throttle-lever", STEEL())
    k.add_tube(bm, (0, 0, 0.025), (0, -0.06, 0.10), 0.013, 0.011, 6)
    done()
    bm, done = k.part("throttle-thumb-pad", ALERT(), 0.003)
    k.add_box(bm, (0, -0.068, 0.108), (0.07, 0.04, 0.025))
    done()


def build_skimmer_hand(name, side):
    """Hand and forearm reaching forward to the horizontal bar."""
    k.asset(name, {"role": "skimmer-hand"})
    side_word = "left" if side < 0 else "right"

    bm, done = k.part(f"skim-{side_word}-sleeve", SUIT())
    k.add_tube(
        bm,
        (side * 0.30, 0.28, -0.24),
        (side * 0.05, 0.035, -0.01),
        0.092,
        0.069,
        8,
    )
    done()
    bm, done = k.part(f"skim-{side_word}-cuff", SUIT_DARK())
    k.add_tube(
        bm,
        (side * 0.09, 0.075, -0.045),
        (side * 0.035, 0.015, 0.005),
        0.077,
        0.068,
        8,
    )
    done()
    bm, done = k.part(f"skim-{side_word}-palm", GLOVE(), 0.005)
    k.add_box(bm, (0, 0, 0.035), (0.145, 0.105, 0.115))
    done()
    bm, done = k.part(f"skim-{side_word}-knuckle", GLOVE_PAD(), 0.003)
    k.add_box(bm, (0, -0.058, 0.052), (0.115, 0.016, 0.055))
    done()
    # Fingers curl below the bar, thumb rides above it.
    for i in range(4):
        x = -0.048 + i * 0.032
        bm, done = k.part(f"skim-{side_word}-finger-{i}", GLOVE())
        k.add_tube(bm, (x, -0.040, 0.025), (x, 0.025, -0.030),
                   0.016, 0.014, 6)
        done()
    bm, done = k.part(f"skim-{side_word}-thumb", GLOVE())
    k.add_tube(bm, (side * 0.058, -0.02, 0.070), (side * 0.010, 0.035, 0.018),
               0.019, 0.015, 6)
    done()


def build():
    build_tool_body()
    build_pick_head()
    build_drill_head()
    build_scanner_head()
    build_sample_head()
    build_field_hand("field-hand-left", -1, True)
    build_field_hand("field-hand-right", 1, False)
    build_skimmer_cowl()
    build_skimmer_bars()
    build_skimmer_display()
    build_skimmer_throttle()
    build_skimmer_hand("skimmer-hand-left", -1)
    build_skimmer_hand("skimmer-hand-right", 1)


k.run(
    "surface-viewmodels",
    build,
    tri_budget=9000,
    per_asset=2200,
)
