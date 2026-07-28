# Drop models here — that's the whole workflow

Any `.blend`, `.glb` or `.gltf`: modelled in the Blender GUI, downloaded from
an asset pack, generated. Then either

    npm run assets:ship

or leave the watcher running and just keep saving/exporting into this folder:

    npm run assets:watch

The build derives the asset's id and names from the file (a lone
`Armature.001` root gets renamed to the filename), repairs it to the kit rules
(missing UVs, live transforms, tangents, rigs, textures), verifies it through
the game's own merge, ships it to `public/assets/uplift/meshes/imports/`, and
adds it to the game's prefetch manifest. A `<file>.import.json` sidecar
appears next to your model with everything that was derived — edit it to
override (budget, names, renames, `prefetch: false`), and commit it with the
model.

Full story: §8 of docs/BLENDER_PIPELINE.md.
