# TerraClicker Redux — Art Direction & Rendering Technology

> The planet is the protagonist. Every visual decision in this document exists to make one object — the world you are terraforming — feel alive, physical, and worth staring at for forty hours.

This document is binding for M-VS (the visual vertical slice) onward. It covers the rendering stack, the planet renderer, scene architecture, cinematics, UI design language, motion, sound, accessibility, and performance budgets. Progression math lives in [PROGRESSION.md](PROGRESSION.md); systems design in [../DESIGN.md](../DESIGN.md).

---

## 1. Vision

**One sentence:** *Powers of Ten* directed by the Guide — a serene, luminous, slightly deadpan cosmos where your purchases physically accumulate around a planet that visibly transforms under your hands.

Reference points (for sensibility, not imitation):

- **Powers of Ten (Eames, 1977)** — the continuous scale zoom. This literally becomes our Total Perspective Vortex.
- **Outer Wilds** — small, handmade-feeling celestial bodies with personality; orbital mechanics as charm.
- **No Man's Sky** — palette confidence: few hues per biome, saturated but disciplined.
- **Monument Valley / Alto's Odyssey** — calm, readable, gradient-driven ambient beauty; UI restraint.
- **The Guide itself** — the entire UI is diegetic: you are reading a well-designed electronic book that happens to be running a terraforming operation.

Three laws of the look:

1. **Everything on screen is derived from the save.** No decorative randomness — if a moon exists, it's in the seed; if a satellite glints, you bought it. The scene *is* the game state.
2. **Purchases are diegetic.** Buildings appear in the world: probes as tiny satellites, mirror arrays as orbital glints, bio-domes as surface light clusters, Marvin as a small silhouette sitting alone on the moon. Watching your infrastructure accumulate is a core reward channel.
3. **Calm by default, spectacular on schedule.** The idle state is a screensaver you'd leave on. Spectacle (events, completions, prestige) is choreographed, tiered, and always earns its motion.

---

## 2. Rendering stack (the actual decision)

| Layer | Choice | Rationale |
|---|---|---|
| Renderer | **three.js `WebGPURenderer` + TSL** (Three Shading Language) | The current state of the art for web 3D: WebGPU-first with **automatic WebGL2 fallback** from the same TSL node materials — one shader codebase, both backends. Compute shaders (particles, star fields) on capable devices, graceful degradation elsewhere. |
| React bridge | **React Three Fiber v9** (+ drei) | Declarative scene graph that matches our React 19 + Zustand architecture; drei gives instancing/text/camera-rig helpers for free. |
| Post-processing | three.js WebGPU post pipeline (bloom, AgX tone mapping, grain, vignette, CA) | Native TSL post nodes; no second framework. |
| UI layer | React DOM **over** the scene (not in-canvas UI) | Text quality, accessibility, i18n, inspectability. Glass panels float above the 3D view. |
| UI motion | **Motion** (motion.dev) | Springs, layout animation, gesture support; React 19 compatible. |
| Audio | Raw **Web Audio API** (thin custom layer) | Generative ambient + synthesized UI feedback; zero audio-file downloads. |
| Dev tooling | leva (dev-only tuning panel), Playwright screenshot tests for shader regressions | Shader and palette work needs visual diffing, not vibes. |

**Why not Babylon.js:** equally capable, but three+R3F+drei is the stronger ecosystem for a *hybrid* app where React owns the UI. **Why not PixiJS:** the hero object is a 3D planet; faking it in 2D throws away the whole emotional core. **Why not raw WebGPU:** we want the fallback, the ecosystem, and the velocity; this is a solo-scale project with AAA-adjacent ambitions, not an engine project.

**Fallback matrix:**

| | Backend | Particles | Clouds | Post | DPR cap | Target |
|---|---|---|---|---|---|---|
| **Tier A** (WebGPU, capable GPU) | WebGPU | 200k compute | dual shell + storm cells | full stack | 2.0 | 60 fps |
| **Tier B** (WebGPU integrated / strong WebGL2) | either | 50k instanced | dual shell | bloom + tonemap + grain | 1.5 | 60 fps |
| **Tier C** (weak / old mobile) | WebGL2 | 8k instanced | single shell | tonemap only | 1.0 | 30 fps |

Tier detection: WebGPU adapter query + a 300ms micro-benchmark during the loading screen, with a manual override in Settings. The loading screen says **DON'T PANIC** in large friendly letters and doubles as shader warm-up (compile all TSL pipelines behind it — first frame is never janky).

---

## 3. Scene architecture

```
<Scene>
 ├─ Skybox            procedural nebula (seeded per galaxy), regenerated on galaxy change
 ├─ Starfield         GPU points, 3 parallax layers, twinkle via shader time
 ├─ StarRig           the local sun: disc + corona shader + lens dirt sprite, drives key light
 ├─ PlanetRig
 │   ├─ Surface       displaced icosphere, TSL biome material   (§4)
 │   ├─ Ocean         separate sphere at sea-level uniform, animated normals
 │   ├─ Clouds        1–2 scrolling noise shells
 │   ├─ Atmosphere    inverted shell, Fresnel scattering rim
 │   ├─ Moons[0–3]    seeded orbits; Marvin sits on moon[0] if owned
 │   ├─ Ring?         procedural annulus, 30% of seeds
 │   └─ Infrastructure  instanced per-building visuals (§5)
 ├─ FxLayer           particles: flares, meteors, comet trails, aurora ribbons (compute/instanced)
 ├─ Interactables     Improbability Bubbles (transmission spheres), Vogon ships — raycast targets
 └─ CameraRig         state machine: HERO | SHOP_FOCUS | CINEMATIC | VORTEX     (§6)
```

The scene reads a **display snapshot** published by the engine each logic tick (4 Hz), interpolating displayed values at render rate. It never touches game logic.

---

## 4. The planet renderer (centerpiece spec)

**Geometry:** icosphere, subdivision 5–6 by tier; vertex displacement from 4–6 octave simplex FBM, seeded per planet. Elevation is computed once into a float texture at planet creation (equirect, 1024×512 Tier A / 512×256 C) so the fragment shader samples rather than recomputes.

**Surface material (TSL node graph):** inputs = elevation, latitude, slope, moisture noise, and **the four aspect gauges as uniforms**. Terraforming must be *visible continuously* — this mapping is the emotional core of the game:

| Gauge | 0% → 100% visible change |
|---|---|
| **Thermal 🔥** | Ice caps recede from the poles (cap radius uniform); permafrost blue-grey warms toward earth tones; on volcanic worlds, lava veins cool and darken; the terminator gains warm scatter. |
| **Atmospheric 🌫️** | Fresnel rim thickens and saturates; sky-tint appears on the limb; cloud coverage 0→60%; a sunset ring blooms along the terminator. |
| **Hydrologic 💧** | Sea level rises (ocean sphere radius vs elevation threshold) — coastlines *move*; specular sun-glint appears on water; river channels (flow-noise valleys) darken and fill; shore foam band. |
| **Biotic 🌱** | Green spreads as a noise-threshold mask growing from seeded "landing sites" — visibly creeping vegetation frontier; density darkens toward forest; faint night-side bioluminescence, then warm city lights as the planet nears completion. |

Planet types re-parameterize the same graph (palette ramps, elevation scale, ocean floor, cloud style) — six types, one shader.

**Quirks with visual hooks** render for real: "Award-winning fjords" boosts coastline noise frequency (gorgeous crinkly coasts), "sentient cloud formations" gives clouds slow deliberate shapes, "reverses rotation occasionally" actually does.

**Atmosphere shell:** backface-rendered inverted sphere; single-scatter approximation (Fresnel-weighted wavelength tint — full Rayleigh raymarch is Tier-A-only if it stays under budget). Density/hue from Atmo gauge and planet type.

**Earth (#42):** fixed seed, the familiar blue-green. No procedural variance. "Mostly harmless."

---

## 5. Diegetic infrastructure (buildings you can see)

Instanced meshes keyed to building counts (log-scaled: N buildings → `ceil(8·log10(N+1))` visible instances, capped per tier):

| Building | In-scene representation |
|---|---|
| Seed Probe | tiny satellites in low orbit, blinking |
| Atmospheric Processor | slender towers at high-altitude sites, faint updraft shimmer |
| Hydro Seeder | glinting delivery streaks descending toward oceans |
| Geothermal Tap | warm surface glow points along fault lines |
| Bio-Dome | clustered hemispheric lights on the night side |
| Research Lab | a small orbital station; more labs → more modules bolted on |
| Orbital Mirror Array | a ring arc of glints that *actually reflect* the sun as they orbit |
| Marvin | one small silhouette on the nearest moon, head down. Never animates. |
| Quantum Excavation Core | brief ground-flash events with displaced-geometry pulse |
| Temporal Compressor | thin clock-hand light sweep around the equator |
| Deep Thought Node | a distant, dim, thinking monolith in high orbit; a progress pip during The Answer |
| Stellar Forge | the *sun* gains visible machinery silhouettes at its limb |
| Heart of Gold | a white teardrop that is never quite where you last saw it; occasionally (1 frame per ~5 min) it is a teapot |
| Magrathean Workshop | scaffolding arcs over the planet's dark side, weld-flash sparks |

Vogon constructor ships: chunky yellow slabs. Motion spec, verbatim from the source sensibility: **they do not float, bob, or ease — they hang, wrongly, perfectly still**, which against a scene where everything else drifts reads as deeply unsettling. Destroyed ships drop straight down half a screen then vanish, without dignity.

Improbability Bubbles: refractive transmission spheres (roughness 0, IOR ~1.3) drifting on seeded splines; the world refracts upside-down through them. Gold variant for rare types; petunias variant contains a tiny bowl.

---

## 6. Camera & cinematics

Camera rig is a state machine; all cinematics are **skippable after first viewing** (tap anywhere), and all end exactly where interaction resumes.

| Shot | Duration | Spec |
|---|---|---|
| **HERO** (default) | ∞ | Planet at golden-ratio left, slow drift orbit (0.02 rad/s), subtle breathing dolly ±1.5% over 20s. UI panels live in the right third. |
| **Click punch** | 90 ms | 0.5% dolly-in + planet 2% squash-and-stretch + surface ripple decal at hit point + 6-particle spark. Never queues; interrupts itself. |
| **Planet complete** | 6 s | Gauges converge → white soft-flash → clouds spiral-part → time-lapse bloom of green/city lights → pull back → completed planet shrinks into a system slot (UI) → new planet warps in with atmosphere-first reveal. |
| **System formed** | 8 s | Pull back to show 5 planets arranging into orbits around a new star igniting (additive flare + particle burst). |
| **Galaxy formed** | 12 s | Continuous pull-back as systems become points, spiral arms sweep in as GPU point clouds, core ignites. Screenshot moment: pause on the wide shot 1.5s before returning. |
| **Prestige (Magrathea)** | 15 s | Reverse big-bang: infrastructure de-instances piece by piece (in purchase order, reversed), planet de-terraforms in accelerated rewind, everything contracts to a point of gold light — which is then handed, via cut, to a mouse. Fade to new Terra Prima. |
| **VORTEX** | free | See below. |

**The Total Perspective Vortex** is the flagship: a *continuous log-scale zoom* from the surface of your current planet out to the cosmic web — planet → orbit → system (impostor sprites) → galaxy (point cloud) → cluster (billboards) → the full lifetime map, with your lifetime universe-progress percentage rendered as one faint label in an ocean of dark: **"You are here."** Implemented with logarithmic camera distance + 4 LOD scene swaps cross-faded in the post pipeline. Scroll/pinch to travel; it is the stats screen.

---

## 7. UI design language: "The Guide device"

The DOM layer is styled as the Guide: a friendly, extremely well-typeset electronic book UI floating over the cosmos.

**Layout (desktop):**

```
┌────────────────────────────────────────────────┬──────────────────┐
│                                                │  TU counter      │
│                                                │  (display size,  │
│              3D SCENE (planet hero,            │   tabular nums)  │
│              interactables live here)          ├──────────────────┤
│                                                │  ETA ribbon      │
│                                                │  "next: ~40s"    │
│   [event banner slides in bottom-left]         ├──────────────────┤
│                                                │  Guide tabs:     │
│   [aspect gauges: 4 slim arcs                  │  Shop ▸ Research │
│    curved around the planet itself]            │  Guide ▸ Vortex  │
│                                                │  Magrathea       │
└────────────────────────────────────────────────┴──────────────────┘
```

- **Aspect gauges are diegetic**: four slim luminous arcs curved around the planet in screen space, not bars in a sidebar. The bottleneck gauge pulses gently — you can read the whole game state from the hero shot.
- Mobile: scene full-bleed, gauges around planet, panels as bottom sheet with tab bar. Designed at 390×844 first, not adapted later.

**Color tokens** (WCAG: body text on panel ≥ 7:1):

| Token | Hex | Role |
|---|---|---|
| `--void` | `#05060A` | space background floor |
| `--panel` | `#0D1020` @ 72% + blur(24px) | glass panel base |
| `--line` | `#2A3350` | hairline borders |
| `--ink` | `#E9EEF9` | primary text |
| `--ink-dim` | `#8C96AF` | secondary text |
| `--thermal` | `#FF8A3D` | aspect accent |
| `--atmo` | `#5AD7E8` | aspect accent |
| `--hydro` | `#4D8DFF` | aspect accent |
| `--bio` | `#58D68A` | aspect accent |
| `--improbable` | `#F5C84C` | gold: bubbles, the number 42, rare rarity |
| `--magrathea` | `#B36BFF` | prestige layer |
| `--vogon` | `#8A8F5A` | bureaucratic drab; poetry UI |

**Typography:**

- Display / LARGE FRIENDLY LETTERS: **Bricolage Grotesque** (variable) — characterful, rounded-enough, modern.
- UI & body: **Inter variable** with `font-variant-numeric: tabular-nums` mandatory on every number.
- Counters: Inter tabular at display sizes; rolling odometer animation on the TU counter (per-digit translate, not text swap).
- Fluid scale: `clamp()`-based, base 15–16px, ratio 1.25. Self-hosted, subset, `font-display: swap`.

**Iconography:** custom 1.5px-stroke line glyphs, one accent color max. Emoji are banned from chrome; they may appear *inside Guide entry text* where the Guide would use one, deadpan.

**Panel anatomy:** glass (`backdrop-filter: blur`), 1px `--line` border, 16px radius, inner top highlight at 4% white. Buy buttons show cost, owned count, and a **live affordability progress fill** (the button itself fills toward affordable — glanceable without reading).

---

## 8. Motion language

Principles: springs, not tweens; nothing moves without cause; celebration budget is tiered and rationed — see [PROGRESSION.md §8](PROGRESSION.md) for when each tier fires.

| Token | Value | Use |
|---|---|---|
| `t-instant` | 80–90 ms | click feedback, hover |
| `t-fast` | 140 ms | button state, toggle |
| `t-med` | 240 ms | panel/tab transitions |
| `t-slow` | 400 ms | modal, sheet |
| `spring-ui` | stiffness 420, damping 34 | most UI |
| `spring-pop` | stiffness 260, damping 20 | celebrations, badges |

Celebration tiers: **T0** purchase (button spring + tick) · **T1** upgrade/research (panel shimmer + stinger) · **T2** planet (6s cinematic) · **T3** system (8s) · **T4** galaxy (12s) · **T5** prestige (15s). One tier at a time; higher preempts lower; T2+ skippable.

`prefers-reduced-motion`: cinematics become crossfades with a summary card; parallax, shimmer, and screen-space punch disabled; particles decimated 90%. Photosensitivity: no full-screen flash exceeds 1.5× background luminance for >120ms; nothing strobes above 3 Hz. Improbability chromatic-aberration spikes are capped and disableable.

---

## 9. Sound direction (zero audio files)

All synthesized via Web Audio at runtime:

- **Ambient bed:** 2–3 detuned pad layers whose filter cutoff and shimmer track planet completion — a barren world sounds hollow and wind-only; a finished one hums warmly. Layer per aspect crossfades in as its gauge passes 50%.
- **Clicks:** short filtered noise+sine "thock" with ±30 cents random pitch and velocity from click cadence — satisfying at 1 Hz and at 8 Hz.
- **Purchases:** rising two-note motif; interval widens with building tier (tier 14 spans an octave).
- **Events:** synthesized stingers per family; Vogon poetry is procedurally garbled formant muttering (funny, unsettling, and zero copyright surface).
- **Cinematics:** the ambient bed swells; galaxy formation adds a slow sub-bass bloom.
- Master/music/SFX sliders; muted-by-default until first interaction (autoplay policy compliance).

---

## 10. Performance budgets & delivery

| Budget | Target |
|---|---|
| Initial JS (gz) | ≤ 1.8 MB total; three.js chunk lazy after first paint of the DON'T PANIC screen |
| Themed assets | ≤ 300 KB total for Guide SVGs/WebPs plus one 512px grayscale lens-dirt texture; all planet and environment textures remain procedural |
| Time to interactive | < 3 s mid-range laptop, < 5 s mid-range phone |
| Main-thread logic | ≤ 2 ms per logic tick; render ≤ 8 ms/frame Tier B |
| Hidden tab | rendering fully suspended; engine advances on timestamps (no rAF dependence) |
| Save size | < 32 KB (no stored imagery — v1 stored planet PNGs; we re-derive from seed) |

Dynamic resolution scaling: if frame time exceeds budget for 2s, DPR steps down 10% (floor 0.75), recovers when idle. PWA: installable, offline-capable, standalone display — an idle game should live on the home screen.

---

## 11. Content-style note (Adams without lawyers)

The tone is homage: original copy written in the Guide's deadpan register. Concepts and proper nouns (Vogons, Magrathea, 42) are referenced as cultural allusion; **actual prose from the books is not reproduced** — no quoted passages, no lyric-length excerpts, no verbatim Guide entries. Where the game's text lands a famous beat, it lands it in our own words. (v1's README already flagged this: "distinct thematic assets required." This is that, enforced.)

---

## 12. Groundfall (the surface renderer)

The scale fantasy, completed: fly at any world with a floor and the runabout offers **groundfall** — a scripted atmospheric entry (plasma sheath quad, white-out swap, cloud-deck punch-through) into a **1 unit = 1 metre** surface scene where the player disembarks, walks, and mines core samples.

Non-negotiables, all enforced in code:

- **The continent you saw from orbit is the continent you land on.** `surface/terrainField.ts` evaluates `planetGeometry`'s exact macro field (same mulberry seed, same octaves) at the landing direction; a test locks the two together. Latitude gives frost; the landing point's macro elevation gives the region.
- **The gauges are ground truth.** Sea level rises with Hydrologic, the snow line with Thermal, vegetation density and the green splat with Biotic, and the sky/fog/star budget with Atmospheric — an airless world gets a black daytime sky and a knife-sharp horizon. Volcanic worlds get lava for a sea.
- **The renderer and the walker read the same array.** Heights bake into two Float32 tiers (4 m and 64 m per texel) behind the plasma; the vertex shader and the CPU collision sample them with the same manual bilinear + smoothing + curvature drop. No GPU-only geometric displacement, ever.
- **One terrain shader for every world** — palette, sea, snow line, lava switch and curvature are uniforms, honouring the planet renderer's hard-won sharing rule. Lights are borrowed from the permanent rig (`sceneLightRig`, `SceneLamps`), never mounted, so a landing recompiles nothing.
- **Terrain mesh is a camera-following polar grid** (one draw, no clipmap seams); props, seams and the parked runabout are instanced/hand-placed at human scale. Planet curvature is applied analytically — the horizon is genuinely the planet's, by size class.

Economy stays sealed: core samples become salvage on boarding (`engine/groundfall.ts`), plus a one-time ground-survey bonus per world, persisted in `expedition.groundWorlds` (save v23).

Planetary Expeditions (see [EXPEDITIONS.md](EXPEDITIONS.md)) adds three more non-negotiables, enforced in code and test:

- **Sites are properties of the place, not the landing.** Seams live on a planet-fixed cube-cell lattice (`surface/surfaceSites.ts`); a site id is its cell, so the same ground is the same seam from any approach. Sample identity reads planet truth only — macro elevation, latitude, type, gauges, quirks — never the landing frame's local height or clamped waterline.
- **The ground remembers.** Worked seams never return; prospect stakes stand on every later landing; the world's expedition record (`engine/groundSites.ts`) survives prestige like the rest of the Deep Field.
- **Scan, then choose.** A seam offers no verbs until scanned; the extraction choice (quick break / precision core / prospect / preserve) is the gameplay, and the instruments (field pulse, compass marker rail) are load-bearing, not decorative.
