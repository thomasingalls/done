import { openWriteSession, withExclusiveSlot, slotPermitName } from '../../src/crdt/writeSession';
import { storageUpgradeKey } from '../../src/crdt/storageCompatibility';
import {
  beginLocalGenesis,
  listLocalWorkspaces,
  openLocalWorkspace,
} from '../../src/crdt/localGenesis';
import { prepareLocalClear } from '../../src/crdt/localClear';
import { openJournalSession } from '../../src/crdt/custody';
import { createDoc, encodeState } from '../../src/crdt/yjs';
const operations = {},
  writers = new Map(),
  gates = new Map(),
  aborts = new Map();
let initializations = 0,
  blocker;
const track = (id, fn) => {
  operations[id] = { state: 'pending' };
  void Promise.resolve()
    .then(fn)
    .then(
      (value) => {
        operations[id] = { state: 'resolved', value };
      },
      (error) => {
        operations[id] = { state: 'rejected', code: error.code, message: error.message };
      },
    );
};
const hold = (name) => new Promise((resolve) => gates.set(name, resolve));
const raw = async (fn) => {
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open('done.custody', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('entries');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('entries', 'readwrite');
      fn(tx.objectStore('entries'));
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
};
window.compat = {
  async seed() {
    const ceremony = beginLocalGenesis('local'),
      code = ceremony.displayCode;
    const receipt = await ceremony.confirm(code);
    return { code, scope: receipt.scope };
  },
  async open(id, code) {
    const [route] = await listLocalWorkspaces('local', code);
    const result = await openLocalWorkspace('local', code, {
      identity: {
        id: route.principal,
        actor: { kind: 'human', name: 'test', color: '#888888' },
        device: { id, name: id },
      },
      validateReceive() {
        throw Error('No network');
      },
      today: () => '2026-09-10',
    });
    if (result.kind !== 'ready') throw Error(result.kind);
    writers.set(id, result.workspace);
    return result.workspace.read().master;
  },
  async edit(id, text) {
    await writers.get(id).text({ kind: 'master' }).input({ name: 'insert', text }).accepted;
  },
  durable(id) {
    return writers.get(id).whenDurable();
  },
  async close(id) {
    await writers.get(id).close();
    writers.delete(id);
  },
  probe(id, slot = 'local', exclusive = false) {
    const controller = new AbortController();
    aborts.set(id, controller);
    track(id, async () => {
      const opts = {
        signal: controller.signal,
        initialize() {
          initializations++;
        },
        dispose() {},
      };
      if (exclusive) await withExclusiveSlot(slot, () => {}, opts);
      else await (await openWriteSession(slot, opts)).close();
    });
  },
  prepareClear(id, code) {
    track(id, () => prepareLocalClear('local', code));
  },
  cancel(id) {
    aborts.get(id).abort();
  },
  transition(value, pauseAfter = false) {
    track('transition', () =>
      withExclusiveSlot('local', async (task) => {
        operations['granted'] = { state: 'resolved' };
        await task.wait(() => raw((store) => store.put(value, storageUpgradeKey('local'))));
        operations['committed'] = { state: 'resolved' };
        if (pauseAfter) await task.wait(() => hold('after-commit'));
      }),
    );
  },
  // Test fixtures only: these edits do not implement or authorize production migration.
  marker(value, slot = 'local') {
    return raw((store) => store.put(value, storageUpgradeKey(slot)));
  },
  unmark() {
    return raw((store) => store.delete(storageUpgradeKey('local')));
  },
  async futureSchema(code, scope) {
    const owner = await openJournalSession(
      { ...scope, resolvePrincipal: () => scope.principalId },
      code,
    );
    const doc = createDoc();
    doc.getMap('meta').set('schemaVersion', 999);
    try {
      const result = owner.appendLocal(new Uint8Array(encodeState(doc)));
      if (result.status !== 'journalled') throw Error('Future schema did not reach journal');
    } finally {
      doc.destroy();
      await owner.close();
    }
  },
  async blockVersionUpgrade() {
    blocker = await new Promise((resolve) => {
      const r = indexedDB.open('done.custody');
      r.onsuccess = () => resolve(r.result);
    });
    blocker.onversionchange = () => {};
    track(
      'version-upgrade',
      () =>
        new Promise((resolve, reject) => {
          const r = indexedDB.open('done.custody', 2);
          r.onblocked = () => {
            operations['version-blocked'] = { state: 'resolved' };
          };
          r.onsuccess = () => {
            r.result.close();
            resolve();
          };
          r.onerror = () => reject(r.error);
        }),
    );
  },
  releaseBlocker() {
    blocker.close();
  },
  state() {
    return { operations, initializations, gates: [...gates.keys()] };
  },
  async locks() {
    const q = await navigator.locks.query();
    return {
      held: q.held.filter((x) => x.name === slotPermitName('local')),
      pending: q.pending.filter((x) => x.name === slotPermitName('local')),
    };
  },
  async census() {
    const all = [];
    for (const name of (await indexedDB.databases()).map((db) => db.name).sort()) {
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open(name);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      try {
        const stores = {};
        for (const name of db.objectStoreNames)
          stores[name] = await new Promise((resolve, reject) => {
            const tx = db.transaction(name),
              s = tx.objectStore(name),
              keys = s.getAllKeys(),
              values = s.getAll();
            tx.oncomplete = () => resolve([keys.result, values.result]);
            tx.onabort = () => reject(tx.error);
          });
        all.push({ name, version: db.version, stores });
      } finally {
        db.close();
      }
    }
    return JSON.stringify(
      { databases: all, local: Object.fromEntries(Object.entries(localStorage).sort()) },
      (_k, v) => (v instanceof Uint8Array ? [...v] : v),
    );
  },
};
