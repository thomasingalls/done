import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { accountTextMode } from './src/crdt/accountTextMode.ts';
import { accountLedgerMode } from './src/crdt/accountLedgerMode.ts';
import { accountBatchPolicy } from './src/crdt/accountBatchPolicy.ts';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import { precacheServiceWorker } from './vite/precacheServiceWorker.ts';

const commitMetadata = (): { version: string; date: string } => {
  // Container contexts exclude .git and all retained/private runtime data. Require
  // explicit provenance there; a local candidate may identify its uncommitted tree.
  const revision = process.env['APP_BUILD_REVISION'];
  const date = process.env['APP_BUILD_DATE'];
  if (revision !== undefined || date !== undefined) {
    if (
      !revision ||
      !/^[0-9a-f]{40}(?:-dirty)?$/.test(revision) ||
      !date ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date)
    )
      throw new Error('APP_BUILD_REVISION and APP_BUILD_DATE must identify the container source');
    return { version: revision.slice(0, 8) + (revision.endsWith('-dirty') ? '-dirty' : ''), date };
  }
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

const developmentTls = () => {
  if (process.env['DEV_HTTPS'] !== '1') return {};
  const cert = process.env['DEV_HTTPS_CERT'];
  const key = process.env['DEV_HTTPS_KEY'];
  if (!cert || !key) {
    throw new Error('DEV_HTTPS requires DEV_HTTPS_CERT and DEV_HTTPS_KEY');
  }

  return {
    https: {
      cert: readFileSync(cert),
      key: readFileSync(key),
    },
  };
};

const relayProxy = () => {
  // Tailscale Serve terminates TLS outside Vite. DEV_HTTPS is retained only
  // for the isolated HTTPS integration test, which also needs this proxy.
  if (process.env['DEV_RELAY_PROXY'] !== '1' && process.env['DEV_HTTPS'] !== '1') return {};

  const relayPort = Number(process.env['DEV_RELAY_PORT'] ?? 1234);
  if (!Number.isInteger(relayPort) || relayPort < 1 || relayPort > 65_535) {
    throw new Error('DEV_RELAY_PORT must be a TCP port');
  }

  return {
    proxy: {
      '/relay': {
        target: `ws://127.0.0.1:${relayPort}`,
        ws: true,
        // y-websocket appends /<room>?token=...; the relay expects that room
        // at the root rather than underneath the public /relay prefix.
        rewrite: (path: string): string => path.replace(/^\/relay/u, ''),
      },
    },
  };
};

export default defineConfig(({ mode }) => ({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), precacheServiceWorker()],
  define: {
    'import.meta.env.VITE_ACCOUNT_TEXT_ADMISSION': JSON.stringify(
      (() => {
        const value = loadEnv(mode, process.cwd(), 'VITE_ACCOUNT_TEXT_ADMISSION')[
          'VITE_ACCOUNT_TEXT_ADMISSION'
        ];
        accountTextMode(value);
        return value || 'direct';
      })(),
    ),
    'import.meta.env.VITE_ACCOUNT_BATCH': JSON.stringify(
      (() => {
        const value = loadEnv(mode, process.cwd(), 'VITE_ACCOUNT_BATCH')['VITE_ACCOUNT_BATCH'];
        accountBatchPolicy(value);
        return value || 'coordinated-2000';
      })(),
    ),
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(commit.version),
    'import.meta.env.VITE_APP_COMMIT_DATE': JSON.stringify(commit.date),
    'import.meta.env.VITE_ACCOUNT_LEDGER': JSON.stringify(
      accountLedgerMode(loadEnv(mode, process.cwd(), 'VITE_ACCOUNT_LEDGER')['VITE_ACCOUNT_LEDGER']),
    ),
  },
  build: {
    rollupOptions: { input: { app: 'index.html', local: 'local.html' } },
    // The §12 budget is on the initial JS bundle; splitting it into many small
    // chunks would only hide the number the budget is about.
    target: 'es2022',
    sourcemap: true,
    // The budget check in scripts/check-budget.mjs is the real gate.
    chunkSizeWarningLimit: 900,
  },
  server: {
    host: true, // reachable from a phone on the same network, which Phase 1 exists to test
    ...developmentTls(),
    ...relayProxy(),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx', 'vite/**/*.test.ts'],
  },
}));
