"""
Weather-reactive surface props.

UV1 is the motion contract: U is bend/flap weight from anchor to free end and V
is phase.  Rigid snow, puddle and ice meshes still receive zeroed UV1 so each
root survives the same runtime merge as the animated fabric roots.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kitlib as k  # noqa: E402


METAL = lambda: k.mat(0x77828C, "weather-metal", 0.50, 0.58)       # noqa: E731
DARK = lambda: k.mat(0x272D34, "weather-dark", 0.58, 0.62)        # noqa: E731
CLOTH = lambda: k.mat(0xB4673A, "weather-cloth", 0.96)            # noqa: E731
PALE = lambda: k.mat(0xE1DDD0, "weather-pale", 0.90)              # noqa: E731
GOLD = lambda: k.mat(0xD4AD4A, "weather-gold", 0.62, 0.16)        # noqa: E731
ICE = lambda: k.mat(0xB9DCEA, "weather-ice", 0.28, 0.02)          # noqa: E731
SNOW = lambda: k.mat(0xE8F0F3, "weather-snow", 0.82)              # noqa: E731
WET = lambda: k.mat(0x476978, "weather-wet", 0.18)                # noqa: E731


def asset(name):
    k.asset(name, {"atlas": "../../textures/surface/weather-atlas.ktx2"})


def axis_weight(axis, lo, hi):
    idx = "xyz".index(axis)
    span = hi - lo
    return lambda co: max(0.0, min(1.0, (co[idx] - lo) / span if span else 0.0))


def box(name, center, size, material, motion=None):
    bm, done = k.part(name, material, 0.0, motion)
    k.add_box(bm, center, size)
    done()


def tube(name, p0, p1, r0, r1, material, motion=None, sides=6):
    bm, done = k.part(name, material, 0.0, motion)
    k.add_tube(bm, p0, p1, r0, r1, sides)
    done()


def cloth_strip(name, x0, x1, z0, z1, width, material, phase=0.0, sag=0.0):
    """A three-station ribbon, anchored at x0 and free at x1."""
    middle = (x0 + x1) * 0.5
    loft = [
        [(x0, -width * 0.5, z0), (x0, width * 0.5, z0),
         (x0, width * 0.5, z0 - 0.025), (x0, -width * 0.5, z0 - 0.025)],
        [(middle, -width * 0.5, (z0 + z1) * 0.5 - sag),
         (middle, width * 0.5, (z0 + z1) * 0.5 - sag),
         (middle, width * 0.5, (z0 + z1) * 0.5 - sag - 0.022),
         (middle, -width * 0.5, (z0 + z1) * 0.5 - sag - 0.022)],
        [(x1, -width * 0.42, z1), (x1, width * 0.42, z1),
         (x1, width * 0.42, z1 - 0.018), (x1, -width * 0.42, z1 - 0.018)],
    ]
    bm, done = k.part(name, material, 0.0, (axis_weight("x", x0, x1), phase))
    k.add_loft(bm, loft)
    done()


def windsock():
    asset("weather-windsock")
    tube("windsock-mast", (0, 0, 0), (0, 0, 2.20), 0.055, 0.040, METAL(), None, 7)
    tube("windsock-arm", (0, 0, 2.12), (0.46, 0, 2.12), 0.045, 0.035, DARK(), None, 6)
    # Tapered fabric tube points downwind; weight increases along +X.
    rings = []
    for x, radius, sag in ((0.40, 0.25, 0), (0.95, 0.20, -0.05),
                           (1.52, 0.12, -0.13), (1.95, 0.06, -0.24)):
        rings.append([
            (x, math.cos(a) * radius, 2.10 + sag + math.sin(a) * radius)
            for a in [i * 2 * math.pi / 8 for i in range(8)]
        ])
    bm, done = k.part("windsock-cloth", CLOTH(), 0.0, (axis_weight("x", 0.40, 1.95), 0.0))
    k.add_loft(bm, rings, True, False)
    done()
    for i, x in enumerate((0.72, 1.15, 1.55)):
        tube(f"windsock-band-{i}", (x, 0, 2.03 - i * 0.06), (x + 0.05, 0, 2.02 - i * 0.06),
             0.20 - i * 0.04, 0.18 - i * 0.04, PALE(),
             (axis_weight("x", 0.40, 1.95), i * 0.17), 8)


def banner():
    asset("weather-banner")
    tube("banner-pole", (0, 0, 0), (0, 0, 2.35), 0.055, 0.040, METAL(), None, 7)
    tube("banner-crossbar", (0, 0, 2.23), (0.93, 0, 2.23), 0.040, 0.030, DARK(), None, 6)
    bm, done = k.part("banner-cloth", CLOTH(), 0.0, (axis_weight("x", 0.05, 1.28), 0.12))
    k.add_loft(bm, [
        [(0.05, -0.02, 2.16), (0.05, 0.02, 2.16), (0.05, 0.02, 0.65), (0.05, -0.02, 0.65)],
        [(0.68, -0.02, 2.12), (0.68, 0.02, 2.12), (0.68, 0.02, 0.57), (0.68, -0.02, 0.57)],
        [(1.28, -0.02, 2.03), (1.28, 0.02, 2.03), (1.28, 0.02, 0.72), (1.28, -0.02, 0.72)],
    ])
    done()
    box("banner-mark", (0.68, -0.035, 1.36), (0.38, 0.018, 0.38),
        GOLD(), (0.58, 0.12))


def dust_streamer():
    asset("weather-dust-streamer")
    tube("streamer-stake", (0, 0, 0), (0, 0, 1.05), 0.035, 0.025, METAL(), None, 6)
    for i in range(4):
        cloth_strip(f"dust-ribbon-{i}", 0.0, 1.15 + i * 0.18,
                    0.92 - i * 0.12, 0.82 - i * 0.18,
                    0.09, CLOTH() if i % 2 else GOLD(), i * 0.23, 0.07 + i * 0.02)


def loose_straps():
    asset("weather-loose-straps")
    box("equipment-case", (0, 0, 0.30), (1.20, 0.80, 0.60), DARK(), None)
    for i, y in enumerate((-0.31, 0.31)):
        cloth_strip(f"loose-strap-{i}", -0.48, 0.92, 0.62, 0.22,
                    0.08, GOLD(), i * 0.5, 0.12)
        tube(f"strap-buckle-{i}", (-0.42, y, 0.62), (-0.31, y, 0.62),
             0.05, 0.05, METAL(), None, 6)


def storm_vane():
    asset("weather-storm-vane")
    tube("vane-mast", (0, 0, 0), (0, 0, 1.90), 0.045, 0.035, METAL(), None, 7)
    tube("vane-spindle", (-0.65, 0, 1.82), (0.72, 0, 1.82),
         0.04, 0.04, DARK(), (0.34, 0.0), 6)
    bm, done = k.part("vane-fin", GOLD(), 0.0, (0.72, 0.0))
    k.add_loft(bm, [
        [(0.25, -0.02, 1.82), (0.25, 0.02, 1.82), (0.25, 0.02, 1.62), (0.25, -0.02, 1.62)],
        [(0.76, -0.02, 1.82), (0.76, 0.02, 1.82), (0.76, 0.02, 2.10), (0.76, -0.02, 2.10)],
    ])
    done()
    tube("vane-arrow", (-0.72, 0, 1.82), (-0.91, 0, 1.82),
         0.14, 0.015, PALE(), (0.72, 0.0), 5)


def icicles():
    asset("weather-icicles")
    box("ice-lip", (0, 0, 1.44), (1.90, 0.34, 0.22), ICE(), None)
    lengths = (0.72, 0.42, 1.05, 0.58, 0.86, 0.35, 0.66)
    for i, length in enumerate(lengths):
        x = (i - 3) * 0.25
        tube(f"icicle-{i}", (x, -0.04, 1.36), (x + 0.02 * (i % 2), -0.04, 1.36 - length),
             0.075, 0.006, ICE(), None, 6)


def snow_drift():
    asset("weather-snow-drift")
    for i, (x, y, w, h) in enumerate(((-0.55, -0.10, 0.80, 0.38),
                                       (0.15, 0.06, 1.02, 0.52),
                                       (0.68, -0.08, 0.58, 0.30))):
        bm, done = k.part(f"drift-lobe-{i}", SNOW())
        k.add_loft(bm, [
            [(x - w, y - 0.48, 0), (x + w, y - 0.48, 0),
             (x + w * 0.82, y + 0.48, 0), (x - w * 0.82, y + 0.48, 0)],
            [(x - w * 0.36, y - 0.15, h), (x + w * 0.42, y - 0.15, h * 0.91),
             (x + w * 0.28, y + 0.16, h * 0.72), (x - w * 0.28, y + 0.16, h)],
        ])
        done()


def puddle():
    asset("weather-puddle")
    bm, done = k.part("puddle-lens", WET())
    rings = []
    for scale, z in ((1.0, 0.0), (0.82, 0.025)):
        rings.append([
            (math.cos(i * 2 * math.pi / 12) * 1.05 * scale * (0.88 + (i % 3) * 0.05),
             math.sin(i * 2 * math.pi / 12) * 0.72 * scale,
             z)
            for i in range(12)
        ])
    k.add_loft(bm, rings)
    done()
    for i in range(3):
        a = i * 0.9
        tube(f"ripple-{i}", (-0.28 + i * 0.27, -0.05, 0.035),
             (-0.28 + i * 0.27 + math.cos(a) * 0.24, -0.05 + math.sin(a) * 0.24, 0.035),
             0.018, 0.008, PALE(), (0.35 + i * 0.15, i / 3), 5)


def rain_catcher():
    asset("weather-rain-catcher")
    for side in (-1, 1):
        tube(f"catcher-leg-{side:+d}", (side * 0.46, 0, 0),
             (side * 0.28, 0, 0.78), 0.04, 0.035, METAL(), None, 6)
    bm, done = k.part("catcher-bowl", WET())
    k.add_tube(bm, (0, 0, 0.72), (0, 0, 0.89), 0.55, 0.40, 10)
    done()
    tube("gauge", (0, 0, 0.80), (0, 0, 1.55), 0.10, 0.08, PALE(), None, 8)
    box("gauge-mark", (0, -0.105, 1.18), (0.07, 0.018, 0.42), GOLD(), None)


def drain_chain():
    asset("weather-drain-chain")
    box("gutter", (0, 0, 1.68), (1.50, 0.32, 0.26), DARK(), None)
    for i in range(9):
        phase = (i % 2) * 0.5
        z0 = 1.56 - i * 0.16
        tube(f"chain-link-{i}", (0.48, 0, z0),
             (0.48 + 0.03 * (i % 2), 0, z0 - 0.14),
             0.035, 0.025, METAL(), (i / 8, phase), 6)
    box("splash-block", (0.48, 0, 0.08), (0.65, 0.48, 0.16), WET(), None)


def build():
    windsock()
    banner()
    dust_streamer()
    loose_straps()
    storm_vane()
    icicles()
    snow_drift()
    puddle()
    rain_catcher()
    drain_chain()


k.run("weather-prop-kit", build, tri_budget=9000, per_asset=900, motion=True)
