"""
The living background — ASSET_UPLIFT.md 2.x, the ecology's own kit.

    npm run assets:ship

Names the game reads (Ecology.tsx): `grazer`, `flier`, `shoal-fish`, `mote`,
plus the static fauna `nest-mound`, `shell-bed` and `bone-arch`.

────────────────────────────────────────────────────────────────────────────
Why these are animated in the SHADER and not in Blender
────────────────────────────────────────────────────────────────────────────

The obvious thing — rig it, key it, export the animation — cannot work here.
`kitGeometry()` merges every mesh under an asset into ONE static geometry and
throws the hierarchy away, so there is nothing left to key; and a skinned mesh
would give up instancing, which is what lets forty grazers and fifty-six fliers
cost one draw call each.

So the division of labour is: Blender authors the SHAPE and a MOTION MASK, and
the vertex stage of the shared material authors the MOVEMENT. Each part
declares `motion=(weight, phase)`:

    weight  0 = rigid, 1 = moves fully. A callable grades it along the part,
            so a wing bends from the shoulder instead of hinging like a door.
    phase   which limb, as a turn. 0 and 0.5 are an opposed pair — the near
            and far legs of a gait, the up-stroke and down-stroke of a wing.

Ecology.tsx reads that mask and displaces accordingly. Nothing here needs to
know the gait's speed or amplitude; those belong to the creature's behaviour,
which already lives in the frame loop.

Scale. These are fitted by `mode: 'extent'` against the primitive radii they
replace, so author them at life size and let the fit normalise: a grazer about
a metre and a half at the shoulder, a flier a metre across the wings.

Author Z up, nose toward -Y, every object at identity. See kitlib.py.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kitlib as k  # noqa: E402
from mathutils import Matrix  # noqa: E402

# ————— Palette —————
# Ecology.tsx tints these by world palette, so — as with the settlements —
# pale takes the world's colour and dark reads as marking against it.
HIDE = lambda: k.mat(0xD6CFC2, "fauna-hide", 0.95, 0.0)      # noqa: E731
DARK = lambda: k.mat(0x4A4239, "fauna-dark", 0.9, 0.0)       # noqa: E731
PALE = lambda: k.mat(0xEDE7DA, "fauna-pale", 0.88, 0.0)      # noqa: E731
HORN = lambda: k.mat(0x8A7F6C, "fauna-horn", 0.7, 0.05)      # noqa: E731
WING = lambda: k.mat(0xB8AEA0, "fauna-wing", 0.92, 0.0)      # noqa: E731
SHELL = lambda: k.mat(0xC9D6DA, "fauna-shell", 0.5, 0.05)    # noqa: E731
BONE = lambda: k.mat(0xE4DECF, "fauna-bone", 0.85, 0.0)      # noqa: E731


def graded(axis, lo, hi):
    """A motion weight ramping 0→1 along an axis — the shoulder-to-tip mask."""
    idx = "xyz".index(axis)
    span = hi - lo
    return lambda co: max(0.0, min(1.0, (co[idx] - lo) / span if span else 0.0))


# ————— The grazer: four legs, a slow head, a tail —————


def grazer():
    """A patient quadruped. Ground clusters walk it round an ellipse; the mask
    swings the legs and nods the head as it goes."""
    k.asset("grazer")

    # Body: a chamfered barrel. Rigid — the whole animal is already being
    # moved by its instance matrix, so the mask only owes us the limbs.
    bm, done = k.part("body", HIDE(), 0.04)
    k.add_loft(bm, [
        k.plate_profile(-0.62, 0.30, 0.62, 1.16, 0.16),
        k.plate_profile(-0.20, 0.38, 0.56, 1.28, 0.20),
        k.plate_profile(0.35, 0.36, 0.58, 1.24, 0.20),
        k.plate_profile(0.72, 0.26, 0.66, 1.06, 0.14),
    ])
    done()

    # Neck and head, nodding as one on its own slow phase.
    nod = graded("y", -0.60, -1.05)
    bm, done = k.part("neck", HIDE(), 0.02, motion=(nod, 0.25))
    k.add_loft(bm, [
        k.plate_profile(-0.60, 0.22, 0.80, 1.16, 0.10),
        k.plate_profile(-0.86, 0.17, 0.86, 1.14, 0.08),
    ])
    done()
    bm, done = k.part("head", HIDE(), 0.02, motion=(0.85, 0.25))
    k.add_box(bm, (0.0, -1.02, 1.00), (0.30, 0.40, 0.28))
    done()
    bm, done = k.part("muzzle", DARK(), 0.015, motion=(1.0, 0.25))
    k.add_box(bm, (0.0, -1.24, 0.94), (0.20, 0.20, 0.18))
    done()
    for i, side in enumerate((-1, 1)):
        bm, done = k.part(f"horn-{i}", HORN(), motion=(0.9, 0.25))
        k.add_tube(bm, (side * 0.12, -0.92, 1.14), (side * 0.22, -0.98, 1.42),
                   0.045, 0.02, 5)
        done()

    # Legs. Fore and hind on opposed phases, and diagonal pairs matched, which
    # is what makes it read as a walk rather than a hop.
    swing = graded("z", 0.62, 0.0)
    for i, (x, y, phase) in enumerate((
        (-0.26, -0.40, 0.0), (0.26, -0.40, 0.5),
        (-0.26, 0.42, 0.5), (0.26, 0.42, 0.0),
    )):
        bm, done = k.part(f"leg-{i}", HIDE(), motion=(swing, phase))
        k.add_tube(bm, (x, y, 0.62), (x, y, 0.08), 0.075, 0.055, 5)
        done()
        bm, done = k.part(f"hoof-{i}", DARK(), motion=(1.0, phase))
        k.add_tube(bm, (x, y, 0.10), (x, y, 0.0), 0.075, 0.07, 5)
        done()

    # Tail: the loosest thing on the animal, so the highest weight.
    bm, done = k.part("tail", HIDE(), motion=(graded("y", 0.70, 1.15), 0.7))
    k.add_tube(bm, (0.0, 0.70, 1.08), (0.0, 1.14, 0.86), 0.06, 0.025, 5)
    done()


# ————— The flier: two wings on opposed strokes —————


def flier():
    """Wings are the whole point: they carry the mask's full range, graded from
    shoulder to tip, opposed left to right so the stroke is a stroke."""
    k.asset("flier")

    bm, done = k.part("body", DARK(), 0.02)
    k.add_loft(bm, [
        k.plate_profile(-0.34, 0.06, -0.05, 0.07, 0.03),
        k.plate_profile(-0.10, 0.10, -0.07, 0.11, 0.04),
        k.plate_profile(0.18, 0.08, -0.06, 0.09, 0.03),
        k.plate_profile(0.40, 0.04, -0.03, 0.05, 0.02),
    ])
    done()
    bm, done = k.part("head", DARK(), 0.015)
    k.add_box(bm, (0.0, -0.40, 0.04), (0.10, 0.14, 0.10))
    done()
    bm, done = k.part("beak", HORN())
    k.add_tube(bm, (0.0, -0.46, 0.02), (0.0, -0.60, 0.0), 0.035, 0.008, 5)
    done()

    for i, side in enumerate((-1, 1)):
        # Opposed phases: one wing up while the other is down.
        phase = 0.0 if side < 0 else 0.5
        tip = graded("x", 0.10 * side, 0.62 * side) if side > 0 else graded("x", -0.10, -0.62)
        bm, done = k.part(f"wing-{i}", WING(), motion=(tip, phase))
        k.add_loft(bm, [
            [(side * 0.08, -0.16, 0.03), (side * 0.08, 0.20, 0.03),
             (side * 0.08, 0.20, -0.02), (side * 0.08, -0.16, -0.02)],
            [(side * 0.34, -0.13, 0.05), (side * 0.34, 0.16, 0.05),
             (side * 0.34, 0.16, 0.02), (side * 0.34, -0.13, 0.02)],
            [(side * 0.62, -0.06, 0.06), (side * 0.62, 0.10, 0.06),
             (side * 0.62, 0.10, 0.04), (side * 0.62, -0.06, 0.04)],
        ])
        done()

    bm, done = k.part("tail", WING(), motion=(graded("y", 0.34, 0.62), 0.25))
    k.add_loft(bm, [
        [(-0.05, 0.34, 0.02), (0.05, 0.34, 0.02), (0.05, 0.34, -0.01), (-0.05, 0.34, -0.01)],
        [(-0.12, 0.60, 0.03), (0.12, 0.60, 0.03), (0.12, 0.60, 0.01), (-0.12, 0.60, 0.01)],
    ])
    done()


# ————— The shoal fish and the mote —————


def shoal_fish():
    """Small, glassy, and mostly tail — a shoal reads by its flicker."""
    k.asset("shoal-fish")
    bm, done = k.part("body", SHELL(), 0.015)
    k.add_loft(bm, [
        k.plate_profile(-0.26, 0.03, -0.02, 0.03, 0.01),
        k.plate_profile(-0.10, 0.07, -0.05, 0.08, 0.03),
        k.plate_profile(0.10, 0.05, -0.04, 0.06, 0.02),
        k.plate_profile(0.24, 0.02, -0.02, 0.03, 0.01),
    ])
    done()
    # The tail carries the beat; the body stays a body.
    bm, done = k.part("tail-fin", SHELL(), motion=(graded("y", 0.22, 0.44), 0.0))
    k.add_loft(bm, [
        [(-0.01, 0.22, 0.02), (0.01, 0.22, 0.02), (0.01, 0.22, -0.02), (-0.01, 0.22, -0.02)],
        [(-0.02, 0.42, 0.09), (0.02, 0.42, 0.09), (0.02, 0.42, -0.07), (-0.02, 0.42, -0.07)],
    ])
    done()
    for i, side in enumerate((-1, 1)):
        bm, done = k.part(f"fin-{i}", SHELL(), motion=(graded("x", 0.05 * side, 0.16 * side)
                                                       if side > 0 else graded("x", -0.05, -0.16),
                                                       0.5 if side > 0 else 0.0))
        k.add_loft(bm, [
            [(side * 0.05, -0.06, 0.0), (side * 0.05, 0.06, 0.0),
             (side * 0.05, 0.06, -0.02), (side * 0.05, -0.06, -0.02)],
            [(side * 0.15, -0.02, 0.01), (side * 0.15, 0.05, 0.01),
             (side * 0.15, 0.05, 0.0), (side * 0.15, -0.02, 0.0)],
        ])
        done()


def mote():
    """A drifting spark. Geometry so it catches the light rather than being a
    sprite that does not; the mask makes it pulse."""
    k.asset("mote")
    bm, done = k.part("core", PALE(), motion=(1.0, 0.0))
    k.add_loft(bm, [
        [(-0.05, 0.0, 0.0), (0.0, -0.05, 0.0), (0.05, 0.0, 0.0), (0.0, 0.05, 0.0)],
        [(-0.02, 0.0, 0.09), (0.0, -0.02, 0.09), (0.02, 0.0, 0.09), (0.0, 0.02, 0.09)],
    ])
    done()


# ————— Static fauna: what the animals leave behind —————


def nest_mound():
    """A woven mound with eggs in it. The nesting colony's spires get one."""
    k.asset("nest-mound")
    bm, done = k.part("mound", DARK(), 0.03)
    k.add_loft(bm, [
        k.plate_profile(-0.55, 0.62, 0.0, 0.26, 0.14),
        k.plate_profile(0.0, 0.70, 0.0, 0.34, 0.16),
        k.plate_profile(0.55, 0.60, 0.0, 0.24, 0.13),
    ])
    done()
    bm, done = k.part("bowl", HIDE(), 0.02)
    k.add_tube(bm, (0.0, 0.0, 0.26), (0.0, 0.0, 0.36), 0.40, 0.34, 8)
    done()
    for i, (x, y) in enumerate(((-0.14, -0.08), (0.13, 0.02), (-0.02, 0.16))):
        bm, done = k.part(f"egg-{i}", PALE(), 0.02)
        k.add_loft(bm, [
            k.plate_profile(y - 0.10, 0.07, 0.30, 0.38, 0.03, cx=x),
            k.plate_profile(y, 0.09, 0.28, 0.44, 0.04, cx=x),
            k.plate_profile(y + 0.10, 0.06, 0.31, 0.37, 0.03, cx=x),
        ])
        done()
    for i, (x, y, a) in enumerate(((-0.5, 0.3, 0.5), (0.55, -0.2, -0.7))):
        bm, done = k.part(f"twig-{i}", HORN())
        k.add_tube(bm, (x, y, 0.06), (x + a * 0.3, y + 0.2, 0.20), 0.02, 0.012, 4)
        done()


def shell_bed():
    """A drift of shells at the waterline — what the shoal leaves on a beach."""
    k.asset("shell-bed")
    bm, done = k.part("bed", HORN(), 0.02)
    k.add_loft(bm, [
        k.plate_profile(-0.70, 0.66, 0.0, 0.10, 0.06),
        k.plate_profile(0.0, 0.80, 0.0, 0.16, 0.08),
        k.plate_profile(0.70, 0.62, 0.0, 0.09, 0.05),
    ])
    done()
    shells = ((-0.34, -0.20, 0.20, 0.5), (0.22, -0.05, 0.26, -0.9),
              (-0.10, 0.34, 0.22, 1.4), (0.46, 0.28, 0.17, 0.2))
    for i, (x, y, r, a) in enumerate(shells):
        bm, done = k.part(f"shell-{i}", SHELL(), 0.012)
        k.add_loft(bm, [
            [(x - r, y, 0.08), (x, y - r * 0.7, 0.08), (x + r, y, 0.08), (x, y + r * 0.7, 0.08)],
            [(x - r * 0.5, y, 0.08 + r * 0.5), (x, y - r * 0.35, 0.08 + r * 0.5),
             (x + r * 0.5, y, 0.08 + r * 0.5), (x, y + r * 0.35, 0.08 + r * 0.5)],
        ])
        done()
        bm, done = k.part(f"shell-lip-{i}", PALE())
        k.add_box(bm, (x, y, 0.09), (r * 1.9, 0.04, 0.05), Matrix.Rotation(a, 3, "Z"))
        done()


def bone_arch():
    """Ribs of something large, weathering where it fell. Every world with a
    bio gauge above nothing has had time for one of these."""
    k.asset("bone-arch")
    bm, done = k.part("spine", BONE(), 0.02)
    k.add_tube(bm, (0.0, -1.10, 0.34), (0.0, 1.20, 0.22), 0.10, 0.07, 6)
    done()
    for i, y in enumerate((-0.75, -0.30, 0.15, 0.60)):
        span = 0.72 - abs(y) * 0.22
        height = 1.15 - abs(y) * 0.30
        for j, side in enumerate((-1, 1)):
            bm, done = k.part(f"rib-{i}-{j}", BONE())
            k.add_tube(bm, (0.0, y, 0.30), (side * span * 0.7, y, height), 0.055, 0.035, 5)
            done()
            bm, done = k.part(f"rib-foot-{i}-{j}", BONE())
            k.add_tube(bm, (side * span * 0.7, y, height),
                       (side * span, y + 0.05, height * 0.45), 0.035, 0.025, 5)
            done()
    bm, done = k.part("skull", BONE(), 0.025)
    k.add_loft(bm, [
        k.plate_profile(-1.10, 0.16, 0.20, 0.48, 0.07),
        k.plate_profile(-1.34, 0.20, 0.16, 0.52, 0.09),
        k.plate_profile(-1.62, 0.12, 0.18, 0.40, 0.06),
    ])
    done()
    bm, done = k.part("jaw", BONE(), 0.015)
    k.add_box(bm, (0.0, -1.40, 0.14), (0.26, 0.46, 0.09))
    done()


def build():
    grazer()
    flier()
    shoal_fish()
    mote()
    nest_mound()
    shell_bed()
    bone_arch()


k.run("creature-kit", build, tri_budget=6000, per_asset=900, motion=True)
