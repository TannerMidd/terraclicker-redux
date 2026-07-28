"""
The company runabout — ASSET_UPLIFT.md 3.1.

    npm run assets:ship

Names the game reads (see kitlib.py for why they are an API): `runabout` for
the whole ship, and `hull-nose` for the prow alone — RunaboutHull puts that one
in front of the cockpit camera as the pilot's scale reference.

Proportions. All three call sites box-fit this model into a fixed envelope,
NON-uniformly. The chase and landed envelopes are both ~0.92 W : 0.25 H : 1 L,
so the model is authored to that ratio and arrives undistorted; the prow is cut
to the cockpit envelope's ~0.47 : 0.16 : 1 for the same reason. Change the
silhouette and you change what the flight-scale checks were tuned against.

Author Z up, nose toward -Y, every object at identity. See kitlib.py.
"""

import os
import sys

# Blender does not put a --python script's own directory on the path.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kitlib as k  # noqa: E402
from mathutils import Matrix  # noqa: E402

# Mirrors RunaboutExterior.tsx's chase fit, so a drifting silhouette is noticed
# here rather than on screen.
FIT_MIN = (-0.76, -0.12, -0.85)
FIT_MAX = (0.76, 0.26, 0.79)

# ————— Overall dimensions, metres —————
Y_NOSE = -8.00   # prow tip (forward is -Y in Blender; +Z once exported)
Y_TAIL = 6.00    # engine bell mouths
X_TIP = 6.44     # wingtip
Z_PAD = -1.30    # landing pads: the model's floor, so a landed ship sits flat
Z_TOP = 2.20     # comms whip

# ————— Palette —————
# Two greys and a pale: a working hull is mostly one colour, with the repairs
# showing. sRGB hex here; kitlib converts.
HULL = lambda: k.mat(0x2A3242, "runabout-hull", 0.52, 0.62)          # noqa: E731
UPPER = lambda: k.mat(0x39445A, "runabout-upper", 0.48, 0.6)         # noqa: E731
PALE = lambda: k.mat(0xB9C2D2, "runabout-replacement", 0.44, 0.45)   # noqa: E731
STEEL = lambda: k.mat(0x8C96AF, "runabout-steel", 0.38, 0.85)        # noqa: E731
DARK = lambda: k.mat(0x171C26, "runabout-recess", 0.7, 0.3)          # noqa: E731
CANOPY = lambda: k.mat(0x5AD7E8, "runabout-canopy", 0.12, 0.25)      # noqa: E731
MARK = lambda: k.mat(0xF5C84C, "runabout-markings", 0.35, 0.4)       # noqa: E731
OLD = lambda: k.mat(0x8A5F34, "runabout-corrosion", 0.85, 0.2)       # noqa: E731
CARGO = lambda: k.mat(0x6E7A5A, "runabout-cargo", 0.9, 0.05)         # noqa: E731


def build_prow():
    """`hull-nose`: the sensor snout. Also the cockpit view's whole world, so
    its proportions are cut to that envelope rather than to taste."""
    bm, done = k.part("hull-nose", HULL(), 0.02)
    k.add_loft(bm, [
        k.plate_profile(-8.00, 0.10, -0.10, 0.04, 0.04),
        k.plate_profile(-7.20, 0.32, -0.16, 0.14, 0.09),
        k.plate_profile(-6.20, 0.56, -0.21, 0.24, 0.13),
        k.plate_profile(-5.20, 0.76, -0.245, 0.31, 0.16),
        k.plate_profile(-4.40, 0.875, -0.26, 0.34, 0.18),
    ])
    done()

    # A ranging blister under the snout, and the cap that was clearly sourced
    # from a different ship.
    bm, done = k.part("nose-sensor-blister", DARK(), 0.015)
    k.add_box(bm, (0.0, -6.55, -0.22), (0.42, 1.30, 0.16))
    done()
    bm, done = k.part("nose-cap", PALE(), 0.012)
    k.add_box(bm, (0.0, -7.62, -0.03), (0.30, 0.34, 0.20))
    done()


def build_fuselage():
    """The pressure hull: seven stations, widest just aft of the cabin."""
    bm, done = k.part("hull-core", HULL(), 0.03)
    k.add_loft(bm, [k.plate_profile(*s) for s in [
        (-4.55, 1.00, -0.30, 0.44, 0.20),
        (-3.20, 1.48, -0.40, 0.66, 0.26),
        (-1.30, 1.88, -0.48, 0.88, 0.30),
        (0.90, 2.06, -0.50, 0.94, 0.32),
        (2.90, 1.98, -0.46, 0.88, 0.30),
        (4.40, 1.76, -0.38, 0.74, 0.26),
        (5.35, 1.52, -0.28, 0.58, 0.22),
    ]])
    done()

    # Frame ribs: short sleeves a few centimetres proud of the plating, which
    # is what stops a long hull reading as an extruded lozenge.
    for i, (y, hw, z0, z1, c) in enumerate(
        [(-2.40, 1.72, -0.45, 0.80, 0.29),
         (1.90, 2.04, -0.49, 0.92, 0.32),
         (3.90, 1.86, -0.43, 0.82, 0.28)]
    ):
        bm, done = k.part(f"hull-rib-{i}", UPPER(), 0.012)
        k.add_loft(bm, [
            k.plate_profile(y - 0.09, hw + 0.05, z0 - 0.03, z1 + 0.03, c),
            k.plate_profile(y + 0.09, hw + 0.05, z0 - 0.03, z1 + 0.03, c),
        ], cap_first=False, cap_last=False)
        done()

    # Tail: a flat plate with a recessed service panel.
    bm, done = k.part("tail-plate", UPPER(), 0.02)
    k.add_box(bm, (0.0, 5.42, 0.14), (2.60, 0.16, 0.78))
    done()
    bm, done = k.part("tail-hatch", DARK(), 0.01)
    k.add_box(bm, (0.35, 5.52, 0.10), (1.05, 0.06, 0.52))
    done()


def build_cabin():
    """Canopy and the roof it interrupts."""
    bm, done = k.part("canopy", CANOPY(), 0.02)
    k.add_loft(bm, [
        k.plate_profile(-4.50, 0.60, 0.28, 0.50, 0.10),
        k.plate_profile(-3.95, 0.86, 0.34, 0.92, 0.16),
        k.plate_profile(-3.15, 0.98, 0.42, 1.16, 0.18),
        k.plate_profile(-2.35, 0.92, 0.50, 1.10, 0.16),
    ])
    done()

    # The canopy's frame members — the ship is old enough to still have them.
    for i, y in enumerate((-4.10, -3.30, -2.55)):
        bm, done = k.part(f"canopy-frame-{i}", STEEL(), 0.008)
        k.add_box(bm, (0.0, y, 0.86), (2.02, 0.07, 0.62))
        done()

    # Dorsal working deck: a pale plate, because it was replaced.
    bm, done = k.part("deck-plate", PALE(), 0.02)
    k.add_box(bm, (0.0, 0.90, 0.93), (2.30, 4.90, 0.10))
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
        name = k.side_name(side)
        bm, done = k.part(f"wing-{name}", HULL(), 0.025)
        rings = []
        for x, y_le, y_te, z_mid, thick in sections:
            ring = k.wing_section(x * side, y_le, y_te, z_mid, thick)
            rings.append(ring if side > 0 else list(reversed(ring)))
        k.add_loft(bm, rings)
        done()

        # Leading-edge intake and the tip housing the nav lamp sits on.
        bm, done = k.part(f"wing-intake-{name}", DARK(), 0.01)
        k.add_box(bm, (side * 3.30, -0.16, 0.10), (1.30, 0.22, 0.26))
        done()
        bm, done = k.part(f"wingtip-pod-{name}", STEEL(), 0.02)
        k.add_box(bm, (side * 6.28, 1.35, 0.19), (0.34, 0.86, 0.24))
        done()

        # Two hardpoints per wing, empty. A working ship advertises capacity.
        for i, y in enumerate((1.10, 2.20)):
            bm, done = k.part(f"hardpoint-{name}-{i}", STEEL(), 0.008)
            k.add_box(bm, (side * 4.55, y, -0.02), (0.30, 0.34, 0.20))
            done()


def build_engines():
    """Two nacelles sat on the wing roots, one of them not originally hers."""
    for side in (-1, 1):
        name = k.side_name(side)
        x = side * 2.88
        z = 0.26
        # Replacing an engine cowl is the cheapest big repair, and it never
        # matches: the starboard nacelle wears a pale body and a corroded collar.
        body = PALE() if side < 0 else UPPER()

        bm, done = k.part(f"nacelle-{name}", body)
        k.add_tube(bm, (x, 1.20, z), (x, 5.30, z), 0.60, 0.70, 12)
        done()

        bm, done = k.part(f"nacelle-bell-{name}", UPPER())
        k.add_tube(bm, (x, 5.30, z), (x, 6.00, z), 0.70, 0.54, 12, cap1=False)
        done()

        bm, done = k.part(f"nacelle-throat-{name}", DARK())
        k.add_tube(bm, (x, 5.55, z), (x, 5.98, z), 0.44, 0.44, 12)
        done()

        bm, done = k.part(f"nacelle-intake-{name}", STEEL())
        k.add_tube(bm, (x, 1.02, z), (x, 1.26, z), 0.66, 0.62, 12)
        done()

        bm, done = k.part(f"nacelle-intake-face-{name}", DARK())
        k.add_tube(bm, (x, 1.06, z), (x, 1.14, z), 0.56, 0.56, 12)
        done()

        collar = OLD() if side < 0 else STEEL()
        bm, done = k.part(f"nacelle-collar-{name}", collar)
        k.add_tube(bm, (x, 3.05, z), (x, 3.30, z), 0.74, 0.74, 12)
        done()

        # Fairing down onto the wing, and a coolant run along the top.
        bm, done = k.part(f"nacelle-fairing-{name}", HULL(), 0.02)
        k.add_box(bm, (x, 2.40, -0.14), (0.72, 2.90, 0.62))
        done()
        bm, done = k.part(f"nacelle-conduit-{name}", STEEL())
        k.add_tube(bm, (x - side * 0.30, 1.60, z + 0.60),
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
        bm, done = k.part(f"gear-strut-{name}", STEEL())
        k.add_tube(bm, (x, y, z_top), (x, y, Z_PAD + 0.20), radius, radius * 0.82, 8)
        done()
        bm, done = k.part(f"gear-shock-{name}", DARK())
        k.add_tube(bm, (x, y, z_top - 0.30), (x, y, z_top - 0.62),
                   radius * 1.25, radius * 1.25, 8)
        done()
        bm, done = k.part(f"gear-pad-{name}", HULL(), 0.02)
        k.add_box(bm, (x, y, Z_PAD + 0.09), (pad_x, pad_y, 0.18))
        done()
        # Drag link back to the hull: gear that reads as gear needs the brace.
        bm, done = k.part(f"gear-link-{name}", STEEL())
        k.add_tube(bm, (x, y, Z_PAD + 0.34), (x * 0.55, y + 0.85, z_top + 0.02),
                   0.05, 0.05, 6)
        done()


def build_dorsal():
    """Spine, service stripe, comms, and the cargo nobody has unloaded."""
    bm, done = k.part("spine-rail", STEEL(), 0.012)
    k.add_box(bm, (0.0, 0.90, 1.05), (0.34, 5.40, 0.14))
    done()
    # Below roughly a hand's width, a bevel costs 32 triangles and returns
    # nothing at any distance the ship is drawn — these stay hard-edged.
    bm, done = k.part("service-stripe", MARK())
    k.add_box(bm, (0.0, 0.60, 1.13), (0.13, 4.20, 0.04))
    done()

    # Strapped-down crate, sat off-centre and slightly askew, because it was
    # loaded by someone in a hurry.
    yaw = Matrix.Rotation(0.10, 3, "Z")
    bm, done = k.part("deck-crate", CARGO(), 0.02)
    k.add_box(bm, (-0.72, 1.55, 1.24), (1.10, 1.46, 0.52), yaw)
    done()
    for i, y in enumerate((1.10, 2.00)):
        bm, done = k.part(f"crate-strap-{i}", MARK())
        k.add_box(bm, (-0.72, y, 1.25), (1.20, 0.10, 0.60), yaw)
        done()

    # Comms whip to port, sensor dish to starboard. Nothing on this ship is
    # mirrored if it did not have to be.
    bm, done = k.part("comms-whip", STEEL())
    k.add_tube(bm, (-0.74, 3.10, 1.00), (-0.90, 3.34, Z_TOP), 0.045, 0.022, 6)
    done()
    bm, done = k.part("comms-base", DARK(), 0.008)
    k.add_box(bm, (-0.74, 3.10, 1.02), (0.26, 0.26, 0.14))
    done()

    bm, done = k.part("sensor-mast", STEEL())
    k.add_tube(bm, (0.92, -1.85, 0.92), (0.92, -1.85, 1.62), 0.07, 0.06, 6)
    done()
    bm, done = k.part("sensor-dish", PALE())
    k.add_tube(bm, (0.92, -1.85, 1.62), (0.98, -2.05, 1.78), 0.14, 0.40, 10)
    done()

    for i, (x, y) in enumerate(((-0.95, -0.60), (0.95, -0.60), (-0.95, 3.10), (0.95, 3.10))):
        bm, done = k.part(f"tie-down-{i}", MARK())
        k.add_box(bm, (x, y, 0.99), (0.16, 0.16, 0.14))
        done()


def build_flanks():
    """The airlock, the ladder up to it, and the repairs."""
    # Port flank: airlock in a gold frame, with a grab rail and rungs.
    bm, done = k.part("airlock-frame", MARK(), 0.012)
    k.add_box(bm, (-1.86, -0.60, 0.16), (0.10, 1.32, 1.10))
    done()
    bm, done = k.part("airlock-door", DARK(), 0.01)
    k.add_box(bm, (-1.92, -0.60, 0.16), (0.08, 1.10, 0.92))
    done()
    bm, done = k.part("airlock-handle", STEEL())
    k.add_tube(bm, (-1.99, -0.95, 0.16), (-1.99, -0.30, 0.16), 0.035, 0.035, 6)
    done()
    for i in range(3):
        bm, done = k.part(f"ladder-rung-{i}", STEEL())
        k.add_tube(bm, (-1.80, -0.86 + i * 0.02, -0.30 - i * 0.30),
                   (-1.80, -0.34 + i * 0.02, -0.30 - i * 0.30), 0.032, 0.032, 6)
        done()

    # Starboard flank: a plate welded over something that went wrong, one
    # size too big and a few degrees off square.
    tilt = Matrix.Rotation(0.06, 3, "X")
    bm, done = k.part("weld-backing", OLD(), 0.01)
    k.add_box(bm, (1.80, -0.25, 0.16), (0.07, 2.05, 1.00), tilt)
    done()
    bm, done = k.part("patch-plate", PALE(), 0.012)
    k.add_box(bm, (1.86, -0.28, 0.18), (0.08, 1.86, 0.84), tilt)
    done()

    # Forward intakes, both sides, and belly vents.
    for side in (-1, 1):
        name = k.side_name(side)
        bm, done = k.part(f"forward-intake-{name}", DARK(), 0.01)
        k.add_box(bm, (side * 1.42, -3.45, 0.12), (0.30, 1.05, 0.44))
        done()
    for i, y in enumerate((-1.60, 0.30, 2.20)):
        bm, done = k.part(f"belly-vent-{i}", DARK(), 0.008)
        k.add_box(bm, (0.0, y, -0.48), (1.15, 0.42, 0.10))
        done()

    # Attitude thrusters at the four corners of the pressure hull.
    for i, (x, y) in enumerate(((-1.70, -2.60), (1.70, -2.60), (-1.86, 3.60), (1.86, 3.60))):
        bm, done = k.part(f"rcs-{i}", STEEL())
        k.add_tube(bm, (x, y, 0.30), (x * 1.10, y, 0.30), 0.13, 0.15, 6)
        done()


def build():
    k.asset("runabout", {
        "atlas": "../../textures/ships/runabout-pbr.ktx2",
        "decalAtlas": "../../textures/ships/hull-decals.ktx2",
    })
    build_prow()
    build_fuselage()
    build_cabin()
    build_wings()
    build_engines()
    build_gear()
    build_dorsal()
    build_flanks()


k.run("runabout", build, FIT_MIN, FIT_MAX, tri_budget=4000)
