# The Roadmap — everything still to build, in the order that makes it cheap

This is the working plan for the next stage of the game. It exists because the
feature list is long enough that building it feature-first would make the last
items cost five times the first ones. Read with [EXPANSION.md](EXPANSION.md)
(the two laws), [PROGRESSION.md](PROGRESSION.md) (pacing bands) and DESIGN.md §3.6.

## The shape of the argument

Thirteen features were asked for. They are not thirteen independent systems —
they are consumers of six shared ones. The plan is therefore: repair the
economy, build the six substrates, then let the features land as read-models
over substrate that already exists.

### The six substrates and who consumes them

| Substrate | Consumers |
|---|---|
| **World record store** — persistent per-world traits, history, outcomes | biographies · System Charters · two-resolution petitions · passenger sourcing · statutes · Morning Circular |
| **Waypoint registry** — one addressable target list | nav chart · fly-there petitions · procedural contacts · buoys & depots · stable lanes · Circular deep-links |
| **Deferred-work queue** — true wall-clock, survives close | megaproject phases · infrastructure construction · biography follow-ups · Circular read-model |
| **Combinatorial content format** — slots × components × outcomes | procedural contacts · biography events · dossiers · cargo & passenger stories |
| **Pooled scene objects** — instanced, budgeted, persistent | settlements & lights · weather & moons · nebulae & debris & trails · lanes · player-built infrastructure |
| **Input & handling layer** — remap, gamepad, per-verb routing | nav controls · cargo-affected handling · new flight verbs · interdiction responses |

Two consequences worth stating plainly:

- **The Office of Subsequent Consequences is not a feature, it is substrate #1.**
  Six things read it. Build it as infrastructure with all six in mind.
- **The nav chart is not a cockpit widget, it is the addressing system.**
  Everything spatial registers into it. Build the registry before the UI.

### Three costs that grow with everything built on top

1. **The BP curve, before any new multiplier.** Dossiers, Charters, statutes and
   megaproject modules all add multiplier sources. Adding them to a stack that
   diverges means rebalancing all of them afterwards.
2. **The frame budget, before authoring scene objects.** "The universe visibly
   accumulates" has a ceiling nobody has measured. It decides whether a world
   gets three settlement lights or thirty.
3. **The naming decision, before the string count triples.** Only matters if
   this ever leaves the machine — but its cost is linear in strings, and the
   plan below adds a great many.

## Laws this plan must not break

Inherited from [EXPANSION.md](EXPANSION.md) and still binding:

1. **The Deep Field economy stays sealed.** Salvage buys the ship and nothing
   else. Flight never pays TU, Science, aspects or planet progress. A player who
   never leaves the planet loses nothing but the view.
2. **The universe visibly accumulates.** Anything that creates a thing must be
   visible afterwards and must persist.
3. **Determinism.** Same seed and same elapsed span yield the same state however
   it is chunked. Offline parity is a test, not a hope.

Added here:

4. **Flight pays in what the desk cannot buy.** The bridge between modes offers
   choice, not equivalence. Personal attention yields salvage, cockpit objects
   and story; it never becomes the optimal way to generate TU. Parity would mean
   nobody flies twice.
5. **No new universal currency, no guns, no fuel, no ship destruction, no FOMO
   dailies, no mandatory flight bonuses to idle production.**

## Measured baseline (2026-07-25, seed 20260723, pre-work)

Regression reference. `npm run balance 90` reproduces the bot rows.

| Bot | end TU | TU/s | planets | BP on reset | notes |
|---|---|---|---|---|---|
| greedy-clicker | 75.6M | 5.11M | 40 | 20 | |
| idler | 10.9M | 90.9K | 26 | 13 | |
| aspect-optimizer | 155M | 5.34M | 41 | 20 | |
| afk-then-binge | 105M | 184K | 31 | 15 | |
| operations-manager | 20.0B | **659M** | 54 | 27 | 28 contracts, 33 BP earned |
| earliest-prestige | 10.1K | 753 | 11 (101 lifetime) | 5 | 3 prestiges, 44 BP earned |

- Tests: **146 passing across 16 files.**
- Opening cadence (aspect-optimizer): planet 1 at 0:50, planet 2 at 1:06,
  system 1 at 2:17, system 2 at 6:20, **14 planets by 9:57**.
- BP divergence: non-finite at **prestige 19** (~171 sim minutes). Knee at
  BP ≈ 1400, crossed between prestige 16 (1527 BP) and 17 (3770 BP).

### After 0.1 (BP made additive)

| Bot | end TU | TU/s | planets | notes |
|---|---|---|---|---|
| greedy-clicker | 75.6M | 5.11M | 40 | unchanged |
| idler | 10.9M | 90.9K | 26 | unchanged |
| aspect-optimizer | 155M | 5.34M | 41 | unchanged |
| afk-then-binge | 105M | 184K | 31 | unchanged |
| operations-manager | 625M | **34.2M** | 48 | 25 contracts, 30 BP |
| earliest-prestige | 3.65K | 47.9 | 5 (95 lifetime) | 3 prestiges |
| catalogue-spender | 5.32K | 684 | 12 (102 lifetime) | 3 prestiges, perks bought |

The four bots that never prestige are **identical to baseline**, because
`bpEarned` is 0 for all of them and the BP line was 1.0 under either curve. The
first ninety minutes of a first run is untouched by this change. Tests: 150.

**No harness bot had ever spent a Blueprint.** DESIGN.md M3's acceptance
criterion — "run 2 ≥45% faster to prior peak" — was therefore never exercised
in CI. Measured now: 26.4% on passive BP alone, **43.1%** once perks are bought,
and three of the nine perks a naive spender buys are offline-only, so they
contribute nothing to a foreground measurement. A `catalogue-spender` bot now
lives in the harness so this stays visible. Turning the band into a CI
assertion belongs to 0.5.

### After 0.2 (contract Blueprints reserved for constraining work)

Operations premium against `aspect-optimizer`, measured at 90 minutes:

| | TU/s | premium | contract BP | appraisal BP |
|---|---|---|---|---|
| baseline | 659M | **123×** | 33 | 27 |
| after 0.1 | 34.2M | 6.4× | 30 | 24 |
| after 0.2 | 10.4M | **1.95×** | 13 | 21 |

All three of DESIGN.md §3.10's stated constraints now hold: dispatch bonuses
are smaller than the system ladder (+4% against +15%, and they always were),
contracts pay modest BP, and Magrathea mints more Blueprints than the board.

Note the shape of the sequence — most of the 123× was never the specialty
multipliers. It was the BP loop amplifying an early Operations lead through
ninety minutes of compounding purchases. Only 6.4× of it was Operations, and
only the last step was a deliberate nerf. **If Operations later feels
unrewarding, the lever is `SYSTEM_SPECIALTY_PRODUCTION_MULT`, not contract BP**
— restoring board Blueprints would put the design violation back.

1.95× sits below the 3–8× band this task originally aimed at. That band was a
guess made before measuring; the design's own language — dispatch "changes
strategy without replacing it" — is the better standard, and 1.95× meets it.
Three assertions in `test/operations-balance.test.ts` now pin all of this.
Tests: 153.

## Phase 0 — Economic reality permit

Nothing else is meaningful until the numbers survive Thursday.

- **0.1 Break the BP divergence loop.** `prodMult` multiplies by
  `Decimal.pow(1 + BP_PASSIVE, bpEarned)` ([economy.ts:247](../src/engine/economy.ts:247))
  while `prestigeBpFor` returns `(runTU/1e12)^(1/3)`
  ([economy.ts:17](../src/engine/economy.ts:17)). That is a double exponential:
  `BP_next ≈ (1.02^BP / 1e12)^(1/3)`, divergent once `1.02^BP` outruns `1e12`.
  The cube root feels like damping but only divides the exponent by three.
  *Fix:* apply `BP_PASSIVE` to `sqrt(bpEarned)`, preserving the early curve and
  pushing the knee past any reachable play; guard `prestigeBpFor` against
  non-finite `toNumber()`. *Accept:* 20 prestiges finite; 24h and 7d harness
  runs finite; planet 1 still under 4 min; prestige still eligible by 90 min.
- **0.2 Rebalance Operations production.** The 129× gap is
  `SYSTEM_SPECIALTY_PRODUCTION_MULT` stacking per assigned system
  ([economy.ts:133](../src/engine/economy.ts:133)) plus heritage aspect
  multipliers — not the 33 contract BP. Capping BP rewards would leave the gap
  untouched. *Accept:* Operations premium lands in a defensible band (~3–8×) and
  a harness assertion pins the ratio.
- **0.3 Retire stale copy and dead UI.** The Vortex forecasts a random event
  that can no longer fire ([VortexPanel.tsx:45](../src/ui/panels/VortexPanel.tsx:45)
  against [sim.ts:788](../src/engine/sim.ts:788)); `drive-tuning` and the
  Sub-Etha Sens-O-Matic still say "Events" when `eventFreqMult` now drives
  situations ([situations.ts:89](../src/engine/situations.ts:89)); the Towel's
  `>= 42` branch is unreachable with 29 achievements.
- **0.4 Deferred-work queue + megaproject offline fix.**
  [megaprojects.ts:1](../src/engine/megaprojects.ts:1) documents full-rate
  offline construction as the entire point, but `stepMegaprojects` runs only
  inside `step()` and `stepOffline` caps at `offlineCapMs`. Efficiency is
  genuinely bypassed; the cap is not. Build the queue properly — megaprojects
  are its first customer, flight infrastructure and biography follow-ups are
  the next two.
- **0.5 Doc and test honesty.** PROGRESSION.md §4 claims beat-by-beat harness
  assertions that do not exist, contradicts §3 on planet 1, says "2 planets
  done" at 10:00 where the harness reaches 14, and still schedules a removed
  random event at 8:30.
- **0.6 Measure the frame budget.** Numbers land back in this file as the gate
  on Phases 3–4.

### After 0.4 (deferred work exists)

`engine/deferred.ts` is the first substrate to land, and it arrived early
because a Phase 0 bug turned out to be its first customer. Contract: creditors
are paid in **real elapsed milliseconds**, ignore the offline cap and offline
efficiency, must be pure linear functions of time (clamping allowed), and must
not read production, rng or player presence. That last rule is the load-bearing
one — if the work done depends on how rich you are, it is income, and income
belongs in the ordinary simulation where the cap can reach it.

The split is the trick: the tick loop credits the span the simulation actually
ran, `stepOffline` credits the remainder the cap withheld, and the sum is
always true elapsed time however the absence was chunked.

Current creditors: **megaprojects** (the documented bug) and **rigs** (same bug,
same claim in the comments, and bounded by `def.cap` so they saturate rather
than run away). Megaproject **salvage** was deliberately left out under rule 3.

Later consumers, per the substrate table: flight infrastructure construction
and biography follow-ups. Tests: 159.

### After 0.5 (the documents stopped disagreeing with the game)

PROGRESSION.md §4 opened by claiming "the harness plays it and asserts each
beat's window." There were four assertions in `pacing.test.ts` and none of them
concerned the opening. Measured against the shipped game, the authored sheet
was describing a different one:

| Beat | authored | measured |
|---|---|---|
| First Seed Probe | 0:20 | **0:06** |
| Planet 1 completes | 3:30 | **0:50** |
| Research tab unlocks | 6:00 | **13:53** |
| First random event | 8:30 | *system removed* |
| State at 10:00 | 2 planets | **14 planets, 2 systems** |

§4 is now measured rather than authored, and seven assertions in
`pacing.test.ts` hold it there. Tests: 162.

#### Two decisions, both now settled by the owner (2026-07-25)

1. **The opening is meant to be this fast. Ruled fine; keep it.** Planet 1 at
   50 seconds stands, and `T(n) = 60 × 1.42^n` is not moving. §3's prose band
   ("~1–4 min active") is the stale half, not the game — it has been marked as
   such rather than the constant being changed to satisfy it. §4 is measured
   and `pacing.test.ts` holds it there.
2. **`BP_PASSIVE` stays at 0.02 for now, pending playtest.** DESIGN.md M3 asks
   for run 2 ≥45% faster to prior peak; it measures 33.9%. That gap is *not*
   fallout from 0.1 — at the twelve Blueprints a first prestige awards, the old
   compounding curve gave 1.268× against the new 1.24×, nowhere near enough to
   explain eleven points. The criterion had simply never been measured.
   Raising `BP_PASSIVE` is safe now the bonus is additive and cannot run away,
   so the lever is there and one number wide when it is wanted. The CI floor
   stays at 30%: enough to catch a regression, not enough to pretend the
   design target is met.

### After 0.6 — the frame budget

Measured on installed Chrome (WebGPU), 1440×900, against `shots/u409.txt`:
**409 worlds, 81 systems, 16 galaxies**. Reproduce with
`npm run budget` and `TC_PORT=<port> node scripts/frame-perf.mjs shots/u409.txt`.

**Frame time is not the problem.** Every zoom band and every flight state sits
at a locked 60fps — p50 16.7ms, p99 16.8ms, zero frames over 33ms — with one
exception: entering flight costs a single **166.7ms** hitch, after which the
warm pass is clean. That is first-pipeline-compile, and `ShaderWarmup` already
exists to fight it.

| State | p50 | p99 | max | >50ms |
|---|---|---|---|---|
| map-idle | 16.7 | 16.8 | 16.8 | 0 |
| flight-idle (cold) | 16.7 | 16.8 | **166.7** | 1 |
| flight-warm | 16.7 | 16.8 | 16.8 | 0 |
| flight-moving | 16.7 | 16.8 | 16.8 | 0 |
| flight-at-home | 16.7 | 16.8 | 16.9 | 0 |
| flight-thru-system | 16.7 | 16.8 | 16.9 | 0 |

**The ceiling is material graphs, not polygons.** The same scene:

| | value |
|---|---|
| distinct material graphs | **227** |
| material types | 7 |
| meshes | 279 |
| **instanced meshes** | **2** |
| geometries (zoom 0 → flight-warm) | 55 → 121 |
| textures | 15–18 |

409 worlds are drawn by 279 meshes carrying 227 distinct material graphs and
almost no instancing. This is a node-material scene, so each distinct graph
compiles its own pipeline — that is precisely what the 166.7ms entry hitch is.
Triangles are irrelevant here; the whole universe is under 10K of them.

So the budget for Phases 3–4 is about **graph reuse**, not geometry:

1. **A new visual feature may add at most 2–3 distinct material graphs,
   regardless of how many instances it spawns.** Settlement lights across four
   hundred worlds must be one graph, not four hundred. This is the rule that
   decides whether "the universe visibly accumulates" scales or stops.
2. **Anything spawning more than ~8 objects of a kind must use
   `InstancedMesh`.** There are currently two instanced meshes in the entire
   scene, so this is a new discipline rather than an existing one, and it is
   what the pooled-scene-object substrate in Phase 1 has to provide.
3. **Regression gates:** p50 ≤ 16.8ms and zero frames > 50ms after warm-up, in
   every band. Cold-entry hitch is allowed to exist but must not grow.

Note `info.render.calls` and `.triangles` are deliberately not reported:
against this scene they read 2 and 0, because they are WebGL-era counters the
WebGPU backend does not populate. Frame timing comes from rAF deltas instead.

## Phase 1 — Substrates

Built once, with every consumer listed above in mind. Save-schema changes go
through `engine/save/schema.ts` with migrations and determinism intact.

Note that the deferred-work queue is already done — see 0.4 above.

### World record store — done

`engine/worldRecords.ts`, save v9 → v10. Keyed by `lifetimeIndex`, which is
unique across every commission and never reset.

The decision worth recording: **records live outside `run`.**
`run.completedPlanets` is sold at prestige and that is correct — Magrathea buys
the portfolio, and a commission that left nothing behind would make the sale
meaningless. But "worlds become places you remember" cannot survive a store
that empties every few hours. So the portfolio still sells and the archive
persists: `activeWorldRecords()` is the live set, `allWorldRecords()` is
everything the Guide still remembers. Selling a commission loses the worlds
without un-remembering them.

Traits are **derived, never stored** — from the world's own delivery facts plus
its recorded history, consuming no rng. A trait is a consequence, not a roll,
which means the derivation can improve later without a migration.

The v9 → v10 migration reconstructs records for the current portfolio and the
Heritage archive, which is everything a v9 save can still see. Worlds sold in
earlier commissions are genuinely gone and get no record rather than a
fabricated one. Tests: 170.

Consumers still to come: biographies (Phase 3), Charters (Phase 3),
two-resolution petitions (Phase 3), passenger sourcing (Phase 3), statutes
(Phase 5), Morning Circular (Phase 2).

### Waypoint registry — done

`engine/waypoints.ts`, save v11. Resolves **what** is addressable, never
**where** it is: a `WaypointRef` is structural and the scene turns it into a
position through `universeLayout`, so the engine never imports the renderer and
the registry stays testable headlessly. The pin is stored as an id and resolved
through the live list on every read, so an expired job or a collected rig
leaves a pin that forgets itself rather than parking the helm on nothing.

### Content format + scene pooling — done

`content/composer.ts` is the slot/fragment/tag format. Coherence comes from
tags: fragments `requires` or `forbids` tags contributed by earlier slots or by
the caller's context, so "a door" can never end up on "a cloud". Composition
takes an explicit seed and runs a local PRNG — it never touches a shared rng
stream, because rendering a description must not move the universe along.

First authored set is `content/biography.ts`, wired to `worldBiography()`, which
gives the world record store an immediate consumer rather than leaving the
format unproven until Phase 4.

`ui/scene/universe/pool.tsx` is the enforcement half of the 0.6 budget.
`pooledMaterial(key, make)` returns the same graph for the same *kind*, so a
feature cannot mint one per instance by accident; `<InstancedPool>` draws any
number of transforms in one call with per-instance colour riding the instance
buffer rather than a new graph. `test/scene-pool.test.ts` asserts that four
hundred worlds of settlement lights and weather stay inside two graphs, and
that keying on instance identity — the failure mode this exists to prevent —
is detectable. Tests: 193.

## Phase 2 — Make repetition pleasant

Civil Navigation and the first sortie; Standing Orders; the Morning Circular
replacing [OfflineModal.tsx](../src/ui/hud/OfflineModal.tsx), which currently
reports TU and research only. Automation is the highest-risk item in the whole
plan — configurable policies, never one play-for-me toggle — so it lands after
the substrates and behind a settings surface.

### Civil Navigation — done

`engine/navigation.ts` (bearing, elevation, closing speed, ETA, braking
distance), the Chart panel over the waypoint registry, and the cockpit ribbon.
Two decisions worth keeping:

- **Bearing is signed port-negative**, which is the negation of the rig's own
  yaw delta — `flightControl` builds orientation from a YXZ Euler, so
  *increasing* yaw turns to port. The flip happens once in `solveNav` rather
  than at every call site.
- **Braking distance is `v/k`, not `v²/2a`**, because the rig sheds speed
  exponentially. A loaded hold divides the brake response, so the room a
  delivery needs grows with its cargo; the textbook formula would have
  understated it exactly when it mattered.

Resolution runs on the 5Hz sweep (orbits crawl); the bearing is solved every
frame and allocates nothing. The chart is a filterable list, not a map: the
universe is a five-band log-scale hierarchy and any 2D projection lies at four
of the five scales.

Controls: rebindable to any physical key (localStorage, not the save — a layout
belongs to the person, not the universe), gamepad, horizon lock, invert pitch,
sensitivity. Course hold steers but never throttles, and is offered only for
somewhere already visited (save v12) — the helm flies the commute, never the
discovery.

The first sortie replaces the control legend with five steps that use every
verb the ship has. Nothing blocks input; abandoning it costs nothing.

Verified in installed Chrome via `scripts/flight-check.mjs`, because flight
only integrates while a render loop is running and cannot be checked from a
headless DOM. Tests: 202.

### Standing Orders + Morning Circular — done

Automation is **policies, not autopilot**: every one off by default, every one a
rule the player wrote down, and none of them ever answers a question —
situations, petitions and surveys are left alone because they are the part
that is about judgement. It emits the same `Input`s a click does, one purchase
per half-second, and is not unlocked until a commission has been sold by hand.

The Circular derives over the deferred queue, world records and waypoint
registry; every actionable line carries its action. Needed `doneAtMs` on
megaprojects (save v13) because `builtMs` and `gameTimeMs` are different
clocks — see the note in `engine/circular.ts` about why the comparison is `<=`.

## Phase 3 — Make places matter

### World biographies — done

Petition outcomes — answered *and* ignored — are filed against the world that
asked, so traits evolve from what actually happened. Surfaced in the Guide
atlas beside the delivery certificate, and in settlement density: engineered
worlds sprawl, austere ones stayed small.

**The 227 graphs, found.** Not node materials — only **13** of the 227 were.
The other 214 were plain `<meshBasicMaterial color={x} />` JSX elements in
components that render once per system, per galaxy, per landmark; R3F builds a
new material for every element, so 81 systems meant 81 identical materials.
`TC_OWNERS=1 npm run budget` groups them by signature and prints the worst
offenders, which is the diagnostic that should have existed before the first
guess. Sharing the top signatures took **227 → 205**; the remainder are mostly
one-off landmark art in `DeepFieldObjects`, which is genuinely distinct rather
than duplicated. (The first attempt also surfaced a real bug: the old cleanup
disposed *shared* materials when a single world unmounted.)

## Phase 4 — Make space renewable — done

**Unscheduled Objects Register.** A handful per commission, assembled by the
composer. Renewable (new set each commission), deterministic (derived from seed
and commission number, consuming no rng), and cheap (nothing persisted but
which have been looked into, cleared with the commission). That last property
is why they are not landmarks: a landmark is a permanent fact, an unscheduled
object is a rumour with coordinates. Tag constraints tested across 400
universes, not one.

**Customs appeal** grows from three outs to seven — decoy, planetary shadow, a
valid permit, an improbability wake. Still nothing that shoots at anybody.

**Ship roles and infrastructure.** A role never un-buys a refit; it is a free,
reversible configuration that trades one capability for another, and a test
holds every role to improving something *and* costing something. Infrastructure
is bought with salvage and touches only navigation, storage and convenience —
the seal asserted directly rather than assumed.

## Phase 5 — Give it an ending — done

**Universe statutes** (v21): one law per stage, surviving prestige alongside the
Blueprints, the monuments and the archive. Rules and story pools, never a
currency — asserted by test. No repeal: a law you can undo is a menu.

**Milliways.** The finale is a booking that turns out to have already been
made. Every clause is a fact about what has already happened, so there is
nothing to claim and nothing to miss, and it is the one place in the design
that requires *both* halves of the game — which is fair only because it is
last. It pays no multiplier: the reward for finishing is the ending.

## What remains

The build is feature-complete against the original plan. Outstanding, and
deliberately not done:

- **The editorial and naming pass.** Cost scales with the string count, and the
  string count roughly tripled here. Only matters if this ever leaves the
  machine — see "Three costs" at the top.
- **Balance across the new systems.** Dossiers, Charters, programmes and
  statutes all add multipliers. They land on the additive BP curve rather than
  the divergent one, which is why they were sequenced after Phase 0.1, but
  nobody has played a long game with all of them switched on.
- **`BP_PASSIVE`** remains at 0.02 pending playtest (M3 measures 33.9% against
  a 45% target). The lever is one number wide.
- **205 material graphs**, down from 227. The remainder is mostly one-off
  landmark art rather than duplication. `TC_OWNERS=1 npm run budget` ranks
  what is left.
