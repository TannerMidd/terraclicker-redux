# Planetary Expeditions — land for a reason, leave the planet visibly changed

The standing spec for the groundfall expansion. Phase 1 has landed; the phases
after it are committed design, sequenced so each one is cheap for the next.
Read with [ART_DIRECTION.md](ART_DIRECTION.md) §12 (the surface renderer's
non-negotiables), [EXPANSION.md](EXPANSION.md) (the two laws) and
[ROADMAP.md](ROADMAP.md) (the substrate table).

## The loop this is building

**Discover a reason to land → choose a site → traverse and investigate →
make a decision → leave a persistent consequence.**

Groundfall shipped as a renderer with one verb. Expeditions turns it into a
place: instruments that answer questions, samples with identities, seams that
stay worked, and — in later phases — weather worth planning around, a skimmer
worth deploying, settlements that match the lights you saw from orbit, and
missions that span the two scales of the game.

## The spine (decided once, holds for every phase)

1. **Expeditions consumes existing substrate.** World records, waypoints,
   `attendInPerson`, Sub-Etha rumours, `bearingLabel`, refits. No parallel
   machinery; the seal (`salvage and salvage only`) is untouched throughout.
2. **`GroundfallSession` widened once.** Civic facts — lifetimeIndex,
   completed, gameTimeMs, standing, traits, installations, quirks,
   openRequests, certs — are frozen at commitment. Phases 2–5 add no fields;
   they read what is already there.
3. **Sites are properties of the place.** The planet is quantised into
   cube-face cells (~110 m); a cell's coordinates are a site's identity
   (`g{face}:{iu}:{iv}`), hashed with the planet seed into presence, jitter,
   richness and kind. The same ground is the same seam from any approach.
   Sample identity reads planet truth only (macro elevation, latitude, type,
   gauges, quirks) — never the landing frame. The lattice generalises to
   landmarks, settlements and POIs at coarser cell sizes.
4. **Weather will be a pure function** of (seed, type, dir, aspects,
   gameTimeMs) — no rng, no stored state; the flight scene calls the same
   function, so a storm is visible from orbit before entry.
5. **Progression unlocks verbs, not percentages.** Field Certifications rank
   on firsts; equipment stays salvage-funded through the refit console.

## Phase 1 — instruments, identity, persistence, choice (SHIPPED, save v23)

- **The ground remembers** (`expedition.groundWorlds`, keyed by
  `groundKey(lifetimeIndex)`): survey date, visits, per-site outcomes,
  per-kind sample catalogue, species (Phase 4), marks (Phase 5), salvage paid.
  Survives prestige, like the rest of the Deep Field.
- **Site outcomes escalate and never retreat**: visited → preserved →
  prospected → worked. Worked is terminal — the seam does not return, ever.
  Prospected leaves a stake standing on every later landing (the first
  persistent visible mark a player leaves on a world).
- **Named samples** (`content/groundSamples.ts`): a dozen kinds derived
  first-match from planet facts — fossilised atmosphere, cryogenic brine,
  living basalt, improbability crystal (quirk-gated), tidal glass, ferrous
  drift, polar firn… — each with its own salvage on a 1–5 band around the old
  flat rate. The first of each kind a world produces pays
  `GROUND_CATALOGUE_BONUS`.
- **Scan, then choose.** A seam offers nothing until scanned (short dwell on
  engage). Then the wheel picks the verb: **quick break** (everything, fast),
  **precision core** (fewer samples, double survey credit), **prospect** (one
  sample, permanent stake, rig-eligible later), **preserve** (nothing taken,
  survey credit, revocable). Engage held with nothing in reach charges the
  **field pulse**, sweeping every site within range onto the compass; range is
  refit-gated (`fieldKit`, `SURFACE_SCAN_RANGE`).
- **Bearings**: the compass tape carries a marker rail — the runabout always,
  every scanned site and standing stake, each with live distance.
- **The economy is bounded**: survey files at 5 credit (cores double,
  preserves count), and a world's ground pays at most
  `GROUND_WORLD_YIELD_CAP` salvage across a career. Farming one world is a
  plan the ledger declines; the universe is large on purpose.

## Phase 2 — weather, water that participates, landmarks (SHIPPED)

- **The sky is arithmetic** (`engine/weather.ts`): `weatherAt(spec,
  gameTimeMs)` per spine §4 — six front slots on hashed cycles, born at
  hashed points, drifting on great circles, with smooth grow/fade envelopes.
  Kinds come from the planet type's table, gated by the gauges: no Atmo, no
  rain — thin skies get meteor showers instead, and a world grows weather as
  it grows air. Both scenes call the same function: the hero world's cloud
  shell paints the strongest fronts (counter-rotated into the visual spin so
  a storm stays over the ground it is actually on), the landing offer names
  what is standing below (`· dust front below`), and the surface stands
  inside it. The outlook (`weatherOutlook`) is pure too, so the forecast is
  always right, which the Guide considers the least forecasting can do.
- **Decisions, never damage.** Dust chokes the field pulse and uncovers the
  buried desert seams (a second presence band on the lattice, one richness
  richer, revealed for the rest of the stay once the front peaks); whiteouts
  erase the marker rail and leave thermal traces only — seams inside 46 m,
  the runabout's warm engines inside 320 m — so getting home becomes
  navigation; electrical storms feed the pulse half again; hard tremors
  shake one swing loose. Lightning and tremor pulses are hashed schedules
  every observer agrees on (`stormFlash`, `tremorPulse`).
- **Water participates**: wall → graded depth. Wade to 1.2 m at falling
  speed and a damped jump; past the line a buoyant shove walks you back up
  the seabed gradient ("refuse-until-skimmer" — Phase 3 renegotiates). Lava
  refuses at the ankle. Shore breaks march toward the beach and mist sits on
  the waterline, both in the liquid shader.
- **The landmark grammar runs on the coarse lattice**
  (`surfaceLandmarks.ts`, ~1.9 km cells; `content/groundLandmarks.ts`): two
  to four authored kinds per type — standing rings, arches, hoodoo courts,
  ice organs, pressure ridges, basalt choirs, cinder cones, fumaroles, sea
  stacks, tide arches, blowholes — named on the compass inside 2.6 km, a
  whole region drawn in seven instanced calls. The award-winning fjords
  appear where the quirk holds (a cairn and a modest plaque), and the quirk
  now crinkles `terrainField`'s coast band exactly as `planetGeometry`'s, so
  fjord worlds keep the continent law they were quietly breaking.

Two renderer laws Phase 2 paid for, recorded so no later phase pays again:
scene fog must exist BEFORE the warm-up compiles the surface pipelines (the
node renderer bakes fog support in at build time — a material warmed fogless
ignores weather forever), and on instanced meshes the node system folds the
instance matrix into `positionLocal`, so per-particle shape masks belong in
UV space.

## Phase 3 — the Survey Skimmer, and ground that extends to meet it

A `skimmer` refit (ranks add capability: deploy → storm stabilisation →
amphibious/tow), a new `skim` phase on the existing flight bindings, 20–30
m/s over land and shallow water. The real cost is **chunked props and a
rolling near-tier bake** — today's props stop at ~2.8 km and the near tier at
4 km, under two minutes at skimmer speed. Budget the chunking as the majority
of the phase. POIs come from the Phase 2 grammar, three to five visible per
region, so the vehicle arrives alongside destinations worth driving to.

## Phase 4 — record-driven settlements, installations, ecology

`settlementSpots()` (SettledWorld.tsx) is already the orbital truth; project
its planet-space spots into the landing frame and the settlement you saw as
lights from orbit is the settlement you walk into. Standing drives liveliness;
traits drive character; `record.installations` become walkable facilities;
petition outcomes become physical details. Ecology in three levels — ambient
instanced life, authored vignettes, civilization — all derived from planet
facts, catalogued into `groundWorlds[key].species`. No NPC simulation;
silhouettes, vehicles, drones and audio sell it within the frame budget.

## Phase 5 — mission families, Field Certifications, persistent outcomes

Surface missions extend situations/petitions through `bridge.ts` (a surface
resolution path beside `attendInPerson`): survey, ecology, maintenance, civil,
recovery, storm response, logistics, and mysteries that span scales — rumour →
orbit → landing → another world → a Guide entry. Keep one to three strong
planetary leads at a time; reward variety, never completionist clearing.
Certifications in four tracks (Mobility, Survey, Geology, Liaison) rank on
firsts recorded in `certFirsts`, unlocking verbs. `GroundMark[]` become real
beacons, stations and repairs, each writing a `WorldRecordEvent` — visible in
biographies, the Circular, and from orbit (Expansion law 2).

## Phase 6 — low-altitude runabout flight

Last on purpose: it needs Phase 3's chunked generation. An Atmospheric
Handling Package refit, arbitrary landing validation (generalised
`findDrySite`), secondary landings without the full entry cinematic.

## The vertical slice

After Phase 4: one completed world with a settlement petition, a storm
visible from orbit, a deployable skimmer, two wilderness POIs, one biological
encounter, and an installation repair visible from the surface **and** from
orbit. Prove the whole shape on one world before generalising.

## Verification conventions

`npm test` (groundfall + ground-sites + weather + ground-landmarks suites
hold the promises above), `npm run build`, `npm run balance` after economy
changes. Visual verification is headless: `scripts/shot.mjs` with the
`__tcSurface` hooks (`gfscanall`, `gfverb:i`, `gfmine`, `gfstate`,
`gfweather:kind`, `gfvisit`, `gfshore[:look]`, `gflandmarks`) — the Browser
pane cannot composite this scene. Extend the hook object as each phase lands.
