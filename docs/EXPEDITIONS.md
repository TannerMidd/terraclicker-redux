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

## Phase 2 — weather, water that participates, landmarks

`weatherAt(spec, gameTimeMs)` per spine §4, quantised into fronts with smooth
interpolation. Per type: dust fronts that shrink scanner range but uncover
buried sites; whiteouts that erase markers and reveal thermal trails; rain,
fog, electrical storms; ashfall and tremors; meteor showers on thin-atmosphere
worlds. Weather changes decisions, never drains a health bar. Water goes from
hard wall to graded depth (wade / refuse-until-skimmer), with shore breaks and
mist. A landmark grammar — two to four authored kinds per planet type on the
coarse lattice, including the award-winning fjords where the quirk holds —
gives every region three memorable places instead of more rocks.

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

`npm test` (groundfall + ground-sites suites hold the promises above),
`npm run build`, `npm run balance` after economy changes. Visual verification
is headless: `scripts/shot.mjs` with the `__tcSurface` hooks (`gfscanall`,
`gfverb:i`, `gfmine`, `gfstate`) — the Browser pane cannot composite this
scene. Extend the hook object as each phase lands.
