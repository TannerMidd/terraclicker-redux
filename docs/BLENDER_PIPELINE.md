# The Blender pipeline

How a 3D model gets from Blender into this game. Written for someone who has
not used Blender before; the runabout hull is the worked example throughout,
but the same path now carries the skimmer, the settlement kit, the wildlife,
the crystal seams and the cloud banks.

**A model does not need any Python to get in.** Anything that produces a
`.glb` — the Blender GUI, a CC0 asset pack, a generator — can be registered as
a `source:` asset, and the build repairs it to the rules below automatically.
That route is **§8**, and it is the default for new assets. The per-asset
Python scripts are how the six original kits are built and remain right for
models that really are code (parametric variants, palettes shared with the
game); everything in between is machinery both routes share.

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
| `assets-source/uplift/models/` | **Imported models go here** — `.blend` or `.glb`, no script needed (§8). |
| `scripts/uplift/normalize.mjs` | The repair pass for imported models: bakes transforms, generates UVs, strips what the merge refuses. |
| `scripts/uplift/blend-export.py` | The one generic `.blend → .glb` export used by every `source:` .blend. |
| `scripts/uplift/kit-contract.mjs` | The game's merge, transcribed for Node — what the build and the tests verify against. |
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

## 8. Adding a *new* asset — no code required

Any `.glb` works: modelled in the Blender GUI, downloaded (CC0 low-poly packs
— Kenney, Quaternius — are exactly this art style), or generated. A `.blend`
works too; the build exports it headless with the one generic
`blend-export.py`. You never write a Python file.

1. Put the file under `assets-source/uplift/models/`.
2. Look inside it:

   ```bash
   npm run assets:inspect -- assets-source/uplift/models/<thing>.glb
   ```

   This prints the node tree — triangles, attributes, material colours — and
   ends with the candidate names for step 3.
3. Register it in the `ASSETS` list in `scripts/uplift/build-ship.mjs`. The
   minimal entry:

   ```js
   {
     id: 'person',
     source: 'models/person.glb',           // or models/person.blend
     glb: 'meshes/props/person.glb',        // where it ships, under public/
     names: ['person'],                     // the node the game asks for — the API
     rename: { 'Armature.001': 'person' },  // teach a download that name (optional)
     budget: 900,                           // ≤900 if it will be instanced (§4.6)
   },
   ```

4. Build and prove it:

   ```bash
   node scripts/uplift/build-ship.mjs person
   ```

   The file is **normalized** — transforms baked to identity, missing UVs
   box-projected at the kit density, tangents/vertex-colours/rigs stripped,
   materials flattened to their base colour, the motion mask zero-filled on
   rigid parts — and then **verified** through the game's own merge, exactly
   like the scripted kits. Read the `WARN` lines: a model whose paint job was
   a *texture* arrives one flat colour per material, and normalize cannot
   invent the split for you.
5. Wire it in: `prefetchKit('meshes/props/<thing>.glb')` in `preloadUplift()`
   (`upliftAssets.ts`), draw with `kitGeometryFit(path, name, fit)` and a
   **shared** material — one per family, never one per object (per-object
   materials link a fresh shader each, which is what used to freeze this scene
   mid-flight). Keep a primitive fallback for quality `low` (§4.9), and add
   `sites` to the registry entry once the call site's fit box exists, so a
   drifting silhouette is measured instead of noticed on screen.

Two honest limits. **Animation**: a motion mask (§4.8) is design, not repair —
an imported creature arrives rigid until someone authors `uv1`, in Blender or
in a script. **Paint**: only flat material colours survive; texture-painted
models need their materials split by colour first.

**The procedural route** — `script:` instead of `source:`, how the six
original kits are built — is still the right tool when the model *is* code:
parametric variants, palettes shared with the game, reviewable diffs. Copy the
shape of `skimmer.py`; everything shared lives in `kitlib.py`.

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
