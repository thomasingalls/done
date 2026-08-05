import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { precacheServiceWorker } from './vite/precacheServiceWorker.ts';

export default defineConfig({
  plugins: [react(), precacheServiceWorker()],
  build: {
    // The §12 budget is on the initial JS bundle; splitting it into many small
    // chunks would only hide the number the budget is about.
    target: 'es2022',
    sourcemap: true,
    // The budget check in scripts/check-budget.mjs is the real gate.
    chunkSizeWarningLimit: 900,
  },
  server: {
    host: true, // reachable from a phone on the same network, which Phase 1 exists to test
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  },
});
