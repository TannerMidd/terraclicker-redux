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

## Phase 1 — Substrates

Built once, with every consumer listed above in mind. Save-schema changes go
through `engine/save/schema.ts` with migrations and determinism intact.

## Phase 2 — Make repetition pleasant

Civil Navigation and the first sortie; Standing Orders; the Morning Circular
replacing [OfflineModal.tsx](../src/ui/hud/OfflineModal.tsx), which currently
reports TU and research only. Automation is the highest-risk item in the whole
plan — configurable policies, never one play-for-me toggle — so it lands after
the substrates and behind a settings surface.

## Phase 3 — Make places matter

World biographies; Commission Dossiers and System Charters; megaproject
programmes with phases, decisions, partial benefits and exclusive final
modules; Special Handling and physical pickup; the bridge between modes.

## Phase 4 — Make space renewable

The Unscheduled Objects Register; space geography and the new verbs; expanded
customs appeal; ship loadouts and salvage-built flight infrastructure.

## Phase 5 — Give it an ending

Universe statutes; expanded Guide collections; Milliways as a multi-system
finale. Closes with the editorial and naming pass.

## Tone

Roughly 80% dry administrative competence, 15% absurd escalation, 5% genuine
warmth. The comic mechanism is official precision applied to impossible
circumstances. "A Quiet Request" works because it briefly stops performing
jokes and lets a distant world matter — protect that register; it is the one
the whole plan is ultimately for.
