import { beginCustodyEnrollment, initializeContentStore, openContentSession } from '@custody';
import {
  fields,
  hex,
  hkdf,
  normalizeDeviceCode,
  openFactor,
  openEnvelope,
  utf8,
} from '@custody-crypto';
import { counterPayload } from '@content-record';
import { withExclusiveSlot } from '@write-session';
import * as Y from 'yjs';

const scope = {
  slotId: 'content-slot',
  principalId: 'content-principal',
  workspaceId: 'content-workspace',
};
const authority = { ...scope, resolvePrincipal: () => scope.principalId };
const entries = {},
  sessions = new Map(),
  gates = new Map(),
  events = [];
let saved;
let fault = null,
  encryptions = 0;
const rawSubtle = {
  encrypt: crypto.subtle.encrypt.bind(crypto.subtle),
  sign: crypto.subtle.sign.bind(crypto.subtle),
};
const gate = async (name) => {
  let release;
  const wait = new Promise((r) => {
    release = r;
  });
  gates.set(name, release);
  await wait;
  gates.delete(name);
};
const track = (id, fn) => {
  entries[id] = { status: 'pending' };
  void Promise.resolve()
    .then(fn)
    .then(
      (value) => {
        entries[id] = { status: 'resolved', value };
      },
      (error) => {
        entries[id] = {
          status: 'rejected',
          error: { code: error.code ?? error.name, message: error.message },
        };
      },
    );
};
const name = async () =>
  'done.' +
  hex(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        fields('done/store-name/v1', scope.principalId, scope.workspaceId),
      ),
    ).subarray(0, 16),
  );
const rawDb = (name) =>
  new Promise((resolve, reject) => {
    const r = indexedDB.open(name);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
const raw = async (dbName, stores, mode, fn) => {
  const db = await rawDb(dbName);
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let value;
      fn(tx, (v) => {
        value = v;
      });
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
};
const read = async (dbName, store, key) =>
  raw(dbName, [store], 'readonly', (tx, result) => {
    const r = tx.objectStore(store).get(key);
    r.onsuccess = () => result(r.result ?? null);
  });
const put = async (dbName, store, key, value) =>
  raw(dbName, [store], 'readwrite', (tx) => {
    if (value === null) tx.objectStore(store).delete(key);
    else tx.objectStore(store).put(value, key);
  });
const custody = () =>
  read('done.custody', 'entries', [scope.slotId, scope.principalId, scope.workspaceId]);
const witness = () =>
  read('done.custody', 'entries', [
    scope.slotId,
    scope.principalId,
    scope.workspaceId,
    'content-v1',
  ]);
const counter = async () => read(await name(), 'meta', 'counter');
const inventory = async () => {
  const db = await rawDb(await name());
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction([...db.objectStoreNames]);
      const rows = {};
      for (const store of db.objectStoreNames) {
        rows[store] = [];
        const r = tx.objectStore(store).openCursor();
        r.onsuccess = () => {
          const c = r.result;
          if (c) {
            rows[store].push({ key: c.key, value: c.value });
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
};
const checkCreation = (_task, _scope, intent, mode) => {
  events.push({ check: mode, intent });
};
SubtleCrypto.prototype.encrypt = async function (params, key, data) {
  if (new TextDecoder().decode(params.additionalData).includes('done/store/v1')) {
    if (fault === 'gate-encrypt') {
      fault = null;
      await gate('encrypt');
    }
    encryptions++;
    const result = await rawSubtle.encrypt(params, key, data);
    if (fault === 'gate-sealed') {
      fault = null;
      await gate('sealed');
    }
    return result;
  }
  return rawSubtle.encrypt(params, key, data);
};
const decrypt = SubtleCrypto.prototype.decrypt;
SubtleCrypto.prototype.decrypt = async function (params, key, data) {
  if (
    fault === 'gate-decrypt' &&
    new TextDecoder().decode(params.additionalData).includes('done/store/v1')
  ) {
    fault = null;
    await gate('decrypt');
  }
  return decrypt.call(this, params, key, data);
};
SubtleCrypto.prototype.sign = async function (algorithm, key, data) {
  const text = new TextDecoder().decode(data);
  if (
    fault === 'gate-ready' &&
    text.includes('done/content-witness/v1') &&
    text.includes('"ready"')
  ) {
    fault = null;
    await gate('ready');
  }
  return rawSubtle.sign(algorithm, key, data);
};
for (const method of ['put', 'add']) {
  const native = IDBObjectStore.prototype[method];
  IDBObjectStore.prototype[method] = function (value, ...args) {
    const req = native.call(this, value, ...args);
    const isReservation = this.name === 'meta' && value?.next_seq > 1;
    const isRecord = ['content', 'heads', 'outbound'].includes(this.name);
    if (
      (fault === 'abort-reservation' && isReservation) ||
      (fault === 'abort-content' && isRecord)
    ) {
      fault = null;
      req.addEventListener('success', () => {
        events.push('request-success-then-abort');
        this.transaction.abort();
      });
    }
    return req;
  };
}
const signCounter = async (code, value) => {
  const c = await custody();
  const root = await openFactor(scope, utf8(normalizeDeviceCode(code)), c.seals[0]);
  const generation = await openEnvelope(scope, root, c.envelope);
  try {
    const key = await hkdf(
      generation,
      new Uint8Array(),
      fields(
        'done/content-metadata/v1',
        scope.slotId,
        scope.principalId,
        scope.workspaceId,
        c.store_id,
      ),
      { name: 'HMAC', hash: 'SHA-256', length: 256 },
      ['sign'],
    );
    value.mac = new Uint8Array(
      await rawSubtle.sign(
        'HMAC',
        key,
        counterPayload({ ...scope, storeId: c.store_id, rootId: c.root_id }, value),
      ),
    );
    await put(await name(), 'meta', 'counter', value);
  } finally {
    root.fill(0);
    generation.fill(0);
  }
};
window.content = {
  publicShape: (id) => Object.keys(sessions.get(id)).sort(),
  backup: async () => {
    saved = await inventory();
  },
  restore: async () => {
    const dbName = await name();
    await raw(dbName, Object.keys(saved), 'readwrite', (tx) => {
      for (const [store, rows] of Object.entries(saved)) {
        const objectStore = tx.objectStore(store);
        objectStore.clear();
        for (const row of rows) objectStore.put(row.value, row.key);
      }
    });
  },
  snapshot: () => ({
    entries,
    gates: [...gates.keys()],
    encryptions,
    events,
    states: Object.fromEntries([...sessions].map(([id, s]) => [id, s.state])),
  }),
  async enroll() {
    const e = beginCustodyEnrollment(authority, { checkCreation });
    const code = e.displayCode;
    await e.confirm(code);
    return code;
  },
  initialize: (id, code) =>
    track(id, () => initializeContentStore(authority, code, { checkCreation })),
  open: (id, code) =>
    track(id, async () => {
      const s = await openContentSession(authority, code);
      sessions.set(id, s);
      return { storeId: s.storeId, scope: s.scope };
    }),
  append: (id, session, values, mutate = false) => {
    const batch = values.map((v) => ({
      kind: v.kind ?? 'update',
      bytes: typeof v.bytes === 'string' ? utf8(v.bytes) : new Uint8Array(v.bytes),
    }));
    track(id, () => {
      const p = sessions.get(session).appendBatch(batch);
      if (mutate) for (const v of batch) v.bytes.fill(88);
      return p;
    });
  },
  load: (id, session) =>
    track(id, async () =>
      (await sessions.get(session).loadRecords()).map((r) => ({
        ...r,
        bytes: Array.from(r.bytes),
      })),
    ),
  close: (id, session) => track(id, () => sessions.get(session).close()),
  exclusive: (id) =>
    track(id, () =>
      withExclusiveSlot(scope.slotId, () => {
        events.push('exclusive-entered');
      }),
    ),
  fault: (v) => {
    fault = v;
  },
  release: (n) => gates.get(n)?.(),
  counter,
  witness,
  inventory,
  async tamper(type, code) {
    if (type === 'missing-counter') {
      await put(await name(), 'meta', 'counter', null);
      return;
    }
    if (['count', 'ceiling', 'generation', 'tamper-mac'].includes(type)) {
      const c = await counter();
      if (type === 'generation') {
        c.active_gen = 2;
        c.reserved['2'] = 0;
      } else if (type === 'ceiling') {
        c.next_seq = 2 ** 32 - 1;
        c.reserved = { 1: 2 ** 32 - 2 };
      } else if (type === 'tamper-mac') {
        c.mac[0] ^= 1;
      } else {
        c.next_seq = 1;
        c.reserved = { 1: 0 };
      }
      if (type === 'ceiling' || type === 'generation') await signCounter(code, c);
      else await put(await name(), 'meta', 'counter', c);
      return;
    }
    const rows = await inventory(),
      first = type === 'collision' ? rows.content[0] : rows.content.at(-1);
    let v = first.value;
    if (type === 'version') v.v = 9;
    else if (type === 'tag') v.ct[0] ^= 1;
    else if (type === 'kind') v.kind = 'state';
    else if (type === 'collision') {
      await put(await name(), 'content', 2, v);
      return;
    } else if (type === 'wrong-store') {
      await put(await name(), 'heads', first.key, v);
      return;
    }
    await put(await name(), 'content', first.key, v);
  },
  async deleteDb() {
    const n = await name();
    await new Promise((resolve, reject) => {
      const r = indexedDB.deleteDatabase(n);
      r.onsuccess = resolve;
      r.onerror = () => reject(r.error);
    });
  },
  async yjsProbe() {
    const remote = new Y.Doc(),
      updates = [];
    remote.on('update', (u) => updates.push(u));
    remote.getText('text').insert(0, 'R'.repeat(17 * 1024));
    remote.getText('text').delete(0, 13);
    const local = new Y.Doc();
    Y.applyUpdate(local, updates[0]);
    Y.applyUpdate(local, updates[1]);
    let dependent;
    local.on('update', (u) => {
      dependent = u;
    });
    local.getText('text').insert(1, 'LOCAL');
    const expected = local.getText('text').toString();
    remote.destroy();
    local.destroy();
    return { updates: [...updates, dependent].map((u) => Array.from(u)), expected };
  },
  async replay(session) {
    const doc = new Y.Doc();
    try {
      for (const r of await sessions.get(session).loadRecords())
        if (r.kind === 'update' || r.kind === 'state') Y.applyUpdate(doc, r.bytes);
      return doc.getText('text').toString();
    } finally {
      doc.destroy();
    }
  },
};
