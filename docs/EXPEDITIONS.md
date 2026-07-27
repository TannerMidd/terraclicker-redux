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

## Phase 3 — the Survey Skimmer, and ground that extends to meet it (SHIPPED)

- **The refit** (`skimmer`, salvage 12/24/48): rank 1 deploys a ground-effect
  sled from the runabout; rank 2 is the **stabilised mast** — aboard, weather
  may still feed the field pulse but can no longer choke it, and the marker
  rail survives a whiteout (`scanRangeNow = base × max(1, mult)`, the HUD's
  compass consults `stabilised`); rank 3 is the **amphibious hull** — open
  water becomes scenery, ridden at the surface line. Ranks 1–2 tolerate 3 m
  of water before the shove home (`SKIM_WATER_LIMIT_M`); lava refuses every
  rank at the ankle, as it always has.
- **The skim phase** rides the existing bindings: thrust/strafe drive, boost
  is fast cruise (21 → 29 m/s, `SKIM_CRUISE_M_S`/`SKIM_BOOST_M_S`), and the
  helm's *descend* key — jobless on foot — deploys at the runabout, mounts
  within 6 m of the parked sled, and dismounts anywhere the suit could wade
  ashore. Dismounting parks a real object: the sled stands where you left it,
  on the compass (`▽`), warm enough to trace 240 m through a whiteout
  (`THERMAL_SKIMMER_RANGE_M`). Boarding the runabout stows it in the same
  motion, and takeoff never leaves it behind. Engage from the saddle is the
  mast's field pulse; seams demand boots (`dismount to work the seam`).
- **The rolling ground** (`TierStream`, the phase's real cost): both height
  tiers now carry a centre, and a stream re-bakes a back buffer toward the
  traveller a few milliseconds a frame — rows, smoothing passes, normals —
  then commits in one copy. Centres **snap to the texel grid**, so where old
  and new cover overlap the re-bake evaluates the analytic field at exactly
  the world points it already held: the commit is invisible by arithmetic
  (`terrain-stream` tests hold it to 1e-6). On commit, seams, landmarks,
  stakes and the ship re-seat on the more honest ground (`terrainEpoch`), a
  grounded walker is stepped, not dropped, and the near tier chases at 0.3 ×
  half-extent with a 4 s velocity lead — the far tier the same at 0.22.
  Measured on real Chrome/WebGPU: a 30 s boosted drive across a live commit,
  p99 16.8 ms, zero frames over 33 ms.
- **Chunked props**: the six scatter families stream in world-fixed chunks
  around the walker (256 m cells; boulders 512 m to 3.1 km). Position, scale
  and yaw are pure hashes of (seed, family, chunk) — the valley regrows the
  same rocks — while height is re-read from the live tiers, which is why an
  epoch re-seats resident chunks instead of letting rocks float.
- **The census reaches skimmer range** for everyone (`SITE_FIELD_RADIUS_SKIM`
  2600 m): the lattice always extended there, the census now looks. With
  range comes a placement law: **accept/reject against the analytic field,
  not tier samples** — the far tier at 2.5 km happily calls ground dry that
  near detail later drowns, and a census must never promise ground the sea
  already owns.

Two more renderer-adjacent laws, recorded beside Phase 2's: tier centres
snap to the texel grid or a re-centre pops; and anything placed beyond the
near tier judges water analytically or the rolling bake will embarrass it.

## Phase 4 — record-driven settlements, installations, ecology (SHIPPED)

- **One truth for both scales** (`engine/settlements.ts`): the settlement
  roster is planet-space directions, drawn from the orbit's ORIGINAL stream
  (`seed ^ 0x11f5`, draw order sacred — dry spots have not moved by a roll)
  and accepted against the transcribed macro field, so no light may promise
  ground the sea owns. Shore-band spots are HARBOURS. The orbit component
  (`SettledWorld.tsx`) now truncates this roster; standing truncates the
  same prefix everywhere — lights out, never lights moved. Names come from
  a separate stream (`Port Consequence`, `The Long Weekend`…), because a
  name must never move a light.
- **The landing knows the lights.** Settled worlds spin on screen with the
  lights aboard, so `FocusedSystem` publishes each mesh's live spin
  (`worldSpins`) and `commitGroundfall` un-rotates the approach (and the
  sun) into the RECORD frame for delivered worlds — the ground you get is
  the ground you were looking at. The offer names the aim
  (`· the lights of Port Prudence below` / `· Port Prudence, dark, below`),
  and the autoland's strongest opinion (`settlementApproach`) lands any
  approach inside the snap cone (0.2 rad) on that settlement's one
  deterministic doorstep pad. The snap cone dwarfs the sight radius, so
  every visit to a settlement shares one landing frame: the same streets,
  every time, which is what makes the local octaves' landing-seeded terrain
  compatible with towns.
- **Districts** (`surface/surfaceSettlements.ts`, drawn by
  `Settlements.tsx`): structures are laid out in the SPOT's own planet-space
  tangent frame and projected through `dirToLocal` per landing — habs on
  radial rings facing the plaza, masts with pulsing beacons, a dome quarter,
  stilts and decks wherever the waterline argues (a harbour town chose it).
  Windows are the orbit's exact hexes, warm and cool; a dark district keeps
  exactly one lamp burning. Standing drives liveliness (lit windows, drone
  count, the civic hum); traits drive character (engineered sprawls,
  neglected topples a mast, the well-attended fly banners, the storied get
  an avenue); `record.installations` stand as facilities on the outer ring
  (the seed probe on a plinth, the atmo processor's stacks, Deep Thought
  still thinking); an open petition keeps scaffolding and a crane up.
  Eleven instanced families, shared materials, no mounted lights.
- **Ecology in three levels** (`content/groundSpecies.ts`): AMBIENT life
  streams in hashed clusters around the walker (`Ecology.tsx` — grazers,
  flocks, the glass shoal in the shallows; motion is a pure function of
  (anchor, index, t), nothing simulated, grounded by whiteouts and storms);
  VIGNETTES live on the coarse lattice (`surface/surfaceEcology.ts`,
  `V{face}:{iu}:{iv}`, shore kinds probe the shore fan, dry kinds obey the
  analytic water veto) — the grazer ring, the nesting colony, the ember
  swarm; CIVIC species live where people do. Presence is planet fact (type ×
  Bio gauge): a young commission is quiet and life arrives as Biotic climbs.
- **The biologger** rides the existing instruments: the field pulse
  catalogues ambient life and any vignette in range; walking up to a
  vignette (46 m) or standing in a lit district (90 m) catalogues by eye.
  First records on a world toast with the Guide's blurb. Banking rides the
  same seal — `groundWorlds[key].species` (in the v23 schema since Phase 1)
  records forever; `GROUND_SPECIES_BONUS` pays once per species per world,
  inside `GROUND_WORLD_YIELD_CAP`; a naturalist's empty-handed landing
  still banks its records.

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

Last on purpose: it needs Phase 3's chunked generation (now built). An Atmospheric
Handling Package refit, arbitrary landing validation (generalised
`findDrySite`), secondary landings without the full entry cinematic.

## The vertical slice

After Phase 4: one completed world with a settlement petition, a storm
visible from orbit, a deployable skimmer, two wilderness POIs, one biological
encounter, and an installation repair visible from the surface **and** from
orbit. Prove the whole shape on one world before generalising.

## Verification conventions

`npm test` (groundfall + ground-sites + weather + ground-landmarks + skimmer
+ settlements + settlements-ground suites hold the promises above),
`npm run build`, `npm run balance` after economy changes. Visual verification
is headless: `scripts/shot.mjs` with the `__tcSurface` hooks (`gfscanall`,
`gfverb:i`, `gfmine`, `gfstate`, `gfweather:kind`, `gfvisit`,
`gfshore[:look]`, `gflandmarks`, Phase 3's `gfskimmer:rank` + `gfskim:on|off`,
and Phase 4's `gfland:i` — land on the i-th landable body, settled worlds
included — `gfsettle[:i]`, `gfspecies`, `gfcatalog`) — the Browser pane
cannot composite this scene. Extend the hook object as each phase lands.
