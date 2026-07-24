# Event-art prompt set

Mode: built-in `image_gen`, one generation call per distinct event card. No API/CLI
fallback was used. Each source was generated on a flat chroma key, processed with
the bundled `remove_chroma_key.py` helper, then downsampled and palette-checked as
a transparent 320 × 180 WebP.

## Shared prompt

> Use case: stylized-concept  
> Asset type: small 320 × 180 in-app event/toast illustration cutout, generated
> large for later downsampling  
> Style/medium: original soft gouache plus restrained airbrush, deadpan
> scientific-specimen / technical-manual illustration, dry and diagrammatic
> rather than cinematic, pale ink micro-details, subtle pigment texture confined
> inside the subject, one clean luminous rim highlight; no realism or 3D render  
> Composition/framing: wide 16:9 intent, centered 3/4 orthographic specimen,
> generous padding on every side, strong silhouette at thumbnail size, no crop  
> Color palette: only `#FF8A3D`, `#5AD7E8`, `#4D8DFF`, `#58D68A`, `#F5C84C`,
> `#E9EEF9`, with `#8A8F5A` reserved for Vogon art  
> Constraints: isolated opaque cutout; crisp antialiased edges; no cast shadow;
> no transparent smoke, mist, glass, or wisps; no scene, stars, planets, text,
> letters, numbers, logos, watermark, border, UI frame, or recognizable
> franchise design

Every prompt additionally specified that its background was one perfectly flat,
uniform key color with no gradient, texture, reflection, shadow, floor, haze,
glow spill, or lighting variation, and prohibited the key color from the subject.

## Subject prompts

| File | Key | Primary request |
|---|---|---|
| `solar-flare.webp` | `#ff00ff` | A compact local star disc throwing one elegant arcing prominence, restrained heat contours, and three calibration ticks; administratively calm energy in orange and gold. |
| `comet-delivery.webp` | `#ff00ff` | A faceted blue-white ice comet at a 3/4 angle, a short opaque cyan mineral tail, and one absurdly tidy orange-gold cargo canister strapped to the core. |
| `aurora-storm.webp` | `#ff00ff` | A small curved planetary horizon segment wrapped by three opaque atmospheric ribbons in cyan, biotic green, and hydro blue, plus two gold calibration nodes. |
| `meteor-shower.webp` | `#ff00ff` | Five angular meteors of varied size, each with a short solid orange-gold speed ribbon, arranged along one pale-cyan calibrated trajectory fan. |
| `whale-migration.webp` | `#ff00ff` | Three to five vast, gentle original space-whale silhouettes traveling together, with subtle anatomical panel lines and a serene shared orientation. |
| `probability-squall.webp` | `#00ff00` | A compact impossible weather knot of angular lightning, broken probability wedges, small cubes, dotted samples, and intersecting orbital fragments. |
| `bubble-whale.webp` | `#ff00ff` | One curious sperm-whale-like silhouette curled inside a complete, fully opaque segmented probability ring with sparse calibration nodes. |
| `bubble-petunias.webp` | `#ff00ff` | One tilted pale ceramic bowl overflowing with orange and coral trumpet-shaped petunias, falling as a single calmly absurd specimen cluster. |
| `bubble-gargle.webp` | `#00ff00` | One chunky cyan-blue opaque cocktail vessel with an orange collar, a lemon-gold rectangular energy brick above the rim, and a segmented gold ring. |
| `vogon-reading.webp` | `#ff00ff` | One large blunt filing-cabinet-like command barge with four smaller wedge-box escorts in disciplined chevron formation, dominated by drab olive. |

The aurora source produced a tiny off-palette magenta atmospheric rim. After the
skill-recommended one-pixel edge contraction, the remaining opaque rim pixels
were quantized to atmospheric cyan before the final WebP was written.
