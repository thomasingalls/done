import { expect, type Page } from '@playwright/test';
import { build, type Plugin } from 'vite';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { credentials, restoreAuthenticator } from '../packaged-account/devices';
import { startApplication, stopProcess, type startService } from '../packaged-account/server';
import type { AdmittedWorkspace } from '../../src/crdt/admittedWorkspace';

export type RolloutOwner = {
  dbName: string;
  workspace: Pick<AdmittedWorkspace, 'status' | 'whenDurable' | 'command'>;
  removeLocalHistory?: (revision: number) => Promise<{ kind: string }>;
};
export const writerFlags = {
  'import.meta.env.VITE_ACCOUNT_BASELINE_INSTALL': JSON.stringify('1'),
  'import.meta.env.VITE_ACCOUNT_BASELINE_READ': JSON.stringify('1'),
  'import.meta.env.VITE_ACCOUNT_RETENTION': JSON.stringify('1'),
};
export function rolloutOwnerProbe(): Plugin {
  let hits = 0;
  return {
    name: 'rollout-owner-observation',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/crdt/accountReceive.ts')) return;
      const at = '  clearAccountTransition(result.accountId);';
      if (code.split(at).length !== 2) throw Error('Owner probe moved');
      hits++;
      return code.replace(
        at,
        at + '\n  globalThis.__rolloutOwner = result; globalThis.__baselineOwner = result;',
      );
    },
    buildEnd(error) {
      if (!error && hits !== 1) throw Error('Missing owner observation');
    },
  };
}
export async function rolloutBuild(
  dir: string,
  mode: 'reader' | 'writer' | 'old',
  extra: Plugin[] = [],
) {
  // Freeze the predecessor's affected runtime paths, not a rewritten mock parser. All other
  // application sources are unchanged in this phase. No legacy source is shipped in the product.
  const previous = new Map(
    mode === 'old'
      ? [
          'accountCapture',
          'accountCatchup',
          'accountReceive',
          'accountRotation',
          'accountStartup',
          'contentStore',
          'joinedAccount',
          'localGenesisStorage',
          'membershipSource',
        ].map((file) => [
          file + '.ts',
          execFileSync('git', ['show', 'e2e5337a:src/crdt/' + file + '.ts'], { encoding: 'utf8' }),
        ])
      : [],
  );
  await build({
    logLevel: 'error',
    build: { outDir: resolve(dir) },
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify('retention-' + mode),
      ...(mode === 'writer' ? writerFlags : {}),
      ...(mode === 'old'
        ? Object.fromEntries(Object.keys(writerFlags).map((k) => [k, JSON.stringify('0')]))
        : {}),
    },
    plugins: [
      {
        name: 'rollout-build-identity',
        transformIndexHtml() {
          return [
            {
              tag: 'meta',
              attrs: { name: 'rollout-build', content: 'retention-' + mode },
              injectTo: 'head',
            },
          ];
        },
      },
      ...(mode === 'old'
        ? [
            {
              name: 'predecessor-runtime',
              enforce: 'pre' as const,
              transform(_code: string, id: string) {
                // Observe refusal constructors without changing their control flow or messages.
                if (id.endsWith('/src/crdt/startupState.ts'))
                  return _code.replace(
                    'super(disposition.reason);',
                    'super(disposition.reason); globalThis.__rolloutRefusal = disposition.reason;',
                  );
                if (id.endsWith('/src/crdt/storageCompatibility.ts'))
                  return _code.replace(
                    'super(message);',
                    'super(message); globalThis.__rolloutRefusal = "app-update-required";',
                  );
                if (!id.includes('/src/crdt/')) return;
                return previous.get(id.split('/').at(-1)!);
              },
            },
          ]
        : []),
      rolloutOwnerProbe(),
      ...extra,
    ],
  });
}
export async function noConversion(p: Page) {
  expect(
    await p.evaluate(() => {
      const owner = (globalThis as unknown as { __rolloutOwner: RolloutOwner }).__rolloutOwner;
      return [
        'installLocalBaseline',
        'replaceLocalBaseline',
        'advanceLocalRetention',
        'dryRunLocalRetention',
        'removeLocalHistory',
      ].filter((key) => key in owner);
    }),
  ).toEqual([]);
}
export type RolloutDevice = {
  page: Page;
  auth: Parameters<typeof credentials>[0];
  code: string;
  joined: boolean;
};
/** Exercise the ordinary waiting-service-worker path; keep IndexedDB/localStorage intact. */
export async function switchApplication(
  service: Awaited<ReturnType<typeof startService>>,
  dir: string,
  devices: RolloutDevice[],
  version: string,
) {
  for (const d of devices) {
    if (await d.page.locator('.shell').count())
      await d.page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await d.page.goto('/');
    expect(await d.page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  }
  await stopProcess(service.app);
  service.app = await startApplication(resolve(dir));
  for (const d of devices) {
    await d.page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update());
    await expect
      .poll(() =>
        d.page.evaluate(
          async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state,
        ),
      )
      .toBe('installed');
  }
  for (const d of devices) {
    const saved = await credentials(d.auth),
      context = d.page.context();
    await d.page.close();
    d.page = await context.newPage();
    d.auth = await restoreAuthenticator(d.page, saved);
    await d.page.goto('/');
    await expect(d.page.locator('meta[name=rollout-build]')).toHaveAttribute('content', version);
  }
}
export async function disk(p: Page, name?: string) {
  return p.evaluate(async (name) => {
    const dbName =
      name ?? (globalThis as unknown as { __rolloutOwner: RolloutOwner }).__rolloutOwner.dbName;
    const db = await new Promise<IDBDatabase>((yes, no) => {
      const r = indexedDB.open(dbName);
      r.onsuccess = () => yes(r.result);
      r.onerror = () => no(r.error);
    });
    try {
      return await new Promise<{
        name: string;
        journal: [string, string | null][];
        stores: Record<string, [IDBValidKey[], unknown[]]>;
      }>((yes, no) => {
        const names = ['meta', 'content', 'heads', 'outbound'],
          stores: Record<string, [IDBValidKey[], unknown[]]> = {};
        const tx = db.transaction(names, 'readonly');
        for (const name of names) {
          const store = tx.objectStore(name),
            keys = store.getAllKeys(),
            values = store.getAll();
          values.onsuccess = () => {
            stores[name] = [keys.result, values.result];
          };
        }
        tx.oncomplete = () =>
          yes(
            JSON.parse(
              JSON.stringify(
                {
                  name: dbName,
                  stores,
                  journal: Object.keys(localStorage)
                    .filter((key) =>
                      key.startsWith(`done.pending-update.${encodeURIComponent(dbName)}.`),
                    )
                    .sort()
                    .map((key) => [key, localStorage.getItem(key)]),
                },
                (_k, v) => (v instanceof Uint8Array ? [...v] : v),
              ),
            ),
          );
        tx.onabort = () => no(tx.error);
      });
    } finally {
      db.close();
    }
  }, name);
}
export const metadata = (snapshot: Awaited<ReturnType<typeof disk>>) => {
  const [keys, values] = snapshot.stores['meta']!;
  const counter = values[keys.indexOf('counter')] as {
    v: number;
    baseline?: { revision: number; journalEra: unknown };
  };
  return { counter, chunks: keys.map((k, i) => [k, values[i]]).filter(([k]) => Array.isArray(k)) };
};
