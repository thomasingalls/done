import '../content/browser.mjs';
import { openJournalSession } from '@custody';
import {
  fields,
  hex,
  hkdf,
  normalizeDeviceCode,
  openFactor,
  openEnvelope,
  utf8,
} from '@custody-crypto';
import { recordAAD } from '@content-record';
import * as Y from 'yjs';
const scope = {
  slotId: 'content-slot',
  principalId: 'content-principal',
  workspaceId: 'content-workspace',
};
const authority = { ...scope, resolvePrincipal: () => scope.principalId };
const sessions = new Map(),
  entries = {},
  gates = new Map(),
  faults = new Set(),
  events = [];
let published = false,
  encryptions = 0;
const gate = async (name) => {
  let release;
  const p = new Promise((r) => {
    release = r;
  });
  gates.set(name, release);
  await p;
  gates.delete(name);
};
const take = (name) => faults.delete(name);
const track = (id, fn) => {
  entries[id] = { status: 'pending' };
  void Promise.resolve()
    .then(fn)
    .then(
      (value) => {
        entries[id] = { status: 'resolved', value };
      },
      (e) => {
        entries[id] = { status: 'rejected', error: { code: e.code ?? e.name, message: e.message } };
      },
    );
};
const encrypt = SubtleCrypto.prototype.encrypt,
  decrypt = SubtleCrypto.prototype.decrypt;
SubtleCrypto.prototype.encrypt = async function (p, k, b) {
  const aad = new TextDecoder().decode(p.additionalData);
  if (aad.includes('done/store/v1')) {
    encryptions++;
    if (aad.endsWith('state') && take('hold-seal')) await gate('seal');
  }
  return encrypt.call(this, p, k, b);
};
SubtleCrypto.prototype.decrypt = async function (p, k, b) {
  const result = await decrypt.call(this, p, k, b);
  if (
    published &&
    new TextDecoder().decode(p.additionalData).endsWith('state') &&
    take('hold-audit')
  )
    await gate('audit');
  return result;
};
const transaction = IDBDatabase.prototype.transaction;
const stateTx = new WeakSet(),
  deleteTx = new WeakSet();
IDBDatabase.prototype.transaction = function (...args) {
  const tx = transaction.apply(this, args);
  Object.defineProperty(tx, 'oncomplete', {
    configurable: true,
    set(fn) {
      tx.addEventListener('complete', async (e) => {
        if (stateTx.has(tx)) {
          published = true;
          events.push('state-native-complete');
          if (take('hold-published')) await gate('published');
        }
        if (deleteTx.has(tx)) {
          events.push('delete-native-complete');
          if (take('hold-deleted')) await gate('deleted');
        }
        fn?.call(tx, e);
      });
    },
  });
  return tx;
};
const add = IDBObjectStore.prototype.add,
  remove = IDBObjectStore.prototype.delete;
IDBObjectStore.prototype.add = function (v, ...args) {
  if (this.name === 'content' && v.kind === 'state') stateTx.add(this.transaction);
  const req = add.call(this, v, ...args);
  if (this.name === 'content' && v.kind === 'state' && take('abort-publish'))
    req.addEventListener('success', () => {
      events.push('state-request-success-abort');
      this.transaction.abort();
    });
  return req;
};
IDBObjectStore.prototype.delete = function (k) {
  if (this.name === 'content') deleteTx.add(this.transaction);
  const req = remove.call(this, k);
  if (this.name === 'content' && take('abort-delete'))
    req.addEventListener('success', () => {
      events.push('delete-request-success-abort');
      this.transaction.abort();
    });
  return req;
};
const rawDb = (name) =>
  new Promise((resolve, reject) => {
    const r = indexedDB.open(name);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
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
const raw = async (dbName, store, mode, fn) => {
  const db = await rawDb(dbName);
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      let value;
      fn(tx.objectStore(store), (v) => {
        value = v;
      });
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
};
const get = (db, store, key) =>
  raw(db, store, 'readonly', (s, result) => {
    const r = s.get(key);
    r.onsuccess = () => result(r.result);
  });
const put = (db, store, key, value) =>
  raw(db, store, 'readwrite', (s) => (value === null ? s.delete(key) : s.put(value, key)));
const independent = (text) => {
  const d = new Y.Doc();
  d.clientID = text.charCodeAt(0) * 101;
  d.getText('text').insert(0, text);
  const u = Y.encodeStateAsUpdate(d);
  d.destroy();
  return Array.from(u);
};
window.trim = {
  snapshot: () => ({
    entries,
    gates: [...gates.keys()],
    events,
    encryptions,
    states: Object.fromEntries([...sessions].map(([k, s]) => [k, s.state])),
  }),
  fault: (...names) => {
    for (const n of names) faults.add(n);
  },
  release: (n) => gates.get(n)?.(),
  open: (id, code) =>
    track(id, async () => {
      const s = await openJournalSession(authority, code);
      sessions.set(id, s);
      return s.storeId;
    }),
  compact: (id, s = 'session') => track(id, () => sessions.get(s).compactContent()),
  close: (id, s = 'session') => track(id, () => sessions.get(s).close()),
  append: (id, values, s = 'session') =>
    track(id, () =>
      sessions
        .get(s)
        .appendBatch(
          values.map((v) => ({ kind: v.kind ?? 'update', bytes: new Uint8Array(v.bytes) })),
        ),
    ),
  journal: (bytes, s = 'session') => sessions.get(s).appendLocal(new Uint8Array(bytes)),
  journalInventory: () =>
    Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])),
  corruptJournal: () => {
    const k = Object.keys(localStorage)[0];
    localStorage.setItem(k, 'damaged');
  },
  async controls() {
    return raw('done.custody', 'entries', 'readonly', (s, result) => {
      const rows = [];
      const r = s.openCursor();
      r.onsuccess = () => {
        const c = r.result;
        if (c) {
          rows.push({ key: c.key, value: c.value });
          c.continue();
        } else result(rows);
      };
    });
  },
  async replay(s = 'session', later = []) {
    const doc = new Y.Doc();
    try {
      const r = await sessions.get(s).loadRecovery();
      for (const e of r.records)
        if (e.kind === 'state' || e.kind === 'update') Y.applyUpdate(doc, e.bytes);
      for (const e of r.journal) Y.applyUpdate(doc, e.bytes);
      for (const u of later) Y.applyUpdate(doc, new Uint8Array(u));
      return doc.getText('text').toString();
    } finally {
      doc.destroy();
    }
  },
  async rewrite(seq, code, text = 'X') {
    const db = await name(),
      r = await get(db, 'content', seq),
      c = await get('done.custody', 'entries', [
        scope.slotId,
        scope.principalId,
        scope.workspaceId,
      ]);
    const root = await openFactor(scope, utf8(normalizeDeviceCode(code)), c.seals[0]),
      g = await openEnvelope(scope, root, c.envelope);
    try {
      const key = await hkdf(
        g,
        new Uint8Array(),
        fields('done/store/v1', scope.workspaceId, c.store_id),
        { name: 'AES-GCM', length: 256 },
        ['encrypt'],
      );
      r.nonce = crypto.getRandomValues(new Uint8Array(12));
      r.ct = new Uint8Array(
        await crypto.subtle.encrypt(
          {
            name: 'AES-GCM',
            iv: r.nonce,
            additionalData: recordAAD({ ...scope, storeId: c.store_id }, r),
            tagLength: 128,
          },
          key,
          new Uint8Array(independent(text)),
        ),
      );
      await put(db, 'content', seq, r);
    } finally {
      root.fill(0);
      g.fill(0);
    }
  },
  async corrupt(seq, store = 'content') {
    const db = await name(),
      r = await get(db, store, seq);
    r.ct[0] ^= 1;
    await put(db, store, seq, r);
  },
  async remove(seq) {
    await put(await name(), 'content', seq, null);
  },
  probe(mode = 'independent') {
    if (mode === 'independent')
      return { updates: ['A', 'B', 'C', 'J'].map(independent), expected: 'ABC' };
    const d = new Y.Doc(),
      updates = [];
    d.on('update', (u) => updates.push(Array.from(u)));
    d.getText('text').insert(0, 'BASE');
    if (mode === 'struct') d.getText('text').insert(2, 'LATE');
    else d.getText('text').delete(1, 2);
    const expected = d.getText('text').toString();
    d.destroy();
    return { updates, expected };
  },
};
