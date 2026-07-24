# TerraClicker Redux — Design & Architecture

> *"In the beginning the Universe was created. This has made a lot of people very angry and been widely regarded as a bad move. TerraClicker Redux intends to fix it, five planets at a time."*

This is the founding document for a from-scratch rebuild of [TerraClicker](https://github.com/TannerMidd/Terraclicker) — a Cookie Clicker-style incremental game about terraforming the cosmos. The original prototype proved the *idea* is great; the codebase is unsalvageable. This doc captures what the idea actually is, why v1 rotted, and the design + architecture that keeps the redux fun to play *and* fun to work on.

**Companion specs** (binding, same authority as this doc):
- [docs/ART_DIRECTION.md](docs/ART_DIRECTION.md) — visual identity, the WebGPU rendering stack, planet renderer spec, cinematics, UI language, motion, sound, performance budgets.
- [docs/PROGRESSION.md](docs/PROGRESSION.md) — pacing clocks, curves and formulas with worked tables, the scripted first ten minutes, prestige economy, and the CI balance harness that enforces all of it.

The quality bar: this should look and feel like a modern web *game* — WebGPU-rendered, art-directed, choreographed — not a spreadsheet with CSS. The bar is enforced structurally: milestone **M-VS** (visual vertical slice) must prove the look before any breadth of systems gets built.

---

## 1. Autopsy of v1

### What the game actually is (the idea worth keeping)

- **A clicker/idle hybrid where the "cookie" is a planet.** You click the planet to generate **Terraform Units (TU)** and buy buildings (Seed Probes → Atmospheric Processors → … → reality-bending megastructures) that generate TU passively.
- **The identity mechanic: you finish planets.** Every planet has a terraforming requirement; production fills it passively, clicks fill it directly. Complete a planet → a brand-new procedurally generated planet arrives (type, size, visual traits, *personality quirks* like "Refuses to terraform on Mondays").
- **A hierarchical long arc:** 5 completed planets form a **Solar System** (+15% each), 5 systems form a **Galaxy** (×1.4 each), galaxies advance **Universe Stages** (Local System → Early Galaxy → Cluster → Supercluster → Cosmic Web), and total universe progress follows an asymptotic curve `100·(1 − e^(−galaxies/6))` that approaches but never reaches 100%.
- **Texture systems:** timed research queue, achievements, weighted random events (Solar Flare, Space Whale Migration…), clickable golden-cookie anomalies with buffs, a **Vogon invasion** mini-game (the one existing HHGTTG reference — click the ships), and a seed-based prestige.

All of that survives into the redux. It's a genuinely good skeleton.

### Why the code was too far gone (each failure → a redux rule)

| v1 failure | Redux rule |
|---|---|
| **Derived state stored in state.** `rates`, `researchMultipliers`, etc. were persisted, then re-applied on load — spawning multiplicative-stacking bugs, a literal `REPAIR_RESEARCH_BONUSES` action, and "rebuild from baseline" rituals. | **Derive, never store.** Persisted state = player decisions + counters only. Every multiplier/rate is a memoized pure function of that state. A "repair" action is impossible by construction. |
| **`Math.random()` inside the reducer.** Untestable, save-scummable, offline/online behave differently. | **Seeded, stored RNG.** All randomness flows from named PRNG streams whose seeds live in the save. Deterministic replay; testable to the digit. |
| **Duplicated logic.** Planet-completion code copy-pasted between the TICK path and the click path; migration code re-implemented system/galaxy formation. | **One simulation function.** `step()` is the only place time advances; clicks/purchases are inputs to it. Offline = the same `step()` with a big dt, chunked. |
| **Monoliths.** 12,741-line `styles.css`, 2,390-line `Game.tsx`, 1,657-line `state.ts`. | Content is **data**, rules are **small pure modules**, components are **one file per panel** with co-located styles. Nothing over ~300 lines without a reason. |
| **DOM particle soup.** Events spawned dozens of animated DOM nodes with CSS filters; required a whole PERFORMANCE_OPTIMIZATIONS.md of mitigations and a "performance mode" setting. | **One GPU scene for the pretty stuff.** Planet + effects live in a single WebGPU/WebGL2 scene (three.js TSL — see ART_DIRECTION.md); React renders panels and numbers. No manual perf modes — device tiers are detected and quality adapts automatically. |
| **Full-tree re-render at 10 Hz** via `useReducer` at the root. | Game loop lives **outside React** in a store; components subscribe to narrow selectors and re-render only when their slice changes. |
| **Ad-hoc saves.** Shallow-merge rehydration, per-field `if (!x) x = default` migrations, localStorage + IndexedDB dual paths, stray `test-save.html` / `offline-test.html` debugging artifacts. | **Versioned schema + ordered migrations.** One codec, one storage backend (localStorage), validated parse, export/import string. Migrations are pure functions with tests. |
| **Resources that don't matter.** Heat/atmo/water/bio/science collapsed into a weighted sum → one number wearing five hats; zero decisions. | **Resources drive per-planet strategy** (see §3.2 Aspects). If a system creates no decisions, it gets cut instead of carried. |
| **Number literals like `123032000000000000000000`.** Precision loss past 2^53 looms over every formula. | **`break_infinity.js` Decimal** throughout the engine, formatted centrally. |
| **Power-creep content tail.** 21 buildings ending in "Omniverse Core / Infinity Harvester / Transcendence Beacon" — three ways to say the same nothing. | Shorter, coherent ladder (14 buildings) that ends **at Magrathea**, because in this universe the ultimate technology is *building planets for money*. Deeper tiers arrive with prestige layers, not as day-one filler. |

### Cut entirely (complexity that never paid rent)

- Per-planet building inventories (tracked, never used).
- The 5-zone topography model (poles/temperate/equator/oceans/continents) — replaced by the four aspect gauges, which the planet shader *visualizes directly* (receding ice, rising seas, creeping green — ART_DIRECTION.md §4).
- IndexedDB backend, "performance mode" setting, per-planet snapshot textures stored in the save (bloated saves; re-render from seed instead).

---

## 2. Design pillars

1. **The planet is the cookie.** Everything on screen orbits (literally) the current planet. Clicking it feels physical; finishing it feels like an event.
2. **Same buildings, different lens.** Each new planet reshuffles what's efficient. Variety comes from modifiers on a small content set, not from more content.
3. **Numbers go up, jokes land dry.** The tone is the *Guide's*: bureaucratic deadpan about cosmic absurdity. Douglas Adams is the house style, not a skin pack.
4. **Deterministic core, decorative shell.** The simulation is a pure, seeded, testable machine. All spectacle is derived from it and can be thrown away.
5. **Respect the player's absence.** Idle games are about coming back. Offline progress, catch-up, and "what happened while you were out" are first-class features, not patches.

---

## 3. Game design

### 3.1 Core loop

```
click planet → TU → buy buildings → TU/sec → planet progress fills
     ↑                                              ↓
     └── upgrades, research, events, anomalies ← planet completes →
              new weirder planet → systems → galaxies → prestige (Magrathea)
```

### 3.2 Resources: TU + four Aspects + Science

- **TU (Terraform Units)** — the only *spendable* currency for buildings/upgrades. From clicks and every building.
- **Aspects** — four terraforming gauges per planet: **Thermal 🔥, Atmospheric 🌫️, Hydrologic 💧, Biotic 🌱**. Each building contributes to one or two aspects. A planet completes when **all four gauges** hit their targets.
- **Science 🧪** — produced by labs, spent on research. Not part of planet completion.

**Why this fixes v1:** planet types now *bias* the gauges. A volcanic world arrives with Thermal 80% pre-filled but Hydrologic target ×3 — suddenly your dusty Hydro Seeders are the bottleneck and the optimal build changes. Resources create decisions instead of decorating a weighted sum.

- Planet gauge targets scale with planet index (see §5 balance).
- Excess aspect production isn't wasted: overflow converts to TU at a discount, so specialized builds stay sane.
- Clicks fill the planet's *lowest* gauge (manual labor goes where it's needed — with an upgrade to choose).

### 3.3 Buildings (14, ending at Magrathea)

Cost curve: `cost = base × 1.15^owned` (classic, kept from v1). Each tier ≈ ×9–12 base cost, ≈ ×4–6 output of the previous. Every building has a **Guide entry** (flavor text in the Guide's voice).

| # | Building | Base cost | Aspect focus | Guide entry sketch |
|---|---|---|---|---|
| 1 | Seed Probe | 15 | all (tiny) | "Mostly harmless." |
| 2 | Atmospheric Processor | 100 | Atmo | "Produces air of almost, but not quite, entirely breathable quality." |
| 3 | Hydro Seeder | 1.1k | Hydro | "Delivers oceans. Dolphins sold separately, and leaving anyway." |
| 4 | Geothermal Tap | 12k | Thermal | "Warms planets from the inside, like a very slow argument." |
| 5 | Bio-Dome | 130k | Biotic | "A self-sustaining ecosystem, assuming nobody opens a window." |
| 6 | Research Lab | 1.4M | Science | "Where white mice conduct experiments on scientists." |
| 7 | Orbital Mirror Array | 16M | Thermal+Atmo | "Focuses sunlight with the confidence of a species that has never once burned toast." |
| 8 | **Marvin** (unique, max 1) | 50M | auto-click | "Brain the size of a planet, employed to click one." Auto-clicks 1/sec; flavor text rotates through complaints. |
| 9 | Quantum Excavation Core | 210M | Hydro+Science | "Digs in several dimensions at once, occasionally finding last Tuesday." |
| 10 | Temporal Compressor | 2.5B | all | "Terraforms now using time borrowed from later. Later is furious." |
| 11 | Deep Thought Node | 30B | Science++ | Unlocks *The Answer* research (§3.5). "Currently thinking. Estimated completion: seven and a half million years, or 42 hours with the service pack." |
| 12 | Stellar Forge | 400B | Thermal++ | "Manufactures sunlight wholesale." |
| 13 | **Heart of Gold Drive** | 5.5T | Improbability | Powers the event system (§3.7): each Drive raises Improbability. "Passes through every point in the universe; occasionally passes through profitability." |
| 14 | Magrathean Workshop | 75T | planet progress | Directly accelerates planet completion %. "Custom planet building. Ask about our fjords." |

### 3.4 Upgrades

Kept structurally from v1, trimmed and systematized:

- **Click line** — Terraforming Gloves → … → *Electronic Thumb*; late-game "clicks gain +1% of TU/sec" upgrade so clicking never becomes pointless.
- **Per-building efficiency tiers** — auto-generated at ownership thresholds (1/5/25/50/100…): ×2, ×2, ×2, ×5, ×10. Data-driven, not 40 hand-written entries.
- **Milestone upgrades** — total-building-count thresholds granting global multipliers.
- **Synergy pairs** — a small curated set ("Geothermal Taps +5% per Stellar Forge"), computed as derived multipliers — v1's dynamic combo subsystem (600 lines) is cut; the curated pairs deliver the same feel.
- **Infinite lines** — one repeatable per-building line with growing cost/requirement (v1's best idea, kept as a single generic mechanic).

### 3.5 Research (timed, science-gated)

A queue of timed research (idle texture: start it, come back). Costs Science + real time. Highlights:

- Aspect efficiency branches (thermal/atmo/hydro/bio ×).
- **Babel Fish Cultivation** — halves Vogon poetry debuff.
- **Sub-Etha Sens-O-Matic** — forecasts the next event; later warns of Vogons.
- **Somebody Else's Problem Field** — debuffs auto-dismiss; also auto-starts queued research.
- **Bistromathics** — building cost scaling 1.15 → 1.1485. Tiny. Compounds absurdly. The description just says "numbers on restaurant bills obey different rules."
- **While You Were Hitchhiking** — offline efficiency 50% → 75% → 100%, offline cap 8h → 24h.
- **The Answer** (requires Deep Thought Node) — takes **42 real hours**. Grants a permanent, prestige-surviving **+42% to everything**. The description is "42." The follow-up research, *The Question*, is unlockable but its cost is unknowable and it never finishes.

### 3.6 Planets, systems, galaxies

**Planet generation** (seeded): type (terrestrial / gas giant / ice / desert / volcanic / ocean), size, aspect bias profile, visual palette, 1–3 **quirks**. The full bias matrix and pacing math are in PROGRESSION.md §5; the type-specific rendering in ART_DIRECTION.md §4.

**Orbital Survey:** from planet #4 on, each new planet offers a pick-1-of-3 survey report (a per-planet modifier draft: "Rich geothermal seams", "Improbability shadow", "Vogon paperwork lost"…) — ten seconds of agency that makes every arrival a decision, not a scene change.

Redux quirks get *small mechanical hooks* so personality lands:

- "Refuses to terraform on Mondays" — −5% production on real-world Mondays.
- "Award-winning fjords" (Slartibartfast was here) — +10% Biotic, and the shader raises coastline noise frequency: genuinely crinklier, prettier coasts.
- "Mostly harmless" — no effect whatsoever. Guaranteed on planet #42, which is always named **Earth** (see §4).
- "Home to sentient cloud formations" — Atmo overflow converts to TU at full rate.
- ~20 quirks at launch, each ≤1 line of engine code.

**Meta ladder (kept from v1):** 5 planets → system (+15% additive each, per run), 5 systems → galaxy (×1.5 multiplicative each, per run), galaxies → universe stages with the v1 names. Lifetime-best progress feeds the **Total Perspective Vortex** (§3.9).

### 3.7 The Improbability Engine (events, anomalies, Vogons)

All randomness-as-content is unified under one stat: **Improbability**, raised by Heart of Gold Drives and certain research.

- **Events** (v1's weighted table, kept: Solar Flare, Comet Impact, Space Whale Migration…) — frequency and rarity-weighting scale with Improbability. Announced with Guide-style copy.
- **Anomalies → "Improbability Bubbles"** — clickable golden-cookie equivalents, spawn cadence ~60–95s (seeded). Rare variants:
  - **Sperm Whale** — "it wonders what clicking is" — big Science payout.
  - **Bowl of Petunias** — "oh no, not again" — big TU payout; clicking a second one ever unlocks an achievement.
- **Vogon Constructor Fleet** (rare, 30–90 min cadence): a **poetry reading** begins — production −50% for 45s while verse scrolls across the screen. Click all ships to end it early. Babel Fish research halves the debuff; Sens-O-Matic gives warning. Clearing every ship: achievement *"Resistance Is Useless"*.

### 3.8 Prestige: Magrathea

Narrative: when your run is big enough, **Magrathea reopens** and buys your terraformed portfolio; the mice commission a fresh start.

- Reset: planets, systems, galaxies, buildings, TU, research-in-progress.
- Keep: achievements, Guide entries, The Answer, towel (§4), **Blueprints**.
- **Blueprints (BP)** earned at reset: `BP = floor( (runTU / 1e12)^(1/3) + 0.5 × planetsCompleted )` — rewards both raw size and the game's identity (finishing planets).
- Passive: every BP *ever earned* gives +2% global production (never spent away).
- **The Magrathean Catalogue** — spend BP on permanent perks: start with N probes, Marvin clicks faster ("against his will"), Improbability tuning, offline cap +, *Fjord Certification* (all planets get better coastlines: +Biotic), aspect head-starts by planet type.
- First prestige targeted at 45–90 minutes (§5).
- The confirm button reads: **"So Long, and Thanks for All the Fish."**

Post-1.0 second layer reserved: **Milliways** — a reservation you can only afford after watching the universe end a few times.

### 3.9 Achievements → The Guide

Every achievement writes an **entry in your copy of the Guide** (the in-game encyclopedia/stats panel). Each entry grants +1% production — collection *is* the meta. Broad categories from v1 (TU totals, building counts, clicks, planets, systems, galaxies, prestiges) plus the easter-egg set (§4).

The stats panel is the **Total Perspective Vortex**: it shows your lifetime universe progress `100·(1 − e^(−galaxies/6))` on a scale that renders you invisibly small, with the caption "You are here." Surviving the Vortex (opening it) is itself an achievement.

---

## 4. HHGTTG integration (the full easter-egg ledger)

Ambient (always visible):
- **DON'T PANIC** — large friendly letters on the error boundary / save-recovery screen, and the loading screen.
- **"Share and Enjoy"** — the save-export button (Sirius Cybernetics Corporation Complaints Division sends the string to your clipboard).
- Offline-return modal: **"While you were hitchhiking…"** — production report in Guide voice.
- The number **42** always renders in gold, everywhere, forever. No explanation is ever given.
- UI toasts have Genuine People Personalities (the settings toggle to disable them is labeled "go stick your head in a pig").

Content (mechanical, listed above): Marvin, Heart of Gold, Deep Thought + The Answer (42h), Magrathea prestige, Vogon poetry, Babel Fish, SEP Field, Bistromathics, Electronic Thumb, Sub-Etha Sens-O-Matic, whale + petunias bubbles, award-winning fjords, Milliways.

Scripted:
- **Planet #42 is always Earth** ("Mostly harmless", quirk-free, blue-green). Completing it: achievement *"Life, the Universe and Everything."* Ten real minutes after it completes, a Vogon demolition notice arrives for it — long since "on display at the local planning office in Alpha Centauri." Surviving or failing the setpiece both pay out (failing grants the **Towel**).
- **The Towel** — earned via the Earth setpiece or 42 total achievements: permanent +42% offline cap, and the achievement *"A frood who really knows where their towel is."*
- Own **exactly 42** of any building: achievement *"Six by Nine."* (6×9=42 in base 13; the description just says "Something is wrong with mathematics.")
- Konami-style: typing `42` on the keyboard while the Vortex is open shows the Question briefly, garbled.
- **Pan Galactic Gargle Blaster** — rare bubble reward: ×20 click power 20s, then the screen wobbles like a lemon-wrapped gold brick.

Tone rule: never wink. Every joke is delivered as dry documentation.

---

## 5. Balance targets & formulas

**The deep version of this section is [docs/PROGRESSION.md](docs/PROGRESSION.md)** — clocks, worked pacing tables, the scripted first ten minutes, anti-stall valves, prestige run-length model, and the CI balance harness. The table below is the quick reference. Tunable constants live in one file (`content/constants.ts`).

| Beat | Target |
|---|---|
| First building | <10 s |
| First upgrade | ~1 min |
| First planet complete | 3–4 min |
| Planet cadence mid-run | one per 2–8 min |
| First system (5 planets) | ~20 min |
| First prestige | 45–90 min, ~10–15 planets |
| First galaxy | run 2–3 |
| The Answer | 42 h (real time, once) |

Formulas:
- Building cost `base × 1.15^owned`; bulk-buy ×10/×100 via geometric sum.
- Click: `(1 + additives) × mults × (1 + 0.01 × TU/sec × thumbLevel)`.
- Planet N aspect targets: `T(n) = 400 × 1.42^n × sizeMod × aspectBias` — v1's 1.8^n was brutally steeper than the 1.15^n income curve; 1.42 keeps cadence alive deep into a run.
- Systems `×(1 + 0.15·count)`, galaxies `×1.5^count`, both per-run.
- Universe progress (lifetime): `100 × (1 − e^(−bestGalaxies/6))` — v1's best curve, kept verbatim.
- Prestige: see §3.8. Offline: 50% efficiency base, 8 h cap base, research-upgradeable.

Invariant tests to write early (§7): income monotonicity, planet cadence stays under 10 min through planet 25 at "reasonable play," prestige at target time yields ≥5 BP, no formula NaNs/negatives across 1e0–1e300.

---

## 6. Architecture

### Stack

| Choice | What | Why |
|---|---|---|
| Vite + React 19 + TypeScript (strict) | app shell | Familiar from v1; the problems were architectural, not the stack |
| **Zustand** | store bridging engine ↔ UI | Selector subscriptions kill v1's full-tree re-renders; tiny API |
| **break_infinity.js** | numbers | Idle-game standard; fast Decimal to 1e9e15 |
| **zod** | save schema | Validated parse + typed migrations |
| **lz-string** | save export | Compressed "Share and Enjoy" strings (kept from v1) |
| **Vitest** | engine tests | Engine is pure TS — test it to death |
| **three.js WebGPURenderer + TSL** | the scene | WebGPU-first with automatic WebGL2 fallback from one shader codebase; compute particles on capable GPUs. Full rationale + fallback matrix in ART_DIRECTION.md §2 |
| **React Three Fiber v9 + drei** | scene ↔ React | declarative scene graph; instancing/camera-rig helpers |
| **Motion** (motion.dev) | UI animation | spring-based motion language (ART_DIRECTION.md §8) |
| Web Audio API (thin custom layer) | sound | fully synthesized — zero audio files (ART_DIRECTION.md §9) |
| Plain CSS (tokens + one file per component) | DOM UI styling | v1's 12.7k-line CSS was a process failure, not a technology gap; tokens defined in ART_DIRECTION.md §7 |
| leva (dev-only) + Playwright screenshots | tuning & visual regression | shader work gets visual diffs, not vibes |
| GitHub Actions → Pages | deploy | Same as v1's working setup; PWA-installable |

### Module map

```
src/
  engine/            # PURE. No React, no DOM, no Date.now(), no Math.random().
    types.ts         #   GameState (persisted shape), Input events
    num.ts           #   Decimal re-export + format() [42 renders gold via UI]
    rng.ts           #   mulberry32 streams: rng.events, rng.planets, rng.bubbles…
    sim.ts           #   step(state, dtMs, inputs[]) -> state   ← the ONLY tick
    economy.ts       #   derived: costs, TU/sec, click power (memoized selectors)
    aspects.ts       #   gauge fill, overflow conversion, completion check
    planets.ts       #   seeded generation, quirk hooks, systems/galaxies formation
    improbability.ts #   events, bubbles, vogons (all cadence via rng streams)
    research.ts, prestige.ts, achievements.ts
    save/
      schema.ts      #   zod schema + SAVE_VERSION
      migrate.ts     #   ordered [v1→v2, v2→v3…] pure migrations
      codec.ts       #   serialize / lz-string export-import
  content/           # DATA ONLY. Stable string ids; cross-refs checked by a registry test.
    constants.ts, buildings.ts, upgrades.ts, research.ts,
    events.ts, achievements.ts, quirks.ts, guide.ts, naming.ts
  state/
    store.ts         # Zustand store; game loop driver (rAF + accumulator, 4 Hz logic,
                     # visibilitychange → offline catch-up via chunked step())
    selectors.ts
  ui/
    App.tsx
    panels/          # Shop, Research, Guide, Vortex, Magrathea, Settings, Achievements
    scene/           # R3F scene graph (see ART_DIRECTION.md §3)
      Planet.tsx, materials/ (TSL node graphs), Infrastructure.tsx (instanced buildings),
      Fx.tsx (particles), Interactables.tsx (bubbles, vogon ships), CameraRig.tsx,
      cinematics/ (planet/system/galaxy/prestige shot sequences), vortex/
    audio/           # WebAudio synth layer (ambient bed, thocks, stingers)
    theme.css        # design tokens from ART_DIRECTION.md §7
  workers/
    engine.worker.ts # optional M2+: engine runs off-main-thread (pure TS makes this free)
  balance/           # headless bot harness + HTML report gen (PROGRESSION.md §9)
  test/              # determinism, offline parity, migrations, registry, harness CI bands
```

### The five engine laws

1. **One clock.** `step(state, dt, inputs)` is the only mutation path. Clicks, purchases, bubble-clicks are `Input` objects consumed by `step`. Offline catch-up = `step` in ≤60s chunks (events/bubbles suppressed offline) — online and offline can never diverge, fixing v1's offline bugs by construction.
2. **Determinism.** Time is a parameter; randomness comes from named seeded streams in the save. Same save + same inputs = same universe, to the digit. (Planet visuals re-derive from seed — v1 stored PNG data-URLs in the save.)
3. **Derived is never persisted.** The save stores decisions and counters. Rates, multipliers, unlocks recompute via memoized selectors. v1's repair actions and double-application bugs cannot exist.
4. **Content is data.** Buildings/upgrades/research/quirks are typed objects with stable ids. A registry test asserts every cross-reference resolves and every id has a Guide entry.
5. **React renders; it never simulates.** The loop drives the store; panels subscribe via selectors; the 3D scene reads a display snapshot (with interpolated display-only values so numbers and gauges glide at 60fps while logic runs at 4 Hz). The scene is derived state with a GPU: every visible object traces back to the save (ART_DIRECTION.md §1).

### Save system

- Autosave: debounced 10s + on `visibilitychange`/`pagehide`. Slot in localStorage.
- `{ version, seed, streams, decisions… }` validated by zod on load; unknown version → run ordered migrations; corrupt → **DON'T PANIC** screen offering last-good backup (keep 3 rolling backups) and export.
- Export/import: lz-string compressed base64 ("Share and Enjoy").

---

## 7. Milestones

The visual bar is enforced by build order: **the vertical slice comes second, before any breadth.** If M-VS doesn't make someone say "whoa," we fix that before writing another system. Each milestone ends playable and deployed (Pages from M-VS on).

- **M0 — Skeleton (the mostly harmless build):** Vite+TS+React scaffold, engine `step()` with TU + clicks + first 5 buildings + cost curve, Zustand bridge, autosave/load with schema v1, Vitest with determinism + save round-trip tests, headless harness runner stub. *Accept: numbers go up, survive reload, engine runs headless.*
- **M-VS — The Vertical Slice (the whoa build):** the WebGPU/TSL planet renderer with all four aspect→visual mappings live (ice caps recede, coastlines move, green creeps, rim thickens), HERO camera + click punch, diegetic gauges arced around the planet, starfield + nebula skybox, device-tier fallback (A/B/C), DON'T PANIC loading/warm-up screen, planet-complete cinematic, ambient audio bed + click thocks, one full planet loop (complete → warp-in next). Content breadth: first 6 buildings only, 2 planet types. *Accept: 60fps Tier B laptop / 30fps Tier C phone; a cold-start observer unprompted comments on the visuals; Playwright screenshot suite established as the regression baseline.*
- **M1 — The planet loop at full width:** all 6 planet types + quirk visual hooks, Orbital Survey draft, buildings 1–9 with diegetic infrastructure instancing, upgrade lines, offline catch-up + "While you were hitchhiking" report, ETA ribbon, PROGRESSION.md first-ten-minutes script fully authored. *Accept: harness green on planet-cadence + stall bands; first-10-min beat table verified by bot replay.*
- **M2 — Improbability:** events + bubbles (whale/petunias/Gargle Blaster) as refractive interactables, buffs, research system + first 12 items, achievements + Guide panel, Vogon poetry readings with hanging-slab fleet, celebration tier system + rationing. *Accept: 30-min session gets ≥2 events and 1 survivable poetry reading; celebration budget never double-fires.*
- **M3 — Magrathea:** prestige + Blueprints + Catalogue (3 branches), systems/galaxies formation + their cinematics, the Total Perspective Vortex log-zoom, buildings 10–14. *Accept: first prestige lands in 45–90 min in harness; run 2 ≥45% faster to prior peak; Vortex zooms planet→cosmic-web without a loading hitch.*
- **M4 — The Guide's polish:** full easter-egg ledger (§4) incl. Earth #42 setpiece and The Answer, prestige cinematic, mobile one-hand layout pass, reduced-motion/photosensitivity audit, PWA install + offline, balance sweep against PROGRESSION.md bands, Pages deploy workflow.
- **Post-1.0 parking lot:** Milliways layer, cloud save, engine-in-worker promotion if profiling demands it, Steam-style wishlist… no. Parking lot means parking lot.

---

*This document is the spec. When code and doc disagree, one of them is wrong on purpose — update whichever was lying.*
