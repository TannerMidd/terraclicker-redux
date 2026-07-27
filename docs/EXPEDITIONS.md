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

## Phase 5 — mission families, Field Certifications, persistent outcomes (SHIPPED)

- **Requests answered by boots** (`bridge.ts`): a `SituationDef` may carry a
  `ground` objective — survey, species, a named sample, a landmark reached,
  a civic call, weather stood in, a repair, a beacon, freight to the docks —
  and such a request is settled by DOING THE THING on that world's ground
  and boarding, never by merely arriving in orbit (`attendInPerson` refuses
  ground defs; the arrival latch therefore skips them). The banking path
  verifies what it can against the world's own tables (weather against
  `weatherKindsFor`, landmarks against the type's grammar), then
  `resolveGroundRequests` pays the bridge's law: the desk's best standing,
  `GROUND_MISSION_SALVAGE`, and `visited` + `petitionAnswered` in the
  history. Fourteen authored ground petitions cover the families (weather
  watches and provenance runs are type-shaped; repair and beacon petitions
  arrive only once the player holds the verb); one urgent situation
  (`storm-watch`) rides the same path; logistics settles from
  `deliverManifest`. Desk options always remain — the surface is an
  addition, never a hostage — and the petition queue's cap of three IS the
  "one to three strong planetary leads" rule.
- **Field Certifications** (`content/certifications.ts`,
  `engine/certifications.ts`): four tracks — Mobility, Survey, Geology,
  Liaison — advance on FIRSTS (`certFirsts`: `${track}:${key}`, written
  once, ever) at thresholds [2, 6, 12]; conferred ranks are stored like
  achievements so a re-tuned threshold never demotes anybody. Ranks unlock
  verbs: the beacon (Mobility I), shelter + field-deploying the sled
  (Mobility II), the station (Survey I), kept charts — landing near a
  standing station arrives pre-scanned to `STATION_CHART_M` (Survey II),
  seam sense — unscanned seams inside 46 m ride the rail unlabelled
  (Geology I), reading the sand — the pulse raises buried seams without a
  dust front (Geology II), the repair (Liaison I), and the civic call —
  attending a town pays `CIVIC_CALL_STANDING`, once a stay (Liaison II).
  Rank III is a title, which is the point of titles. The refit bay shows
  the tracks in the one column salvage cannot buy.
- **Marks are real** (`engine/groundMarks.ts`, `surface/Marks.tsx`): with
  nothing in reach the wheel chooses the FIELD KIT — the pulse, or a mark
  planted at the boots (`localToDir`; the gnomonic frame runs both ways to
  centimetres, by test). The engine validates against certification, a
  per-world cap (`MARKS_PER_WORLD_MAX` 10), same-kind spacing (30 m), and
  for repairs the presence of a settlement within `REPAIR_REACH_M` — one
  repair per settlement, ever, worth `REPAIR_STANDING` where the lights
  actually come from. Marks persist in `groundWorlds[key].marks` as planet
  directions, re-seat on every later landing's live ground, ride the
  compass (a beacon survives whiteouts; a shelter shows on thermal), and
  write `markPlaced`/`repairMade` `WorldRecordEvent`s — feeding the
  `tended`/`waymarked` traits, the biography, one standing-mark line in
  the Circular, and amber pin lights on the orbiting world (mounted inside
  the same spinning mesh as the settlement lights, so a beacon turns with
  the ground it stands on). Marks planted on the hero commission enter its
  history at delivery. Known consequences, accepted: local octaves are
  landing-seeded, so a wilderness mark can stand on different countryside
  next visit (it re-reads the live ground); the hero world's orbital mark
  lights are deferred until its spin/landing frame is reconciled.
- **The lead** (`engine/leads.ts`): the spec's sentence built exactly once —
  rumour → orbit → landing → another world → a Guide entry. The Sub-Etha
  rolls it ahead of ordinary rumours (`LEAD_ODDS`, three landable delivered
  worlds required, state in engine-known flags); the named world's next
  landing stands a RESONATOR a short walk from the pad (analytically dry,
  ring-searched); reading it names a counterpart world (seeded pick over
  the live candidates); the counterpart closes the file — `LEAD_SALVAGE`,
  a chronicle line, the hidden `Mostly Harmonic` achievement. The trail
  goes cold at prestige (`clearLead` in `doPrestige`), because the worlds
  it named left the sky.

## Phase 6 — low-altitude runabout flight (SHIPPED)

Last on purpose: it needed Phase 3's chunked generation, and it is built on
it exactly. **A landing is now a region rather than a spot.** The frame never
changes — same landing, same seeded local octaves, same tiers rolling under a
faster traveller — so the hill you walked past is the hill you fly back over.

- **The refit** (`atmo`, salvage 14/30/60) and its envelope
  (`engine/atmoflight.ts`, kept free of three.js so the numbers are testable
  without a canvas): rank 1 flies low (400 m ceiling, 58–92 m/s) and the
  weather shoves it; rank 2 is **stormworthy trim** (900 m, 76–124) and the
  front stops arguing with the airframe; rank 3 adds **terrain hold and
  rough-field gear** (1800 m, 96–160) — the rank that will set you down on a
  hillside. There is no damage model and there is not about to be one: the
  floor and the ceiling are firm opinions the airframe expresses by not going
  there. A hold you were told to be careful with is still a hold you cannot
  hurry (`engine/handling.ts` feeds the response rate).
- **One key, two verbs.** Boarding with the package fitted lifts to a hover
  and the stay stays open; HOLDING engage — at the ramp or anywhere in the
  air — breaks for orbit exactly as it always did. A pilot who only wanted to
  leave never learns there was a choice. Nothing banks on a lift: the ledger
  closes once, when the ship leaves for orbit, which is why a hop does not
  inflate a world's visit count. Aloft, the helm keys do their own jobs again
  (thrust/slide, rise/descend, `V` swaps canopy for a chase seat behind your
  own hull — the one view that gives the landscape a scale).
- **Set down anywhere the gear accepts** (`findSetdownSite`, the generalised
  `findDrySite`): hold descend below 42 m and dry, level, unoccupied ground
  takes the weight — a second landing on the same visit, no plasma, no
  cinematic. Water, lava, slope past the gear's rating and other people's
  plazas are refusals **with a reason**, and the autoland spirals (golden
  angle, as it always has) to the nearest shelf that will hold. The ship is
  a live object from here on: `surfaceLive.shipAt` moves, the compass follows
  it, the sled deploys from it, and the walker steps out framed exactly as
  an arrival frames it. A law worth recording beside Phase 3's: **a set-down
  reads the TIERS, not the analytic field** — the opposite of the census
  law, and deliberately so, because a census places things kilometres away
  while a set-down puts a ship and then a walker on ground both of them are
  standing on this second.
- **The belly sweep** charts what it flies over — seams, landmarks, towns,
  colonies — onto the compass as HUNCHES. The sensor is a cone, so altitude
  buys width (`alt × 1.45`, capped at 900 m) and the air takes it back above
  1250 m, and speed past 150 m/s smears it. The sweep PLACES; it has never
  once read anything. Nothing airborne mints a unit of anything: the seal
  holds, the yield cap holds, and boots with a field kit are still the only
  way to know what a seam is.
- **Air work** (two new `GroundObjectiveKind`s, verified from the banked
  stay like everything else): `overflight` counts charts, `range` counts
  metres from the pad you first touched down on. Two authored petitions
  carry them, and both are invisible until the package is fitted — from the
  ground they would read as a world asking you to sprout wings. Three
  once-ever certification firsts: `mobility:airborne`, `mobility:setdown`,
  `survey:overflight`, each believed only from a ship that could have done
  it.

Measured with the ground rolling under a boosted ship: 30 s of flight never
leaves the near tier's cover, epochs commit, the height under the hull stays
a real number (`test/atmo-flight.test.ts`). The stream gets a larger frame
budget while airborne and aims its new centres further ahead, because the
sled's numbers were never chosen for something doing ninety metres a second.

## The vertical slice

After Phase 4: one completed world with a settlement petition, a storm
visible from orbit, a deployable skimmer, two wilderness POIs, one biological
encounter, and an installation repair visible from the surface **and** from
orbit. Prove the whole shape on one world before generalising. *(Phase 5
delivered the last item: a repair made by hand raises standing, and standing
is what the orbit's lights are drawn from — both scales agree because both
read the same number.)*

## Verification conventions

`npm test` (groundfall + ground-sites + weather + ground-landmarks + skimmer
+ settlements + settlements-ground + certifications + ground-missions +
atmo-flight suites hold the promises above), `npm run build`, `npm run
balance` after economy changes. Visual verification is headless:
`scripts/shot.mjs` with the `__tcSurface` hooks (`gfscanall`, `gfverb:i`,
`gfmine`, `gfstate`, `gfweather:kind`, `gfvisit`, `gfshore[:look]`,
`gflandmarks`, Phase 3's `gfskimmer:rank` + `gfskim:on|off`, Phase 4's
`gfland:i` — land on the i-th landable body, settled worlds included —
`gfsettle[:i]`, `gfspecies`, `gfcatalog`, Phase 5's `gfcert:track,rank`,
`gfmark:kind`, `gfmarks`, `gfmission`, `gflead[:read|:force]`, and Phase 6's
`gfatmo:rank`, `gffly:on|off`, `gfflyto:x,z[,alt]`, `gfsetdown`,
`gfview:chase|cockpit`, `gfair`, `gfprobe[:x,z]`, `gfwet`) — the Browser
pane cannot composite this scene. Extend the hook object as each phase
lands. Every headless run starts with `flight:on` before `gfland`: with no
helm there are no bodies to park over.

Two harness laws, learned the hard way. **Phase 5:** a fixed-length engage
tap races the frame loop and the target body keeps orbiting, so `gfland`
re-parks and HOLDS engage until the surface session exists — never trust a
timed tap to commit a dive. **Phase 6:** this page stops being given frames
after roughly a dozen seconds of headless life (an on-foot control run
freezes at the same frame count, so it is the browser, not the scene). Two
consequences: anything you want to photograph must be reached EARLY in the
run, and anything polled on a live clock — the set-down verdict, a CSS
entrance animation — will read stale. `gfprobe`/`gfwet` therefore ask the
validator directly rather than through the frame loop, and the fly-phase
canopy is drawn `steady` (no fade-in) because a frame that fades up on
every view swap reads as a fault in the glass anyway.
