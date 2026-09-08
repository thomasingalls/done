import '../local-genesis/browser.mjs';
import { prepareLocalClear, clearLocalWorkspace, resumeLocalClear } from '@clear';
import { openJournalSession } from '@custody';
import { createDoc, encodeState } from '@yjs';
const entries = {},
  gates = new Map(),
  points = new WeakMap(),
  events = [],
  progress = [];
let target,
  fault,
  controller,
  blocker,
  directSession,
  decryptions = 0,
  removed = 0;
const gate = (name) =>
  new Promise((resolve) =>
    gates.set(name, () => {
      gates.delete(name);
      resolve();
    }),
  );
const track = (id, fn) => {
  entries[id] = { status: 'pending' };
  Promise.resolve()
    .then(fn)
    .then(
      (value) => {
        entries[id] = { status: 'resolved', value };
      },
      (e) => {
        entries[id] = {
          status: 'rejected',
          error: { code: e.code, disposition: e.disposition, message: e.message },
        };
      },
    );
};
const complete = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
Object.defineProperty(IDBTransaction.prototype, 'oncomplete', {
  ...complete,
  set(fn) {
    complete.set.call(
      this,
      typeof fn !== 'function'
        ? fn
        : (event) => {
            const point = points.get(this);
            if (point) events.push('commit:' + point);
            if (point && fault === 'hold-' + point) {
              fault = null;
              void gate(point).then(() => fn.call(this, event));
            } else fn.call(this, event);
          },
    );
  },
});
for (const method of ['add', 'put', 'delete']) {
  const native = IDBObjectStore.prototype[method];
  IDBObjectStore.prototype[method] = function (value, ...args) {
    const point =
      value?.kind === 'local-clear'
        ? value.stage === 'content'
          ? 'intent'
          : 'stage-' + value.stage
        : method === 'delete' && this.name === 'slots'
          ? 'index-delete'
          : undefined;
    if (point) points.set(this.transaction, point);
    const req = native.call(this, value, ...args);
    if (point && fault === 'abort-' + point) {
      fault = null;
      req.addEventListener('success', () => {
        events.push('abort-after-request:' + point);
        this.transaction.abort();
      });
    }
    return req;
  };
}
const deleteDatabase = indexedDB.deleteDatabase.bind(indexedDB);
indexedDB.deleteDatabase = (name) => {
  if (target?.dbName === name && fault === 'delete-error') {
    fault = null;
    throw new DOMException('Injected delete refusal', 'SecurityError');
  }
  const req = deleteDatabase(name);
  if (target?.dbName === name) {
    const descriptor = Object.getOwnPropertyDescriptor(IDBRequest.prototype, 'onsuccess');
    Object.defineProperty(req, 'onsuccess', {
      configurable: true,
      get() {
        return descriptor.get.call(req);
      },
      set(fn) {
        descriptor.set.call(
          req,
          typeof fn !== 'function'
            ? fn
            : (event) => {
                events.push('content-delete-success');
                if (fault === 'hold-content-delete') {
                  fault = null;
                  void gate('content-delete').then(() => fn.call(req, event));
                } else fn.call(req, event);
              },
        );
      },
    });
  }
  return req;
};
const remove = Storage.prototype.removeItem;
Storage.prototype.removeItem = function (key) {
  if (target && key.startsWith(`done.pending-update.${encodeURIComponent(target.dbName)}.`)) {
    if (fault === 'journal-error') throw Error('Injected journal deletion refusal');
    if (fault === 'journal-noop') return;
    removed++;
    const result = remove.call(this, key);
    events.push('journal-remove:' + removed);
    if (fault === 'journal-partial') {
      fault = null;
      throw Error('Stop after one native journal deletion');
    }
    return result;
  }
  return remove.call(this, key);
};
const decrypt = SubtleCrypto.prototype.decrypt;
SubtleCrypto.prototype.decrypt = function (...args) {
  decryptions++;
  return decrypt.apply(this, args);
};
const openDb = (name) =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(name);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
const modify = async (fn) => {
  const db = await openDb('done.custody');
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('entries', 'readwrite');
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
      fn(tx.objectStore('entries'));
    });
  } finally {
    db.close();
  }
};
window.clear = {
  snapshot: () => ({ entries, gates: [...gates.keys()], events, progress, decryptions, removed }),
  async prepare(code, slot = 'local-slot') {
    target = await prepareLocalClear(slot, code);
    return target;
  },
  start(id, code, selected = target) {
    controller = new AbortController();
    track(id, () =>
      clearLocalWorkspace(selected, code, {
        signal: controller.signal,
        onProgress: (p) => progress.push(p),
      }),
    );
  },
  resume(id, code, slot = 'local-slot') {
    controller = new AbortController();
    track(id, () =>
      resumeLocalClear(slot, code, {
        signal: controller.signal,
        onProgress: (p) => progress.push(p),
      }),
    );
  },
  async seedJournal(code, count = 3) {
    const scope = target;
    const session = await openJournalSession(
      { ...scope, resolvePrincipal: () => scope.principalId },
      code,
    );
    try {
      for (let i = 0; i < count; i++) {
        const doc = createDoc();
        try {
          doc.getText('master').insert(0, `encrypted-journal-${i}`);
          if (i === 0) await session.appendBatch([{ kind: 'update', bytes: encodeState(doc) }]);
          const result = session.appendLocal(encodeState(doc));
          if (result.status !== 'journalled') throw Error('Journal seed refused');
        } finally {
          doc.destroy();
        }
      }
    } finally {
      await session.close();
    }
  },
  blockContent: async () => {
    blocker = await openDb(target.dbName);
    blocker.onversionchange = () => events.push('blocker-versionchange');
  },
  unblock: () => {
    blocker?.close();
    blocker = undefined;
  },
  cancel: () => controller?.abort(),
  fault: (value) => {
    fault = value;
  },
  release: (name) => gates.get(name)?.(),
  lowOpen: (id, code, scope = target) => {
    decryptions = 0;
    track(id, async () => {
      directSession = await openJournalSession(
        { ...scope, resolvePrincipal: () => scope.principalId },
        code,
      );
      return directSession.state;
    });
  },
  lowClose: () => directSession?.close(),
  async damage(mode) {
    await modify((store) => {
      const key = [target.slotId, 'local-clear-v1'],
        req = store.get(key);
      req.onsuccess = () => {
        const r = req.result;
        if (mode === 'mac') r.mac[0] ^= 1;
        if (mode === 'target') r.target.dbName = 'done.' + 'ff'.repeat(16);
        if (mode === 'stage') r.stage = 'index';
        store.put(r, key);
      };
    });
  },
  addUnknown: () =>
    modify((store) => store.put({ wrapped: 'unknown' }, [target.slotId, 'unknown-reference'])),
  target: () => target,
  setTarget: (value) => {
    target = value;
  },
  async retained() {
    const result = {
      journal: Object.fromEntries(
        Object.keys(localStorage)
          .sort()
          .map((k) => [k, localStorage.getItem(k)]),
      ),
    };
    for (const [name, store] of [
      ['done.custody', 'entries'],
      ['done.slots', 'slots'],
    ]) {
      const d = await openDb(name);
      try {
        result[name] = await new Promise((resolve, reject) => {
          const tx = d.transaction(store),
            rows = [],
            r = tx.objectStore(store).openCursor();
          r.onsuccess = () => {
            const c = r.result;
            if (c) {
              rows.push({ key: c.key, value: c.value });
              c.continue();
            }
          };
          tx.oncomplete = () => resolve(rows);
          tx.onabort = () => reject(tx.error);
        });
      } finally {
        d.close();
      }
    }
    return JSON.parse(
      JSON.stringify(result, (_k, v) => (v instanceof Uint8Array ? Array.from(v) : v)),
    );
  },
};
