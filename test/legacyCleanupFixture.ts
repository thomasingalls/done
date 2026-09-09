// @vitest-environment node
import { afterEach, beforeEach, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { beginLegacyImport, resumeLegacyImport } from '../src/crdt/legacyImport';
import { captureLegacyExport } from '../src/crdt/legacyExport';
import { withExclusiveSlot } from '../src/crdt/writeSession';
import { seed } from './legacy-source/fixture';
import { makeExportSource } from './legacy-export/source';
// @ts-expect-error External Node ledger.
import { example } from '../scripts/legacy-export/oracle.mjs';
export const slot = 'cleanup-unit';
export const options = {
  identity: {
    id: 'test-human',
    actor: { kind: 'human' as const, name: 'Human', color: '#000000' },
    device: { id: 'test-device', name: 'Device' },
  },
  validateReceive: () => {},
  today: () => '2026-01-01',
};
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('location', { origin: 'https://seeded.example' });
  vi.stubGlobal('navigator', {
    locks: { request: async (_n: unknown, _o: unknown, fn: () => Promise<void>) => fn() },
  });
  const data = new Map<string, string>();
  vi.stubGlobal(
    'localStorage',
    new Proxy(
      {
        get length() {
          return data.size;
        },
        key: (i: number) => [...data.keys()][i] ?? null,
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => data.set(k, v),
        removeItem: (k: string) => data.delete(k),
        clear: () => data.clear(),
      },
      {
        ownKeys: () => [...data.keys()],
        getOwnPropertyDescriptor: (_t, key) =>
          data.has(String(key))
            ? { configurable: true, enumerable: true, value: data.get(String(key)) }
            : undefined,
      },
    ),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
export const setup = async (
  source = { ...example(), days: [] },
  complete = true,
  beforeCapture?: () => void,
) => {
  const old = makeExportSource(source);
  try {
    await seed([0], [1, 2], old.updates);
  } finally {
    old.doc.destroy();
  }
  beforeCapture?.();
  const capture = await withExclusiveSlot('capture', (task) =>
    captureLegacyExport(task, { preview: 'markdown-v1' }),
  );
  const input = {
    recovery: capture.recovery,
    recoveryDigest: capture.recoveryDigest,
    sourceOrigin: location.origin,
    sourceDigest: capture.sourceDigest,
    policy: 'markdown-system-v1' as const,
  };
  const ceremony = beginLegacyImport(slot, input, { maxSlices: 1 }),
    code = ceremony.displayCode!;
  let progress = await ceremony.confirm(code);
  while (complete && progress.stage !== 'imported')
    progress = await resumeLegacyImport(slot, code, input, { maxSlices: 32 });
  return { input, code, progress };
};
export const change = async (name: string, storeName: string, fn: (s: IDBObjectStore) => void) => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(name);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      fn(tx.objectStore(storeName));
    });
  } finally {
    db.close();
  }
};
