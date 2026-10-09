import {
  beginLocalGenesis,
  resumeLocalGenesis,
  inspectLocalStartup,
  openLocalWorkspace,
  listLocalWorkspaces,
} from '@genesis';
import { openSlotIndex } from '@slot-index';
import { withExclusiveSlot, slotPermitName } from '@write-session';
import { createAdmittedEditor } from '@editor';
import '@styles';
const nativeDatabases = indexedDB.databases.bind(indexedDB);
let enumerationCalls = 0;
indexedDB.databases = () => {
  enumerationCalls++;
  throw Error('Forbidden database enumeration');
};
const entries = {},
  gates = new Map(),
  boundaries = new WeakMap(),
  events = [];
let fault,
  enrollment,
  workspace,
  editor,
  mounts = 0,
  controller;
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
const boundary = (store, value) => {
  if (store === 'entries' && value?.v === 1 && value.initial)
    return value.stage === 'custody' ? 'claim' : 'progress-' + value.stage;
  if (store === 'entries' && value?.v === 2 && value.state === 'creating')
    return value.seal_reserved ? 'reservation' : 'claim';
  if (store === 'entries' && value?.v === 2 && value.state === 'protected') return 'custody';
  if (store === 'entries' && value?.v === 1 && value.intent)
    return value.state === 'creating' ? 'witness' : 'witness-ready';
  if (store === 'meta' && value?.next_seq === 1) return 'counter';
  if (store === 'slots' && value?.local) return 'index';
};
for (const method of ['put', 'add']) {
  const native = IDBObjectStore.prototype[method];
  IDBObjectStore.prototype[method] = function (value, ...args) {
    const point = boundary(this.name, value);
    if (point) boundaries.set(this.transaction, point);
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
const complete = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
Object.defineProperty(IDBTransaction.prototype, 'oncomplete', {
  ...complete,
  set(fn) {
    complete.set.call(
      this,
      typeof fn !== 'function'
        ? fn
        : (event) => {
            const point = boundaries.get(this);
            if (point) events.push('committed:' + point);
            if (point && fault === 'hold-' + point) {
              fault = null;
              void gate(point).then(() => fn.call(this, event));
            } else fn.call(this, event);
          },
    );
  },
});
const sign = SubtleCrypto.prototype.sign;
SubtleCrypto.prototype.sign = async function (algorithm, key, data) {
  if (
    fault === 'hold-crypto' &&
    new TextDecoder().decode(data).includes('done/local-genesis-progress/v1')
  ) {
    fault = null;
    await gate('crypto');
  }
  return sign.call(this, algorithm, key, data);
};
const openDb = (name) =>
  new Promise((resolve, reject) => {
    const r = indexedDB.open(name);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
const transact = async (name, stores, fn) => {
  const db = await openDb(name);
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(stores, 'readwrite');
      let value;
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => reject(tx.error);
      fn(tx, (v) => {
        value = v;
      });
    });
  } finally {
    db.close();
  }
};
const inventory = async () => {
  const result = {};
  for (const d of (await nativeDatabases()).sort((a, b) => a.name.localeCompare(b.name))) {
    const db = await openDb(d.name);
    try {
      result[d.name] = await new Promise((resolve, reject) => {
        const names = [...db.objectStoreNames],
          tx = db.transaction(names),
          rows = {};
        for (const name of names) {
          rows[name] = [];
          const req = tx.objectStore(name).openCursor();
          req.onsuccess = () => {
            const c = req.result;
            if (c) {
              rows[name].push({ key: c.key, value: c.value });
              c.continue();
            }
          };
        }
        tx.oncomplete = () => resolve(rows);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }
  result.localStorage = Object.fromEntries(
    Object.keys(localStorage)
      .sort()
      .map((k) => [k, localStorage.getItem(k)]),
  );
  return JSON.parse(
    JSON.stringify(result, (_k, v) => (v instanceof Uint8Array ? Array.from(v) : v)),
  );
};
const claim = async (slot) =>
  transact('done.custody', ['entries'], (tx, result) => {
    const req = tx.objectStore('entries').get([slot, 'local-genesis-v1']);
    req.onsuccess = () => result(req.result);
  });
window.genesis = {
  snapshot: () => ({
    entries,
    gates: [...gates.keys()],
    events,
    mounts,
    enumerationCalls,
    text: editor?.view.state.doc.toString(),
  }),
  begin(slot = 'local-slot') {
    controller = new AbortController();
    enrollment = beginLocalGenesis(slot, { signal: controller.signal });
    return enrollment.displayCode;
  },
  confirm: (id, code) => track(id, () => enrollment.confirm(code)),
  resume: (id, slot, code) => track(id, () => resumeLocalGenesis(slot, code)),
  inspect: (slot = 'local-slot') => inspectLocalStartup(slot),
  list: (slot, code) => listLocalWorkspaces(slot, code),
  async open(id, slot, code) {
    track(id, async () => {
      const result = await openLocalWorkspace(slot, code, {
        identity: {
          id: 'genesis-human',
          actor: { kind: 'human', name: 'Local human', color: '#3f8fd6' },
          device: { id: 'local-device', name: 'fixture' },
        },
        today: () => '2026-09-08',
        validateReceive: () => {},
      });
      if (result.kind !== 'ready') return result;
      workspace = result.workspace;
      editor = createAdmittedEditor({
        parent: document.querySelector('#editor'),
        document: workspace.text({ kind: 'master' }),
      });
      mounts++;
      return { kind: 'ready', scope: result.scope, storeId: result.storeId };
    });
  },
  input: (id, text) =>
    track(id, () => workspace.text({ kind: 'master' }).input({ name: 'insert', text }).accepted),
  close: async () => {
    editor?.destroy();
    editor = undefined;
    await workspace?.close();
    workspace = undefined;
  },
  cancel: () => controller?.abort(),
  fault: (name) => {
    fault = name;
  },
  release: (name) => gates.get(name)?.(),
  barrier: (id, slot = 'local-slot') =>
    track(id, () => withExclusiveSlot(slot, () => 'exclusive-granted')),
  locks: () => navigator.locks.query(),
  lockName: (slot = 'local-slot') => slotPermitName(slot),
  inventory,
  claim,
  legacy: (id, slot, op) =>
    track(id, async () => {
      const index = await openSlotIndex();
      try {
        return await index[op](slot);
      } finally {
        index.close();
      }
    }),
  async damage(slot, mode) {
    const c = await claim(slot),
      key = [slot, c.initial.principal_id, c.initial.workspace_id];
    if (mode === 'missing-complete') {
      const inv = await inventory(),
        row = inv['done.slots'].slots.find((s) => s.key === slot).value;
      await new Promise((resolve, reject) => {
        const r = indexedDB.deleteDatabase(row.stores[0].dbName);
        r.onsuccess = resolve;
        r.onerror = reject;
      });
      await transact('done.slots', ['slots'], (tx) => tx.objectStore('slots').delete(slot));
      await transact('done.custody', ['entries'], (tx) =>
        tx.objectStore('entries').delete([...key, 'content-v1']),
      );
    } else if (mode === 'missing-custody')
      await transact('done.custody', ['entries'], (tx) => tx.objectStore('entries').delete(key));
    else if (mode === 'mac') {
      c.mac[0] ^= 1;
      await transact('done.custody', ['entries'], (tx) =>
        tx.objectStore('entries').put(c, [slot, 'local-genesis-v1']),
      );
    } else if (mode === 'progress') {
      c.stage = 'custody';
      await transact('done.custody', ['entries'], (tx) =>
        tx.objectStore('entries').put(c, [slot, 'local-genesis-v1']),
      );
    } else if (mode === 'unknown')
      await transact('done.custody', ['entries'], (tx) =>
        tx.objectStore('entries').put({ state: 'clearing' }, [...key, ['unknown']]),
      );
    else if (mode === 'closed')
      await transact('done.slots', ['slots'], (tx) => {
        const s = tx.objectStore('slots'),
          r = s.get(slot);
        r.onsuccess = () => s.put({ ...r.result, status: 'closed' });
      });
  },
};
