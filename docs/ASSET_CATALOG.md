# TerraClicker themed asset catalogue

This is the compact visual layer for the Guide device. Runtime files live in
`public/assets/`; Vite copies them without placing image masters in the JavaScript
bundle.

## House style

- Guide service diagrams drawn by a calm engineer.
- Icons use a `64 × 64` viewBox, a 48-unit optical box, rounded 2.35-unit strokes,
  pale ink structure, and one token accent.
- Aspect glyphs use `currentColor` and are mounted as CSS masks so they remain
  tintable at runtime.
- Guide plates are deadpan technical-manual cutaways with registration marks,
  dimension lines, and one accent wash.
- Event art is soft gouache/airbrush specimen art on transparency, with no
  rectangular scene, text, watermark, or borrowed film/book-cover design.

Palette:

| Role | Value |
|---|---|
| Panel | `#0D1020` |
| Ink | `#E9EEF9` |
| Thermal | `#FF8A3D` |
| Atmospheric | `#5AD7E8` |
| Hydrologic | `#4D8DFF` |
| Biotic | `#58D68A` |
| Improbable | `#F5C84C` |
| Magrathea | `#B36BFF` |
| Vogon | `#8A8F5A` |

## Inventory

| Family | Count | Format | Runtime use |
|---|---:|---|---|
| Building diagrams | 14 | SVG, 256 × 256 | Shop installation cards |
| Aspect glyphs | 4 | SVG, tintable | Aspect output labels |
| Research diagrams | 15 | SVG, 256 × 256 | Research cards and completion toasts |
| Upgrade diagrams | 9 | SVG, 256 × 256 | Seven click upgrades plus reusable milestone/synergy marks |
| Event/bubble cards | 10 | transparent WebP, 320 × 180 | Event chips, toasts, and Vogon banner |
| Guide plates | 20 | transparent WebP, 320 × 144 | All 33 achievement entries via semantic reuse |
| Brand lockups | 2 | SVG | Masthead and boot/error screens |
| Lens dirt | 1 | transparent WebP, 512 × 512 | Local star sprite only |

The 65 generated building-efficiency upgrades reuse their building diagram.
Four milestone upgrades reuse the milestone mark, and five synergies reuse the
linked-node mark. The 20 Guide plates cover all 33 entries by reusing the nearest
technical subject for ladder achievements.

## Paths and code

- Asset URL and semantic mappings: `src/ui/assets.tsx`
- Vector/Guide/lens generator: `scripts/generate-themed-assets.mjs`
- Browser smoke test: `scripts/asset-qa.mjs`
- Generated manifest: `public/assets/manifest.json`

Run deterministic generation with:

```sh
npm run assets:generate
```

ImageMagick 7 is required for the transparent Guide WebP and lens outputs.
The command does not regenerate the painterly event cards.

## Runtime sizing

- Buildings: 43 px desktop, 38 px mobile.
- Upgrade/research: 31–36 px.
- Guide plate: 92 × 48 px.
- Toast art: 72 × 54 px desktop, 58 × 46 px mobile.
- Source files remain at least 2× their rendered size.

Locked Guide art is desaturated and dimmed in CSS; no duplicate locked-state
raster files are shipped.
