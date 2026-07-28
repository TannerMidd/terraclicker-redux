# Asset sources

This file covers the production pack generated from [ASSET_UPLIFT.md](ASSET_UPLIFT.md).

## Ground masters

The six files under `assets-source/uplift/ground/*-atlas-source.png` were generated with the built-in OpenAI image-generation tool. The shared prompt and per-world palette notes are recorded in `public/assets/uplift/manifest.json`. The requested content was original, non-branded material art with no text or recognizable franchise design.

The generator mirrors each source quadrant into a seamless 2K master, derives packed RG normal / B roughness / A ambient-occlusion maps, and encodes the result as Basis Universal KTX2 arrays.

## Deterministic project-authored assets

All remaining texture masters, SVGs, WebPs, and GLB files are generated locally by `scripts/generate-uplift-assets.mjs` from project-authored geometry and vector patterns. They have no third-party source imagery.

KTX2 files are encoded by Khronos KTX-Software 4.4.2. The complete file list, hashes, coverage map, counts, palette, and prompt set live in the generated manifest.

## Regeneration

```sh
npm run assets:uplift
```

Set `TOKTX_BIN` if `toktx` is not installed at `.runtime/ktx/bin/toktx.exe`. ImageMagick 7 is required.
