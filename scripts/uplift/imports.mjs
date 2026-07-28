/**
 * Zero-config imports: every model file in assets-source/uplift/models/ IS a
 * registered asset. Nobody edits build-ship's ASSETS for these — drop the
 * file, run `npm run assets:ship` (or leave `npm run assets:watch` running),
 * and it is normalized, verified, shipped, and prefetched by the game.
 *
 * Everything is derived, and everything derived is written to a sidecar —
 * `<file>.import.json` next to the model — the first time the asset is built:
 *
 *   id      the filename, kebab-cased            person.glb  -> person
 *   glb     meshes/imports/<id>.glb              its own namespace, no clashes
 *   names   the file's root nodes; a lone root with the wrong name is renamed
 *           to the id automatically (downloads arrive as 'Armature.001')
 *   budget  900 per asset — the instanced ceiling, the strictest default
 *   prefetch true — the game downloads it with the rest of the pack
 *
 * The sidecar is the override surface: edit it to set a different budget, a
 * rename map, fit-box `sites`, `requireAttributes: ["uv1"]`, or
 * `prefetch: false`. It is data, not code, and it is committed.
 *
 * The game learns about imports through ONE generated file,
 * src/ui/scene/uplift/importsManifest.ts, so no TSX changes are needed to get
 * a model downloading. Drawing it somewhere is still a design decision —
 * kitGeometryFit(glb, name, fit) wherever it should appear.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PUBLIC_ROOT, ROOT, SOURCE_ROOT } from './helpers.mjs';
import { createIO, findRoots } from './normalize.mjs';

export const MODELS_ROOT = resolve(SOURCE_ROOT, 'models');
export const MANIFEST_PATH = resolve(ROOT, 'src', 'ui', 'scene', 'uplift', 'importsManifest.ts');
export const MODEL_EXTENSIONS = /\.(glb|gltf|blend)$/i;

/** person.glb -> person; "Big Rock 02.blend" -> big-rock-02. */
export function importId(file) {
  return file
    .replace(MODEL_EXTENSIONS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function modelFiles(dir = MODELS_ROOT) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => MODEL_EXTENSIONS.test(f)).sort();
}

export function sidecarPath(file, dir = MODELS_ROOT) {
  return resolve(dir, `${file.replace(MODEL_EXTENSIONS, '')}.import.json`);
}

function readSidecar(path) {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`${path} is not valid JSON: ${err.message}`);
  }
}

/**
 * Every model file as a registry entry, sidecar overrides applied. `names`
 * stays null until first build derives it (a .blend cannot be read without
 * exporting first, so derivation happens on the exported document).
 */
export function discoverImports(dir = MODELS_ROOT) {
  const entries = [];
  const ids = new Map();
  for (const file of modelFiles(dir)) {
    const id = importId(file);
    if (!id) throw new Error(`cannot derive an id from '${file}' — rename the file`);
    if (ids.has(id)) {
      throw new Error(`'${file}' and '${ids.get(id)}' both want the id '${id}' — rename one`);
    }
    ids.set(id, file);
    const sidecar = sidecarPath(file, dir);
    const sc = readSidecar(sidecar);
    entries.push({
      id,
      imported: true,
      sidecar,
      source: `models/${file}`,
      glb: sc.glb ?? `meshes/imports/${id}.glb`,
      names: sc.names ?? null,
      rename: sc.rename ?? undefined,
      budget: sc.budget ?? undefined,
      perAsset: sc.perAsset ?? (sc.budget ? undefined : 900),
      sites: sc.sites ?? [],
      requireAttributes: sc.requireAttributes ?? undefined,
      optional: sc.optional ?? undefined,
      prefetch: sc.prefetch ?? true,
      skewLimit: sc.skewLimit ?? null,
    });
  }
  return entries;
}

/**
 * What the game will call this file's contents. A single root whose name is
 * not the id gets renamed TO the id — downloads arrive as 'Armature.001', and
 * the file's own name is the only name the person dropping it actually chose.
 * Multi-root files are kits; their authored names stand.
 */
export function deriveNames(doc, id) {
  const roots = findRoots(doc);
  if (roots.length === 0) throw new Error(`no meshes found — nothing to import`);
  if (roots.length === 1 && roots[0] !== id) {
    return { names: [id], rename: { [roots[0]]: id } };
  }
  return { names: roots, rename: {} };
}

/**
 * Persist the derived config so the next run (and the next dev) sees it.
 * Never overwrites — the sidecar is the user's override surface.
 */
export function writeSidecarIfMissing(asset, derived) {
  if (existsSync(asset.sidecar)) return false;
  const body = {
    about: 'Overrides for this import — see docs/BLENDER_PIPELINE.md §8. Derived on first build; edit freely.',
    glb: asset.glb,
    names: derived.names,
    ...(Object.keys(derived.rename).length ? { rename: derived.rename } : {}),
    perAsset: asset.perAsset,
    prefetch: asset.prefetch,
    sites: [],
  };
  writeFileSync(asset.sidecar, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  return true;
}

/** Verify-only runs need names without a build: read them off the shipped GLB. */
export async function namesFromShipped(asset) {
  const shipped = resolve(PUBLIC_ROOT, asset.glb);
  if (!existsSync(shipped)) {
    throw new Error(`${asset.id}: never built — run \`node scripts/uplift/build-ship.mjs ${asset.id}\` first`);
  }
  return findRoots(await createIO().read(shipped));
}

/**
 * The one file the game reads. Deterministic and only rewritten on change, so
 * a watch loop does not spin the dev server.
 */
export function writeImportsManifest(imports, path = MANIFEST_PATH) {
  const kits = imports
    .filter((a) => a.prefetch)
    .map((a) => a.glb)
    .sort();
  const body = [
    '// GENERATED by scripts/uplift/build-ship.mjs from assets-source/uplift/models/.',
    '// Do not edit — drop or remove model files (and their .import.json) instead.',
    'export const IMPORTED_KITS: ReadonlyArray<string> = [',
    ...kits.map((k) => `  '${k}',`),
    '];',
    '',
  ].join('\n');
  if (existsSync(path) && readFileSync(path, 'utf8') === body) return false;
  writeFileSync(path, body, 'utf8');
  return true;
}
