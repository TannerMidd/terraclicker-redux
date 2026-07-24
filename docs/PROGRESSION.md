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
- **Planet requirement:** `T(n) = 60 × 1.42^n × sizeMod` per gauge, times the planet's aspect bias. (Shipped constant: the 400 first drafted here made planet 1 a wall for idle-leaning players; 60 puts planet 1 at ~1–4 min active, ~14 min pure-idle — harness-verified.) Why 1.42: income compounds at ~1.15 per purchase across ~14 buildings; 1.8 (v1) outran income by planet ~8 and turned planets into once-per-run events. Completion pays a bonus of 45 s of TU/s (was 90 s; the harness showed high-cadence players compounding bonuses into a runaway).
- **Offline:** 50% efficiency, 8 h cap (research/Catalogue push to 100% / 24 h + towel 42%). Offline uses the same `step()` chunked — parity is a test, not a hope.

### Worked pacing table (run 1 — harness-measured bands, seed 20260723)

A "reasonable player" sits between the two bots; `npm run balance` reproduces these.

| Beat | greedy bot (4 clicks/s) | idle bot (buys only) | Notes |
|---|---|---|---|
| Planet 1 | 50 s | ~14 min | tutorial planet; active play is meant to feel hot |
| First System (5 planets) | 2 m 15 s | ~45+ min | |
| Planet 10 / System 2 | 5 m 30 s | — | |
| Planet 20 / System 4 | ~14 min | — | cadence stretching by design |
| 45-minute mark | 30 planets · 15 BP ready | 13 planets · 6 BP ready | first prestige lands naturally inside 45–90 min for any style |
| Max stall observed | 30 s | 8 min | both inside the 12-min rubber-band ceiling |

## 4. The first ten minutes (scripted density)

The opening is authored beat-by-beat; the harness plays it and asserts each beat's window.

| T | Beat |
|---|---|
| 0:00 | Cold open: dark planet, one line of Guide text, a single pulsing prompt. First click ripples the surface. No UI chrome yet. |
| 0:20 | 15 TU → first Seed Probe. It *visibly launches* and starts orbiting. Shop panel slides in (one item). |
| 0:50 | Second probe; TU/sec counter fades in; ETA ribbon appears ("Atmospheric Processor ~30s"). |
| 1:30 | Atmo Processor → the rim of the atmosphere *visibly thickens* (aspect→visual mapping does the tutorializing; no tooltips explain what words can't). |
| 2:00 | First upgrade (Terraforming Gloves). First aspect gauge crosses 50% — ambient audio layer swells in. |
| 3:00 | First bubble drifts in (guaranteed, seeded). Catching it teaches interactables. |
| 3:30 | **Planet 1 completes** — first T2 cinematic, system slot UI appears with 1/5 filled. |
| 4:00 | Planet 2 arrives as an ice world: Thermal target ×2.5. The build must pivot — the whole game in one moment. |
| 6:00 | Research Lab affordable → Research tab unlocks (one visible item). |
| 8:30 | First random event fires (guaranteed window 7–10 min). |
| 10:00 | Player has: 2 planets done, a pivot survived, research ticking, one bubble caught. Hooked or not — but never confused. |

Panels unlock on first relevance, not at t=0: Shop → Research → Guide → Vortex → Magrathea (visible-but-locked with "Magrathea has noticed you" once run TU crosses 10% of the prestige threshold).

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

Worked targets: run 1 ends ~1–3e12 TU + 15 planets → **8–9 BP**. Every BP *ever earned* = +2% production (never spent away); spending BP in the Catalogue is separate.

**The Magrathean Catalogue** — three branches, costs 1/2/4/8/16 BP per depth:

| Construction (Magrathea) | Improbability (Heart of Gold) | Bureaucracy (Vogon Dept. of Works) |
|---|---|---|
| start with N probes | +event frequency/quality | offline cap +4 h steps |
| building cost −2%/rank | bubble lifetime +4 s | offline efficiency +10% steps |
| aspect head-start by type | golden odds ×1.5 | research queue slot +1 |
| survey rerolls | Gargle Blaster on demand (1/day) | **auto-buy tier 1–3 buildings** (endgame QoL) |
| Fjord Certification (+Bio all planets) | start with 1 Heart of Gold | Marvin clicks 2×, "against his will" |

**Run-length model the harness enforces:**

| Run | Time to prior peak | New territory | End state |
|---|---|---|---|
| 1 | — | planets 1–15 | 8–9 BP |
| 2 | ~35 min (−55%) | planets 16–20, **galaxy 1** | ~22 BP total |
| 3–5 | ~25 min | galaxies 2–3, deep research | ~60 BP |
| 6–10 | ~15 min | multi-galaxy runs, Earth #42 territory (42nd *lifetime* completion) | Answer started |
| 10+ | — | universe stages III–IV, Vortex tourism, Guide completion | Milliways tease |

Universe progress (lifetime best): `100·(1 − e^(−g/6))` — 4 galaxies ≈ 49%, 14 ≈ 90%. The last 10% is meant to be a horizon, not a checklist; the Vortex presents this honestly ("You are here").

## 8. Celebration rationing

Celebrations follow [ART_DIRECTION.md §8](ART_DIRECTION.md) tiers. Budget: T1 fires at most 1/min (queue and merge); T2+ never twice in 90 s (hold the second); order-of-magnitude TU thresholds (1e6, 1e9…) fire a T1 planet flourish exactly once each. Scarcity is what makes T4 land.

## 9. The balance harness (how this stays true)

`pnpm balance` runs the **headless engine** (no DOM, same `step()`) with scripted bots over simulated days, in seconds of real time:

- **Bots:** `greedy-tups` (always best TU/sec per cost), `clicker` (8 clicks/s active blocks), `idler` (checks in every 8 h), `optimizer` (aspect-aware pivots), `afk-then-binge`.
- **Metrics per run:** time-to-each-planet/system/galaxy/prestige, income doubling intervals, ETA-ribbon honesty (predicted vs actual), stall windows (longest gap between acquisitions), BP per run.
- **CI assertions (fail the build):** planet 1 ≤ 4 min; first prestige 45–90 min (`optimizer`); no stall > 12 min in run 1 (`greedy`); active/idle advantage 15–40%; run 2 reaches run-1 peak ≥ 45% faster; no NaN/negative/∞ anywhere across 1e0–1e300.
- **Output:** an HTML report with income curves, acquisition timelines, and stall heatmaps per bot — the tuning conversation happens over charts, not feelings.

Change protocol: any constant change ships with a harness run attached to the commit. If a change moves a CI band intentionally, the band moves in the same commit, with one line of why.
