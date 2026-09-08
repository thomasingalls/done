import { beginCustodyEnrollment, openCustodySession, resumeCustodyCreation } from '@custody';
import {
  CUSTODY_DB,
  CUSTODY_STORE,
  authenticateRecord,
  recordKey,
  signRecord,
} from '@custody-record';
import {
  aes,
  fields,
  hex,
  hkdf,
  normalizeDeviceCode,
  openEnvelope,
  openFactor,
  random,
  utf8,
} from '@custody-crypto';
import { withExclusiveSlot } from '@write-session';

const defaultScope = {
  slotId: 'test-slot',
  principalId: 'test-principal',
  workspaceId: 'test-workspace',
};
const entries = new Map(),
  gates = new Map(),
  events = [];
let fault = null,
  rootEncryptions = 0,
  privateExports = 0;
const refuse = (error) => ({ code: error.code ?? error.name, message: error.message });
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const gate = async (name) => {
  const d = deferred();
  gates.set(name, d);
  await d.promise;
  gates.delete(name);
};
const track = (id, fn) => {
  const entry = entries.get(id) ?? {};
  entries.set(id, entry);
  entry.status = 'pending';
  delete entry.error;
  void Promise.resolve()
    .then(fn)
    .then(
      (value) => {
        entry.status = 'resolved';
        entry.value = value;
      },
      (error) => {
        entry.status = 'rejected';
        entry.error = refuse(error);
      },
    );
};
const rawDb = (name, store) =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(store);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
const rawRead = async (scope = defaultScope) => {
  const db = await rawDb(CUSTODY_DB, CUSTODY_STORE);
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(CUSTODY_STORE);
      const req = tx.objectStore(CUSTODY_STORE).get(recordKey(scope));
      tx.oncomplete = () => resolve(req.result ?? null);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
};
const rawPut = async (record, scope = defaultScope) => {
  const db = await rawDb(CUSTODY_DB, CUSTODY_STORE);
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(CUSTODY_STORE, 'readwrite');
      if (record === null) tx.objectStore(CUSTODY_STORE).delete(recordKey(scope));
      else tx.objectStore(CUSTODY_STORE).put(record, recordKey(scope));
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
};
const probeDb = 'done.custody-probe';
const probes = async (value) => {
  const db = await rawDb(probeDb, 'probe');
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('probe', value ? 'readwrite' : 'readonly');
      const store = tx.objectStore('probe');
      if (value) store.put(value, 'probe');
      const req = store.get('probe');
      tx.oncomplete = () => resolve(req.result ?? null);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
};
const authority = (scope = defaultScope, flags = {}) => ({
  slotId: scope.slotId,
  workspaceId: scope.workspaceId,
  resolvePrincipal: async (task) => {
    events.push('resolve-principal');
    if (flags.authorityGate) await task.wait(() => gate('authority'));
    if (flags.denyAuthority)
      throw Object.assign(Error('Synthetic identity rejected'), { code: 'identity-refused' });
    return scope.principalId;
  },
});
const creationOptions = (controller, flags = {}) => ({
  signal: controller.signal,
  checkCreation: async (_task, scope, intent, mode) => {
    events.push({ checkCreation: mode, intentId: intent.id });
    if (flags.checkGate) await gate('creation-check');
    const p = await probes();
    if (
      flags.refuseCarriers ||
      (p?.scope?.principalId === scope.principalId && p?.scope?.workspaceId === scope.workspaceId)
    )
      throw Object.assign(Error('Synthetic surviving carrier requires the startup owner'), {
        code: 'carrier-refused',
      });
  },
});

const generateKey = SubtleCrypto.prototype.generateKey,
  exportKey = SubtleCrypto.prototype.exportKey;
SubtleCrypto.prototype.generateKey = async function (...args) {
  const result = await generateKey.apply(this, args);
  if (fault === 'gate-keygen' && args[0] === 'X25519') {
    fault = null;
    await gate('keygen');
  }
  return result;
};
SubtleCrypto.prototype.exportKey = function (format, key) {
  if (key.type === 'private') privateExports++;
  return exportKey.call(this, format, key);
};
const encrypt = SubtleCrypto.prototype.encrypt,
  decrypt = SubtleCrypto.prototype.decrypt;
SubtleCrypto.prototype.encrypt = async function (params, key, data) {
  const aad = new TextDecoder().decode(params.additionalData ?? new Uint8Array());
  if (aad.includes('done/keyenv/v1') || aad.includes('done/custody-credential/v2')) {
    if (fault === 'gate-envelope' && aad.includes('done/keyenv/v1')) {
      fault = null;
      await gate('envelope');
    }
    rootEncryptions++;
    events.push('root-encryption');
  }
  return encrypt.call(this, params, key, data);
};
SubtleCrypto.prototype.decrypt = async function (params, key, data) {
  const aad = new TextDecoder().decode(params.additionalData ?? new Uint8Array());
  if (fault === 'gate-decrypt' && aad.includes('done/store/v1')) {
    fault = null;
    await gate('decrypt');
  }
  return decrypt.call(this, params, key, data);
};
const put = IDBObjectStore.prototype.put;
IDBObjectStore.prototype.put = function (value, ...args) {
  const req = put.call(this, value, ...args);
  if (
    this.name === CUSTODY_STORE &&
    ((fault === 'abort-reservation' && value?.state === 'creating' && value.seal_reserved > 0) ||
      (fault === 'abort-completion' && value?.state === 'protected'))
  ) {
    fault = null;
    const tx = this.transaction;
    req.addEventListener(
      'success',
      () => {
        events.push('put-success-then-abort');
        tx.abort();
      },
      { once: true },
    );
  }
  return req;
};

const inventory = async () => {
  const rows = [];
  for (const { name } of await indexedDB.databases()) {
    const req = indexedDB.open(name);
    const db = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      for (const name of db.objectStoreNames) {
        const values = await new Promise((resolve, reject) => {
          const tx = db.transaction(name);
          const r = tx.objectStore(name).getAll();
          tx.oncomplete = () => resolve(r.result);
          tx.onabort = () => reject(tx.error);
        });
        rows.push({ database: db.name, store: name, values });
      }
    } finally {
      db.close();
    }
  }
  return rows;
};
const serialize = (value) => {
  if (value instanceof CryptoKey)
    return {
      cryptoKey: {
        type: value.type,
        algorithm: value.algorithm.name,
        extractable: value.extractable,
      },
    };
  if (value instanceof Uint8Array) return { hex: hex(value) };
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serialize(v)]));
  return value;
};
const contentAAD = (s, r, record) =>
  fields(
    'done/store/v1',
    s.principalId,
    s.workspaceId,
    r.store_id,
    '1',
    '1',
    String(record.seq),
    record.kind,
  );
const fixturePlaintext = 'custody content probe: survives cold unlock';
const futurePlaintext = 'future generation receiver probe';
const futureAAD = utf8('done/custody-test-future/v1');
const futureKey = (secret) =>
  hkdf(secret, new Uint8Array(), futureAAD, { name: 'AES-GCM', length: 256 }, [
    'encrypt',
    'decrypt',
  ]);
const seedProbe = async (code, plant = false, scope = defaultScope) => {
  const r = await rawRead(scope),
    factor = utf8(normalizeDeviceCode(code));
  let root, generation, secret;
  try {
    root = await openFactor(scope, factor, r.seals[0]);
    await authenticateRecord(root, r);
    generation = await openEnvelope(scope, root, r.envelope);
    const key = await hkdf(
      generation,
      new Uint8Array(),
      fields('done/store/v1', scope.workspaceId, r.store_id),
      { name: 'AES-GCM', length: 256 },
      ['encrypt', 'decrypt'],
    );
    const record = {
      v: 1,
      gen: 1,
      seq: 1,
      kind: 'update',
      nonce: random(12),
      ct: new Uint8Array(),
    };
    // Test-only content carrier. No production allocator or acknowledgements are claimed.
    record.ct = new Uint8Array(
      await encrypt.call(
        crypto.subtle,
        { name: 'AES-GCM', iv: record.nonce, additionalData: contentAAD(scope, r, record) },
        key,
        utf8(fixturePlaintext),
      ),
    );
    const peer = await crypto.subtle.generateKey('X25519', false, ['deriveBits']);
    const publicKey = await crypto.subtle.importKey(
      'raw',
      r.credentials[0].publicKey,
      'X25519',
      false,
      [],
    );
    secret = new Uint8Array(
      await crypto.subtle.deriveBits({ name: 'X25519', public: publicKey }, peer.privateKey, 256),
    );
    const nonce = random(12);
    const future = {
      publicKey: new Uint8Array(await crypto.subtle.exportKey('raw', peer.publicKey)),
      nonce,
      ct: new Uint8Array(
        await encrypt.call(
          crypto.subtle,
          { name: 'AES-GCM', iv: nonce, additionalData: futureAAD },
          await futureKey(secret),
          utf8(futurePlaintext),
        ),
      ),
    };
    await probes({ scope, record, future, ...(plant ? { promptlessRoot: await aes(root) } : {}) });
    return { knownContent: true, knownFuture: true, planted: plant };
  } finally {
    factor.fill(0);
    root?.fill(0);
    generation?.fill(0);
    secret?.fill(0);
  }
};
const attacker = async () => {
  const rows = await inventory(),
    p = await probes(),
    r = await rawRead(p.scope),
    candidates = [];
  const visit = (v, path) => {
    if (v instanceof CryptoKey || (v instanceof Uint8Array && v.length === 32))
      candidates.push({ value: v, path });
    else if (Array.isArray(v)) v.forEach((x, i) => visit(x, `${path}/${i}`));
    else if (v && typeof v === 'object' && !(v instanceof Uint8Array))
      Object.entries(v).forEach(([k, x]) => visit(x, `${path}/${k}`));
  };
  rows.forEach((row) => visit(row.values, `${row.database}/${row.store}`));
  let content = false,
    future = false,
    opener = null;
  for (const { value, path } of candidates) {
    try {
      const rootKey = value instanceof CryptoKey ? value : await aes(value);
      const generation = new Uint8Array(
        await decrypt.call(
          crypto.subtle,
          {
            name: 'AES-GCM',
            iv: r.envelope.nonce,
            additionalData: fields(
              'done/keyenv/v1',
              p.scope.principalId,
              p.scope.workspaceId,
              '1',
              '1',
              'content-key',
            ),
          },
          rootKey,
          r.envelope.ct,
        ),
      );
      try {
        const key = await hkdf(
          generation,
          new Uint8Array(),
          fields('done/store/v1', p.scope.workspaceId, r.store_id),
          { name: 'AES-GCM', length: 256 },
          ['decrypt'],
        );
        const text = new TextDecoder().decode(
          await decrypt.call(
            crypto.subtle,
            {
              name: 'AES-GCM',
              iv: p.record.nonce,
              additionalData: contentAAD(p.scope, r, p.record),
            },
            key,
            p.record.ct,
          ),
        );
        if (text === fixturePlaintext) {
          content = true;
          opener = path;
        }
      } finally {
        generation.fill(0);
      }
      const c = r.credentials[0];
      const raw = new Uint8Array(
        await decrypt.call(
          crypto.subtle,
          {
            name: 'AES-GCM',
            iv: c.sealed.nonce,
            additionalData: fields(
              'done/custody-credential/v2',
              p.scope.principalId,
              p.scope.workspaceId,
              c.role,
              c.id,
              hex(c.publicKey),
            ),
          },
          rootKey,
          c.sealed.ct,
        ),
      );
      const pkcs8 = new Uint8Array(48);
      pkcs8.set([48, 46, 2, 1, 0, 48, 5, 6, 3, 43, 101, 110, 4, 34, 4, 32]);
      pkcs8.set(raw, 16);
      let secret;
      try {
        const privateKey = await crypto.subtle.importKey('pkcs8', pkcs8, 'X25519', false, [
          'deriveBits',
        ]);
        const publicKey = await crypto.subtle.importKey(
          'raw',
          p.future.publicKey,
          'X25519',
          false,
          [],
        );
        secret = new Uint8Array(
          await crypto.subtle.deriveBits({ name: 'X25519', public: publicKey }, privateKey, 256),
        );
        const text = new TextDecoder().decode(
          await decrypt.call(
            crypto.subtle,
            { name: 'AES-GCM', iv: p.future.nonce, additionalData: futureAAD },
            await futureKey(secret),
            p.future.ct,
          ),
        );
        if (text === futurePlaintext) future = true;
      } finally {
        raw.fill(0);
        pkcs8.fill(0);
        secret?.fill(0);
      }
    } catch {
      /* Actual cryptographic attempt, not only the application's factor prompt. */
    }
  }
  return { content, future, opener, candidates: candidates.map((c) => c.path) };
};
window.custody = {
  begin(id, flags = {}, scope = defaultScope) {
    const controller = new AbortController();
    const ceremony = beginCustodyEnrollment(
      authority(scope, flags),
      creationOptions(controller, flags),
    );
    entries.set(id, { ceremony, controller, scope });
    return ceremony.displayCode;
  },
  confirm(id, code) {
    const e = entries.get(id);
    track(id, async () => {
      e.descriptor = await e.ceremony.confirm(code);
      return true;
    });
  },
  open(id, code, flags = {}, scope = defaultScope) {
    const controller = new AbortController();
    entries.set(id, { controller, scope });
    track(id, async () => {
      const e = entries.get(id);
      e.session = await openCustodySession(authority(scope, flags), code, {
        signal: controller.signal,
      });
      return true;
    });
  },
  resume(id, code, flags = {}, scope = defaultScope) {
    const controller = new AbortController();
    entries.set(id, { controller, scope });
    track(id, async () => {
      entries.get(id).descriptor = await resumeCustodyCreation(
        authority(scope, flags),
        code,
        creationOptions(controller, flags),
      );
      return true;
    });
  },
  close(id, operation = id) {
    const e = entries.get(id);
    track(operation, () => e.session.close());
  },
  abort(id) {
    entries.get(id).controller.abort();
  },
  cancel(id) {
    entries.get(id).ceremony.cancel();
  },
  fault(value) {
    fault = value;
  },
  release(name) {
    gates.get(name)?.resolve();
  },
  exclusive(id, slotId = defaultScope.slotId) {
    entries.set(id, {});
    track(id, () =>
      withExclusiveSlot(slotId, () => {
        entries.get(id).entered = true;
      }),
    );
  },
  read(id, operation = id) {
    const e = entries.get(id);
    track(operation, async () => {
      const p = await probes();
      return new TextDecoder().decode(await e.session.run((task) => task.openRecord(p.record)));
    });
  },
  saveTask(id) {
    const e = entries.get(id);
    track(id, async () => {
      const p = await probes();
      await e.session.run((task) => {
        e.stale = () => task.openRecord(p.record);
      });
      return true;
    });
  },
  stale(id) {
    const e = entries.get(id);
    track(id, async () => new TextDecoder().decode(await e.stale()));
  },
  seedProbe,
  attacker,
  async inventory() {
    return serialize(await inventory());
  },
  async record(scope = defaultScope) {
    return serialize(await rawRead(scope));
  },
  async tamper(kind, code, scope = defaultScope) {
    let r = await rawRead(scope);
    if (kind === 'missing') r = null;
    else if (kind === 'partial') r.envelope = null;
    else if (kind === 'legacy') r = { v: 1, promptless: 'legacy-marker' };
    else if (kind === 'count') r.seal_reserved++;
    else if (kind === 'unknown') r.v = 3;
    else if (kind === 'scope') r.workspace_id = 'other';
    else if (kind === 'ceiling') {
      const root = await openFactor(scope, utf8(normalizeDeviceCode(code)), r.seals[0]);
      try {
        r = await signRecord(root, { ...r, seal_reserved: 2 ** 32 - 3 });
      } finally {
        root.fill(0);
      }
    }
    await rawPut(r, scope);
  },
  snapshot() {
    return {
      entries: Object.fromEntries(
        [...entries].map(([id, e]) => [
          id,
          {
            status: e.status,
            error: e.error,
            value: e.value,
            state: e.session?.state,
            displayErased: e.ceremony?.displayCode === null,
            entered: e.entered ?? false,
            descriptor: e.descriptor
              ? { storeId: e.descriptor.storeId, rootId: e.descriptor.rootId }
              : null,
          },
        ]),
      ),
      gates: [...gates.keys()],
      events,
      rootEncryptions,
      privateExports,
    };
  },
};
