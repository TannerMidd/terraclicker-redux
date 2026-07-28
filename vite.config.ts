import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@engine': fileURLToPath(new URL('./src/engine', import.meta.url)),
      '@content': fileURLToPath(new URL('./src/content', import.meta.url)),
      '@state': fileURLToPath(new URL('./src/state', import.meta.url)),
      '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
    },
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      // The headless harness parks browser profiles under .runtime; Chrome
      // holds their cookie stores locked, and a watcher that wanders in
      // takes the whole dev server down with EBUSY.
      ignored: ['**/.runtime/**', '**/shots/**'],
    },
  },
  test: {
    // .mjs tests exist for the node-side asset tooling (scripts/uplift), which
    // is plain JS and would otherwise fight the strict TS config.
    include: ['test/**/*.test.ts', 'test/**/*.test.mjs'],
    environment: 'node',
    // Long-horizon simulation tests (offline catch-up, megaprojects, the
    // Circular) legitimately run multi-second sims; on a two-core CI runner
    // under worker contention they brush past the default 5s and fail with
    // no regression anywhere. Twenty seconds is still tight enough to catch
    // a genuine hang.
    testTimeout: 20_000,
  },
});
