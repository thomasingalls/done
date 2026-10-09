import { openWriteSession, withExclusiveSlot } from '../../src/crdt/writeSession';
import { Y } from '../../src/crdt/yjs';
import { LEGACY_STORE, openLocalStore } from '../../src/crdt/persistence';
import { database, key, reset, seed, source, summarize, transaction } from './fixture';

const nativeDatabases = indexedDB.databases.bind(indexedDB);
indexedDB.databases = () => {
  throw Error('Production may not enumerate databases');
};
const nativeTransaction = IDBDatabase.prototype.transaction;
const nativeCursor = IDBObjectStore.prototype.openCursor;
const nativeDigest = crypto.subtle.digest.bind(crypto.subtle);
let modes = [],
  fault = null,
  gated = false,
  pending = null,
  release = null,
  exclusive = null;
let oldDoc = null,
  oldStore = null;
IDBDatabase.prototype.transaction = function (stores, mode, ...args) {
  if (this.name === 'done') modes.push(mode ?? 'readonly');
  return nativeTransaction.call(this, stores, mode, ...args);
};
IDBObjectStore.prototype.openCursor = function (...args) {
  const request = nativeCursor.apply(this, args);
  if (
    this.name === 'updates' &&
    this.transaction.mode === 'readonly' &&
    ['abort', 'journal-change'].includes(fault)
  ) {
    const selected = fault;
    fault = null;
    request.addEventListener(
      'success',
      () => {
        if (selected === 'abort') this.transaction.abort();
        if (selected === 'journal-change') localStorage.setItem(key(99), '1:AAA=');
      },
      { once: true },
    );
  }
  return request;
};
crypto.subtle.digest = async (...args) => {
  const result = await nativeDigest(...args);
  if (fault === 'digest-gate') {
    fault = null;
    gated = true;
    await new Promise(() => {});
  }
  return result;
};
const inspect = async () => {
  const session = await openWriteSession('legacy-survey');
  modes = [];
  try {
    return { status: 'observed', value: await session.run(summarize), modes: [...modes] };
  } catch (error) {
    return {
      status: 'refused',
      reason: error.reason ?? error.code ?? error.name,
      modes: [...modes],
    };
  } finally {
    await session.close();
  }
};
const inventory = async () => {
  const names = (await nativeDatabases()).map((d) => d.name).sort();
  const local = Object.keys(localStorage)
    .sort()
    .map((k) => [k, localStorage.getItem(k)]);
  if (!names.includes('done')) return { names, local, rows: null };
  const db = await database();
  try {
    const tx = nativeTransaction.call(db, ['updates', 'custom'], 'readonly');
    const rows = {};
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
      for (const name of ['updates', 'custom']) {
        const entries = [];
        rows[name] = entries;
        const request = tx.objectStore(name).openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          entries.push([
            cursor.key,
            cursor.value instanceof Uint8Array ? [...cursor.value] : cursor.value,
          ]);
          cursor.continue();
        };
      }
    });
    return { names, local, rows };
  } finally {
    db.close();
  }
};
window.legacy = {
  seed,
  reset,
  inspect,
  inventory,
  source: () => source().updates,
  fault: (name) => {
    fault = name;
  },
  set: (k, v) => localStorage.setItem(k, v),
  custom: async () => {
    const db = await database();
    try {
      await transaction(db, (tx) => tx.objectStore('custom').put('private-custom', 'unexpected'));
    } finally {
      db.close();
    }
  },
  startRead: () => {
    gated = false;
    pending = inspect();
    void pending.catch(() => {});
  },
  gated: () => gated,
  holdExclusive: () => {
    exclusive = withExclusiveSlot('legacy-survey', async () => {
      gated = true;
      await new Promise((resolve) => {
        release = resolve;
      });
    });
  },
  release: async () => {
    release();
    await exclusive;
  },
  locks: () => navigator.locks.query(),
  startOldWriter: async () => {
    oldDoc = new Y.Doc();
    oldStore = openLocalStore(oldDoc, LEGACY_STORE);
    await oldStore.whenSynced;
    oldDoc.getText('legacy').insert(0, 'old');
    await oldStore.whenDurable();
  },
  oldWrite: async () => {
    oldDoc.getText('legacy').insert(3, '-after-exclusive');
    const journalled = Object.values(localStorage).some((v) => v.startsWith('1:'));
    await oldStore.whenDurable();
    return journalled;
  },
  stopOldWriter: () => {
    oldStore.destroy();
    oldDoc.destroy();
  },
};
