import { Y } from '../../src/crdt/yjs';
import { inspectLegacySource } from '../../src/crdt/legacySource';
import { captureLegacyExport, replayLegacyExport } from '../../src/crdt/legacyExport';
import { openWriteSession } from '../../src/crdt/writeSession';
import { database, seed, transaction } from '../legacy-source/fixture';
import { makeExportSource } from './source';
import { toBase64 } from 'lib0/buffer';
const enumerate = indexedDB.databases.bind(indexedDB);
indexedDB.databases = () => {
  throw Error('Production database enumeration');
};
let source = null,
  gateAt = 0,
  digestCount = 0,
  gate = false,
  pending = null,
  fault = null;
const nativeDigest = crypto.subtle.digest.bind(crypto.subtle);
crypto.subtle.digest = async (...args) => {
  const result = await nativeDigest(...args);
  digestCount++;
  if (gateAt && digestCount === gateAt) {
    gate = true;
    await new Promise(() => {});
  }
  if (fault === 'late-source' && digestCount === 2) {
    fault = null;
    localStorage.setItem('done.device', 'changed-during-capture');
  }
  return result;
};
const run = async (fn) => {
  const owner = await openWriteSession('legacy-export-observation');
  try {
    return await owner.run(fn);
  } finally {
    await owner.close();
  }
};
const inspect = () =>
  run(async (task) => {
    const observed = await inspectLegacySource(task);
    return {
      digest: observed.digest,
      dependencies: observed.dependencies,
      records: [
        ...observed.journal.map((r) => ['journal', r.key, toBase64(r.bytes)]),
        ...observed.updates.map((r) => ['disk', r.key, toBase64(r.bytes)]),
      ],
    };
  });
const capture = async () => {
  digestCount = 0;
  try {
    const value = await run((task) => captureLegacyExport(task, { preview: 'markdown-v1' }));
    return {
      status: 'candidate',
      ...value,
      recovery: [...value.recovery],
      markdown: [...value.markdown],
    };
  } catch (error) {
    return { status: 'refused', reason: error.reason ?? error.name };
  }
};
const inventory = async () => {
  const names = (await enumerate()).map((row) => row.name).sort();
  const local = Object.keys(localStorage)
    .sort()
    .map((k) => [k, localStorage.getItem(k)]);
  const cacheNames = await caches.keys();
  const workers = (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope);
  if (!names.includes('done')) return { names, local, rows: null, cacheNames, workers };
  const db = await database();
  const rows = [];
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['updates', 'custom'], 'readonly');
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
      for (const name of ['updates', 'custom']) {
        const request = tx.objectStore(name).openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          rows.push([
            name,
            cursor.key,
            cursor.value instanceof Uint8Array ? [...cursor.value] : cursor.value,
          ]);
          cursor.continue();
        };
      }
    });
  } finally {
    db.close();
  }
  return { names, local, rows, cacheNames, workers };
};
window.captureFixture = {
  prepare: async (input, disk = [0], wal = [1, 2]) => {
    source?.doc.destroy();
    source = makeExportSource(input);
    await seed(disk, wal, source.updates);
    return source.updates;
  },
  inventory,
  inspect,
  capture,
  replay: async (bytes, digest) => {
    try {
      return { status: 'replayed', ...(await replayLegacyExport(new Uint8Array(bytes), digest)) };
    } catch (error) {
      return { status: 'refused', reason: error.reason ?? error.name };
    }
  },
  startCapture: (at) => {
    gateAt = at;
    gate = false;
    pending = capture();
    void pending.catch(() => {});
  },
  gated: () => gate,
  fault: (kind) => {
    fault = kind;
  },
  mutate: async (kind) => {
    if (kind === 'text-array') {
      const doc = new Y.Doc();
      doc.getMap('meta').set('schemaVersion', 4);
      doc.getArray('master').insert(0, ['first', 'second']);
      await seed([0], [], [[...Y.encodeStateAsUpdate(doc)]]);
      doc.destroy();
      return;
    }
    if (kind === 'pending') {
      await seed([0], [2], source.updates);
      return;
    }
    if (kind === 'unreadable') {
      localStorage.setItem('done.pending-update.done.bad.0', '1:???');
      return;
    }
    if (kind === 'schema') source.doc.getMap('meta').set('schemaVersion', 99);
    if (kind === 'membership') source.doc.getMap('cardLocations').set('orphan', '2026-08-01:next');
    if (kind === 'path') source.doc.getMap('days').set('../../escape', new Y.Map());
    if (kind === 'unknown-root') source.doc.getText('unknown').insert(0, 'must not disappear');
    const db = await database();
    try {
      await transaction(db, (tx) => {
        tx.objectStore('updates').clear();
        tx.objectStore('updates').add(Y.encodeStateAsUpdate(source.doc));
      });
    } finally {
      db.close();
    }
  },
  oldWorker: async () => {
    const worker = new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' });
    await new Promise((resolve) => {
      worker.onmessage = () => resolve();
      worker.postMessage('ready');
    });
  },
  oldWrite: () => {
    let update;
    source.doc.on('update', (bytes) => {
      update = bytes;
    });
    source.doc.getText('master').insert(0, 'late-old-writer');
    localStorage.setItem('done.pending-update.done.old.0', '1:' + toBase64(update));
  },
  forbiddenFetch: async () => {
    try {
      await fetch('/test/legacy-export/old.html');
    } catch {
      /* controlled refusal */
    }
  },
  attemptWorker: () => new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' }),
};
