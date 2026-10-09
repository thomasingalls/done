import { captureLegacyExport, replayLegacyExport } from '../../src/crdt/legacyExport';
import { inspectLegacySource } from '../../src/crdt/legacySource';
import { openWriteSession } from '../../src/crdt/writeSession';

const run = async (fn) => {
  const owner = await openWriteSession('legacy-host-observation');
  try {
    return await owner.run(fn);
  } finally {
    await owner.close();
  }
};
const digest = async (bytes) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
const value = (item) => (item instanceof Uint8Array ? { bytes: [...item] } : item);
/** Independent carrier census: does not obtain expectations from the source reader's whitelist. */
const inventory = async () => {
  const databases = [];
  for (const info of (await indexedDB.databases()).sort((a, b) => a.name.localeCompare(b.name))) {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open(info.name);
      r.onupgradeneeded = () => {
        r.transaction.abort();
        reject(Error('inventory-created-database'));
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      const stores = [];
      for (const name of [...db.objectStoreNames]) {
        const rows = await new Promise((resolve, reject) => {
          const tx = db.transaction(name, 'readonly'),
            store = tx.objectStore(name),
            entries = [];
          tx.oncomplete = () => resolve(entries);
          tx.onabort = () => reject(tx.error);
          const r = store.openCursor();
          r.onsuccess = () => {
            const c = r.result;
            if (c) {
              entries.push([c.key, value(c.value)]);
              c.continue();
            }
          };
        });
        stores.push({ name, rows });
      }
      databases.push({ name: db.name, version: db.version, stores });
    } finally {
      db.close();
    }
  }
  const local = Object.keys(localStorage)
    .sort()
    .map((key) => [key, localStorage.getItem(key)]);
  const cacheRows = [];
  for (const name of (await caches.keys()).sort()) {
    const cache = await caches.open(name),
      entries = [];
    for (const request of (await cache.keys()).sort((a, b) => a.url.localeCompare(b.url))) {
      const response = await cache.match(request);
      entries.push([request.url, await digest(await response.arrayBuffer())]);
    }
    cacheRows.push({ name, entries });
  }
  const registrations = (await navigator.serviceWorker.getRegistrations())
    .map((r) => ({
      scope: r.scope,
      active: r.active?.scriptURL ?? null,
      waiting: r.waiting?.scriptURL ?? null,
      installing: r.installing?.scriptURL ?? null,
    }))
    .sort((a, b) => a.scope.localeCompare(b.scope));
  return { databases, local, caches: cacheRows, registrations };
};
const attempt = async (fn) => {
  try {
    return { status: 'ok', value: await fn() };
  } catch (error) {
    return { status: 'refused', reason: error.reason ?? error.message };
  }
};
window.hostFixture = {
  inventory,
  inspect: () =>
    run(async (task) => {
      const s = await inspectLegacySource(task);
      return { digest: s.digest, dependencies: s.dependencies };
    }),
  capture: () =>
    attempt(() =>
      run(async (task) => {
        const captured = await captureLegacyExport(task, { preview: 'markdown-v1' });
        return {
          bytes: [...captured.recovery],
          digest: captured.recoveryDigest,
          sourceDigest: captured.sourceDigest,
          origin: location.origin,
          policy: 'markdown-system-v1',
        };
      }),
    ),
  replay: (bytes, binding) =>
    attempt(async () => {
      if (binding.policy !== 'markdown-system-v1') throw Error('input-policy-mismatch');
      const replay = await replayLegacyExport(new Uint8Array(bytes), binding.digest);
      if (replay.origin !== binding.origin || replay.origin !== location.origin)
        throw Error('input-origin-mismatch');
      if (replay.sourceDigest !== binding.sourceDigest) throw Error('input-source-mismatch');
      return replay.entries;
    }),
  verifyCurrent: (bytes, binding) =>
    attempt(async () => {
      const replay = await replayLegacyExport(new Uint8Array(bytes), binding.digest);
      if (binding.policy !== 'markdown-system-v1') throw Error('input-policy-mismatch');
      if (replay.origin !== binding.origin || replay.origin !== location.origin)
        throw Error('input-origin-mismatch');
      if (replay.sourceDigest !== binding.sourceDigest) throw Error('input-source-mismatch');
      const current = await run((task) => inspectLegacySource(task));
      if (current.digest !== binding.sourceDigest) throw Error('source-changed');
      return replay.entries;
    }),
  lock: () => {
    let release;
    window.releaseHostLock = () => release();
    void navigator.locks.request(
      'done/slot-writer/"legacy-host-observation"',
      { mode: 'exclusive' },
      () =>
        new Promise((resolve) => {
          release = resolve;
          window.hostLockHeld = true;
        }),
    );
  },
};
