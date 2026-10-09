import '../content/browser.mjs';
import { openJournalSession, JOURNAL_WATERMARK } from '@custody';
import { deriveStoreName } from '@store-name';
import {
  journalPrefix,
  deriveJournalKey,
  createJournalCodec,
  decodeJournal,
  encodeJournal,
} from '@journal-codec';
import { normalizeDeviceCode, openFactor, openEnvelope, utf8 } from '@custody-crypto';
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
  memories = [];
const prefix = journalPrefix(await deriveStoreName(scope.principalId, scope.workspaceId));
let fault = null,
  nonceCalls = 0,
  subtleCalls = 0;
const failure = (error) => ({ code: error.code ?? error.name, message: error.message });
const gate = async (name) => {
  let release;
  const p = new Promise((r) => {
    release = r;
  });
  gates.set(name, release);
  await p;
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
        entries[id] = { status: 'rejected', error: failure(error) };
      },
    );
};
const Native = WebAssembly.Instance;
WebAssembly.Instance = new Proxy(Native, {
  construct(target, args) {
    const instance = Reflect.construct(target, args);
    if (instance.exports.memory) memories.push(instance.exports.memory);
    return instance;
  },
});
const random = Crypto.prototype.getRandomValues;
Crypto.prototype.getRandomValues = function (buffer) {
  if (buffer.byteLength === 24) nonceCalls++;
  return random.call(this, buffer);
};
for (const method of [
  'importKey',
  'deriveBits',
  'deriveKey',
  'encrypt',
  'decrypt',
  'sign',
  'verify',
]) {
  const native = SubtleCrypto.prototype[method];
  SubtleCrypto.prototype[method] = async function (...args) {
    subtleCalls++;
    if (
      method === 'verify' &&
      fault === 'gate-recovery' &&
      new TextDecoder().decode(args[3]).includes('done/content-counter/v1')
    ) {
      fault = null;
      await gate('recovery');
    }
    return native.apply(this, args);
  };
}
const nativeSet = Storage.prototype.setItem,
  nativeRemove = Storage.prototype.removeItem,
  nativeGet = Storage.prototype.getItem;
Storage.prototype.setItem = function (key, value) {
  if (key.startsWith(prefix) && fault === 'quota') {
    fault = null;
    throw new DOMException('fixture quota', 'QuotaExceededError');
  }
  if (key.startsWith(prefix) && fault === 'unavailable') {
    fault = null;
    throw new DOMException('fixture disabled storage', 'SecurityError');
  }
  return nativeSet.call(this, key, value);
};
Storage.prototype.getItem = function (key) {
  if (key.startsWith(prefix) && fault === 'read-unavailable') {
    fault = null;
    throw new DOMException('fixture disabled read', 'SecurityError');
  }
  if (key.startsWith(prefix) && fault === 'change-during-read') {
    fault = null;
    nativeRemove.call(this, key);
    return null;
  }
  return nativeGet.call(this, key);
};
Storage.prototype.removeItem = function (key) {
  if (key.startsWith(prefix) && fault === 'remove-refused')
    throw new DOMException('fixture cleanup failure', 'SecurityError');
  if (key.startsWith(prefix) && fault === 'pause-cleanup') {
    fault = null;
    // eslint-disable-next-line no-debugger -- Intentional CDP kill boundary in this isolated fixture.
    debugger;
  }
  return nativeRemove.call(this, key);
};
const nativeAdd = IDBObjectStore.prototype.add;
IDBObjectStore.prototype.add = function (value, ...args) {
  const req = nativeAdd.call(this, value, ...args);
  if (fault === 'abort-second-chunk' && this.name === 'content' && value.seq === 257) {
    fault = null;
    req.addEventListener('success', () => this.transaction.abort());
  }
  return req;
};
const inventory = () =>
  Object.fromEntries(
    Object.keys(localStorage)
      .filter((k) => k.startsWith(prefix))
      .sort()
      .map((k) => [k, localStorage.getItem(k)]),
  );
const recoveryValue = (result) => ({
  records: result.records.map((r) => ({ ...r, bytes: Array.from(r.bytes) })),
  journal: result.journal.map((r) => ({ ...r, bytes: Array.from(r.bytes) })),
});
const bytes = (v) => (typeof v === 'string' ? utf8(v) : new Uint8Array(v));
const codec = async (code, fn) => {
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open('done.custody');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const c = await new Promise((resolve, reject) => {
    const tx = db.transaction('entries'),
      r = tx.objectStore('entries').get([scope.slotId, scope.principalId, scope.workspaceId]);
    tx.oncomplete = () => resolve(r.result);
    tx.onabort = () => reject(tx.error);
  });
  db.close();
  const root = await openFactor(scope, utf8(normalizeDeviceCode(code)), c.seals[0]),
    generation = await openEnvelope(scope, root, c.envelope),
    key = await deriveJournalKey(generation, scope.workspaceId);
  const seal = createJournalCodec(scope.workspaceId, 1, key);
  try {
    return fn(seal);
  } finally {
    seal.dispose();
    root.fill(0);
    generation.fill(0);
    key.fill(0);
  }
};
window.journal = {
  base: window.content,
  snapshot: () => ({
    entries,
    gates: [...gates.keys()],
    nonceCalls,
    subtleCalls,
    memories: memories.map((m) => ({
      bytes: m.buffer.byteLength,
      zero: new Uint8Array(m.buffer).every((b) => b === 0),
    })),
    states: Object.fromEntries([...sessions].map(([id, s]) => [id, s.state])),
  }),
  open: (id, code) =>
    track(id, async () => {
      const s = await openJournalSession(authority, code);
      sessions.set(id, s);
      return { storeId: s.storeId };
    }),
  close: (id, session = 's') => track(id, () => sessions.get(session).close()),
  append: (value, session = 's') => {
    const before = { nonceCalls, subtleCalls };
    try {
      const result = sessions.get(session).appendLocal(bytes(value));
      return {
        result,
        promise: typeof result?.then === 'function',
        persisted: result.key ? localStorage.getItem(result.key) : null,
        nonceCalls: nonceCalls - before.nonceCalls,
        subtleCalls: subtleCalls - before.subtleCalls,
      };
    } catch (error) {
      return { error: failure(error) };
    }
  },
  appendMany: (count, size = 18, session = 's') => {
    const results = [];
    for (let i = 0; i < count; i++) {
      const r = sessions.get(session).appendLocal(new Uint8Array(size).fill(i % 256));
      results.push(r);
      if (r.status !== 'journalled') break;
    }
    return results;
  },
  batch: (id, values, session = 's') =>
    track(id, () =>
      sessions.get(session).appendBatch(values.map((v) => ({ kind: 'update', bytes: bytes(v) }))),
    ),
  flush: (id, session = 's') => track(id, () => sessions.get(session).flushJournal()),
  recover: (id, session = 's') =>
    track(id, async () => recoveryValue(await sessions.get(session).loadRecovery())),
  replay: (id, session = 's') =>
    track(id, async () => {
      const recovered = await sessions.get(session).loadRecovery(),
        doc = new Y.Doc();
      try {
        for (const r of recovered.records)
          if (r.kind === 'update' || r.kind === 'state') Y.applyUpdate(doc, r.bytes);
        for (const r of recovered.journal) Y.applyUpdate(doc, r.bytes);
        return doc.getText('text').toString();
      } finally {
        doc.destroy();
      }
    }),
  inventory,
  fault: (v) => {
    fault = v;
  },
  release: (name) => gates.get(name)?.(),
  observed: (session = 's') => sessions.get(session).observedJournalCharacters,
  async tamper(type, code) {
    const [key, value] = Object.entries(inventory())[0];
    if (type === 'legacy') {
      localStorage.setItem(key, '1:plaintext legacy');
      return;
    }
    if (type === 'unknown') {
      localStorage.setItem(key, '9:opaque');
      return;
    }
    if (type === 'moved') {
      localStorage.setItem(key + '.moved', value);
      return;
    }
    if (type === 'changed-valid') {
      await codec(code, (c) =>
        localStorage.setItem(
          key,
          c.seal(key, crypto.getRandomValues(new Uint8Array(24)), utf8('replacement')),
        ),
      );
      return;
    }
    const p = decodeJournal(value);
    if (type === 'generation') p.generation = 2;
    else p.ct[p.ct.length - 1] ^= 1;
    localStorage.setItem(key, encodeJournal(p.generation, p.nonce, p.ct));
  },
  fillWatermark() {
    localStorage.setItem('unrelated', 'Ω'.repeat(JOURNAL_WATERMARK - 100));
  },
  clearUnrelated() {
    localStorage.removeItem('unrelated');
  },
  foreign(value) {
    const key = 'done.pending-update.foreign-store.legacy';
    if (value !== undefined) localStorage.setItem(key, value);
    return localStorage.getItem(key);
  },
  actualQuota() {
    let writes = 0;
    try {
      for (; writes < 12000; writes++) localStorage.setItem('quota.' + writes, 'Q'.repeat(1024));
    } catch (error) {
      return { name: error.name, writes };
    }
    throw Error('Fixture did not reach quota');
  },
  measure(session = 's') {
    const samples = [],
      sizes = [18, 419, 4096, 16384];
    for (const size of sizes) {
      const durations = [];
      for (let i = 0; i < 20; i++) {
        const start = performance.now(),
          r = sessions.get(session).appendLocal(new Uint8Array(size));
        durations.push(performance.now() - start);
        if (r.status !== 'journalled') throw Error('Measurement refused');
      }
      durations.sort((a, b) => a - b);
      samples.push({
        size,
        n: durations.length,
        p95_ms: durations[Math.ceil(0.95 * durations.length) - 1],
        samples_ms: durations,
      });
    }
    return { isolated: crossOriginIsolated, samples };
  },
};
