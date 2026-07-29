"""
Close-range surface dressing kit.

This file deliberately groups assets that share the same runtime contract:
small, rigid, independently instanced roots with UV0 and flat palette colours.
It covers six deposit families in three worked states, biome microclutter,
settlement dressing, and authored ecology discovery setpieces.

All roots stay below 900 triangles.  Low quality continues to use the existing
primitive fallbacks because nothing in this kit changes scene ownership.
"""

import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kitlib as k  # noqa: E402
from mathutils import Matrix  # noqa: E402


# Geology
ROCK = lambda: k.mat(0x5C5B58, "dressing-rock", 0.96)             # noqa: E731
DARK_ROCK = lambda: k.mat(0x292C30, "dressing-dark-rock", 0.97)   # noqa: E731
SAND = lambda: k.mat(0xA7814F, "dressing-sand", 0.98)             # noqa: E731
ICE = lambda: k.mat(0xB9DCE8, "dressing-ice", 0.30, 0.02)         # noqa: E731
BRINE = lambda: k.mat(0x4F8194, "dressing-brine", 0.24)           # noqa: E731
CRYSTAL = lambda: k.mat(0x70D9E8, "dressing-crystal", 0.22)       # noqa: E731
FERROUS = lambda: k.mat(0x775449, "dressing-ferrous", 0.68, 0.30) # noqa: E731
SULFUR = lambda: k.mat(0xD3B341, "dressing-sulfur", 0.82)         # noqa: E731
FOSSIL = lambda: k.mat(0xD2C8AD, "dressing-fossil", 0.88)         # noqa: E731
BIO = lambda: k.mat(0x4F9C68, "dressing-bio", 0.86)               # noqa: E731
BIO_PALE = lambda: k.mat(0xA9D28F, "dressing-bio-pale", 0.78)     # noqa: E731
EMBER = lambda: k.mat(0xD85E35, "dressing-ember", 0.72)           # noqa: E731

# Human hardware
METAL = lambda: k.mat(0x7D8790, "dressing-metal", 0.48, 0.62)     # noqa: E731
DARK_METAL = lambda: k.mat(0x252B33, "dressing-dark-metal", 0.54, 0.65)  # noqa: E731
PAINT = lambda: k.mat(0xD3D0C4, "dressing-paint", 0.62, 0.18)     # noqa: E731
GOLD = lambda: k.mat(0xD6AA42, "dressing-gold", 0.50, 0.28)       # noqa: E731
CYAN = lambda: k.mat(0x52CAD9, "dressing-cyan", 0.34, 0.05)       # noqa: E731
CLOTH = lambda: k.mat(0x695E55, "dressing-cloth", 0.98)           # noqa: E731


def _rng(label):
    seed = 2166136261
    for byte in label.encode("utf8"):
        seed = ((seed ^ byte) * 16777619) & 0xFFFFFFFF
    return random.Random(seed)


def box(name, center, size, material, rot=None, bevel=0.0):
    bm, done = k.part(name, material, bevel)
    k.add_box(bm, center, size, rot)
    done()


def tube(name, p0, p1, r0, r1, material, sides=6):
    bm, done = k.part(name, material)
    k.add_tube(bm, p0, p1, r0, r1, sides)
    done()


def rock(name, center, radii, material, seed, segments=6):
    cx, cy, cz = center
    rx, ry, rz = radii
    r = _rng(seed)
    rings = []
    for zf, radial in ((-0.43, 0.63), (-0.16, 1.0), (0.31, 0.79), (0.50, 0.26)):
        ring = []
        for i in range(segments):
            a = i * 2 * math.pi / segments
            ring.append((
                cx + math.cos(a) * rx * radial * (0.84 + r.random() * 0.28),
                cy + math.sin(a) * ry * radial * (0.84 + r.random() * 0.28),
                cz + zf * 2 * rz + (r.random() - 0.5) * rz * 0.08,
            ))
        rings.append(ring)
    bm, done = k.part(name, material)
    k.add_loft(bm, rings)
    done()


def shard(name, base, top, radius, material, sides=6):
    mid = (
        base[0] + (top[0] - base[0]) * 0.72,
        base[1] + (top[1] - base[1]) * 0.72,
        base[2] + (top[2] - base[2]) * 0.72,
    )
    bm, done = k.part(name, material)
    k.add_tube(bm, base, mid, radius, radius * 0.76, sides, cap1=False)
    k.add_tube(bm, mid, top, radius * 0.76, 0.012, sides, cap0=False)
    done()


def root(name, atlas):
    k.asset(name, {"atlas": f"../../textures/surface/{atlas}.ktx2"})


# ---------------------------------------------------------------------------
# Deposits: each family has intact / cracked / depleted roots.
# ---------------------------------------------------------------------------


def crystal_deposit(state):
    name = f"deposit-crystal-{state}"
    root(name, "deposit-atlas")
    count = {"intact": 7, "cracked": 5, "depleted": 2}[state]
    r = _rng(name)
    for i in range(count):
        a = i * 2.39996
        radius = 0.15 + 0.17 * math.sqrt(i)
        x, y = math.cos(a) * radius, math.sin(a) * radius
        h = (1.35 - i * 0.09) * (0.72 if state == "cracked" else 1.0)
        lean = (r.random() - 0.5) * (0.44 if state == "cracked" else 0.16)
        shard(f"crystal-{i}", (x, y, 0.05), (x + lean, y + lean * 0.3, h),
              0.18 - min(i, 4) * 0.018, CRYSTAL(), 6)
    rock("matrix", (0, 0, 0.08), (0.74, 0.62, 0.18), DARK_ROCK(), name, 7)


def ferrous_deposit(state):
    name = f"deposit-ferrous-{state}"
    root(name, "deposit-atlas")
    count = {"intact": 6, "cracked": 5, "depleted": 3}[state]
    r = _rng(name)
    rock("ore-matrix", (0, 0, 0.28), (0.92, 0.70, 0.48), ROCK(), name, 7)
    for i in range(count):
        a = i * 2 * math.pi / count + 0.3
        x, y = math.cos(a) * 0.58, math.sin(a) * 0.45
        h = 0.22 if state == "depleted" else 0.40 + r.random() * 0.22
        rot = Matrix.Rotation(a + r.random() * 0.35, 3, "Z") @ Matrix.Rotation(0.35, 3, "X")
        box(f"iron-plate-{i}", (x, y, 0.42), (0.34, 0.10, h), FERROUS(), rot)


def fossil_deposit(state):
    name = f"deposit-fossil-{state}"
    root(name, "deposit-atlas")
    rock("sediment", (0, 0, 0.20), (1.05, 0.72, 0.30), SAND(), name, 8)
    count = {"intact": 7, "cracked": 5, "depleted": 3}[state]
    for i in range(count):
        x = (i - (count - 1) * 0.5) * 0.25
        y = 0.16 * math.sin(i * 1.8)
        h = 0.54 - abs(x) * 0.16
        tube(f"rib-{i}", (x, y - 0.30, 0.28), (x, y + 0.24, h),
             0.045, 0.030, FOSSIL(), 5)
    if state != "depleted":
        tube("spine", (-0.85, 0.0, 0.37), (0.83, 0.0, 0.40), 0.065, 0.050, FOSSIL(), 6)


def brine_deposit(state):
    name = f"deposit-brine-{state}"
    root(name, "deposit-atlas")
    box("brine-lens", (0, 0, 0.035), (1.65, 1.15, 0.07), BRINE())
    count = {"intact": 6, "cracked": 4, "depleted": 2}[state]
    for i in range(count):
        a = i * 2 * math.pi / max(count, 1)
        radius = 0.32 + (i % 2) * 0.18
        h = (0.90 - i * 0.07) * (0.55 if state == "cracked" else 1.0)
        shard(f"ice-fin-{i}", (math.cos(a) * radius, math.sin(a) * radius, 0.06),
              (math.cos(a) * radius * 1.12, math.sin(a) * radius * 1.12, h),
              0.12, ICE(), 5)


def sulfur_deposit(state):
    name = f"deposit-sulfur-{state}"
    root(name, "deposit-atlas")
    count = {"intact": 7, "cracked": 5, "depleted": 3}[state]
    r = _rng(name)
    for i in range(count):
        a = i * 2.39996
        radius = 0.19 * math.sqrt(i)
        x, y = math.cos(a) * radius, math.sin(a) * radius
        h = (0.45 + r.random() * 0.50) * (0.62 if state != "intact" else 1.0)
        tube(f"sulfur-spire-{i}", (x, y, 0.04), (x + 0.04, y, h),
             0.17, 0.07, SULFUR(), 6)
    rock("vent-matrix", (0, 0, 0.08), (0.72, 0.63, 0.19), DARK_ROCK(), name, 7)


def biologic_deposit(state):
    name = f"deposit-biologic-{state}"
    root(name, "deposit-atlas")
    count = {"intact": 6, "cracked": 4, "depleted": 2}[state]
    for i in range(count):
        a = i * 2 * math.pi / max(count, 1)
        x, y = math.cos(a) * (0.30 + (i % 2) * 0.20), math.sin(a) * (0.30 + (i % 2) * 0.20)
        h = (0.52 + 0.10 * (i % 3)) * (0.58 if state == "cracked" else 1.0)
        tube(f"pod-stem-{i}", (x, y, 0.03), (x * 1.12, y * 1.12, h),
             0.07, 0.09, BIO(), 6)
        rock(f"pod-{i}", (x * 1.12, y * 1.12, h + 0.11), (0.18, 0.15, 0.22),
             BIO_PALE(), f"{name}-pod-{i}", 6)
    rock("root-mass", (0, 0, 0.10), (0.72, 0.64, 0.20), BIO(), name, 7)


def deposits():
    builders = (crystal_deposit, ferrous_deposit, fossil_deposit,
                brine_deposit, sulfur_deposit, biologic_deposit)
    for builder in builders:
        for state in ("intact", "cracked", "depleted"):
            builder(state)


# ---------------------------------------------------------------------------
# Planet-specific microclutter.
# ---------------------------------------------------------------------------


def desert_scrub():
    root("clutter-desert-scrub", "biome-clutter-atlas")
    for i in range(8):
        a = i * 2.39996
        x, y = math.cos(a) * 0.11 * i, math.sin(a) * 0.09 * i
        top = (x + math.sin(i) * 0.17, y + math.cos(i) * 0.13, 0.55 + 0.10 * (i % 3))
        tube(f"scrub-branch-{i}", (0, 0, 0.03), top, 0.045, 0.018, CLOTH(), 5)
        if i % 2 == 0:
            tube(f"scrub-fork-{i}", top, (top[0] + 0.20, top[1] - 0.08, top[2] + 0.18),
                 0.018, 0.008, CLOTH(), 4)


def desert_ribs():
    root("clutter-desert-ribs", "biome-clutter-atlas")
    tube("spine", (-0.75, 0, 0.12), (0.78, 0.05, 0.18), 0.055, 0.035, FOSSIL(), 5)
    for i in range(6):
        x = -0.58 + i * 0.23
        for side in (-1, 1):
            tube(f"rib-{i}-{side:+d}", (x, 0, 0.15), (x + 0.07, side * 0.55, 0.37),
                 0.035, 0.018, FOSSIL(), 5)


def ice_slab():
    root("clutter-ice-slab", "biome-clutter-atlas")
    bm, done = k.part("raised-slab", ICE())
    k.add_loft(bm, [
        [(-0.95, -0.62, 0), (0.90, -0.55, 0), (0.76, 0.62, 0), (-0.84, 0.54, 0)],
        [(-0.75, -0.45, 0.42), (0.78, -0.38, 0.31), (0.62, 0.42, 0.24), (-0.62, 0.45, 0.50)],
    ])
    done()
    for i in range(3):
        box(f"fracture-{i}", (-0.35 + i * 0.33, 0, 0.44 - i * 0.04),
            (0.035, 0.78 - i * 0.12, 0.04), BRINE(), Matrix.Rotation(i * 0.35, 3, "Z"))


def ice_needles():
    root("clutter-ice-needles", "biome-clutter-atlas")
    for i in range(9):
        a = i * 2.39996
        radius = 0.12 * math.sqrt(i)
        x, y = math.cos(a) * radius, math.sin(a) * radius
        shard(f"needle-{i}", (x, y, 0), (x + 0.05 * math.sin(i), y, 0.45 + 0.12 * (i % 4)),
              0.07, ICE(), 5)


def volcanic_slag():
    root("clutter-volcanic-slag", "biome-clutter-atlas")
    for i, (x, y, s) in enumerate(((-0.55, -0.25, 0.48), (0.05, -0.38, 0.62),
                                    (0.52, 0.04, 0.40), (-0.24, 0.45, 0.35))):
        rock(f"slag-{i}", (x, y, s * 0.35), (s, s * 0.72, s * 0.52),
             DARK_ROCK(), f"slag-{i}", 6)


def volcanic_bomb():
    root("clutter-volcanic-bomb", "biome-clutter-atlas")
    rock("bomb", (0, 0, 0.43), (0.75, 0.58, 0.70), DARK_ROCK(), "volcanic-bomb", 7)
    for i in range(4):
        a = i * math.pi * 0.5 + 0.3
        box(f"hot-fracture-{i}", (math.cos(a) * 0.43, math.sin(a) * 0.34, 0.47),
            (0.05, 0.34, 0.06), EMBER(), Matrix.Rotation(a, 3, "Z"))


def ocean_shells():
    root("clutter-ocean-shells", "biome-clutter-atlas")
    for i, (x, y, scale) in enumerate(((-0.46, -0.25, 0.30), (0.08, -0.32, 0.40),
                                       (0.48, 0.04, 0.28), (-0.22, 0.38, 0.34))):
        rock(f"shell-{i}", (x, y, 0.10), (scale, scale * 0.68, scale * 0.33),
             FOSSIL(), f"shell-{i}", 6)
        for ridge in range(3):
            tube(f"shell-ridge-{i}-{ridge}", (x, y, 0.16),
                 (x + (ridge - 1) * scale * 0.46, y + scale * 0.46, 0.22),
                 0.015, 0.008, SAND(), 4)


def ocean_coral():
    root("clutter-ocean-coral", "biome-clutter-atlas")
    for i in range(7):
        a = i * 2.39996
        x, y = math.cos(a) * 0.13 * i, math.sin(a) * 0.10 * i
        h = 0.42 + 0.10 * (i % 3)
        tube(f"coral-stem-{i}", (x * 0.3, y * 0.3, 0), (x, y, h),
             0.055, 0.030, BIO_PALE() if i % 2 else BIO(), 6)
        tube(f"coral-fork-{i}", (x, y, h * 0.68), (x + 0.15 * math.sin(i), y + 0.12, h + 0.15),
             0.028, 0.012, BIO_PALE(), 5)


def terrestrial_roots():
    root("clutter-terrestrial-roots", "biome-clutter-atlas")
    tube("fallen-limb", (-0.78, -0.12, 0.18), (0.70, 0.10, 0.24), 0.16, 0.10, CLOTH(), 7)
    for i in range(6):
        a = i * math.pi / 3
        tube(f"root-{i}", (0, 0, 0.16), (math.cos(a) * 0.92, math.sin(a) * 0.68, 0.03),
             0.08, 0.022, CLOTH(), 5)


def terrestrial_pebbles():
    root("clutter-terrestrial-pebbles", "biome-clutter-atlas")
    for i in range(8):
        a = i * 2.39996
        rad = 0.16 * math.sqrt(i)
        s = 0.18 + 0.035 * (i % 3)
        rock(f"pebble-{i}", (math.cos(a) * rad, math.sin(a) * rad, s * 0.25),
             (s, s * 0.76, s * 0.43), ROCK() if i % 2 else DARK_ROCK(), f"pebble-{i}", 5)


def exotic_shards():
    root("clutter-exotic-shards", "biome-clutter-atlas")
    for i in range(7):
        a = i * 2.39996
        rad = 0.12 * math.sqrt(i)
        x, y = math.cos(a) * rad, math.sin(a) * rad
        shard(f"exotic-{i}", (x, y, 0), (x + 0.12 * math.sin(i), y, 0.50 + 0.11 * (i % 3)),
              0.10, CRYSTAL() if i % 2 else ICE(), 5)


def expedition_debris():
    root("clutter-expedition-debris", "settlement-dressing-atlas")
    box("open-case", (-0.25, 0, 0.18), (0.72, 0.52, 0.34), DARK_METAL(), bevel=0.025)
    box("case-lid", (-0.25, 0.22, 0.50), (0.72, 0.08, 0.44), PAINT(),
        Matrix.Rotation(-0.42, 3, "X"))
    tube("discarded-canister", (0.42, -0.32, 0.13), (0.72, -0.05, 0.17),
         0.12, 0.12, METAL(), 8)
    for i in range(3):
        tube(f"survey-stake-{i}", (-0.56 + i * 0.58, 0.46, 0), (-0.56 + i * 0.58, 0.46, 0.62),
             0.025, 0.018, GOLD(), 5)


def biome_clutter():
    desert_scrub()
    desert_ribs()
    ice_slab()
    ice_needles()
    volcanic_slag()
    volcanic_bomb()
    ocean_shells()
    ocean_coral()
    terrestrial_roots()
    terrestrial_pebbles()
    exotic_shards()
    expedition_debris()


# ---------------------------------------------------------------------------
# Settlement human-scale dressing.
# ---------------------------------------------------------------------------


def settlement_airlock():
    root("settlement-airlock", "settlement-dressing-atlas")
    box("door-frame", (0, 0, 1.10), (1.35, 0.26, 2.20), DARK_METAL(), bevel=0.04)
    box("door-leaf", (0, -0.15, 1.08), (1.02, 0.16, 1.84), PAINT(), bevel=0.05)
    box("door-window", (0, -0.25, 1.42), (0.58, 0.04, 0.38), CYAN())
    for side in (-1, 1):
        tube(f"grab-rail-{side:+d}", (side * 0.72, -0.25, 0.35),
             (side * 0.72, -0.25, 1.55), 0.045, 0.045, GOLD(), 6)
    box("threshold", (0, -0.42, 0.10), (1.52, 0.68, 0.20), METAL())


def settlement_cargo_stack():
    root("settlement-cargo-stack", "settlement-dressing-atlas")
    crates = ((-0.44, 0, 0.34, 0.72), (0.36, -0.12, 0.31, 0.64),
              (-0.16, 0.12, 0.93, 0.58))
    for i, (x, y, z, s) in enumerate(crates):
        box(f"crate-{i}", (x, y, z), (s, s * 0.78, s), PAINT() if i % 2 else METAL(), bevel=0.025)
        for rib in (-1, 1):
            box(f"crate-rib-{i}-{rib:+d}", (x + rib * s * 0.36, y, z),
                (0.055, s * 0.82, s * 1.02), DARK_METAL())
    box("pallet", (0, 0, 0.08), (1.65, 1.15, 0.16), DARK_METAL())


def settlement_service_tank():
    root("settlement-service-tank", "settlement-dressing-atlas")
    tube("tank", (0, 0, 0.22), (0, 0, 1.72), 0.54, 0.54, PAINT(), 10)
    for z in (0.35, 1.55):
        tube(f"tank-band-{z}", (0, 0, z), (0, 0, z + 0.09), 0.58, 0.58, DARK_METAL(), 10)
    for side in (-1, 1):
        tube(f"tank-leg-{side:+d}", (side * 0.34, 0, 0), (side * 0.34, 0, 0.40),
             0.06, 0.06, METAL(), 6)
    tube("valve-neck", (0, 0, 1.72), (0, 0, 2.03), 0.11, 0.09, GOLD(), 7)


def settlement_pipe_run():
    root("settlement-pipe-run", "settlement-dressing-atlas")
    tube("main-pipe", (-1.20, 0, 0.52), (1.20, 0, 0.52), 0.14, 0.14, METAL(), 8)
    for i, x in enumerate((-0.82, 0, 0.82)):
        tube(f"support-{i}", (x, 0, 0), (x, 0, 0.50), 0.06, 0.06, DARK_METAL(), 6)
        tube(f"pipe-band-{i}", (x - 0.04, 0, 0.52), (x + 0.04, 0, 0.52),
             0.17, 0.17, GOLD() if i == 1 else DARK_METAL(), 8)


def settlement_railing():
    root("settlement-railing", "settlement-dressing-atlas")
    for x in (-1.0, 0, 1.0):
        tube(f"post-{x}", (x, 0, 0), (x, 0, 1.10), 0.045, 0.045, METAL(), 6)
    for z in (0.55, 1.08):
        tube(f"rail-{z}", (-1.05, 0, z), (1.05, 0, z), 0.045, 0.045, GOLD() if z > 1 else METAL(), 6)


def settlement_sign():
    root("settlement-sign", "settlement-dressing-atlas")
    for side in (-1, 1):
        tube(f"sign-post-{side:+d}", (side * 0.55, 0, 0), (side * 0.55, 0, 1.50),
             0.045, 0.045, DARK_METAL(), 6)
    box("sign-board", (0, 0, 1.25), (1.42, 0.10, 0.65), PAINT(), bevel=0.035)
    box("sign-stripe", (0, -0.065, 1.25), (1.14, 0.025, 0.10), GOLD())


def settlement_worklight():
    root("settlement-worklight", "settlement-dressing-atlas")
    for side in (-1, 1):
        tube(f"tripod-leg-{side:+d}", (0, 0, 0.78), (side * 0.48, 0.28, 0),
             0.045, 0.028, DARK_METAL(), 6)
    tube("tripod-leg-back", (0, 0, 0.78), (0, -0.52, 0), 0.045, 0.028, DARK_METAL(), 6)
    tube("mast", (0, 0, 0.70), (0, 0, 1.55), 0.055, 0.045, METAL(), 6)
    box("lamp-housing", (0, 0, 1.68), (0.72, 0.30, 0.50), DARK_METAL(), bevel=0.035)
    box("lamp-lens", (0, -0.17, 1.68), (0.58, 0.025, 0.36), CYAN())


def settlement_cable_reel():
    root("settlement-cable-reel", "settlement-dressing-atlas")
    for y in (-0.34, 0.34):
        tube(f"reel-flange-{y}", (0, y, 0.42), (0, y + 0.06, 0.42),
             0.58, 0.58, METAL(), 10)
    tube("reel-core", (0, -0.34, 0.42), (0, 0.40, 0.42), 0.27, 0.27, CLOTH(), 10)
    for side in (-1, 1):
        tube(f"reel-leg-{side:+d}", (side * 0.40, 0, 0), (side * 0.40, 0, 0.48),
             0.05, 0.05, DARK_METAL(), 6)


def settlement_service_drone():
    root("settlement-service-drone", "settlement-dressing-atlas")
    box("drone-body", (0, 0, 0.72), (0.92, 0.66, 0.44), PAINT(), bevel=0.06)
    for side in (-1, 1):
        tube(f"drone-wheel-{side:+d}", (side * 0.48, -0.22, 0.42),
             (side * 0.48, 0.22, 0.42), 0.22, 0.22, DARK_METAL(), 8)
        tube(f"drone-arm-{side:+d}", (side * 0.38, 0, 0.76),
             (side * 0.78, -0.08, 1.05), 0.055, 0.035, METAL(), 6)
    box("drone-eye", (0, -0.35, 0.79), (0.42, 0.035, 0.16), CYAN())
    tube("drone-mast", (0, 0.18, 0.86), (0, 0.18, 1.28), 0.04, 0.03, GOLD(), 6)


def settlement_awning():
    root("settlement-awning", "settlement-dressing-atlas")
    for side in (-1, 1):
        tube(f"awning-post-{side:+d}", (side * 1.0, 0.55, 0), (side * 1.0, 0.55, 1.72),
             0.05, 0.04, DARK_METAL(), 6)
    bm, done = k.part("awning-cloth", CLOTH())
    k.add_loft(bm, [
        [(-1.1, -0.55, 1.92), (1.1, -0.55, 1.92), (1.1, -0.55, 1.86), (-1.1, -0.55, 1.86)],
        [(-1.1, 0.05, 1.84), (1.1, 0.05, 1.84), (1.1, 0.05, 1.77), (-1.1, 0.05, 1.77)],
        [(-1.1, 0.62, 1.66), (1.1, 0.62, 1.66), (1.1, 0.62, 1.58), (-1.1, 0.62, 1.58)],
    ])
    done()
    for x in (-0.72, 0, 0.72):
        box(f"awning-stripe-{x}", (x, 0.05, 1.82), (0.11, 1.12, 0.025), GOLD())


def settlement_dressing():
    settlement_airlock()
    settlement_cargo_stack()
    settlement_service_tank()
    settlement_pipe_run()
    settlement_railing()
    settlement_sign()
    settlement_worklight()
    settlement_cable_reel()
    settlement_service_drone()
    settlement_awning()


# ---------------------------------------------------------------------------
# Ecology discovery setpieces.  These are static seats; moving creatures use
# the separate creature-variants kit so this file does not pay for UV1.
# ---------------------------------------------------------------------------


def vignette_spore_bloom():
    root("vignette-spore-bloom", "ecology-atlas")
    for i in range(9):
        a = i * 2.39996
        rad = 0.13 * math.sqrt(i)
        x, y = math.cos(a) * rad, math.sin(a) * rad
        h = 0.25 + 0.09 * (i % 4)
        tube(f"spore-stem-{i}", (x, y, 0), (x, y, h), 0.035, 0.025, BIO(), 5)
        tube(f"spore-cap-{i}", (x, y, h), (x, y, h + 0.08),
             0.15 + 0.02 * (i % 2), 0.07, BIO_PALE(), 7)


def vignette_brine_garden():
    root("vignette-brine-garden", "ecology-atlas")
    box("brine-bed", (0, 0, 0.03), (1.65, 1.25, 0.06), BRINE())
    for i in range(8):
        a = i * 2.39996
        rad = 0.12 * math.sqrt(i)
        x, y = math.cos(a) * rad, math.sin(a) * rad
        tube(f"garden-stalk-{i}", (x, y, 0.04), (x + 0.08 * math.sin(i), y, 0.58 + 0.10 * (i % 3)),
             0.055, 0.025, BIO(), 6)
        rock(f"garden-bladder-{i}", (x + 0.08 * math.sin(i), y, 0.67 + 0.10 * (i % 3)),
             (0.11, 0.09, 0.14), BIO_PALE(), f"brine-bladder-{i}", 5)


def vignette_tide_chorus():
    root("vignette-tide-chorus", "ecology-atlas")
    for i in range(8):
        a = i * 2 * math.pi / 8
        rad = 0.52 + 0.10 * (i % 2)
        x, y = math.cos(a) * rad, math.sin(a) * rad
        h = 0.42 + 0.13 * (i % 3)
        tube(f"chorus-shell-{i}", (x, y, 0.03), (x, y, h),
             0.14, 0.21, FOSSIL() if i % 2 else BIO_PALE(), 7)
    box("tide-pool", (0, 0, 0.02), (1.55, 1.40, 0.04), BRINE())


def vignette_ember_swarm():
    root("vignette-ember-swarm", "ecology-atlas")
    for i in range(9):
        a = i * 2.39996
        rad = 0.17 * math.sqrt(i)
        s = 0.17 + 0.025 * (i % 3)
        rock(f"ember-host-{i}", (math.cos(a) * rad, math.sin(a) * rad, s * 0.44),
             (s, s * 0.82, s * 0.58), DARK_ROCK(), f"ember-{i}", 5)
        box(f"ember-glow-{i}", (math.cos(a) * rad, math.sin(a) * rad - s * 0.35, s * 0.50),
            (s * 0.48, 0.018, s * 0.16), EMBER())


def vignette_burrow():
    root("vignette-burrow", "ecology-atlas")
    for i in range(11):
        a = i * 2 * math.pi / 11
        rad = 0.72 + 0.10 * math.sin(i * 2.2)
        rock(f"burrow-rim-{i}", (math.cos(a) * rad, math.sin(a) * rad, 0.11),
             (0.24, 0.20, 0.16), SAND(), f"burrow-{i}", 5)
    for i in range(4):
        tube(f"claw-mark-{i}", (-0.38 + i * 0.24, -0.32, 0.03),
             (-0.48 + i * 0.24, -0.72, 0.025), 0.018, 0.008, DARK_ROCK(), 4)


def vignette_lichen_colony():
    root("vignette-lichen-colony", "ecology-atlas")
    rock("host-rock", (0, 0, 0.35), (1.0, 0.76, 0.55), ROCK(), "lichen-host", 8)
    for i in range(10):
        a = i * 2.39996
        x, y = math.cos(a) * (0.22 + 0.04 * i), math.sin(a) * (0.16 + 0.03 * i)
        box(f"lichen-pad-{i}", (x, y - 0.40, 0.42 + 0.03 * (i % 4)),
            (0.20 + 0.02 * (i % 3), 0.025, 0.12), BIO_PALE(),
            Matrix.Rotation(a * 0.35, 3, "Z"))


def vignette_nesting_colony():
    root("vignette-nesting-colony", "ecology-atlas")
    for nest in range(3):
        a = nest * 2 * math.pi / 3
        x, y = math.cos(a) * 0.58, math.sin(a) * 0.45
        tube(f"nest-rim-{nest}", (x, y, 0.05), (x, y, 0.18),
             0.34, 0.27, CLOTH(), 8)
        for egg in range(2):
            rock(f"egg-{nest}-{egg}", (x + (egg - 0.5) * 0.14, y, 0.25),
                 (0.09, 0.07, 0.14), FOSSIL(), f"nest-{nest}-egg-{egg}", 6)


def vignette_grazer_ring():
    root("vignette-grazer-ring", "ecology-atlas")
    for i in range(9):
        a = i * 2 * math.pi / 9
        rad = 0.92 + 0.06 * math.sin(i * 1.7)
        rock(f"trampled-tuft-{i}", (math.cos(a) * rad, math.sin(a) * rad, 0.08),
             (0.22, 0.14, 0.12), BIO() if i % 2 else SAND(), f"grazer-ring-{i}", 5)
    for i in range(4):
        box(f"hoofprint-{i}", (-0.40 + i * 0.25, -0.05 + 0.08 * (i % 2), 0.012),
            (0.12, 0.20, 0.02), DARK_ROCK(), Matrix.Rotation((i - 1.5) * 0.22, 3, "Z"))


def ecology_vignettes():
    vignette_spore_bloom()
    vignette_brine_garden()
    vignette_tide_chorus()
    vignette_ember_swarm()
    vignette_burrow()
    vignette_lichen_colony()
    vignette_nesting_colony()
    vignette_grazer_ring()


def build():
    deposits()
    biome_clutter()
    settlement_dressing()
    ecology_vignettes()


k.run("surface-dressing-kit", build, tri_budget=36000, per_asset=900)
