"""
Biome vegetation — one tree per planet type.

This one is NOT in build-ship's registry and is not run by `npm run assets:ship`.
It is a one-off authoring tool whose OUTPUT is the deliverable: it exports
straight into assets-source/uplift/models/, where the import pipeline (§8 of
docs/BLENDER_PIPELINE.md) picks it up with zero configuration — no registry
entry, no verify config, no prefetch edit. Run it only when the shapes change:

    blender --background --factory-startup --python flora.py -- \
        --glb ../models/biome-flora.glb --blend ../models/biome-flora.blend

Then `npm run assets:ship` (or the watcher) imports, repairs, verifies and
manifests it like any downloaded model.

────────────────────────────────────────────────────────────────────────────
Why this exists at all
────────────────────────────────────────────────────────────────────────────

The prop generator has been drawing biome-keyed vegetation names since the
uplift — `terrestrial-flora-01`, `ice-flora-01` — but `propVariant()` switches
on FAMILY only. The planet type reaches the asset's name and the RNG seed and
nothing else, so every world grew the same stem-and-five-cones plant with
slightly different jitter. Nothing was ever taller than a 1.4 m shrub, either:
the word "tree" did not appear anywhere in the pack.

So these are trees, and they are the thing that is actually different from
world to world. Six silhouettes, chosen to be unmistakable at distance and in
shadow, because that is the range at which a biome reads:

  terrestrial  a broadleaf — a trunk and layered canopy, the default idea
  ice          a conifer spire, snow still on the upper tiers
  desert       a succulent candelabra: no leaves at all, water in the column
  volcanic     a charred snag, limbs broken off, nothing growing
  ocean        a mangrove standing on arching prop roots, out of the water
  gasgiant     a tethered bladder plant, holding itself up with lift

Author Z up, trunk on +Z, every object at identity. See kitlib.py.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kitlib as k  # noqa: E402

# Drawn through upliftFamilyMaterial: vertex colour x palette tint x atlas,
# with a gain that recentres mid-grey. So author real mid-tones — the world's
# own palette pulls them toward its register without flattening them.
BARK = lambda: k.mat(0x6B5A47, "flora-bark", 0.94, 0.0)        # noqa: E731
BARK_DARK = lambda: k.mat(0x4A3E31, "flora-bark-dark", 0.95, 0.0)  # noqa: E731
LEAF = lambda: k.mat(0x4C8E65, "flora-leaf", 0.9, 0.0)         # noqa: E731
LEAF_DEEP = lambda: k.mat(0x35704E, "flora-leaf-deep", 0.9, 0.0)   # noqa: E731
FROST = lambda: k.mat(0x5E8494, "flora-frost", 0.88, 0.0)      # noqa: E731
SNOW = lambda: k.mat(0xE8F2FB, "flora-snow", 0.82, 0.0)        # noqa: E731
SUCCULENT = lambda: k.mat(0x7A9166, "flora-succulent", 0.86, 0.0)  # noqa: E731
CHAR = lambda: k.mat(0x2A2724, "flora-char", 0.97, 0.0)        # noqa: E731
ASH = lambda: k.mat(0x8A8578, "flora-ash", 0.95, 0.0)          # noqa: E731
MANGROVE = lambda: k.mat(0x5B7A52, "flora-mangrove", 0.92, 0.0)    # noqa: E731
BLADDER = lambda: k.mat(0x9A6BC4, "flora-bladder", 0.5, 0.0)   # noqa: E731
BLADDER_LIT = lambda: k.mat(0xD4B4E4, "flora-bladder-lit", 0.4, 0.0)  # noqa: E731


def blob(name, center, radius, squash, material, segments=6):
    """A faceted spheroid — canopy mass, cheap and read by its outline."""
    cx, cy, cz = center
    bm, done = k.part(name, material)
    rings = []
    for band, scale in ((-0.60, 0.55), (0.0, 1.0), (0.58, 0.58)):
        rings.append([
            (cx + math.cos(2 * math.pi * i / segments) * radius * scale,
             cy + math.sin(2 * math.pi * i / segments) * radius * scale,
             cz + band * radius * squash)
            for i in range(segments)
        ])
    k.add_loft(bm, rings)
    done()


def trunk(name, base, top, r0, r1, material, segments=6):
    bm, done = k.part(name, material)
    k.add_tube(bm, base, top, r0, r1, segments)
    done()


def terrestrial():
    """A broadleaf. The shape everyone means by 'tree', so it is the one that
    has to look least designed."""
    k.asset("tree-terrestrial")
    trunk("trunk", (0, 0, 0), (0.14, 0.08, 3.30), 0.30, 0.16, BARK())
    trunk("root-flare", (0, 0, 0), (0, 0, 0.42), 0.44, 0.30, BARK_DARK())
    for i, (a, z0, z1, lean) in enumerate(
        ((0.6, 2.10, 3.10, 1.15), (3.4, 2.55, 3.45, 0.95), (5.1, 2.85, 3.70, 0.75))
    ):
        trunk(f"branch-{i}", (math.cos(a) * 0.1, math.sin(a) * 0.1, z0),
              (math.cos(a) * lean, math.sin(a) * lean, z1), 0.11, 0.06, BARK(), 5)
    blob("canopy-low", (0.0, 0.0, 3.85), 1.85, 0.68, LEAF_DEEP())
    blob("canopy-mid", (0.42, -0.30, 4.75), 1.50, 0.66, LEAF())
    blob("canopy-top", (-0.28, 0.24, 5.45), 1.02, 0.70, LEAF())


def ice():
    """A conifer. Narrow, so snow slides off it, and the top tiers keep some."""
    k.asset("tree-ice")
    trunk("trunk", (0, 0, 0), (0, 0, 6.40), 0.24, 0.09, BARK_DARK())
    tiers = [(0.55, 1.55, 1.85), (1.60, 2.55, 1.58), (2.55, 3.45, 1.30),
             (3.45, 4.30, 1.02), (4.25, 5.20, 0.74), (5.10, 6.10, 0.46)]
    for i, (z0, z1, r) in enumerate(tiers):
        bm, done = k.part(f"tier-{i}", FROST() if i < 4 else LEAF_DEEP())
        k.add_tube(bm, (0, 0, z0), (0, 0, z1), r, r * 0.12, 6, cap1=False)
        done()
    # Snow that has not come off the top two tiers.
    for i, (z0, z1, r) in enumerate(tiers[-2:]):
        bm, done = k.part(f"snow-{i}", SNOW())
        k.add_tube(bm, (0, 0, z0 + 0.06), (0, 0, z1 - 0.02), r * 0.72, r * 0.08, 6, cap1=False)
        done()


def desert():
    """A succulent candelabra. No leaves — the water is in the column, and the
    silhouette is the plant's whole argument."""
    k.asset("tree-desert")
    # Eight sides rather than six: the extra facets read as ribbing, which is
    # what says 'succulent' instead of 'post'.
    trunk("column", (0, 0, 0), (0, 0, 3.70), 0.46, 0.36, SUCCULENT(), 8)
    trunk("crown", (0, 0, 3.62), (0, 0, 4.05), 0.36, 0.14, SUCCULENT(), 8)
    for i, (a, out, up, top) in enumerate(((0.4, 1.05, 1.35, 3.15), (3.7, 0.95, 1.75, 3.55))):
        ax, ay = math.cos(a), math.sin(a)
        trunk(f"arm-out-{i}", (ax * 0.30, ay * 0.30, up),
              (ax * out, ay * out, up + 0.34), 0.24, 0.21, SUCCULENT(), 6)
        trunk(f"arm-up-{i}", (ax * out, ay * out, up + 0.10),
              (ax * out * 1.04, ay * out * 1.04, top), 0.22, 0.17, SUCCULENT(), 6)
        trunk(f"arm-tip-{i}", (ax * out * 1.04, ay * out * 1.04, top - 0.04),
              (ax * out * 1.04, ay * out * 1.04, top + 0.26), 0.17, 0.07, SUCCULENT(), 6)


def volcanic():
    """A snag. Nothing grows here now; what stands is what did not finish
    burning, and the limbs end where they broke."""
    k.asset("tree-volcanic")
    trunk("trunk", (0, 0, 0), (0.22, 0.14, 4.60), 0.34, 0.13, CHAR())
    trunk("root-flare", (0, 0, 0), (0, 0, 0.50), 0.50, 0.34, CHAR())
    for i, (a, z0, z1, out) in enumerate(
        ((0.9, 1.85, 2.35, 1.25), (3.9, 2.60, 2.85, 0.95), (5.6, 3.35, 3.80, 0.70))
    ):
        ax, ay = math.cos(a), math.sin(a)
        # Ends blunt, not tapered to nothing: a broken limb has a face.
        trunk(f"limb-{i}", (ax * 0.12, ay * 0.12, z0), (ax * out, ay * out, z1),
              0.13, 0.09, CHAR(), 5)
    for i, (z, h) in enumerate(((1.20, 0.9), (2.95, 0.7))):
        bm, done = k.part(f"scar-{i}", ASH())
        k.add_box(bm, (0.19, 0.0, z), (0.1, 0.30, h))
        done()


def ocean():
    """A mangrove: the trunk starts above the water, and the roots are the
    reason the whole thing is standing."""
    k.asset("tree-ocean")
    for i in range(5):
        a = i * 2 * math.pi / 5 + 0.3
        ax, ay = math.cos(a), math.sin(a)
        # Two segments make the root ARCH rather than splay.
        trunk(f"prop-root-{i}", (ax * 1.15, ay * 1.15, 0.0),
              (ax * 0.72, ay * 0.72, 0.92), 0.13, 0.10, BARK_DARK(), 4)
        trunk(f"prop-knee-{i}", (ax * 0.72, ay * 0.72, 0.86),
              (ax * 0.16, ay * 0.16, 1.48), 0.10, 0.09, BARK_DARK(), 4)
    trunk("trunk", (0, 0, 1.30), (0.10, 0.06, 3.30), 0.26, 0.15, BARK())
    for i in range(6):
        a = i * 2 * math.pi / 6 + 0.5
        ax, ay = math.cos(a), math.sin(a)
        bm, done = k.part(f"frond-{i}", MANGROVE())
        k.add_tube(bm, (ax * 0.12, ay * 0.12, 3.24),
                   (ax * 1.55, ay * 1.55, 3.55 + (i % 2) * 0.30), 0.30, 0.05, 4)
        done()
    blob("crown", (0.0, 0.0, 3.42), 0.62, 0.62, MANGROVE())


def gasgiant():
    """A bladder plant. It is not holding itself up — the gasbags are, and the
    stalk is a tether."""
    k.asset("tree-gasgiant")
    trunk("stalk", (0, 0, 0), (0.18, 0.12, 5.05), 0.13, 0.07, BARK_DARK(), 5)
    trunk("anchor", (0, 0, 0), (0, 0, 0.34), 0.30, 0.16, BARK_DARK(), 6)
    blob("bladder-low", (0.30, -0.16, 3.05), 0.86, 1.12, BLADDER())
    blob("bladder-mid", (-0.22, 0.26, 4.20), 1.06, 1.15, BLADDER())
    blob("bladder-top", (0.24, 0.10, 5.30), 0.70, 1.10, BLADDER_LIT())
    for i, (a, z, drop) in enumerate(((1.1, 3.20, 1.30), (4.3, 4.35, 1.75))):
        ax, ay = math.cos(a), math.sin(a)
        trunk(f"tendril-{i}", (ax * 0.55, ay * 0.55, z),
              (ax * 0.80, ay * 0.80, z - drop), 0.045, 0.02, BLADDER(), 4)


def build():
    terrestrial()
    ice()
    desert()
    volcanic()
    ocean()
    gasgiant()


k.run("biome-flora", build, tri_budget=2600, per_asset=520)
