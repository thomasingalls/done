import '../legacy-selection/browser.mjs';
import { cleanupLegacySource } from '../../src/crdt/legacyCleanup';
import { readLocalClaim, localClaimKey } from '../../src/crdt/localGenesisRecord';
import { withExclusiveSlot } from '../../src/crdt/writeSession';
import {
  prepareLocalClear,
  clearLocalWorkspace,
  resumeLocalClear,
} from '../../src/crdt/localClear';
import { captureLegacyExport } from '../../src/crdt/legacyExport';
import { openJournalSession } from '../../src/crdt/custody';
import { Y } from '../../src/crdt/yjs';
const inherited = window.selectionFixture,
  slot = 'seeded-import';
let fault,
  trigger = false,
  gated = false,
  progress,
  held,
  aborter,
  running,
  settled = false,
  competing = false,
  competingRun;
let removal = 0;
const pause = async () => {
  gated = true;
  await new Promise(() => {});
};
const run = async (fn) => {
  try {
    const value = await fn();
    await new Promise((r) => setTimeout(r, 0));
    if (trigger) await pause();
    return { status: 'ok', value };
  } catch (e) {
    return { status: 'refused', reason: e.reason ?? e.disposition?.reason ?? e.code ?? e.name };
  }
};
const decode = (input) => ({ ...input, recovery: new Uint8Array(input.recovery) });
const nativePut = IDBObjectStore.prototype.put;
IDBObjectStore.prototype.put = function (value, key) {
  const req = nativePut.call(this, value, key),
    tx = this.transaction;
  if (this.name === 'entries' && key?.[1] === 'local-genesis-v1' && value.sourceCleanup) {
    const n = value.sourceCleanup.next;
    if (fault === `abort-${n}`) {
      fault = null;
      req.addEventListener('success', () => tx.abort(), { once: true });
    }
    if (fault === `kill-progress-${n}`)
      tx.addEventListener(
        'complete',
        () => {
          trigger = true;
        },
        { once: true },
      );
    if (fault === 'change-after-intent' && n === 0)
      tx.addEventListener(
        'complete',
        () => {
          localStorage.setItem('done.actor', 'changed-after-intent');
          fault = null;
        },
        { once: true },
      );
  }
  if (
    this.name === 'entries' &&
    key?.[1] === 'local-clear-v1' &&
    fault === `kill-clear-${value.stage}`
  )
    tx.addEventListener(
      'complete',
      () => {
        trigger = true;
      },
      { once: true },
    );
  return req;
};
const nativeDelete = indexedDB.deleteDatabase.bind(indexedDB);
indexedDB.deleteDatabase = function (name) {
  const req = nativeDelete(name);
  if (name === 'done' && fault === 'kill-database')
    req.addEventListener(
      'success',
      () => {
        trigger = true;
      },
      { once: true },
    );
  return req;
};
const nativeRemove = Storage.prototype.removeItem;
Storage.prototype.removeItem = function (key) {
  const isSource =
    key.startsWith('done.pending-update.done.fixture.') ||
    ['done.actor', 'done.device', 'done.sync', 'done.sync.last'].includes(key);
  if (isSource && fault === 'remove-refused') {
    fault = null;
    return;
  }
  if (isSource && fault === 'remove-throws') {
    fault = null;
    throw new DOMException('Injected storage denial', 'SecurityError');
  }
  const value = nativeRemove.call(this, key);
  if (isSource) {
    if (fault === `kill-remove-${removal}`) trigger = true;
    removal++;
  }
  return value;
};
for (const method of ['encrypt', 'decrypt', 'sign', 'verify', 'digest']) {
  const native = crypto.subtle[method].bind(crypto.subtle);
  crypto.subtle[method] = async (...args) => {
    if (trigger) await pause();
    return native(...args);
  };
}
const cleanup = (code, input, signal) =>
  cleanupLegacySource(slot, code, decode(input), {
    signal,
    onProgress: (p) => {
      progress = p;
      if (fault === 'terminal-observer-change' && p.next === p.total)
        localStorage.setItem('done.actor', 'observer-reappearance');
    },
  });
const mutateClaim = async (fn) => {
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open('done.custody');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('entries', 'readwrite'),
        s = tx.objectStore('entries'),
        r = s.get(localClaimKey(slot));
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
      r.onsuccess = () => {
        fn(r.result);
        s.put(r.result, localClaimKey(slot));
      };
    });
  } finally {
    db.close();
  }
};
window.cleanupFixture = {
  ...inherited,
  prepare: async (s) => {
    await inherited.prepare(s);
    localStorage.setItem('done.sync.last', 'private-last-sync');
    if (s.keySize) {
      const key = 'done.pending-update.done.fixture.0',
        value = localStorage.getItem(key);
      nativeRemove.call(localStorage, key);
      localStorage.setItem('done.pending-update.done.' + 'x'.repeat(s.keySize) + '.0', value);
    }
    if (s.noDatabase)
      await new Promise((resolve, reject) => {
        const r = nativeDelete('done');
        r.onsuccess = resolve;
        r.onerror = () => reject(r.error);
      });
    const r = await withExclusiveSlot('capture', (task) =>
      captureLegacyExport(task, { preview: 'markdown-v1' }),
    );
    return {
      recovery: [...r.recovery],
      recoveryDigest: r.recoveryDigest,
      sourceOrigin: location.origin,
      sourceDigest: r.sourceDigest,
      policy: 'markdown-system-v1',
    };
  },
  clean: (code, input) => run(() => cleanup(code, input)),
  raceClean: (code, input) => Promise.all([1, 2].map(() => run(() => cleanup(code, input)))),
  fault: (value) => {
    fault = value;
    trigger = false;
    gated = false;
    removal = 0;
  },
  gated: () => gated,
  progress: () => progress,
  claim: () => withExclusiveSlot(slot, (task) => readLocalClaim(task, slot)),
  setLocal: (key, value) =>
    value === null ? nativeRemove.call(localStorage, key) : localStorage.setItem(key, value),
  tamper: (kind) =>
    mutateClaim((c) => {
      if (kind === 'cursor') c.sourceCleanup.next++;
      if (kind === 'strip') delete c.sourceCleanup;
      if (kind === 'digest') c.sourceCleanup.entries[0].digest = '0'.repeat(64);
    }),
  clearAll: (code) =>
    run(async () => clearLocalWorkspace(await prepareLocalClear(slot, code), code)),
  resumeClear: (code) => run(() => resumeLocalClear(slot, code)),
  journalEdit: (code, text, pending = false) =>
    run(async () => {
      const c = await withExclusiveSlot(slot, (task) => readLocalClaim(task, slot));
      const authority = {
        slotId: slot,
        workspaceId: c.initial.workspace_id,
        resolvePrincipal: async () => c.initial.principal_id,
      };
      const owner = await openJournalSession(authority, code),
        doc = new Y.Doc();
      try {
        if (pending) doc.getText('master').insert(0, 'missing-dependency');
        else
          for (const r of await owner.loadRecords()) {
            Y.applyUpdate(doc, r.bytes);
            r.bytes.fill(0);
          }
        const vector = Y.encodeStateVector(doc);
        doc.getText('master').insert(0, text);
        const r = owner.appendLocal(new Uint8Array(Y.encodeStateAsUpdate(doc, vector)));
        if (r.status !== 'journalled') throw Error('Fixture journal refused');
        return r;
      } finally {
        doc.destroy();
        await owner.close();
      }
    }),
  compact: (code) =>
    run(async () => {
      const c = await withExclusiveSlot(slot, (task) => readLocalClaim(task, slot));
      const owner = await openJournalSession(
        {
          slotId: slot,
          workspaceId: c.initial.workspace_id,
          resolvePrincipal: async () => c.initial.principal_id,
        },
        code,
      );
      try {
        await owner.flushJournal();
        return await owner.compactContent();
      } finally {
        await owner.close();
      }
    }),
  holdSource: async () => {
    held = await new Promise((resolve, reject) => {
      const r = indexedDB.open('done');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  },
  releaseSource: () => {
    held?.close();
    held = null;
  },
  startBlocked: (code, input) => {
    aborter = new AbortController();
    settled = false;
    running = run(() => cleanup(code, input, aborter.signal)).then((r) => {
      settled = true;
      return r;
    });
  },
  abort: () => aborter.abort(),
  startCompeting: () => {
    competing = false;
    competingRun = withExclusiveSlot(slot, () => {
      competing = true;
    });
  },
  status: () => ({ settled, competing, progress }),
  finishBlocked: async () => {
    const r = await running;
    await competingRun;
    return r;
  },
};
