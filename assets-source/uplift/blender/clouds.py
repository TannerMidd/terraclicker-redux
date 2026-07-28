"""
Cloud banks — ASSET_UPLIFT.md 4.1, the part a shell cannot do.

    npm run assets:ship

Names the game reads (CloudBanks in SurfaceScene.tsx): `cloud-bank-a`,
`cloud-bank-b`, `cloud-bank-c`.

These do NOT replace the cloud deck. That is a 64 km plane at 1400 m with a
flow-mapped shader, and it is the right tool for a ceiling. What it cannot do
is have a near side and a far side: it is infinitely distant by construction,
so in low flight — which tops out at 1800 m, above the deck — you never fly
past anything. These banks live in the band below it, at 500 to 1050 m, and
exist entirely for parallax.

Lit without a light. The whole family draws on one UNLIT material, so shading
has to be baked: lobes near the top are authored pale and lobes underneath are
authored grey-blue, and the merge turns those material colours into the vertex
gradient that makes a blob read as a cloud. There is no cheaper way to get a
sunlit top and a shadowed base, and adding a light to this scene is forbidden
for good reason — mounting one invalidates every material in it.

Faceted on purpose. This is a flat-shaded game; a smooth cloud would be the
only smooth thing in the sky.

Author Z up, every object at identity. See kitlib.py.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kitlib as k  # noqa: E402

# Baked shading, top to bottom. Tinted at runtime by sky and weather, so these
# are relative values: what matters is the gradient, not the absolute grey.
SUNLIT = lambda: k.mat(0xFFFFFF, "cloud-sunlit", 1.0, 0.0)   # noqa: E731
UPPER = lambda: k.mat(0xE2E7EF, "cloud-upper", 1.0, 0.0)     # noqa: E731
MID = lambda: k.mat(0xC2CBDA, "cloud-mid", 1.0, 0.0)         # noqa: E731
BASE = lambda: k.mat(0x9AA6B8, "cloud-base", 1.0, 0.0)       # noqa: E731
SHADOW = lambda: k.mat(0x7C8A9E, "cloud-shadow", 1.0, 0.0)   # noqa: E731


def shade(z, top):
    """Which baked tone a lobe takes, by how high it sits in the bank."""
    t = z / top if top else 0.0
    if t > 0.72:
        return SUNLIT()
    if t > 0.50:
        return UPPER()
    if t > 0.30:
        return MID()
    if t > 0.14:
        return BASE()
    return SHADOW()


def lobe(name, center, radius, squash, material, segments=6):
    """One puff: a faceted spheroid, cheap and readable in silhouette.

    Three rings rather than a sphere — a cloud is read by its outline, and two
    bands of facets give the outline every bump it needs at this distance.
    """
    cx, cy, cz = center
    rz = radius * squash
    bm, done = k.part(name, material)
    rings = []
    for band, scale in ((-0.62, 0.52), (0.0, 1.0), (0.58, 0.58)):
        rings.append([
            (cx + math.cos(2 * math.pi * i / segments) * radius * scale,
             cy + math.sin(2 * math.pi * i / segments) * radius * scale,
             cz + band * rz)
            for i in range(segments)
        ])
    k.add_loft(bm, rings)
    done()


def bank(name, top, lobes):
    """A cloud from a list of (x, y, z, radius, squash)."""
    k.asset(name)
    for i, (x, y, z, r, sq) in enumerate(lobes):
        lobe(f"{name}-lobe-{i}", (x, y, z), r, sq, shade(z, top))


def build():
    # A: a wide, flat raft. The common one, and the one you fly alongside.
    bank("cloud-bank-a", 0.62, [
        (0.00, 0.00, 0.30, 0.62, 0.62),
        (0.82, 0.16, 0.24, 0.46, 0.60),
        (-0.74, -0.20, 0.26, 0.50, 0.58),
        (0.30, -0.52, 0.20, 0.38, 0.62),
        (-0.28, 0.48, 0.22, 0.40, 0.60),
        (1.35, -0.10, 0.16, 0.28, 0.66),
        (-1.28, 0.14, 0.15, 0.26, 0.66),
        (0.16, 0.10, 0.54, 0.34, 0.52),
    ])

    # B: a heap with vertical development — the one worth flying around.
    bank("cloud-bank-b", 1.30, [
        (0.00, 0.00, 0.26, 0.58, 0.70),
        (0.52, 0.22, 0.34, 0.42, 0.72),
        (-0.48, -0.18, 0.30, 0.44, 0.70),
        (0.10, -0.10, 0.66, 0.46, 0.74),
        (-0.20, 0.24, 0.72, 0.36, 0.72),
        (0.26, 0.06, 1.00, 0.32, 0.70),
        (-0.04, -0.14, 1.22, 0.22, 0.66),
        (0.88, -0.06, 0.20, 0.30, 0.66),
        (-0.86, 0.10, 0.18, 0.28, 0.66),
    ])

    # C: torn scraps, for the edges of a front and for weather that is losing.
    bank("cloud-bank-c", 0.46, [
        (0.00, 0.00, 0.22, 0.40, 0.54),
        (0.66, -0.12, 0.18, 0.30, 0.52),
        (-0.58, 0.16, 0.16, 0.26, 0.52),
        (0.22, 0.40, 0.14, 0.22, 0.54),
        (1.12, 0.06, 0.12, 0.17, 0.56),
        (-1.04, -0.10, 0.11, 0.15, 0.56),
    ])


k.run("cloud-banks", build, tri_budget=1600, per_asset=600)
