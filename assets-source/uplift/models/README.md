# Imported models go here

Any `.blend` (modelled in the Blender GUI) or `.glb`/`.gltf` (asset pack,
generator, another tool). No Python required — register the file as a
`source:` asset in `scripts/uplift/build-ship.mjs` and `npm run assets:ship`
repairs it to the kit rules and verifies it through the game's own merge.

Start with:

    npm run assets:inspect -- assets-source/uplift/models/<yours>.glb

which prints the node names the registry entry will need. The full walkthrough
is §8 of docs/BLENDER_PIPELINE.md.
