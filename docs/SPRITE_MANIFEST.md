# Scene-sprite manifest — the diegetic layer

Every discrete object in the 3D scene gets a real, distinct sprite. Planets, moons,
galaxies, and the cosmic web stay procedural (they must morph with game state);
everything that is *a thing you bought, a thing you click, or a thing passing by*
becomes authored art. Same pipeline as the event-card set: generate large on a flat
chroma key, cut out, downsample, palette-check, write transparent WebP.

Target: `public/assets/sprites/<category>/<file>.webp`

---

## Shared prompt (prefix for every sprite below)

> Use case: stylized-concept
> Asset type: square 512 × 512 in-scene game sprite cutout (billboarded in a 3D
> space scene), generated large for later downsampling
> Style/medium: original soft gouache plus restrained airbrush, deadpan
> scientific-specimen / technical-manual illustration, dry and diagrammatic rather
> than cinematic, pale ink micro-details and faint panel lines, subtle pigment
> texture confined inside the subject; no realism, no 3D render, no photo
> Lighting: one clean warm-white rim highlight from the UPPER RIGHT (the local
> sun), ambient fill cool and dim; no cast shadow, no ground plane
> Composition/framing: centered single subject, generous padding on every side,
> strong readable silhouette at 24 px, 3/4 view from slightly above unless the
> entry says "side profile"
> Color palette: hull neutrals `#E9EEF9` `#8C96AF` `#5A6378` `#0D1020`, accents
> only from `#FF8A3D` (thermal) `#5AD7E8` (atmo) `#4D8DFF` (hydro) `#58D68A`
> (bio) `#F5C84C` (gold) `#B36BFF` (magrathea), with `#8A8F5A` reserved for
> Vogon craft
> Constraints: isolated opaque cutout on one perfectly flat, uniform key color
> (no gradient, texture, reflection, shadow, haze, glow spill); key color
> prohibited inside the subject; crisp antialiased edges; no transparent smoke,
> mist, glass fade, or wisps; no scene, stars, planets, text, letters, numbers,
> logos, watermark, border, or recognizable franchise design

Key color: `#FF00FF` unless the entry says `#00FF00` (used when the subject
contains violet/magenta pigment).

Ships and anything that travels are drawn in **side profile, nose pointing
right** — code rotates the billboard along the direction of travel.

---

## A. Installations — one sprite per purchasable building (14 + 2 variants)

These replace the current generic box satellite. Orbit-lane items circle the
planet; surface items sit at seeded sites near the terminator; specials are
placed by their own rules. Blinking, glints, plumes, flashes, and light sweeps
are added in code — draw the machine, not the effect.

| File | Key | In-game placement | Primary request |
|---|---|---|---|
| `installations/seedProbe.webp` | `#FF00FF` | low-orbit swarm | A tiny hexagonal satellite bus with two slender unfolded solar paddles, one small primary dish, four folded spindly landing legs tucked beneath, and a single bio-green calibration stripe; earnest, minimal, mass-produced. |
| `installations/atmoProcessor.webp` | `#FF00FF` | surface, high plateaus | A slender high-altitude tower of five stacked venturi rings that widen toward the top, louvered intake grilles between rings, three guy-line anchors at the base, and atmo-cyan piping running the full height; an instrument that breathes for a planet. |
| `installations/hydroSeeder.webp` | `#FF00FF` | low orbit, nozzle down | An orbital water tanker: one bulbous riveted tank with visible internal baffle seams, a downward delivery boom ending in a three-nozzle sprinkler head, small trim thrusters, hydro-blue tank bands; utilitarian plumbing in space. |
| `installations/geoTap.webp` | `#FF00FF` | surface, dark side | A tripod drilling derrick straddling a round wellhead collar, exposed heat-exchanger coils at the base glowing thermal orange from within, two angled radiator fins, and a thin standpipe rising through the derrick's crown. |
| `installations/bioDome.webp` | `#FF00FF` | surface clusters, night side | Three geodesic greenhouse hemispheres of different sizes sharing one hexagonal foundation plate, faceted panes lit warm bio-green from inside, one tiny cylindrical airlock joining the two largest domes; a terrarium colony. |
| `installations/researchLab.webp` | `#FF00FF` | mid orbit | A modular orbital station: one central pressurized cylinder with two smaller bolted-on module cans at right angles, a mesh dish on a short mast, one gold whip antenna, and a porthole strip; visibly designed to accept more modules. |
| `installations/orbitalMirror.webp` | `#FF00FF` | high orbit ring arc | A hexagonal array of seven gold-foil mirror petals on a two-axis gimbal yoke, thin truss boom, tension wires at the petal corners, the foil faces catching pale warm light; a flower made of focus. |
| `installations/marvin.webp` | `#FF00FF` | seated on the nearest moon | A very small android figure seated with knees drawn up and oversized head bowed low, matte grey-green plating, drooping shoulder joints, one dim red eye visible in the down-turned face; the posture of infinite patience, poorly rewarded. |
| `installations/quantumExcavator.webp` | `#00FF00` | hovering above surface | An inverted floating obelisk drill with three concentric gyro rings around its midsection at different phase angles, magrathea-violet energy seams along the obelisk edges, small ejected rock chips frozen mid-orbit around the tip. |
| `installations/temporalCompressor.webp` | `#FF00FF` | equatorial orbit | A curved equatorial rail segment like a section of an enormous clock bezel, navy body with brass-gold tick marks, one raised hand-pivot hub with a stubby gold indicator, faint engraved chapter-ring numerals abstracted to dashes. |
| `installations/deepThought.webp` | `#FF00FF` | distant high orbit | A tall, austere matte slab monolith with softly chamfered edges, almost featureless, one single small gold pip light glowing a third of the way down; monumental, silent, unmistakably thinking. |
| `installations/stellarForge.webp` | `#FF00FF` | attached at the sun's limb | A crane-like industrial gantry meant to silhouette against a star: black-navy trusswork, one huge ladle arm tipping a channel of white-hot material, heat shielding plates, tiny service pods on the frame; a foundry the size of weather. |
| `installations/heartOfGold.webp` | `#FF00FF` | never where you last saw it | A sleek, seamless white teardrop ship, impossibly clean, no visible engines or panel lines except two hairline gold seams, one soft gold glow at the tapered tail; serene and slightly smug. |
| `installations/heartOfGold-teapot.webp` | `#FF00FF` | 1 frame per ~5 min | The same seamless white material language as the teardrop, but a classic round teapot with spout and handle, one hairline gold seam around the lid; rendered completely deadpan. |
| `installations/researchLab-2.webp` *(optional growth stage)* | `#FF00FF` | ≥25 labs | The same station grown: four bolted modules, a second dish, one external truss with two gold tanks; visibly the same design language, clearly more of it. |
| `installations/magratheanWorkshop.webp` | `#00FF00` | scaffold arc over the dark side | A curved construction scaffold segment built to grip a planet's horizon: layered truss arcs with clamp feet at both ends, magrathea-violet marker lights along the spine, two crane arms and one welding gantry car parked mid-rail; luxury infrastructure for building worlds. |

---

## B. Traffic fleet — 6 ship classes (seeded per route)

Replace the anonymous light-streaks. All side profile, nose right. The seed
already decides each route; it will also decide the class deterministically.

| File | Key | Primary request |
|---|---|---|
| `traffic/hauler.webp` | `#FF00FF` | A boxy long-haul freighter: blunt cab, spine rail stacked with six intermodal cargo containers in mixed aspect colors (orange, cyan, blue, green), one big rear engine block with twin nozzles; honest working tonnage. |
| `traffic/tanker.webp` | `#FF00FF` | A liquid tanker of two riveted spheres in tandem on a slim keel, hydro-blue tank bands and small pressure domes on top, compact tug cab at the bow; cargo that sloshes. |
| `traffic/courier.webp` | `#FF00FF` | A small sharp wedge courier, cockpit slit window, one oversized single engine bell nearly as large as the hull, gold express-stripe along the flank; all engine, no patience. |
| `traffic/liner.webp` | `#FF00FF` | A graceful elongated passenger liner with a raised dorsal observation ridge, a long strip of warm lit portholes, three small maneuvering fins, pale ink hull with a thin cyan waterline stripe. |
| `traffic/tug.webp` | `#FF00FF` | A stubby tug towing three barrel cargo pods on a visible slack line behind it, each pod a slightly different neutral tone with one colored band; the pods trail at slightly different heights. |
| `traffic/surveyor.webp` | `#FF00FF` | A dish-nosed survey skiff: sensor dish as the entire front face, instrument booms bristling above and below, small twin engines, bio-green instrument lights; more antenna than ship. |

---

## C. Vogon Constructor Fleet — 2 (match `vogon-reading.webp`'s barge language)

They hang in the sky the way bricks don't; the sprite must look too heavy to fly.

| File | Key | Primary request |
|---|---|---|
| `vogon/constructor.webp` | `#FF00FF` | A huge blunt filing-cabinet command barge in drab olive `#8A8F5A`: vertical drawer-like hull segmentation, heavy rivet rows, one official-looking pale stamped placard panel, stubby non-aerodynamic fins that serve no purpose; bureaucracy with mass. |
| `vogon/escort.webp` | `#FF00FF` | A smaller wedge-box escort in the same drab olive: a brick sharpened slightly at one end as a concession to travel, two riveted plate seams, one dull yellow hazard chevron; charmless and compliant. |

---

## D. Improbability Bubble cores — 4 (float inside the refractive bubble shell)

The bubble sphere itself stays procedural (refraction is the joke); the rare
contents become sprites suspended inside.

| File | Key | Primary request |
|---|---|---|
| `bubbles/whale-core.webp` | `#FF00FF` | A small curled sperm-whale silhouette mid-tumble, fins spread in first-time wonder, pale ink anatomical panel lines, one curious eye; compact enough to read inside a sphere. |
| `bubbles/petunias-core.webp` | `#FF00FF` | A tilted pale ceramic bowl overflowing with orange and coral trumpet petunias, two loose blossoms drifting free beside it; calm, resigned, mid-fall. |
| `bubbles/gargle-core.webp` | `#00FF00` | A chunky cyan cocktail vessel with an orange collar and a lemon-gold rectangular energy brick hovering above the rim, one thin gold orbit ring around the glass. |
| `bubbles/golden-core.webp` | `#FF00FF` | An impossible gold polyhedral knot — a die with too many faces, several passing through each other — with faint calibration ticks on three faces; concentrated luck as an object. |

---

## E. Event flyovers — 5 (in-scene set pieces while an event runs)

Events currently exist only as toasts; these make them happen in the sky.

| File | Key | Primary request |
|---|---|---|
| `events/comet.webp` | `#FF00FF` | Side profile, nose right: a faceted blue-white ice comet with a short SOLID cyan mineral tail rendered as opaque layered chevrons (no transparency), one tidy orange cargo canister strapped to the core. |
| `events/meteor.webp` | `#FF00FF` | One angular tumbling meteor with a short solid orange-gold speed ribbon, pale fracture lines on the rock face; designed to be instanced in fans of five. |
| `events/space-whale.webp` | `#FF00FF` | Side profile, nose right: one vast, gentle space-whale with subtle anatomical panel lines, broad serene fins, pale belly, dim bio-green photophore dots along the flank; built to cross the sky in a slow pod. |
| `events/flare-arc.webp` | `#FF00FF` | A single elegant solar prominence arc — an opaque ribbon of layered orange and gold leaving and re-entering off-frame at the bottom edge, with three pale calibration ticks; drawn to overlay a star's limb. |
| `events/probability-shard.webp` | `#00FF00` | One floating impossible-geometry shard: a broken wedge whose faces disagree about which way is out, violet edge seams, two small orbiting cubes; instanced during a probability squall. |

---

## F. FX textures — 5 (white-on-key, tinted and blended additively by code)

Painted in whites and pale greys only; the engine colors them per use.

| File | Key | Primary request |
|---|---|---|
| `fx/glow-soft.webp` | `#00FF00` | A soft round luminous core with painterly falloff and very faint radial brush grain; pure white on the key, no hard edge. |
| `fx/shockwave-ring.webp` | `#00FF00` | A thin luminous ring with a slightly irregular, energy-frayed outer edge and a crisp inner edge; white only. |
| `fx/spark-streak.webp` | `#00FF00` | One elongated horizontal light streak, dense white core tapering to both ends, faint speed grain; for warp lines and comet trails. |
| `fx/aurora-ribbon.webp` | `#00FF00` | A tall vertical curtain ribbon with gently waving edges and vertical striations, solid white with painterly density variation; will be tinted and wrapped over planet poles. |
| `fx/star-corona.webp` | `#00FF00` | A stellar corona: dense white disc core with a ring of soft petal-like flame lobes of uneven length; replaces the procedural sun disc's plain gradient. |

---

## G. Garnish — 2 (small delights)

| File | Key | Primary request |
|---|---|---|
| `misc/pet-asteroid.webp` | `#FF00FF` | A lumpy, potato-shaped asteroid with three craters arranged suspiciously like a face, wearing a single thin gold collar band with a tiny tag; deadpan, no other anthropomorphism. |
| `misc/wreck-satellite.webp` | `#FF00FF` | A derelict early-generation probe: one bent solar paddle, dish askew, scorch freckles, a red "decommissioned" dot sticker; drifting background melancholy for veteran systems. |

---

## Integration contract (what the code will do with these)

- **Determinism holds**: which sprite appears, where, and how many is derived
  from the save (building counts, seeds) — art changes nothing about engine law #2.
- Installations: `Infrastructure.tsx` is rebuilt from one generic instanced box
  into per-building sprite lanes (orbit shells, surface sites, specials), counts
  log-scaled exactly as now.
- Traffic: route seed additionally picks a ship class; billboard rotated to
  heading; the old streak becomes the courier's engine trail via `fx/spark-streak`.
- Vogons: slab meshes replaced by `constructor`/`escort` billboards that hang
  perfectly still (the joke is preserved; destroyed ships still drop without dignity).
- Bubbles: rare kinds gain their core sprite floating inside the refraction shell.
- Events: flyover choreography per event id (whale pods cross behind the planet,
  meteors fan past, the flare arc rides the sun's limb, shards orbit erratically).
- All sprites load lazily, non-suspending (imperative `TextureLoader.load`) —
  the useLoader-suspension incident is not invited back.

Total: **38 core sprites** (+2 optional). At 512² WebP these should land well
under ~1.5 MB combined; the delivery budget survives.
