# The Blender pipeline

How a 3D model gets from Blender into this game. Written for someone who has
not used Blender before; the runabout hull is the worked example throughout,
but the same path now carries the skimmer, the settlement kit, the wildlife,
the crystal seams and the cloud banks.

**A model does not need any Python — or any configuration — to get in.**
Anything that produces a `.glb` or `.blend` — the Blender GUI, a CC0 asset
pack, a generator — is imported by **dropping the file into
`assets-source/uplift/models/`**: the build derives its name, repairs it to
the rules below, verifies it through the game's own merge, and adds it to the
game's prefetch list. That route is **§8**, and it is the default for new
assets. The per-asset Python scripts are how the six original kits are built
and remain right for models that really are code (parametric variants,
palettes shared with the game); everything in between is machinery both routes
share.

---

## 1. The mental model

The game does **not** load your Blender file. It loads a `.glb` — a portable
format Blender exports to — and then does something aggressive to it:

> It finds one named object, **merges every mesh underneath it into a single
> lump of geometry**, throws away all the materials, and keeps only each
> material's flat base colour, painted onto the vertices.

That one sentence explains almost every rule below. The game draws the whole
ship in **one draw call with one shared material**, because the ship appears in
orbit, on the ground, and in the cockpit, and a phone has to render it. So the
model is treated as *shape plus per-part colour*, and nothing else.

What you author in Blender: **shape, part layout, flat colours, UVs.**
What you do **not** author in Blender: textures, roughness, metalness, shading,
lighting, animation. Those live in code (`shipKit.tsx`) and are shared.

---

## 2. The files, and the one command

| File | What it is |
|---|---|
| `assets-source/uplift/blender/kitlib.py` | Shared machinery: geometry verbs, UVs, export, self-measurement. |
| `assets-source/uplift/blender/runabout.py` | **A source of truth.** Palette + builders for the ship. |
| `assets-source/uplift/blender/skimmer.py` | Same, for the survey sled. |
| `assets-source/uplift/blender/settlements.py` | 16 building assets, with variants. |
| `assets-source/uplift/blender/creatures.py` | Wildlife and static fauna — the animated kit. |
| `assets-source/uplift/blender/ore.py` | The crystal seam cluster. |
| `assets-source/uplift/blender/clouds.py` | Cloud banks for the flight band. |
| `assets-source/uplift/blender/*.blend` | The Blender files, *output* of those scripts. Open, look, edit. |
| `assets-source/uplift/models/` | **The drop target** — put a `.blend`/`.glb` here and it imports itself (§8). |
| `assets-source/uplift/models/*.import.json` | Per-import config, derived on first build; the override surface (§8). |
| `scripts/uplift/imports.mjs` | Zero-config discovery: every file in models/ IS a registered asset. |
| `scripts/uplift/watch-models.mjs` | `npm run assets:watch` — saving into models/ runs the import for you. |
| `scripts/uplift/normalize.mjs` | The repair pass for imported models: bakes transforms, generates UVs, strips what the merge refuses. |
| `scripts/uplift/blend-export.py` | The one generic `.blend → .glb` export used for every imported .blend. |
| `scripts/uplift/kit-contract.mjs` | The game's merge, transcribed for Node — what the build and the tests verify against. |
| `src/ui/scene/uplift/importsManifest.ts` | Generated: which imported kits the game prefetches. Never edited by hand. |
| `public/assets/uplift/meshes/**/*.glb` | The game assets. This is what ships to players. |
| `scripts/uplift/build-ship.mjs` | The driver: builds (or normalizes), then checks the result. |

```bash
npm run assets:ship
```

That runs Blender with no window, writes every `.blend` and `.glb`, and then
**verifies each `.glb` by replaying the game's own loading code**. A green `OK`
means the models will work in game. It is not a formality — it has already
caught two real bugs (see §5). To do one asset only:

```bash
node scripts/uplift/build-ship.mjs skimmer
```

An asset script is just a palette and some builder functions; everything that
is true of *all* of them lives in `kitlib.py`, which is the file to read when
you want to know why a rule exists.

Blender lives outside the repo, at `F:\Tools\Blender\Blender Foundation\Blender 5.2\`.
Set `$BLENDER` if yours is elsewhere. Nobody needs Blender installed to *run*
the game or build the site — only to change the model.

---

## 3. What happens, end to end

1. **Blender** builds the ship: ~82 separate objects (hull, wings, gear, crate,
   antenna…), each with one flat-coloured material, all parented to an empty
   named `runabout`.
2. **Export to `.glb`.** One binary file, geometry + materials, 314 KB.
3. **The game loads it once** (`upliftAssets.ts`), on a background fetch, and
   caches it. Until it arrives, the ship draws as hand-built boxes — the
   fallback in `RunaboutExterior.tsx`.
4. **`kitGeometry('…/runabout.glb', 'runabout')`** finds the node called
   `runabout`, walks every mesh under it, bakes each mesh's material colour
   into a per-vertex colour attribute, and merges the lot into one geometry.
5. **`kitGeometryFit(...)`** scales that geometry into a fixed box for each
   place the ship appears (§6).
6. **`shipMaterial()`** in `shipKit.tsx` draws it: your vertex colours,
   multiplied by a shared PBR texture atlas and a decal sheet, with roughness
   and metalness set in code.

Note step 6: the *texture* on the hull comes from `textures/ships/runabout-pbr.ktx2`,
which is generated separately and is **not** part of your Blender file. Your UV
map controls how that texture lands, but you never assign it in Blender.

---

## 4. The rules (why a model that looks fine in Blender breaks in game)

These are not style guidance. Break one and the ship silently vanishes or
arrives mangled.

(For a `source:` asset, `normalize.mjs` repairs **4.4** and **4.5** for you —
missing UVs are box-projected, forbidden attributes stripped, transforms baked
to identity, mirrored parts unflipped — and it keeps 4.8's all-or-none rule by
zero-filling the mask on rigid parts. The scripted kits satisfy the rules by
construction. Either way, this section is what the game *needs*; only who does
the work differs.)

**4.1 — Asset names are an API.**
The TSX looks assets up by string, so a rename makes that part of the game
render nothing, with no error. The ship has two: `runabout` (the whole hull)
and `hull-nose`, fetched *separately* to draw the prow in front of the cockpit
camera. Every kit lists its names at the top of its script, and the `ASSETS`
registry in `build-ship.mjs` asserts they exist.

**4.2 — Only the base colour survives.**
Roughness, metalness, textures, node graphs, shader setups: all discarded. To
make a part a different colour, give it a **different material with a different
base colour**. That is the entire painting mechanism. The palette lives at the
top of `runabout.py`.

**4.3 — Colours must be linear.**
glTF stores colour linearly, and the game reads it straight through. The hex
codes designers use are sRGB. `runabout.py` has an `srgb()` helper that
converts. If you pick a colour in Blender's colour picker, use the **RGB**
sliders (linear), not the Hex field (sRGB), or the part comes out too bright.

**4.4 — Every mesh needs a UV map. No vertex colours, no tangents.**
The merge requires every mesh to carry *exactly* the same set of vertex
attributes. One object missing UVs and `mergeGeometries` returns `null` — the
whole ship disappears, silently, with the boxes left in its place. In the
export dialog: **UVs on, Normals on, Tangents OFF, Vertex Colors OFF.**

**4.5 — Leave every object's transform at identity; put position into the geometry.**
This one is subtle and cost real debugging. Blender is Z-up; glTF is Y-up.
Blender's exporter handles that by converting the vertex data *and* the node
transforms. Meanwhile the loader deliberately re-poses parts relative to the
root object — which cancels whatever transform the root carries. With
everything at identity, the axis conversion lives entirely in the vertex data,
survives that cancel, and comes out right. **Put a rotation on the `runabout`
empty and the ship arrives lying on its side.** The build script measured this
and refused it at 17× distortion.

Practically: model with the nose pointing toward **−Y** and up as **+Z** (the
normal Blender way — the nose faces you in Front view), and apply transforms
(`Ctrl+A → All Transforms`) before exporting.

**4.6 — Triangle budgets, and they differ.**
4000 for the ship (currently 3888). **900 per asset** for anything instanced —
settlements, creatures, clouds. 140 for a seam shard, which is drawn four times
per seam across kilometres of census. The build prints every count and shouts
when one goes over.

**4.7 — Colour means different things in different kits.**
*Ships*: the vertex colour IS the paint — author the real hull colours.
*Settlements and clouds*: it is a **multiplier** on a palette-derived family
colour, so author bodies near-white (they take the world's palette) and trim
dark (it reads as ironwork against it). *Crystal seams*: ignored entirely — the
material is one glow with a noise pulse, so only silhouette reaches the game.
Check what the call site's material does before picking a palette.

**4.8 — Animation lives in the shader, not in Blender.**
A rig cannot survive the merge — it flattens the hierarchy, so there is nothing
left to key — and a skinned mesh would give up instancing. So an animated kit
bakes a **motion mask** into a second UV set instead: `uv1 = (weight, phase)`
per part, where weight grades along the limb (a callable of vertex position, so
a wing bends from the shoulder instead of hinging like a door) and phase says
which limb it is (0 and 0.5 are an opposed pair — a gait, or a wingbeat). The
material's vertex stage reads that and does the moving. See `creatures.py` and
`animate()` in `Ecology.tsx`.

Once **any** part of a kit carries a mask, **every** part must — a rigid part is
weight 0, not absent, or the attribute sets differ and the merge returns null.
`build-ship.mjs` asserts `uv1` survived for that kit.

**4.9 — Low-end machines never load it.** On quality `low` the pack is skipped
entirely and the hand-built primitive fallback draws instead. That fallback
lives in the `.tsx` files and must keep working.

---

## 5. Why the build verifies itself

`build-ship.mjs` doesn't just run Blender. It loads the exported `.glb` in
Node, runs a **literal transcription of the game's `kitGeometry()`**, performs
the same box fit for every call site in its `ASSETS` registry, and asserts:

- every required name exists (they are an API, §4.1);
- every mesh has the same attributes, so the merge cannot return `null`;
- any attribute a kit *depends* on is present — `uv1` for the animated ones;
- a vehicle's forward part ends up on `+Z` (i.e. it is not backwards);
- triangle counts are under budget, per asset where the kit is instanced;
- the fit is near-uniform **where that means anything** — see §6.

It also prints the fitted coordinates of the three glowing bits — nav lamps,
beacon, engine exhausts — which are *not* part of the merged model (they need
to glow, and the merged hull shares one lit material). They are separate meshes
in `RunaboutExterior.tsx` and do **not** move when you change the hull. If you
reshape the ship, re-seat them using the numbers the build prints.

This is what caught the 17× orientation bug in §4.5, which looked completely
fine right up until it was measured.

---

## 6. Sizing: your model gets squashed into a box

Each place the ship appears fits it into a **fixed bounding box**, scaling each
axis independently:

| Where | Box (W × H × L) | Code |
|---|---|---|
| Chase camera | 1.52 × 0.38 × 1.64 | `RunaboutExterior.tsx` |
| Landed on a world | 1.42 × 0.42 × 1.55 | `SurfaceScene.tsx` |
| Cockpit prow (`hull-nose` only) | 0.058 × 0.02 × 0.13 | `RunaboutHull.tsx` |

So **absolute size in Blender is irrelevant** — build at whatever scale is
comfortable. But **proportions matter enormously**: the box fit stretches each
axis by a different amount, so if your model's shape doesn't match the box's
shape, it gets distorted.

All three boxes are roughly **0.92 wide : 0.25 tall : 1 long** — long, wide and
low. The runabout is authored to that ratio (14 m × 12.9 m × 3.5 m), which is
why it survives the fit at only 1.09× skew. `runabout.py`'s report prints how
far you have drifted; over 8% it warns.

These boxes were tuned against the flight-scale and collision work. Changing
them changes how big the ship *feels* — don't, casually.

---

## 7. Changing the ship

**Route A — in the GUI (fine for shape tweaks).**
Open `assets-source/uplift/blender/runabout.blend`, move things, then
`File → Export → glTF 2.0`, saving over
`public/assets/uplift/meshes/ships/runabout.glb`. Stock settings are correct —
the file is deliberately rigged so no unusual export options are needed. Check
Format `glTF Binary (.glb)`, and under Data: UVs and Normals on, Tangents and
Vertex Colors off. Then run:

```bash
node scripts/uplift/build-ship.mjs --verify
```

⚠️ Your GUI edits are **not** in `runabout.py`, so the next `npm run assets:ship`
overwrites them. Treat Route A as experimentation; fold anything you want to
keep back into the script.

**Route B — in the script (the durable way).**
Edit `runabout.py` and run `npm run assets:ship`. The script has small helpers
(`add_box`, `add_tube`, `add_loft`, `plate_profile`) so parts are a few lines
each. This is the reviewable route — a diff shows what changed about the ship,
which a binary `.blend` never can.

---

## 8. Adding a *new* asset — drop the file

`assets-source/uplift/models/` is a drop target. Put a `.glb`, `.gltf` or
`.blend` there — modelled in the Blender GUI, downloaded (CC0 low-poly packs —
Kenney, Quaternius — are exactly this art style), or generated — and run:

```bash
npm run assets:ship
```

Or leave the watcher running while you work, and *saving into the folder is
the whole workflow* — Blender's export dialog can point straight at it:

```bash
npm run assets:watch
```

That is the import. Automatically, per file:

- the **id** is the filename (`Big Rock.glb` → `big-rock`), and the asset
  ships to `meshes/imports/<id>.glb`;
- the **names** the game will ask for are the file's root nodes — and a lone
  root with a meaningless name (downloads arrive as `Armature.001`) is renamed
  to the id, so the filename you chose becomes the in-game name;
- the file is **normalized** — transforms baked to identity, missing UVs
  box-projected at the kit density, tangents/vertex-colours/rigs stripped,
  materials flattened to their base colour, the motion mask zero-filled on
  rigid parts — and **verified** through the game's own merge, against the
  900-triangle instanced budget;
- a sidecar **`<file>.import.json`** appears next to the model holding
  everything that was derived — commit it along with the model;
- the generated `src/ui/scene/uplift/importsManifest.ts` is updated, so the
  game **prefetches it with the rest of the pack**. No code edits.

Read the `WARN` lines in the build output: a model whose paint job was a
*texture* arrives one flat colour per material, and normalize cannot invent
the split for you.

**The sidecar is the override surface.** Edit it and rebuild:

| field | meaning |
|---|---|
| `names` | the node names the game asks for — the API (§4.1) |
| `rename` | `{ "from": "to" }`, applied before anything reads names |
| `perAsset` / `budget` | triangle ceiling: per-name (instanced), or whole-file |
| `sites` | call-site fit boxes once they exist, so drift is measured (§6) |
| `requireAttributes` | e.g. `["uv1"]` to assert an animated kit kept its mask |
| `prefetch` | `false` ships the file but keeps it out of the game's download |
| `glb` | override the shipped path |

**Showing it in the game** is the one step that stays human, because it is
design, not plumbing: `kitGeometryFit('meshes/imports/<id>.glb', '<name>',
fit)` wherever it should appear, drawn with a **shared** material — one per
family, never one per object (per-object materials link a fresh shader each,
which is what used to freeze this scene mid-flight) — and keep a primitive
fallback for quality `low` (§4.9).

`npm run assets:inspect -- <file>` prints any GLB's node tree, triangle
counts and material colours, useful before renaming or when a WARN needs
chasing.

Two honest limits. **Animation**: a motion mask (§4.8) is design, not repair —
an imported creature arrives rigid until someone authors `uv1`, in Blender or
in a script. **Paint**: only flat material colours survive; texture-painted
models need their materials split by colour first.

**The other two routes** still exist for assets that outgrow the defaults: a
manual `source:` entry in `ASSETS` (same machinery, but curated paths and fit
`sites` live in the registry with everyone else), and `script:` — how the six
original kits are built — for models that *are* code: parametric variants,
palettes shared with the game, reviewable diffs. Copy the shape of
`skimmer.py`; everything shared lives in `kitlib.py`.

---

## 9. Symptom → cause

| What you see | Almost certainly |
|---|---|
| Ship missing entirely; boxes instead | A mesh has no UV map, or has vertex colours/tangents — the merge returned `null`. (`source:` assets: normalize fixes this; if it still happens, the GLB skipped normalize) |
| Ship on its side or backwards | A non-identity transform on the root empty (§4.5) — auto-fixed for `source:` assets |
| Imported model is one flat colour | Its paint was a texture; normalize `WARN`ed when it stripped it — split the model into flat-coloured materials |
| Imported creature stands rigid | No motion mask — `uv1` must be authored (§4.8); normalize only zero-fills it |
| One part invisible | Renamed object, or it isn't parented under `runabout` |
| Everything one flat colour | All parts share a material — colour comes from *materials*, not from Blender vertex paint |
| Colours too bright/washed | sRGB hex used where linear was needed (§4.3) |
| Ship stretched or squashed | Authored proportions don't match the fit box (§6) |
| Nose part missing in cockpit only | `hull-nose` renamed |
| Nothing changed after export | Overwrote the wrong path, or the browser cached the old `.glb` — hard-reload |
