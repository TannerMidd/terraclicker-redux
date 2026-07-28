/**
 * The zero-config import layer: filenames become ids, files become registry
 * entries, sidecars override, roots name themselves, and the generated
 * manifest is deterministic. Discovery never opens the model files, so stub
 * files are enough here; the full read/repair path is normalize.test.mjs.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Document } from '@gltf-transform/core';
import { afterAll, describe, expect, it } from 'vitest';
import {
  deriveNames,
  discoverImports,
  importId,
  writeImportsManifest,
  writeSidecarIfMissing,
} from '../scripts/uplift/imports.mjs';

const tempDirs = [];
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'tc-imports-'));
  tempDirs.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('importId', () => {
  it('kebab-cases whatever the file is called', () => {
    expect(importId('person.glb')).toBe('person');
    expect(importId('Big Rock 02.blend')).toBe('big-rock-02');
    expect(importId('Thing.GLTF')).toBe('thing');
    expect(importId('weird__name!!.glb')).toBe('weird-name');
  });
});

describe('discoverImports', () => {
  it('turns dropped files into registry entries, sidecar overrides applied', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'person.glb'), '');
    writeFileSync(join(dir, 'Big Rock.glb'), '');
    writeFileSync(join(dir, 'README.md'), 'not a model');
    writeFileSync(
      join(dir, 'Big Rock.import.json'),
      JSON.stringify({ budget: 4000, prefetch: false, names: ['boulder'] }),
    );
    const entries = discoverImports(dir);
    expect(entries.map((e) => e.id)).toEqual(['big-rock', 'person']);

    const person = entries.find((e) => e.id === 'person');
    expect(person.glb).toBe('meshes/imports/person.glb');
    expect(person.names).toBeNull(); // derived on first build
    expect(person.perAsset).toBe(900);
    expect(person.prefetch).toBe(true);
    expect(person.sites).toEqual([]);

    const rock = entries.find((e) => e.id === 'big-rock');
    expect(rock.budget).toBe(4000);
    expect(rock.perAsset).toBeUndefined(); // a whole-asset budget replaces the instanced default
    expect(rock.prefetch).toBe(false);
    expect(rock.names).toEqual(['boulder']);
  });

  it('refuses two files that want the same id', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'Big Rock.glb'), '');
    writeFileSync(join(dir, 'big rock.blend'), '');
    expect(() => discoverImports(dir)).toThrow(/both want the id 'big-rock'/);
  });

  it('refuses a sidecar that is not JSON', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'person.glb'), '');
    writeFileSync(join(dir, 'person.import.json'), '{ not json');
    expect(() => discoverImports(dir)).toThrow(/not valid JSON/);
  });
});

describe('deriveNames', () => {
  function docWithRoots(...names) {
    const doc = new Document();
    const scene = doc.createScene('scene');
    for (const name of names) {
      scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name)));
    }
    return doc;
  }

  it("renames a lone root to the file's own id", () => {
    expect(deriveNames(docWithRoots('Armature.001'), 'person')).toEqual({
      names: ['person'],
      rename: { 'Armature.001': 'person' },
    });
  });

  it('keeps authored names when the file is a multi-asset kit', () => {
    expect(deriveNames(docWithRoots('grazer', 'flier'), 'creatures-two')).toEqual({
      names: ['grazer', 'flier'],
      rename: {},
    });
  });

  it('refuses a file with no meshes at all', () => {
    const doc = new Document();
    doc.createScene('scene').addChild(doc.createNode('empty'));
    expect(() => deriveNames(doc, 'empty')).toThrow(/no meshes/);
  });
});

describe('sidecar persistence', () => {
  it('writes the derived config once and never clobbers it', () => {
    const dir = tempDir();
    const asset = {
      id: 'person',
      sidecar: join(dir, 'person.import.json'),
      glb: 'meshes/imports/person.glb',
      perAsset: 900,
      prefetch: true,
    };
    const derived = { names: ['person'], rename: { 'Armature.001': 'person' } };
    expect(writeSidecarIfMissing(asset, derived)).toBe(true);
    const body = JSON.parse(readFileSync(asset.sidecar, 'utf8'));
    expect(body.names).toEqual(['person']);
    expect(body.rename).toEqual({ 'Armature.001': 'person' });
    expect(body.perAsset).toBe(900);
    writeFileSync(asset.sidecar, JSON.stringify({ names: ['edited'] }));
    expect(writeSidecarIfMissing(asset, derived)).toBe(false);
    expect(JSON.parse(readFileSync(asset.sidecar, 'utf8')).names).toEqual(['edited']);
  });
});

describe('writeImportsManifest', () => {
  it('emits a sorted, prefetch-only list and only rewrites on change', () => {
    const dir = tempDir();
    const path = join(dir, 'importsManifest.ts');
    const imports = [
      { glb: 'meshes/imports/zebra.glb', prefetch: true },
      { glb: 'meshes/imports/aardvark.glb', prefetch: true },
      { glb: 'meshes/imports/secret.glb', prefetch: false },
    ];
    expect(writeImportsManifest(imports, path)).toBe(true);
    const body = readFileSync(path, 'utf8');
    expect(body).toContain("  'meshes/imports/aardvark.glb',\n  'meshes/imports/zebra.glb',");
    expect(body).not.toContain('secret');
    expect(body).toContain('GENERATED');
    expect(writeImportsManifest(imports, path)).toBe(false); // unchanged — no dev-server churn
    expect(existsSync(path)).toBe(true);
  });
});
