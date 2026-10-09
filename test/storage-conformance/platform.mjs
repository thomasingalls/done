// Faults live at browser primitives. None implements admission, replay or retirement.
export class KnownRefusal extends Error {
  constructor(code, message = code, typed = true) {
    super(message);
    this.name = 'KnownRefusal';
    this.code = code;
    this.typed = typed;
  }
}
export const request = (r) =>
  new Promise((resolve, reject) => {
    r.addEventListener('success', () => resolve(r.result), { once: true });
    r.addEventListener('error', () => reject(r.error), { once: true });
  });
export const complete = (tx) =>
  new Promise((resolve, reject) => {
    tx.addEventListener('complete', resolve, { once: true });
    tx.addEventListener('abort', () => reject(tx.error ?? new Error('transaction aborted')), {
      once: true,
    });
  });
export async function raw(name, store, action, mode = 'readonly') {
  if (!(await indexedDB.databases()).some((entry) => entry.name === name))
    throw Error(`Absent database: ${name}`);
  const db = await request(indexedDB.open(name));
  try {
    const tx = db.transaction(store, mode),
      done = complete(tx);
    const value = await action(tx.objectStore(store));
    await done;
    return value;
  } finally {
    db.close();
  }
}
export const rows = (name, store) => raw(name, store, (s) => request(s.getAll()));
export const put = (name, store, row) => raw(name, store, (s) => request(s.put(row)), 'readwrite');
export async function seedIndex(name, slot, principal, workspace, dbName) {
  // Synthetic authorized clear inventory, not a forged account binding and not a genesis test.
  await put(name, 'slots', {
    id: slot,
    status: 'active',
    unlockBinding: null,
    stores: [{ principal, workspace, dbName }],
  });
}
export function encode(value) {
  if (value instanceof CryptoKey)
    return {
      cryptoKey: {
        type: value.type,
        algorithm: value.algorithm,
        usages: value.usages,
        extractable: value.extractable,
      },
    };
  if (ArrayBuffer.isView(value))
    return {
      hex: Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join(''),
    };
  if (value instanceof ArrayBuffer) return encode(new Uint8Array(value));
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, encode(value[k])]),
    );
  return value;
}
export async function inventory() {
  const databases = [];
  for (const { name } of (await indexedDB.databases()).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const db = await request(indexedDB.open(name));
    try {
      const stores = {};
      for (const store of Array.from(db.objectStoreNames)) {
        const tx = db.transaction(store),
          s = tx.objectStore(store);
        const [keys, values] = await Promise.all([request(s.getAllKeys()), request(s.getAll())]);
        stores[store] = keys.map((key, i) => ({ key: encode(key), value: encode(values[i]) }));
      }
      databases.push({ name, version: db.version, stores });
    } finally {
      db.close();
    }
  }
  return {
    databases,
    localStorage: Object.fromEntries(
      Object.keys(localStorage)
        .sort()
        .map((k) => [k, localStorage.getItem(k)]),
    ),
  };
}

export function installFaults() {
  const events = [],
    gates = new Map(),
    stateTransactions = new WeakSet();
  let refuseJournal = 0,
    journalPrefix = '',
    refuseDelete = false,
    refuseRemove = false;
  const record = (kind, detail = {}) => events.push({ order: events.length, kind, ...detail });
  const arm = (name) => {
    if (gates.has(name)) throw Error(`Gate already armed: ${name}`);
    let resolve;
    const promise = new Promise((r) => {
      resolve = r;
    });
    gates.set(name, { promise, resolve, hits: 0 });
  };
  const hit = (name) => {
    const gate = gates.get(name);
    if (!gate || gate.hits) return null;
    gate.hits++;
    record('gate-hit', { name });
    return gate.promise;
  };
  const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
  crypto.subtle.encrypt = async (...args) => {
    const aad = args[0]?.additionalData;
    if (aad && new TextDecoder().decode(aad).includes('done/store/v1')) {
      const wait = hit('encrypt');
      if (wait) await wait;
    }
    return encrypt(...args);
  };
  const transaction = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (...args) {
    const tx = transaction.apply(this, args);
    tx.addEventListener(
      'complete',
      (event) => {
        if (stateTransactions.has(tx)) {
          const wait = hit('state-committed');
          if (wait) {
            // Disk committed. Delay only delivery of the completion notification to
            // the candidate, allowing a different connection's reserved row to land.
            event.stopImmediatePropagation();
            void wait.then(() => tx.dispatchEvent(new Event('complete')));
            return;
          }
        }
        record('idb-complete', {
          database: this.name,
          mode: tx.mode,
          stores: Array.from(tx.objectStoreNames),
        });
      },
      { capture: true },
    );
    return tx;
  };
  for (const method of ['put', 'add']) {
    const original = IDBObjectStore.prototype[method];
    IDBObjectStore.prototype[method] = function (value, ...rest) {
      if (value?.kind === 'state') stateTransactions.add(this.transaction);
      if (value?.kind)
        record('record-write', {
          recordKind: value.kind,
          seq: value.seq,
          gen: value.gen,
          store: this.name,
        });
      return original.call(this, value, ...rest);
    };
  }
  const setItem = Storage.prototype.setItem,
    removeItem = Storage.prototype.removeItem;
  Storage.prototype.setItem = function (key, value) {
    if (key.startsWith(journalPrefix) && journalPrefix) {
      if (refuseJournal > 0) {
        refuseJournal--;
        record('journal-refused', { key });
        throw new DOMException('Injected journal refusal', 'QuotaExceededError');
      }
      record('journal-append', { key, chars: value.length });
    }
    return setItem.call(this, key, value);
  };
  Storage.prototype.removeItem = function (key) {
    if (refuseRemove && key.startsWith(journalPrefix))
      throw new DOMException('Injected journal removal refusal', 'SecurityError');
    return removeItem.call(this, key);
  };
  const deleteDatabase = indexedDB.deleteDatabase.bind(indexedDB);
  indexedDB.deleteDatabase = (name) => {
    record('delete-database', { name });
    if (refuseDelete) throw new DOMException('Injected content deletion refusal', 'SecurityError');
    return deleteDatabase(name);
  };
  return {
    events,
    arm,
    record,
    prefix(value) {
      journalPrefix = value;
    },
    refuseJournal(count) {
      refuseJournal = count;
    },
    refuseDelete(value) {
      refuseDelete = value;
    },
    refuseRemove(value) {
      refuseRemove = value;
    },
    state() {
      return Object.fromEntries([...gates].map(([k, v]) => [k, v.hits]));
    },
    release(name) {
      const gate = gates.get(name);
      if (!gate?.hits) throw Error(`Gate was not hit: ${name}`);
      gate.resolve();
      gates.delete(name);
    },
  };
}
