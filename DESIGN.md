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

**Visiting (click-to-inspect):** every formed galaxy and system in the tableau is a destination, not a prop. Click a galaxy → the camera leaves the scroll rail and flies there; its five member stars surface in the disc, each clickable. Click a system (constellation glyph or member star) → its five worlds are rebuilt from their `completedPlanets` records — same seeded geometry they were terraformed with — orbiting their star, names on hover. While a system is inspected the host galaxy dims politely. Breadcrumbs (`everything › galaxy N › system M`) plus Esc / empty-space click step back out; scroll or pinch reclaims the journey outright; a formation ceremony starting reclaims the stage and clears the visit. Implementation: `focus` on the uiBus, framing math in `universeLayout.ts` (`focusSeat` / `focusFraming`), worlds in `universe/FocusedSystem.tsx`, camera blend in `CameraRig`. Headless verification: `shot.mjs` actions `focus:` / `clickobj:` / `hoverobj:` / `key:` against the dev hook `__tcCam.screenPos`.

**Manual flight (take the helm).** The map's opposite number: press `F` (or the little ship under the zoom rail) and the camera stops being a crane and becomes **the company runabout** — first-person, mouse-steered, flown through the same universe with nothing staged for it. Controls: pointer offset steers (dead zone center, quadratic response, banked roll on turns), `W`/`S` thrust/brake, `A`/`D` slide, `space`/`C` rise/sink, `shift` improbability boost (FOV kick + radial streaks + a whoosh), scroll trims a cruise throttle; touch = left-thumb stick, right-thumb thrust, double-tap boost. Physics is arcade-honest: velocity exponentially chases a desired vector, and the speed cap grows with distance from home (`speedCapAt`), so the planet is a place and the cosmic web is a commute. The journey's zoom-keyed fades all still work because flight publishes `zoomLive` through `zoomForDistance` (camera range → journey zoom, band whooshes included). Fly within ~5.5u of any formed system and its five recorded worlds **materialize around you** (the same `FocusedSystem` treatment, driven by `flightNearSystem` with hysteresis); nameplates still hover; clicking any visitable disembarks into the classic visit. Esc/`F` hands the camera back, easing onto the rail at the equivalent band via the focus-release path. The cockpit is DOM: throttle bar, velocity in plain language ("loitering" → "highly improbable"), nearest-landmark line, and the DON'T PANIC sticker required by regulation. Ceremonies never steal the camera mid-flight; prestige garages the runabout; a modal pauses the controls. Modules: `scene/flightControl.ts` (state + physics + input, tested in `test/flight.test.ts`), `hud/FlightHUD.tsx`, flight branch in `CameraRig`. Headless verification: `shot.mjs` actions `flight:` / `flykeys:` / `move:` / `flystate` against the dev hook `__tcFlight`.

**The Deep Field (law: not everything out there is yours).** Every other object in the tableau is a monument to something the player finished; the Deep Field is the set of things that were already there, are indifferent to the commission, and can only be learned about by flying out and looking. Fifteen landmarks (`content/deepField.ts`) are placed once, permanently, by the **master seed alone** — not progress, not run number, not prestige count (`engine/deepField.ts`, `deepFieldSites`) — so a universe's sky is fixed for its whole life and no two players get the same one. Rendering follows a strict three-step reveal: at range an anonymous **glint** worth a detour; inside ~46u the **body** resolves but the console still calls it a contact; only a completed **scan** gives it a name. Placement is spread across four distance shells (9–24u / 26–58u / 62–115u / 125–185u) with a quarter of the catalogue behind you, where nobody thinks to look.

The verbs live at the helm. Sensors hold contacts within a refit-derived range; the reticle locks whatever you are most squarely aimed at (big things forgive sloppy aim, a teapot does not); **hold `E`** to scan, and hold it again in close to **board**. A **proximity governor** (`cushion`) bleeds inward speed across a cushion and parks you on the hull line — flying through a nine-hundred-year-old derelict would make it scenery — which conveniently leaves you slow enough and close enough to board; phenomena are not solid and let you in. Approach distances all derive from one place (`hullShell` < `boardRange` < `jumpStandoff`) so parking is always inside your own boarding envelope and a jump always leaves the whole thing in the windscreen. `J` engages the **Improbability Drive** (a refit) to arrive at any scanned contact. The runabout carries its **own lamp** (`scene/RunaboutLamp.tsx`) because the scene is lit for the hero planet and there is nothing out there to see by.

Boarding pays **salvage**, which buys **refits and nothing else** (`content/refit.ts`: sensor range, scan rate, thrust ceiling, the drive). This is the hard rule of the layer: exploration is a **parallel track that never gates the idle economy** — no entry touches TU, Science, aspects, or planet progress, and a player who never leaves the planet loses nothing but the view. Scanning writes a Guide entry (a Deep Field section in the Guide panel, separate from the achievement ledger); three achievements mark first contact, eight filed, and a complete survey; the drifting towel is a third route to the Towel. The logbook is **lifetime state and survives prestige** — those things were never part of the portfolio Magrathea buys (save v6, `expedition`). Milliways is the one landmark that declines to be approached: it holds 66u ahead of you along its own bearing forever, so full sensors (78u) can read it and the ship never reaches it. Cockpit: an SVG **canopy** with corner fillets and steering-tracked glare, a sensor slate, and the refit bay on `R`. Headless verification: `shot.mjs` actions `goto:` / `sites` / `refit:`, plus `flykeys:e`; tested in `test/deep-field.test.ts`.

**Scale and terrain at the helm (law: a planet must behave like a planet).** Four things were making the runabout feel planet-sized.

First, **nothing was solid**. `flightControl.ts` keeps a list of solid bodies and the governor refuses them — and *every world belongs on that list*, not just the stars. Covering the hero world and the system stars alone still left the actual planets (the ones orbiting your assembling system, the ones in a system you have flown up to) as ghosts you sailed straight through, which is the loudest possible way to tell the player they are moon-sized. Orbiting bodies carry their ellipse and resolve their live position per frame; the set of solid worlds mirrors `FocusedSystem`'s own render rule exactly, so a system reached by *visiting* from the map is as solid as one reached by flying. Galaxies stay passable, because flying through one is correct. Collision is a **swept** test against the whole path travelled each frame, not a point test at the endpoint: at boost a frame covers 0.4u while a settled world's shell is 0.2, so a point test would have the ship appear on the far side having never once been recorded as inside anything.

Second, **speed was keyed to range from the origin**, so a star fifteen units out was approached at open-space speed and went past in a blink. The ceiling is now `SURFACE_CAP + heightAboveNearestSurface × APPROACH_K`, which boost lifts the range cap against but cannot buy its way out of. The surface floor is deliberately a crawl (0.085 u/s): at the old 1.15 you circled an entire world in under five seconds, a speed that makes sense only if the ship is a moon. This is the single biggest lever on how big a planet feels.

Third, **nothing in the frame had a known size**, so the eye had nothing to measure a planet against and settled on the only reading available — that the viewer is about as big as the thing filling the glass. `RunaboutHull.tsx` puts the ship's nose in the near field: tiny in world units (which the flight near plane of 0.02 permits), built from boxes so its on-screen footprint is exact rather than discovered, sitting low enough that you catch only its spine. It leans against acceleration and banks into turns, because a thing that answers to physics reads as an object and a thing welded to the lens reads as a HUD decal.

Fourth, the console reported raw distance from the middle of the universe; within 3u of a surface it reports **altitude above that body** instead.

The enumeration is the hard part and it took three passes to get right — hero world, then the orbiting settled worlds, then the hero planet's **moons**, which are small but visibly *planets* and were sailed straight through. Moon orbits now come from `heroMoons`/`heroMoonPosition` in `universeLayout.ts` so the renderer and the helm cannot disagree about where they are; anything else added to the sky must be added to the body list in the same commit. The hull (`RunaboutHull.tsx`) must also be mounted **after** `CameraRig` — R3F runs `useFrame` in mount order, so subscribing earlier poses the hull against last frame's camera and it visibly swims.

**Flight comfort (law: neutral input means neutral).** Manual flight made a tester motion-sick, and the cause was the steering scheme: the pointer's POSITION set a permanent turn rate, so unless the mouse sat exactly at screen centre the ship rotated forever and there was no way to express "fly straight". It is now **hold-to-steer** — press to raise a stick centred where you pressed, drag to deflect, release and turning stops instantly. The stick draws itself (`.fh-stick`), because a hold-to-steer control nobody can see is a control nobody finds. The left button being the stick means a click can no longer trigger a visit (`focusOn` and `onMissed` both refuse in flight): disembark is `esc`, deliberately and only.

Camera motion is cut right back: bank per unit of yaw 0.42 → 0.10 (a rolling horizon is one of the most reliable ways to make somebody ill, and it now self-levels the instant you let go), turn rates roughly halved, and the boost **FOV kick removed entirely** — an 8° lens swing is a classic trigger for very little payoff.

The speed limit near a body is expressed as an **angular** rate, not a linear one, because what makes a close pass sickening is how fast the surface sweeps across the view. `OMEGA_MAX` bounds ω about whatever you are nearest, which automatically yields a crawl on the surface, an unhurried low orbit and normal cruising once the body is small in the window. Crucially the limit must **release with range** — a plain `ω × distance` cap was still throttling open space forty units from a planet that subtends nothing — so it relaxes across ten radii. Measured: ω stays between 0.16 and 0.38 rad/s at every altitude from a 0.05 skim to 20 units out, with a hero-planet orbit taking 32–39s throughout.

**The scale hierarchy (law: every level contains the level beneath it at full size).** The universe was a deliberately compressed diorama — a "system" was a 0.78-unit glyph and a galaxy held five of them 1.15–2.11 units apart. That works while a system is a *symbol*; it collapses the moment you can fly into one, because five real systems will not fit inside a galaxy two units across, and a delivered world rendered at a sixth of the hero planet reads as a marble of the thing it used to be.

The spatial layout now derives from one block at the top of `universeLayout.ts`:

```
SYSTEM_R   = 8     outermost orbit of a system's five worlds
GALAXY_R   = 78    outermost member seat — comfortably clears a whole system
UNIVERSE_R = 260   the shell galaxies sit on — clears two galaxies
WEB_R      = 1150  the cosmic-web backdrop everything sits inside
```

Everything follows: `orbitSlot`, `visitOrbit`, `systemGlyphPosition`, `galaxyPosition`, `memberSeatLocal`, the galaxy point clouds, `cosmicWeb`, `focusFraming`, and the **journey waypoints** themselves. `MINI_SIZE` is 0.5–0.95 against the hero planet's 1.0 — the hero is the ruler and stays put. Band stops land at 6.6 / 36 / 118 / 404 / 1213 and are **exported as `BAND_DISTANCES`**, which the helm derives `DIST_STOPS` from rather than copying: a re-scale must never leave flight mapping range onto the wrong band.

Rebased downstream in the same change: the soft/hard walls, speed ceilings, the system reveal distance, every collision shell, the Deep Field's placement shells and sensor ranges, and both camera far planes. **The tests derive their expectations from these constants too** — six broke on the re-scale precisely because they hardcoded the old numbers, and that is the mechanism that catches the next one. Retuning a level is now editing one number; nothing spatial in this project should ever be a bare literal again.

**One planet pipeline (law: a delivered world is not a lesser world).** Settled worlds used to be a second, much poorer renderer — an icosphere at detail 2–3 (a few hundred vertices for a whole planet) wearing CPU-baked vertex colours, against the hero's detail 5 and full procedural surface. A finished world therefore looked like a marble of the thing it had been, and the closer you flew the worse the comparison got. There is now **one** pipeline (`settledPlanet.ts`): the same geometry builder and the same node material, with gauges pinned to DELIVERED rather than tracking a live commission — full seas, ice caps where they belong, vegetation spread, cities lit. Geometry and materials are cached per world seed and shared across the assembling view, the visited view and the ceremonies; nothing disposes them, because everything shares them. This also *removed* the last flight hitches (a revealed system no longer links five shaders): `flight-moving` in a 409-world save went from 2–3 long frames to zero.

**A delivered world keeps its sky** (`universe/SettledAtmosphere.tsx`). Finished worlds had no cloud deck and no atmospheric rim, so the moment a planet left your commission it went from living to a painted marble — a downgrade for doing well, which is backwards. Two shared shells now ride every settled world: weather at ×1.045 (two noise bands drifting at different rates so fronts form and break up, plus a sparser dense band for storms) and an atmospheric rim at ×1.16 tinted per planet type. Variety comes from the **mesh**, not the material — each world spins its deck at its own rate from its own angle — because a material per world is a shader link per world at exactly the wrong moment. Cloud noise is sampled in LOCAL space: these worlds orbit, and a world-space pattern makes the weather swim across the surface as the planet travels.

Flight also gets its own **near plane** (0.02 against the journey's 0.1, with `far` pulled in to 420 to buy the depth precision back). At the old near plane, holding station a tenth of a unit off a surface clipped the near geometry away and backface-culled the far side — the planet you were standing on appeared not to exist.

**Terrain is per-pixel** (`planetMaterial.ts`). Elevation used to arrive as a per-VERTEX attribute: ~10k samples for a whole world at detail 5, vertices 0.035 units apart, everything between them interpolated. From orbit it passed; up close the planet was a smeared ball with a few colours, because that was all the data there was. The attribute now carries only the base shape, and every frequency above it is evaluated per pixel — driving both the colour ramp and a **derived normal**, so relief is lit rather than painted. Three rules learned the hard way: scale the bump as a **slope** (`BUMP_SLOPE`), not the raw gradient, or the surface reads as sandpaper; split `elevShape` (coastline, sea, shore band — a whisper of detail) from `elevDetail` (land ramp, peaks — all of it), or every pixel crosses the waterline and shore foam fires across the whole planet; and fade the finest band in with proximity, which both stops it aliasing from orbit and gives the one quality that sells scale — detail that keeps arriving as you descend. Settled worlds get the same treatment through one **shared** node material that modulates their baked vertex colours (`SETTLED_MATERIAL` in `miniPlanet.ts`); per-planet materials meant a newly revealed system linked a fresh shader per world, mid-flight.

**Frame hitches.** Averages hide stutter, so measure percentiles (`scripts/frame-perf.mjs`, `scripts/frame-profile.mjs`). The big one: the runabout's lamp was mounted and unmounted on the flight toggle, and changing a scene's light configuration invalidates every material — a guaranteed ~170ms rebuild *every single time* you took the helm. It now stays in the scene at zero intensity. That lamp also has to fade against a surface: its falloff is a power of distance, so a tenth of a unit off a planet it delivers a couple of hundred times nominal illuminance and the terrain washes out to white, which looks exactly like a shader bug and is not one.

**The Sub-Etha (law: the channel keeps filing while you are away).** An always-on diegetic broadcast feed, and the connective tissue between every other layer. Two kinds of traffic share it: **chronicle** entries filed by the simulation when something actually happens (world delivered, system formed, contract closed, contact resolved, portfolio sold), and **ambient** entries from `content/subEtha.ts` — colonial chatter naming your real worlds, Guide editorial revisions, Vogon administration, freight, hitchhikers. Everything is drawn from a dedicated `subetha` rng stream, so a universe produces a given feed and any chunking of the same elapsed time produces the same log (engine law #1).

The load-bearing category is **rumours**: an ambient roll (`C.SUBETHA_RUMOUR_ODDS`) names an *undiscovered* Deep Field landmark, its shipping-lane bearing (`bearingOf` — coreward / rimward / spinward / trailing, plus high or low) and its rough range. A rumoured landmark then reads at `C.SUBETHA_RUMOUR_RANGE_MULT` × sensor range and holds a steadier glint, so reading the channel is mechanically worth something and the Deep Field stops depending on flying around at random. Rumours never repeat a landmark and never point at one already resolved.

Two decisions worth keeping: broadcasts are generated **in the tick loop online and offline alike** — unlike bubbles, events and Vogons, which are suppressed while you are away because they are rewards. The Sub-Etha is a record, not a reward, and coming back to scroll what the universe said is the whole feature. And the log is a **ring buffer** (`C.SUBETHA_LOG_MAX`), because an eight-hour absence at this cadence would otherwise file several hundred lines into localStorage. A short `recent` window suppresses back-to-back repeats — the channel is small enough that unguarded weighted picks visibly loop.

Presentation: a **quiet ticker** that surfaces one line near the masthead and fades (never a toast — toasts announce what *you* did; this announces what happened near you, most of which does not concern you), plus the full scrollable log at the top of the Guide with relative timestamps. Rumours are the one kind allowed to look like they matter. Suppressed on phones (≤900px), where masthead, gauges, caption, buffs, toasts and a 46vh dock sheet already share the screen; the Guide's log carries it there. Save v7 (`subEtha`). Modules: `engine/subEtha.ts`, `hud/SubEthaTicker.tsx`, `chronicleEffect` in `engine/sim.ts`. Headless verification: `shot.mjs` `spawn:broadcast`; tested in `test/sub-etha.test.ts`.

**The living universe (law: delivered means inhabited).** A completed world must never read as less alive than it was the moment it shipped. Delivery snapshots the player's actual installation loadout onto the record (`installations`, save v5; pre-v5 worlds get a biography-derived loadout in migration — bottleneck rig, survey lab, one seeded specialty). Everywhere a remembered world renders — assembling-system minis, visited systems, the world close-up — it carries: seeded **settlement lights** whose density grows with the world's `lifetimeIndex` (the empire visibly matures), its **recorded hardware** orbiting as sprites, and **shuttle traffic** commuting between the worlds of its system. Systems with an assigned dispatch route run a colored **freight lane** with haulers; focused galaxies show **trade lanes** pulsing between member stars; constellation glyphs carry a patrol glint. Scale discipline: system-scale actors (freight, commuters, the glyph marker, the dispatch halo) yield the frame during a world close-up, and ambient interstellar traffic fades within ~2 units of the camera so a liner never dwarfs a planet. Modules: `universe/SettledWorld.tsx`, `universe/LivingLanes.tsx`, `engine/worldHardware.ts`.

### 3.7 The Improbability Engine (events, anomalies, Vogons)

All randomness-as-content is unified under one stat: **Improbability**, raised by Heart of Gold Drives and certain research.

- **Events** (v1's weighted table, kept: Solar Flare, Comet Impact, Space Whale Migration…) — frequency and rarity-weighting scale with Improbability. Announced with Guide-style copy.
- **Anomalies → "Improbability Bubbles"** — clickable golden-cookie equivalents, spawn cadence ~60–95s (seeded). Rare variants:
  - **Sperm Whale** — "it wonders what clicking is" — big Science payout.
  - **Bowl of Petunias** — "oh no, not again" — big TU payout; clicking a second one ever unlocks an achievement.
- **Vogon Constructor Fleet** (rare, 30–90 min cadence): a **poetry reading** begins — production −50% for 45s while verse scrolls across the screen. Click all ships to end it early. Babel Fish research halves the debuff; Sens-O-Matic gives warning. Clearing every ship: achievement *"Resistance Is Useless"*.

### 3.8 Prestige: Magrathea

Narrative: when your run is big enough, **Magrathea reopens** and buys your terraformed portfolio; the mice commission a fresh start.

- Reset: planets, systems, galaxies, buildings, TU, and commission-scale research.
- Keep: achievements, Guide entries, towel (§4), **Blueprints**, and active or completed Deep Thought metaprojects.
- **Blueprints (BP)** earned at reset: `BP = floor( (runTU / 1e12)^(1/3) + 0.5 × planetsCompleted )` — rewards both raw size and the game's identity (finishing planets).
- Passive: every BP *ever earned* gives +2% global production (never spent away).
- **The Magrathean Catalogue** — spend BP on permanent perks: start with N probes, Marvin clicks faster ("against his will"), Improbability tuning, offline cap +, *Fjord Certification* (all planets get better coastlines: +Biotic), aspect head-starts by planet type.
- First appraisal targeted at roughly 30–90 minutes (§5): five complete systems initially, then one additional system per successful commission.
- The confirm button reads: **"So Long, and Thanks for All the Fish."**

Post-1.0 second layer reserved: **Milliways** — a reservation you can only afford after watching the universe end a few times.

### 3.9 Achievements → The Guide

Every achievement writes an **entry in your copy of the Guide** (the in-game encyclopedia/stats panel). Each entry grants +1% production — collection *is* the meta. Broad categories from v1 (TU totals, building counts, clicks, planets, systems, galaxies, prestiges) plus the easter-egg set (§4).

The stats panel is the **Total Perspective Vortex**: it shows your lifetime universe progress `100·(1 − e^(−galaxies/6))` on a scale that renders you invisibly small, with the caption "You are here." Surviving the Vortex (opening it) is itself an achievement.

### 3.10 Galactic Operations

Completed systems become a portfolio to operate, not merely a multiplier to admire:

- **Acceptance Contracts:** the Guide files three deterministic offers at a time. One can be active; objectives cover deliveries, system formation, aspect bottlenecks, surveyed worlds, lean builds, and timed work. Contracts pay modest BP and faction reputation; standing improves that faction's future offers within a hard cap. The board may be rerolled once per newly formed system, and an active filing can be withdrawn without penalty.
- **System Dispatch:** each formed system exposes aspect routes matching the bottlenecks recorded across its five worlds; Science appears after two surveyed worlds, while general Production is always available. Contract history unlocks up to four dispatch slots. Bonuses are intentionally smaller than the system ladder so dispatch changes strategy without replacing it.
- **Heritage Worlds:** one completed world may be nominated during each commission. A successful Magrathean sale preserves it permanently in the Guide. The newest eight Heritage Worlds provide a small aspect bonus based on their recorded bottleneck; the complete archive remains available for memory, not power.

All deadlines use simulated time and therefore behave identically online and offline. Contracts, reputation, and the Heritage archive survive prestige; active work, current offers, dispatch assignments, and the pending Heritage nomination reset with the sold portfolio.

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
- **The Towel** — earned via the Earth setpiece, by boarding the drifting towel in the Deep Field, or by filing 42 records: permanent +42% offline cap, and the achievement *"A frood who really knows where their towel is."* (A "record" is an achievement or a charted Deep Field object. The threshold used to read 42 *achievements*, of which there have only ever been 29, so that path could not be taken; the number is not negotiable, so the count changed. 29 + 15 = 44.)
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
| First prestige | ~30–90 min, 25+ planets |
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
