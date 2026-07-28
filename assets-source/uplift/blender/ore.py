"""
The crystal seams — ASSET_UPLIFT.md 2.7.

    npm run assets:ship

The name the game reads is `crystal-shard` (SurfaceScene.tsx). Four of them
are instanced per seam, each leaned and scaled differently, and the `crack`
value tilts and sinks them as the pick works the seam.

This one was deliberately SKIPPED in the original uplift, on the grounds that
the placeholder was already an octahedron and a modelled crystal would not be
an improvement. That was true of a single shard and false of a cluster: what
reads as ore is not one clean solid but a main prism with smaller growths
crowding its foot. So the asset is a cluster, and the seam gets four of them.

Colour is not authored here. `createCrystalMaterial()` ignores vertex colours
entirely — the whole family is one glow with a noise pulse on the emissive —
so the materials below exist only for the .blend's own viewport, and the ONLY
thing this file contributes to the game is silhouette. Budget it accordingly:
the seam census reaches a long way, and every seam pays four times.

Author Z up, growth axis +Z, every object at identity. See kitlib.py.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kitlib as k  # noqa: E402

# Height of the main prism. The fit normalises the longest axis to this, and
# SurfaceScene's seat scale is chosen against it.
TOP = 1.40

CRYSTAL = lambda: k.mat(0x6FE0FF, "ore-crystal", 0.22, 0.1)   # noqa: E731
CORE = lambda: k.mat(0xBFF2FF, "ore-core", 0.14, 0.05)        # noqa: E731
MATRIX = lambda: k.mat(0x3A4148, "ore-matrix", 0.92, 0.0)     # noqa: E731


def prism(name, material, base, top, r0, r1, segments=6, cap=True):
    """A crystal: a faceted column that terminates in a point rather than a
    face. The near-zero top radius is what makes it read as grown."""
    bm, done = k.part(name, material)
    k.add_tube(bm, base, top, r0, r1, segments, cap0=cap, cap1=False)
    done()


def build():
    k.asset("crystal-shard", {"atlas": "../../textures/seams/crystal-seam.ktx2"})

    # The main prism: a hexagonal column, then a termination. Two parts rather
    # than one loft so the shoulder is a hard crease — a crystal's tip meets
    # its shaft at an angle, it does not blend into it.
    bm, done = k.part("prism-body", CRYSTAL())
    k.add_tube(bm, (0.0, 0.0, 0.0), (0.0, 0.0, 0.95), 0.26, 0.235, 6)
    done()
    prism("prism-tip", CORE(), (0.0, 0.0, 0.95), (0.0, 0.0, TOP), 0.235, 0.02, 6, cap=False)

    # Two satellites crowding the foot, leaning off the main axis. Different
    # heights and headings: a seam that grew, not a seam that was installed.
    prism("satellite-a", CRYSTAL(), (0.21, 0.11, 0.0), (0.31, 0.16, 0.72), 0.115, 0.02, 5)
    prism("satellite-b", CRYSTAL(), (-0.17, -0.15, 0.0), (-0.27, -0.22, 0.47), 0.095, 0.02, 5)

    # The rubble it grew out of. Under the crystal shader this glows like the
    # rest, which is the correct lie: at the foot of a lit seam everything is
    # lit, and it costs eight triangles to stop the prisms floating.
    bm, done = k.part("foot", MATRIX())
    k.add_tube(bm, (0.0, 0.0, -0.04), (0.0, 0.0, 0.13), 0.34, 0.28, 5)
    done()


k.run("crystal-shard", build, tri_budget=140)
