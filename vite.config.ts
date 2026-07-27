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
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
