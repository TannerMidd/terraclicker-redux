# Asset uplift — what to make now that all six Expeditions phases have landed

The systems are finished. Every surface in this game is currently **arithmetic**:
there is not one albedo, normal, roughness or AO map anywhere in the 3D scene.
The only image files that ship are UI (SVG diagrams, WebP cards, one cockpit
fascia, one lens-dirt sprite). Terrain, planets, ships, towns, wildlife, weather
and sky are all TSL nodes and hand-placed primitives.

That was the right call while the systems were moving — a procedural surface
costs nothing to re-tune, and [ART_DIRECTION.md §12](ART_DIRECTION.md) built
laws around it. It is now the single largest gap between how good this game
*is* and how good it *looks*.

This document is the production list. It is ordered by **visual return per hour
of work**, and every item names the file it plugs into, because an asset with
no integration point is a wallpaper.

## The five laws any new asset must obey

These are not style preferences; breaking them costs frames, and this scene has
a measured budget (p99 16.8 ms on real Chrome/WebGPU).

1. **One material per family, shared across every instance.** A per-object
   material is a shader link, and a shader link mid-flight is a 170 ms hitch
   (see `threejs-node-material-cost` — the reason the whole scene shares
   `settledPlanet.ts`). New textures go into the *existing* shared materials as
   uniforms, not into new ones.
2. **Texture arrays, not per-type materials.** Six planet types × four ground
   layers is one `DataArrayTexture` and an index uniform, never twenty-four
   materials.
3. **KTX2 / Basis Universal, always.** A 2K PNG set for six planet types is
   ~180 MB of VRAM as raw RGBA; the same set as KTX2 with mips is ~12 MB and
   uploads without a main-thread stall. `.png`/`.webp` masters live outside
   `public/`; only `.ktx2` ships.
4. **Tier budgets hold** (§10): Tier A gets 2K sets, Tier B 1K, Tier C keeps
   today's procedural path untouched. Every texture item below must degrade to
   "the game as it looks now" on Tier C, which is free because that path exists.
5. **The renderer and the walker read the same array.** Nothing here may
   displace geometry on the GPU. Detail normals, parallax and decals are
   shading-only; the height tiers stay the one truth for collision.

---

## Tier 1 — the ground you stand on (biggest uplift by a distance)

The player spends whole minutes at 1.7 m eye height looking at a flat-shaded
noise gradient. This is where the money is.

| # | Asset | Spec | Plugs into |
|---|---|---|---|
| 1.1 | **Ground material sets, 6 planet types × 4 layers** (lowland, upland, shore, peak/frost) — albedo, normal, roughness, AO packed to 2 maps (RGB albedo, RG normal + B rough + A AO) | 2K KTX2, tiling, `DataArrayTexture` of 48 slices | `surface/surfaceMaterial.ts` — replaces the palette-band `mix` with a triplanar sample keyed to the same band weights already computed |
| 1.2 | **Detail/macro breakup set** — one greyscale detail-normal + one large-scale mottle per type, blended at two frequencies to kill tiling | 1K + 2K KTX2 | same shader, second UV scale — this alone removes the "smooth putty" read at 2–15 m |
| 1.3 | **Shore and waterline set** — wet-sand darkening mask, foam line, and a scrolling break texture | 1K, alpha | the liquid shader's existing depth-driven shore fan |
| 1.4 | **Snow/frost overlay + its normal** — driven by the snow line the gauges already compute | 1K | `surfaceMaterial.ts` frost mix |
| 1.5 | **Lava set** — emissive crust with a flow normal and a crust-crack mask | 1K, emissive | volcanic liquid switch |
| 1.6 | **Ground decal atlas** — scorch, seam-spoil, drill spatter, footprint, landing-gear scar, blast ring | 1K atlas, alpha | new shared decal instancer; **the set-down and the touchdown dust already fire nonces to hang these on** (`touchdownNonce`, `mineNonce`) |

**Why first:** items 1.1 and 1.2 change every second of surface play on every
world, cost one shader edit, and reuse the band weights the material already
computes. Nothing else on this list has that ratio.

## Tier 2 — the things you walk up to

Six scatter families and eleven settlement families are currently boxes, cones
and spheres. They read well at silhouette distance and poorly at 3 m.

| # | Asset | Spec | Plugs into |
|---|---|---|---|
| 2.1 | **Prop family meshes, 3 LODs each** — rocks, boulders, flora, shrubs, shards, vents; 4–6 variants per family per planet type | glTF, ≤600 tris LOD0, shared atlas per family | `SurfaceScene.tsx` `PropChunks` — instancing, chunking and hashing are already built; only the geometry+material change |
| 2.2 | **Prop texture atlases** — one 2K atlas per family, all variants and all planet types | 2K KTX2 | as above, one material per family (law 1 holds) |
| 2.3 | **Settlement kit** — hab shell, roof, mast, dome, deck/stilt, works, pad, banner: 11 real meshes with panel lines, ladders, handrails, vents | glTF, ≤900 tris each, one shared 2K atlas | `surface/Settlements.tsx` — 11 instanced families already, one atlas swap |
| 2.4 | **Window emissive sheet** — warm/cool window strips as an emissive atlas so lit windows are windows, not quads | 1K emissive | the existing `windowWarm`/`windowCool` instanced meshes |
| 2.5 | **Installation/facility meshes** — seed probe on its plinth, atmo-processor stacks, Deep Thought, the crane and scaffolding an open petition raises | glTF | `surfaceSettlements.ts` facility ring |
| 2.6 | **Mark kit** — beacon mast, survey station, shelter, repair rig, prospect stake | glTF + shared atlas | `surface/Marks.tsx`, 5 instanced families |
| 2.7 | **Crystal/seam set** — 4 seam meshes with a refractive-looking shared material and a per-kind tint, plus a cracked/worked state | glTF + 1K | the octahedron instancer in `SurfaceScene.tsx` |

## Tier 3 — the ship, now that you can see it in flight

Phase 6 put the runabout on screen against terrain you walked. The chase camera
is the first thing in this game that ever framed the ship as an object in a
landscape, and it is currently hand-placed boxes.

| # | Asset | Spec | Plugs into |
|---|---|---|---|
| 3.1 | **Runabout exterior mesh** — one hull, real panel breaks, gear that reads as gear, canopy glass | glTF ≤4k tris, 2K PBR + emissive | replaces `LandedRunabout` in `SurfaceScene.tsx` **and** `RunaboutHull.tsx`/`RunaboutExterior.tsx` — one asset, three call sites |
| 3.2 | **Refit visual variants** — a fitted skimmer cradle, a cargo pod, a rig bay, dispersal-field emitters, and the atmo package's intakes as swappable sub-meshes | glTF parts, same atlas | the refit state already lives in `expedition.refits`; hanging geometry off it makes salvage *visible*, which it currently never is |
| 3.3 | **Cockpit interior plate** — the canopy is an SVG frame today; a real dashboard fascia, throttle quadrant and window frame with parallax | 2K WebP layers (already the pattern — `cockpit/console-fascia.webp`) | `FlightHUD.tsx` `Canopy` (now also used by the surface in the `fly` phase) |
| 3.4 | **Skimmer mesh** — the sled you park and remount | glTF ≤1.5k tris | `ParkedSkimmer` + `SkimmerDash` |
| 3.5 | **Hull decal sheet** — registration numbers, hazard stripes, a Guide sticker, wear around the airlock | 1K alpha atlas | ship material |

## Tier 4 — sky, weather and light

| # | Asset | Spec | Plugs into |
|---|---|---|---|
| 4.1 | **Cloud-deck texture set** — 4 layered cloud sheets (cirrus, cumulus base, storm anvil, dust haze) with alpha and a curl-noise flow map | 2K KTX2 | `SurfaceScene.tsx` cloud deck plane + `SettledAtmosphere.tsx` shells |
| 4.2 | **Weather particle atlas** — rain streak, snow crystal, dust mote, ash flake, ember, meteor streak (currently untextured points/quads) | 1K alpha atlas | `surface/WeatherFX.tsx` |
| 4.3 | **Sky gradient LUTs** — a per-planet-type, per-sun-elevation 2D LUT so dawn/dusk are authored rather than lerped | 256×64 KTX2 | sky dome material — cheap, and the single biggest "screenshot quality" lever after ground textures |
| 4.4 | **Star field plate + nebula wash** — the airless-sky case deserves a real plate | 4K equirect KTX2 | `Stars.tsx` |
| 4.5 | **Sun/glare sprite set** — bloom kernel, anamorphic streak, lens ghosts to sit alongside the existing `lens-dirt.webp` | 1K alpha | `PlanetFX`, `SceneLamps` |
| 4.6 | **Aurora/bioluminescence ramp** — for high-Biotic night sides, which the gauges already drive | 512 gradient | surface sky + `SettledWorld` |

## Tier 5 — the orbital and universe scales

| # | Asset | Spec | Plugs into |
|---|---|---|---|
| 5.1 | **Planet surface detail maps, per type** — cloud, city-light and ice-cap masks at orbit resolution to layer over the procedural bands | 2K equirect KTX2 | `planetMaterial.ts` / `settledPlanet.ts` (shared, so one upload serves every world) |
| 5.2 | **City-light plate** — the settlement lights currently drawn as hexes; a real emissive plate with sprawl and arterial roads | 2K, emissive | `SettledWorld.tsx` |
| 5.3 | **Ring particle / dust band texture** | 1K | ringed-world glyphs |
| 5.4 | **Deep Field landmark meshes** — the sofa, the B-Ark, Deep Thought's cooling array, Krikkit's gate, Milliways, the towel: 15 authored objects, currently primitives | glTF, one atlas | `DeepFieldObjects.tsx` — **highest narrative payoff per asset in the whole list** |
| 5.5 | **Galaxy sprite set** — core bloom, arm dust lanes, HII regions for the point clouds | 1K alpha | `Galaxies.tsx`, `ProtoGalaxy.tsx` |
| 5.6 | **Traffic and freight sprites** — hulls at distance instead of uniform dots (a noted backlog item) | 512 atlas | `Traffic.tsx`, `LivingLanes.tsx` |

## Tier 6 — UI, and the parts that sell the game

| # | Asset | Spec | Plugs into |
|---|---|---|---|
| 6.1 | **Guide plates for the Expeditions content** — the existing 20-plate set predates Phases 1–6; certifications (4 tracks × 3 ranks), mark kinds, ground species, sample kinds, landmark kinds, and the atmo package all currently borrow art | transparent WebP 320×144, house style | `src/ui/assets.tsx` semantic map |
| 6.2 | **Refit console diagrams** — one per refit, including the new Atmospheric Handling Package | SVG 256×256 | refit bay in `FlightHUD.tsx` |
| 6.3 | **Certification seals** — four track marks that look like qualifications nobody can buy | SVG, tintable | cert column |
| 6.4 | **Sample and species plates** — the biologger and the assay ledger are text-only today | WebP 320×180 | `SurfaceHUD`, catalogue |
| 6.5 | **Compass rail glyph set** — the marker rail uses text glyphs (`▽`, `⌖`); proper icons per kind | SVG sprite sheet | `SurfaceHUD` `MARK_GLYPH` |
| 6.6 | **Landing-page media refresh** — the page's captures predate Phases 4–6; low flight, the chase view, a set-down and a district at dusk are all new and all better than what is up | WebP, existing sizes | `landing/media/` |
| 6.7 | **Sound** — the direction doc mandates zero audio files and the synth stack honours it. If that is ever revisited: wind beds per planet type, engine layers, footstep sets by ground material, and weather beds are the four that would matter | — | `src/ui/audio/audio.ts` |

---

## Suggested order of work

1. **1.1 + 1.2** (ground sets + detail breakup). One shader, six worlds, every
   second of play. Nothing else competes.
2. **3.1** (runabout mesh). Three call sites, and Phase 6 just made the ship a
   thing people look at.
3. **2.1 + 2.2** (prop meshes + atlases). The chunk streamer is already built
   for exactly this.
4. **4.1 + 4.3** (clouds + sky LUTs). Cheap, and they carry every screenshot.
5. **2.3 + 2.4** (settlement kit + windows). Turns "delivered means inhabited"
   from a claim into a look.
6. **5.4** (Deep Field objects). The jokes deserve geometry.
7. Everything else, by appetite.

## Production notes

- **Generation.** `scripts/generate-themed-assets.mjs` already does
  deterministic vector/plate generation; the texture sets want a second
  pipeline (`scripts/generate-ground-sets.mjs`) that emits masters → KTX2 via
  `toktx`, with the manifest extended so `assets.tsx` keeps being the one map.
- **Provenance.** Whatever produces these — hand-painted, photogrammetry,
  substance graphs, or generated — the licence has to permit redistribution in
  a public Pages bundle. Keep a `docs/ASSET_SOURCES.md` alongside the masters.
- **Budget check.** Re-run `npm run budget` and `scripts/frame-perf.mjs` after
  each tier lands; the laws above exist because this scene has been made to
  stutter before, and the profile names the culprit every time.
