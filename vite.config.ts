import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import { precacheServiceWorker } from './vite/precacheServiceWorker.ts';

const commitMetadata = (): { version: string; date: string } => {
  try {
    const [version = 'unknown', date = 'unknown'] = execFileSync(
      'git',
      ['show', '-s', '--format=%h%n%cs', 'HEAD'],
      { encoding: 'utf8' },
    )
      .trim()
      .split('\n');
    return { version, date };
  } catch {
    return { version: 'unknown', date: 'unknown' };
  }
};

const commit = commitMetadata();

export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), precacheServiceWorker()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(commit.version),
    'import.meta.env.VITE_APP_COMMIT_DATE': JSON.stringify(commit.date),
  },
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
