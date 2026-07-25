# TerraClicker Redux — Progression Engineering

> Pacing is not a vibe; it is a set of curves with tests. This document defines the clocks, the curves, the first ten minutes, the per-planet puzzle, the prestige economy, and the **balance harness** that keeps all of it honest in CI.

Companion to [../DESIGN.md](../DESIGN.md) (systems) and [ART_DIRECTION.md](ART_DIRECTION.md) (how progress is *seen*). All constants live in `content/constants.ts`; the numbers here are the shipped starting values and the bands the harness enforces.

---

## 1. The player promise

1. **Something is always about to happen.** In an active session, the next acquisition/unlock/completion is ≤ 90 s away in the first hour, ≤ 5 min away thereafter. The UI shows this honestly (the **ETA ribbon**: "next: Hydro Seeder in ~40s").
2. **Absence is rewarded, not punished.** Coming back after any gap produces a satisfying report and an immediate burst of decisions to make.
3. **Every layer has a purpose.** Clicks for agency, buildings for growth, planets for puzzle, systems/galaxies for arc, prestige for mastery, easter eggs for love. Any mechanic that stops creating decisions gets cut (that's how v1's resources died).

## 2. The five clocks

| Clock | Period | Content |
|---|---|---|
| Seconds | 1–30 s | clicks, purchases, bubble catches |
| Minutes | 2–8 min | upgrades, planet completions, events |
| Session (20–40 min) | | systems forming, research completing, build pivots |
| Days | 1–3 d | galaxies, prestige loops, Catalogue tiers, The Answer (42 h) |
| Weeks | | universe stages, Guide completion, Earth #42, Milliways tease |

Design rule: **every screen shows at least two clocks.** The shop shows seconds (buy now) and minutes (ETA to next tier); the Vortex shows days and weeks.

## 3. Core curves

- **Income:** building cost `base × 1.15^owned`; each next building ≈ ×9–12 base cost, ×4–6 output. Net effect: TU/sec roughly **doubles every 3–5 minutes** during active play in a healthy run. The harness asserts this band.
- **Clicks:** `click = (1 + additives) × mults × (1 + 0.01 × TUps × thumbLevel)` — click power rides TU/sec late, so active play always beats idle by 15–40%, never by 10×.
- **Planet requirement:** `T(n) = 60 × 1.42^n × sizeMod` per gauge, times the planet's aspect bias. (Shipped constant: the 400 first drafted here made planet 1 a wall for idle-leaning players; 60 was chosen to put planet 1 at ~1–4 min active, ~14 min pure-idle. Measured, it lands at **50 s** active — faster than the band this line was originally written to describe, and deliberately kept that way. See §4.) Why 1.42: income compounds at ~1.15 per purchase across ~14 buildings; 1.8 (v1) outran income by planet ~8 and turned planets into once-per-run events. Completion pays a bonus of 45 s of TU/s (was 90 s; the harness showed high-cadence players compounding bonuses into a runaway).
- **Offline:** 50% efficiency, 8 h cap (research/Catalogue push to 100% / 24 h + towel 42%). Offline uses the same `step()` chunked — parity is a test, not a hope.

### Worked pacing table (run 1 — harness-measured bands, seed 20260723)

A "reasonable player" sits between the two bots; `npm run balance` reproduces these.

| Beat | greedy bot (4 clicks/s) | idle bot (buys only) | Notes |
|---|---|---|---|
| Planet 1 | 50 s | ~14 min | tutorial planet; active play is meant to feel hot |
| First System (5 planets) | 2 m 15 s | ~45+ min | |
| Planet 10 / System 2 | 5 m 30 s | — | |
| Planet 20 / System 4 | ~14 min | — | cadence stretching by design |
| 45-minute mark | 29 planets · 14 BP eligible | 11 planets · 5 BP provisional | active appraisal is available; idle appraisal lands later in the 90-minute window |
| Max stall observed | 30 s | 8 min | both inside the 12-min rubber-band ceiling |

## 4. The first ten minutes (measured)

Beats below are **measured**, not authored — greedy bot, seed 20260723,
reproduced by `npm run balance 10`. `test/pacing.test.ts` asserts each window.

This section previously opened with "the opening is authored beat-by-beat; the
harness plays it and asserts each beat's window." It did not: there were four
assertions in that file and none of them were about the opening. In the
meantime the shipped game drifted a long way from the sheet — the authored
version put planet 1 at 3:30 and two planets by ten minutes, where the game
does planet 1 at 0:50 and fourteen planets by ten minutes. It also scheduled a
random buff event at 8:30, for a system that no longer exists. Everything below
is what actually happens.

| T | Beat |
|---|---|
| 0:00 | Cold open: dark planet, one line of Guide text, a single pulsing prompt. First click ripples the surface. No UI chrome yet. |
| 0:06 | 15 TU → first Seed Probe. It *visibly launches* and starts orbiting. Shop panel slides in (one item). |
| 0:11 | Second probe; TU/sec counter fades in; ETA ribbon appears. |
| 0:50 | **Planet 1 completes** — first T2 cinematic, system slot UI appears with 1/5 filled. Vortex and Operations tabs unlock. |
| 0:51 | First upgrade. |
| 0:56 | Atmo Processor → the rim of the atmosphere *visibly thickens* (aspect→visual mapping does the tutorializing; no tooltips explain what words can't). |
| 1:06 | Planet 2 completes. The type change forces the build to pivot — the whole game in one moment. |
| 2:19 | **System 1 forms** (5 planets). |
| 3:00 | First bubble drifts in (guaranteed, seeded at `FIRST_BUBBLE_MS`). Catching it teaches interactables. |
| 4:02 | First situation opens (window `SITUATION_FIRST_MIN_MS`–`MAX`). Something asks you a question. |
| 6:16 | System 2. |
| 10:00 | Player has: 14 planets, 2 systems, a bubble caught, a question answered or pointedly ignored. |
| 13:53 | Research tab unlocks (gated at 950K lifetime TU; ten minutes earns 317K). |
| 28:06 | Research Lab affordable and bought. |

The opening is therefore **much faster and much denser** than the authored
sheet described, and that is the intended experience — ruled on and kept
(2026-07-25). The constant is not moving. Where §3's prose still says planet 1
lands in "~1–4 min active", the prose is the stale half; the table beside it
and the beats above are the game.

Panels unlock on first relevance, not at t=0: Shop → Research → Guide → Vortex → Magrathea (visible-but-locked with "Magrathea has noticed you" once run TU crosses 10% of the prestige threshold). In practice Vortex and Operations arrive first, at planet 1.

## 5. The per-planet puzzle

**Aspect bias matrix** (multiplier on gauge *targets*; production biases are the inverse story — a volcanic world helps thermal production ×1.5):

| Type | Thermal | Atmo | Hydro | Bio | Character |
|---|---|---|---|---|---|
| Terrestrial | 1.0 | 1.0 | 1.0 | 1.0 | baseline / tutorial |
| Ice world | **2.5** | 1.0 | 0.6 | 1.2 | melt it first |
| Desert | 0.7 | 1.2 | **2.2** | 1.3 | water is everything |
| Volcanic | 0.4 | **1.8** | 1.6 | 1.4 | already hot; needs air & rain |
| Ocean | 0.8 | 1.0 | 0.3 | **2.0** | seed the seas |
| Gas giant (moons) | 1.2 | **2.0** | 1.0 | 1.5 | you terraform its moons; atmo wall |

Plus quirks (±5–15% nudges) and size (`sizeMod` 0.7 / 1.0 / 1.4 / 2.0 with proportionally bigger completion bonuses).

**Orbital Survey (pick 1 of 3):** every planet after #3 arrives with three survey reports — choose one before landing: e.g. "Rich geothermal seams: Thermal buildings +25% here" / "Improbability shadow: +1 guaranteed bubble, events +15% frequency here" / "Vogon paperwork lost: this planet cannot be invaded." One choice, 10 seconds of thought, no wrong answers — agency without a menu maze. (Survey rerolls are a Catalogue perk.)

**Anti-stall valves:**
- Overflow: excess aspect production converts to TU at 35% (100% with the right quirk/research) — over-specialization never feels wasted.
- Clicks auto-target the lowest gauge (upgrade: choose target).
- **Diegetic rubber-banding:** if no completion/unlock for 12 min, ambient **Improbability rises** ("the universe is getting bored") — event and bubble frequency climb until something happens. Rubber-banding as flavor, not apology.
- Bubble pity timer: if no bubble is caught for 6 min of active play, the next spawn is golden and slow.

## 6. Events, bubbles, Vogons (payout math)

- Bubbles: base spawn 60–95 s (seeded), lifetime 18 s, payout = max(45 s of TU/sec, 0.5% of bank) + a 15–30 s buff ×2–3. Rare table: whale 4% (Science jackpot), petunias 2% (TU jackpot + achievement lore), Gargle Blaster 1% (×20 click / 20 s, then wobble).
- Events: window 5–12 min active; magnitude scales with Improbability stat (Heart of Gold count + research + rubber-band). Buff events multiply, never drain — **no punish-events**; tension comes only from Vogons.
- Vogon poetry reading: 30–90 min cadence, −50% production 45 s, fully counterable (click all ships), warnable (Sens-O-Matic), and haltable (Babel Fish halves; SEP field auto-dismisses one per hour). Expected cost if fully ignored: ~1% of hourly income — theater, not tax.

## 7. Prestige economy (Magrathea)

`BP = floor((runTU / 1e12)^(1/3) + 0.5 × planetsCompleted)`

The offer remains provisional until the assigned portfolio is complete: five systems (25 worlds) for the first commission, then one additional system after each successful sale. This prevents repeatedly farming the scripted opening worlds.

Worked target: the first active appraisal lands near 30 minutes at 25 worlds for roughly **12 BP**; idle-leaning play reaches the same gate later. Every BP *ever earned* = +2% production (never spent away); spending BP in the Catalogue is separate.

**The Magrathean Catalogue** — three branches, costs 1/2/4/8/16 BP per depth:

| Construction (Magrathea) | Improbability (Heart of Gold) | Bureaucracy (Vogon Dept. of Works) |
|---|---|---|
| start with N probes | +event frequency/quality | offline cap +4 h steps |
| building cost −2%/rank | bubble lifetime +4 s | offline efficiency +10% steps |
| aspect head-start by type | golden odds ×1.5 | research queue slot +1 |
| survey rerolls | Gargle Blaster on demand (1/day) | **auto-buy tier 1–3 buildings** (endgame QoL) |
| Fjord Certification (+Bio all planets) | start with 1 Heart of Gold | Marvin clicks 2×, "against his will" |

**Run-length planning model:**

| Run | Time to prior peak | New territory | End state |
|---|---|---|---|
| 1 | — | 25 worlds / 5 systems | ~12 BP |
| 2 | faster to prior depth | 30 worlds / 6 systems | ~27 BP total |
| 3–5 | accelerated, but deeper | one additional required system per sale; persistent metaprojects | ~40–80 BP total |
| 6–10 | portfolio-scale runs | multi-galaxy commissions, Earth #42 territory | The Answer underway |
| 10+ | — | universe stages III–IV, Vortex tourism, Guide completion | Milliways tease |

Universe progress (lifetime best): `100·(1 − e^(−g/6))` — 4 galaxies ≈ 49%, 14 ≈ 90%. The last 10% is meant to be a horizon, not a checklist; the Vortex presents this honestly ("You are here").

### 7.1 Galactic Operations budgets

Operations adds choices to the established curve without becoming a second exponential ladder. Ignoring the contract board leaves baseline planet, system, galaxy, and prestige pacing unchanged.

| Operation | Mechanical budget |
|---|---|
| Aspect dispatch | +8% matching aspect production per routed system |
| Science dispatch | +10% Science production per routed system |
| Production dispatch | +4% all production per routed system |
| Heritage archive | newest 8 worlds only; +1% to each recorded bottleneck aspect |

Dispatch slots are `min(4, 1 + floor(completedContracts / 3))`. A system's aspect routes come from its five recorded bottlenecks, Science requires at least two surveyed worlds, and Production is always eligible. Base filings award 0-1 BP plus faction reputation; each 10 reputation adds +1 BP to that faction's newly generated offers, capped at +1. Contract BP counts as lifetime BP earned. The 45-minute operations bot closes 10 contracts for 7 BP while its portfolio is worth 15 BP at appraisal, keeping Magrathea above optional paperwork. Deadlines use the simulation clock; the board rerolls at most once per newly formed system.

## 8. Celebration rationing

Celebrations follow [ART_DIRECTION.md §8](ART_DIRECTION.md) tiers. Budget: T1 fires at most 1/min (queue and merge); T2+ never twice in 90 s (hold the second); order-of-magnitude TU thresholds (1e6, 1e9…) fire a T1 planet flourish exactly once each. Scarcity is what makes T4 land.

## 9. The balance harness (how this stays true)

`npm run balance` runs the **headless engine** (no DOM, same `step()`) with scripted bots over simulated sessions, in seconds of real time:

- **Bots:** `greedy-clicker`, `idler`, `aspect-optimizer`, `afk-then-binge`, contract-aware `operations-manager`, and adversarial `earliest-prestige`.
- **Metrics per run:** planet/system/galaxy/prestige/contract timeline, income doublings, longest acquisition stall, lifetime BP, contract count, active dispatch routes, Heritage count, and current appraisal depth.
- **CI assertions (fail the build):** planet 1 <= 4 min; active play reaches appraisal eligibility by 90 min; hostile reset spam cannot sell an incomplete portfolio; no stall > 12 min in the first 45 min; no NaN/negative/infinite economy values.
- **Output:** a compact console timeline for each bot, with prestige milestones always surfaced even after the timeline truncates.

Change protocol: any constant change ships with a harness run attached to the commit. If a change moves a CI band intentionally, the band moves in the same commit, with one line of why.
