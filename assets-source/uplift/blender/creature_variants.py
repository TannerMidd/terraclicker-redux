"""
Biome-specific creature silhouettes with merge-safe motion masks.

The runtime flattens each root to one BufferGeometry, so UV1 carries
`(motion_weight, phase)` rather than a Blender rig.  Every mesh in this file
has UV1, including rigid bodies at weight zero, preserving a uniform attribute
set for mergeGeometries and instancing.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kitlib as k  # noqa: E402


HIDE = lambda: k.mat(0xC9C1B1, "variant-hide", 0.92)              # noqa: E731
DARK = lambda: k.mat(0x3A3938, "variant-dark", 0.94)              # noqa: E731
PALE = lambda: k.mat(0xE3E0D6, "variant-pale", 0.84)              # noqa: E731
SHELL = lambda: k.mat(0x7591A0, "variant-shell", 0.48, 0.05)      # noqa: E731
WING = lambda: k.mat(0x9CA8AD, "variant-wing", 0.72)              # noqa: E731
BIO = lambda: k.mat(0x5DA675, "variant-bio", 0.80)                # noqa: E731
EMBER = lambda: k.mat(0xB95734, "variant-ember", 0.66)            # noqa: E731
HORN = lambda: k.mat(0x8A806E, "variant-horn", 0.75, 0.05)        # noqa: E731
CYAN = lambda: k.mat(0x75D6E4, "variant-cyan", 0.28)              # noqa: E731
ICE = lambda: k.mat(0xB8D9E5, "variant-ice", 0.34, 0.02)          # noqa: E731


def asset(name):
    k.asset(name, {"atlas": "../../textures/surface/ecology-atlas.ktx2"})


def axis_weight(axis, lo, hi, absolute=False):
    idx = "xyz".index(axis)
    span = hi - lo

    def weight(co):
        value = abs(co[idx]) if absolute else co[idx]
        return max(0.0, min(1.0, (value - lo) / span if span else 0.0))

    return weight


def box(name, center, size, material, motion=None, bevel=0.0):
    bm, done = k.part(name, material, bevel, motion)
    k.add_box(bm, center, size)
    done()


def tube(name, p0, p1, r0, r1, material, motion=None, sides=6):
    bm, done = k.part(name, material, 0.0, motion)
    k.add_tube(bm, p0, p1, r0, r1, sides)
    done()


def loft(name, rings, material, motion=None):
    bm, done = k.part(name, material, 0.0, motion)
    k.add_loft(bm, rings)
    done()


def meadow_drifter():
    asset("meadow-drifter")
    loft("drifter-body", [
        k.plate_profile(-0.58, 0.24, 0.78, 1.17, 0.10),
        k.plate_profile(-0.12, 0.37, 0.72, 1.28, 0.16),
        k.plate_profile(0.45, 0.29, 0.76, 1.20, 0.12),
        k.plate_profile(0.72, 0.14, 0.84, 1.11, 0.07),
    ], HIDE())
    # Three long stilt legs make a silhouette unlike the stock quadruped.
    for i, (x, y, phase) in enumerate(((-0.27, -0.30, 0.0), (0.28, -0.25, 0.5), (0.0, 0.48, 0.25))):
        tube(f"stilt-{i}", (x, y, 0.82), (x * 1.18, y * 1.08, 0.06),
             0.06, 0.035, HIDE(), (axis_weight("z", 0.80, 0.0), phase), 5)
        tube(f"foot-{i}", (x * 1.18, y * 1.08 - 0.08, 0.05),
             (x * 1.18, y * 1.08 + 0.11, 0.035), 0.045, 0.035,
             DARK(), (1.0, phase), 5)
    tube("neck", (0, -0.50, 1.08), (0, -0.86, 1.52),
         0.12, 0.08, HIDE(), (axis_weight("y", -0.48, -0.86), 0.75), 6)
    box("head", (0, -0.95, 1.57), (0.25, 0.34, 0.19), HIDE(), (1.0, 0.75))
    for side in (-1, 1):
        tube(f"feeler-{side:+d}", (side * 0.07, -1.10, 1.61),
             (side * 0.22, -1.28, 1.73), 0.018, 0.006, HORN(), (1.0, 0.75), 4)


def sky_wisp():
    asset("sky-wisp")
    loft("wisp-body", [
        k.plate_profile(-0.30, 0.05, -0.03, 0.04, 0.02),
        k.plate_profile(-0.02, 0.11, -0.07, 0.08, 0.04),
        k.plate_profile(0.36, 0.05, -0.03, 0.04, 0.02),
    ], PALE())
    for side in (-1, 1):
        phase = 0.0 if side < 0 else 0.5
        loft(f"sail-{side:+d}", [
            [(side * 0.08, -0.16, 0), (side * 0.08, 0.22, 0),
             (side * 0.08, 0.22, -0.025), (side * 0.08, -0.16, -0.025)],
            [(side * 0.52, -0.08, 0.06), (side * 0.72, 0.18, 0.04),
             (side * 0.72, 0.18, 0.01), (side * 0.52, -0.08, 0.02)],
            [(side * 1.02, 0.03, 0.02), (side * 0.96, 0.15, 0.02),
             (side * 0.96, 0.15, 0.005), (side * 1.02, 0.03, 0.005)],
        ], WING(), (axis_weight("x", 0.08, 1.02, True), phase))
    for side in (-1, 1):
        tube(f"tail-{side:+d}", (side * 0.03, 0.31, 0),
             (side * 0.20, 0.92, -0.05), 0.025, 0.007,
             CYAN(), (axis_weight("y", 0.28, 0.92), 0.25 if side < 0 else 0.75), 4)


def glass_shoal():
    asset("glass-shoal")
    loft("glass-body", [
        k.plate_profile(-0.38, 0.03, -0.02, 0.03, 0.01),
        k.plate_profile(-0.12, 0.13, -0.09, 0.10, 0.04),
        k.plate_profile(0.18, 0.10, -0.07, 0.08, 0.03),
        k.plate_profile(0.37, 0.03, -0.025, 0.035, 0.01),
    ], SHELL())
    for side in (-1, 1):
        loft(f"fan-tail-{side:+d}", [
            [(0, 0.32, side * 0.01), (0, 0.43, side * 0.02),
             (side * 0.01, 0.43, 0), (side * 0.01, 0.32, 0)],
            [(side * 0.02, 0.65, 0.16 * side), (side * 0.03, 0.74, 0.22 * side),
             (side * 0.02, 0.74, 0), (side * 0.01, 0.65, 0)],
        ], CYAN(), (axis_weight("y", 0.32, 0.74), 0.0 if side < 0 else 0.5))
    for side in (-1, 1):
        loft(f"side-fin-{side:+d}", [
            [(side * 0.08, -0.02, 0), (side * 0.08, 0.12, 0),
             (side * 0.08, 0.12, -0.015), (side * 0.08, -0.02, -0.015)],
            [(side * 0.34, 0.05, 0.03), (side * 0.30, 0.18, 0.02),
             (side * 0.30, 0.18, 0), (side * 0.34, 0.05, 0)],
        ], WING(), (axis_weight("x", 0.08, 0.34, True), 0.25 if side < 0 else 0.75))


def dune_skink():
    asset("dune-skink")
    loft("skink-body", [
        k.plate_profile(-0.52, 0.15, 0.12, 0.31, 0.06),
        k.plate_profile(-0.12, 0.25, 0.10, 0.36, 0.09),
        k.plate_profile(0.48, 0.17, 0.11, 0.30, 0.06),
    ], HIDE())
    box("skink-head", (0, -0.64, 0.23), (0.31, 0.34, 0.20), HIDE(), (0.25, 0.2))
    for i, (x, y, phase) in enumerate((
        (-0.20, -0.34, 0), (0.20, -0.34, 0.5),
        (-0.23, 0.02, 0.5), (0.23, 0.02, 0),
        (-0.17, 0.38, 0), (0.17, 0.38, 0.5),
    )):
        tube(f"skink-leg-{i}", (x, y, 0.19), (x * 1.72, y + 0.03, 0.055),
             0.045, 0.025, HIDE(), (axis_weight("x", 0.18, 0.42, True), phase), 5)
    tube("skink-tail", (0, 0.43, 0.22), (0.14, 1.24, 0.11),
         0.11, 0.015, HIDE(), (axis_weight("y", 0.42, 1.24), 0.3), 7)


def tumbleweave():
    asset("tumbleweave")
    # A hollow-looking walking seed ball: crossed tendrils carry different phases.
    for i in range(12):
        a = i * math.pi / 6
        z = 0.52 + 0.38 * math.sin(a * 1.5)
        p0 = (math.cos(a) * 0.12, math.sin(a) * 0.12, 0.52)
        p1 = (math.cos(a) * 0.62, math.sin(a) * 0.62, z)
        tube(f"weave-{i}", p0, p1, 0.035, 0.012,
             HORN() if i % 2 else BIO(), (axis_weight("x", 0.12, 0.62, True), (i % 4) * 0.25), 5)
    for i in range(4):
        a = i * math.pi * 0.5 + 0.4
        tube(f"runner-{i}", (math.cos(a) * 0.35, math.sin(a) * 0.35, 0.22),
             (math.cos(a) * 0.84, math.sin(a) * 0.84, 0.02),
             0.026, 0.008, HORN(), (1.0, i * 0.25), 4)


def firn_burrower():
    asset("firn-burrower")
    loft("burrower-body", [
        k.plate_profile(-0.46, 0.19, 0.12, 0.45, 0.08),
        k.plate_profile(-0.05, 0.34, 0.08, 0.56, 0.13),
        k.plate_profile(0.54, 0.24, 0.10, 0.46, 0.09),
    ], SHELL())
    for i, y in enumerate((-0.28, 0.12, 0.39)):
        box(f"armor-plate-{i}", (0, y, 0.51), (0.62 - i * 0.06, 0.26, 0.08), ICE(),
            (0.10, i * 0.17))
    box("shovel-head", (0, -0.59, 0.26), (0.46, 0.30, 0.20), PALE(), (0.35, 0.1))
    for side in (-1, 1):
        tube(f"claw-arm-{side:+d}", (side * 0.20, -0.40, 0.22),
             (side * 0.54, -0.66, 0.07), 0.065, 0.035, HIDE(),
             (axis_weight("x", 0.20, 0.54, True), 0 if side < 0 else 0.5), 6)
        for claw in range(3):
            tube(f"claw-{side:+d}-{claw}", (side * 0.52, -0.64 + claw * 0.05, 0.07),
                 (side * (0.70 + claw * 0.03), -0.78 + claw * 0.03, 0.025),
                 0.022, 0.005, HORN(), (1.0, 0 if side < 0 else 0.5), 4)


def aurora_moth():
    asset("aurora-moth")
    tube("moth-body", (0, -0.33, 0), (0, 0.46, 0), 0.08, 0.045, DARK(), None, 7)
    box("moth-head", (0, -0.42, 0.01), (0.18, 0.18, 0.13), DARK())
    for side in (-1, 1):
        phase = 0 if side < 0 else 0.5
        for pair, (y0, y1, span) in enumerate(((-0.22, 0.15, 0.82), (0.10, 0.40, 0.62))):
            loft(f"moth-wing-{side:+d}-{pair}", [
                [(side * 0.06, y0, 0), (side * 0.06, y1, 0),
                 (side * 0.06, y1, -0.018), (side * 0.06, y0, -0.018)],
                [(side * span, y0 - 0.08, 0.05), (side * span * 0.90, y1 + 0.12, 0.04),
                 (side * span * 0.90, y1 + 0.12, 0.01), (side * span, y0 - 0.08, 0.01)],
            ], CYAN() if pair == 0 else WING(),
                (axis_weight("x", 0.06, span, True), (phase + pair * 0.12) % 1.0))
        for feeler in (-1, 1):
            tube(f"moth-feeler-{side:+d}-{feeler:+d}", (side * 0.04, -0.48, 0.03),
                 (side * (0.18 + feeler * 0.03), -0.76, 0.08 + feeler * 0.03),
                 0.012, 0.004, PALE(), (1.0, phase), 4)


def cinder_wren():
    asset("cinder-wren")
    loft("wren-body", [
        k.plate_profile(-0.32, 0.07, -0.04, 0.08, 0.03),
        k.plate_profile(-0.03, 0.14, -0.09, 0.13, 0.05),
        k.plate_profile(0.32, 0.07, -0.04, 0.07, 0.025),
    ], EMBER())
    box("wren-head", (0, -0.36, 0.08), (0.20, 0.20, 0.18), DARK())
    tube("beak", (0, -0.46, 0.06), (0, -0.67, 0.03),
         0.045, 0.005, HORN(), (0.3, 0.1), 5)
    for side in (-1, 1):
        phase = 0 if side < 0 else 0.5
        loft(f"wren-wing-{side:+d}", [
            [(side * 0.08, -0.15, 0.04), (side * 0.08, 0.18, 0.02),
             (side * 0.08, 0.18, -0.02), (side * 0.08, -0.15, -0.02)],
            [(side * 0.56, -0.08, 0.08), (side * 0.72, 0.24, 0.03),
             (side * 0.72, 0.24, 0), (side * 0.56, -0.08, 0.02)],
        ], WING(), (axis_weight("x", 0.08, 0.72, True), phase))
    loft("wren-tail", [
        [(-0.07, 0.28, 0.02), (0.07, 0.28, 0.02), (0.07, 0.28, -0.02), (-0.07, 0.28, -0.02)],
        [(-0.22, 0.68, 0.03), (0.22, 0.68, 0.03), (0.22, 0.68, 0), (-0.22, 0.68, 0)],
    ], EMBER(), (axis_weight("y", 0.28, 0.68), 0.25))


def vent_lace():
    asset("vent-lace")
    # Floating bell above the thermal vent with independently phased tendrils.
    loft("lace-bell", [
        k.plate_profile(-0.22, 0.17, 0.55, 0.78, 0.07),
        k.plate_profile(0.0, 0.38, 0.40, 0.85, 0.15),
        k.plate_profile(0.28, 0.29, 0.42, 0.76, 0.11),
    ], PALE(), (0.18, 0.1))
    for i in range(8):
        a = i * math.pi / 4
        x, y = math.cos(a) * 0.25, math.sin(a) * 0.22
        tube(f"lace-tendril-{i}", (x, y, 0.46),
             (x * 1.55 + math.sin(i) * 0.09, y * 1.55, -0.18 - 0.07 * (i % 3)),
             0.025, 0.006, CYAN(), (axis_weight("z", 0.46, -0.34), i / 8), 5)
    tube("vent-anchor", (0, 0, 0), (0, 0, 0.40), 0.10, 0.06, DARK(), None, 7)


def settlement_swift():
    asset("settlement-swift")
    loft("swift-body", [
        k.plate_profile(-0.30, 0.04, -0.03, 0.05, 0.015),
        k.plate_profile(-0.02, 0.09, -0.06, 0.08, 0.03),
        k.plate_profile(0.32, 0.035, -0.025, 0.04, 0.012),
    ], DARK())
    box("swift-head", (0, -0.32, 0.03), (0.13, 0.16, 0.11), PALE())
    for side in (-1, 1):
        phase = 0 if side < 0 else 0.5
        loft(f"swift-wing-{side:+d}", [
            [(side * 0.05, -0.12, 0), (side * 0.05, 0.16, 0),
             (side * 0.05, 0.16, -0.015), (side * 0.05, -0.12, -0.015)],
            [(side * 0.38, -0.01, 0.045), (side * 0.56, 0.13, 0.02),
             (side * 0.56, 0.13, 0), (side * 0.38, -0.01, 0.01)],
            [(side * 0.92, 0.04, 0.015), (side * 0.82, 0.10, 0.01),
             (side * 0.82, 0.10, 0), (side * 0.92, 0.04, 0.004)],
        ], PALE(), (axis_weight("x", 0.05, 0.92, True), phase))
    for side in (-1, 1):
        tube(f"fork-tail-{side:+d}", (side * 0.02, 0.30, 0),
             (side * 0.15, 0.68, -0.02), 0.022, 0.005,
             DARK(), (axis_weight("y", 0.30, 0.68), 0.2 if side < 0 else 0.7), 4)


def build():
    meadow_drifter()
    sky_wisp()
    glass_shoal()
    dune_skink()
    tumbleweave()
    firn_burrower()
    aurora_moth()
    cinder_wren()
    vent_lace()
    settlement_swift()


k.run("creature-variant-kit", build, tri_budget=9000, per_asset=900, motion=True)
