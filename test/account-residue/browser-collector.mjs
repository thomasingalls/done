/** Serialized directly into an isolated test page. Only platform APIs, no product imports. */
export async function collectBrowser({ limits, omit = '', fault = '' }) {
  const results = [];
  const utf8 = (v) => new TextEncoder().encode(v);
  const raw = (bytes) => {
    let s = '';
    for (let i = 0; i < bytes.length; i += 8192)
      s += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(s);
  };
  async function surface(name, acquire) {
    if (omit === name) return;
    const c = {
      surface: name,
      origin: location.origin,
      entries: [],
      errors: [],
      opaque: [],
      complete: true,
    };
    let bytes = 0,
      ended = false,
      timer;
    const add = (location, value, type = 'string') => {
      if (ended) return;
      const b = typeof value === 'string' ? utf8(value) : value;
      bytes += b.byteLength;
      if (b.byteLength > limits.valueBytes || bytes > limits.surfaceBytes)
        throw Error('acquisition-byte-budget');
      c.entries.push({ location, type, raw: raw(b) });
    };
    const seen = new WeakSet();
    const walk = async (v, path, depth = 0) => {
      if (depth > limits.cloneDepth) throw Error('clone-depth-budget');
      if (typeof v === 'string') {
        add(path, v);
        return;
      }
      if (v == null || ['number', 'boolean', 'bigint', 'undefined'].includes(typeof v)) {
        add(path, String(v));
        return;
      }
      if (seen.has(v)) {
        add(path, '[cycle]', 'cycle');
        return;
      }
      seen.add(v);
      if (v instanceof CryptoKey) {
        c.opaque.push({ location: path, type: v.type, usages: v.usages, algorithm: v.algorithm });
        await walk(
          { type: v.type, usages: v.usages, algorithm: v.algorithm },
          [...path, 'key-metadata'],
          depth + 1,
        );
        return;
      }
      if (v instanceof Blob) {
        if (fault === 'blob') return;
        add([...path, 'mime'], v.type);
        if (v instanceof File) add([...path, 'name'], v.name);
        if (v.size > limits.valueBytes) throw Error('acquisition-byte-budget');
        add([...path, 'bytes'], new Uint8Array(await v.arrayBuffer()), 'blob');
        return;
      }
      if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) {
        if (fault === 'view') return;
        add(
          path,
          v instanceof ArrayBuffer
            ? new Uint8Array(v)
            : new Uint8Array(v.buffer, v.byteOffset, v.byteLength),
          'bytes',
        );
        return;
      }
      if (v instanceof Date) {
        add(path, v.toISOString(), 'date');
        return;
      }
      if (v instanceof Map) {
        let i = 0;
        for (const [k, val] of v) {
          await walk(k, [...path, 'map-key', i], depth + 1);
          await walk(val, [...path, 'map-value', i++], depth + 1);
        }
        return;
      }
      if (v instanceof Set) {
        let i = 0;
        for (const val of v) await walk(val, [...path, 'set', i++], depth + 1);
        return;
      }
      if (Array.isArray(v) && v.length && v.every((b) => Number.isInteger(b) && b >= 0 && b < 256))
        add([...path, 'byte-array'], new Uint8Array(v), 'byte-array');
      if (!Array.isArray(v) && ![Object.prototype, null].includes(Object.getPrototypeOf(v)))
        throw Error('unsupported-clone-type');
      for (const k of Reflect.ownKeys(v)) {
        if (typeof k !== 'string') throw Error('unsupported-symbol-key');
        if (fault !== 'key') add([...path, 'property-key', k], k);
        const d = Object.getOwnPropertyDescriptor(v, k);
        if (!('value' in d)) throw Error('unsupported-accessor');
        await walk(d.value, [...path, k], depth + 1);
      }
    };
    try {
      await Promise.race([
        acquire(add, walk),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Error('collector-timeout')), limits.collectorMs);
        }),
      ]);
    } catch (e) {
      c.complete = false;
      c.errors.push(e.message);
    } finally {
      ended = true;
      clearTimeout(timer);
    }
    results.push(c);
  }
  await surface('indexedDB', async (add, walk) => {
    if (!indexedDB.databases) throw Error('unsupported-database-enumeration');
    const dbs = (await indexedDB.databases()).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of dbs) {
      add(['database', entry.name], entry.name);
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open(entry.name);
        r.onupgradeneeded = () => {
          r.transaction.abort();
          reject(Error('database-vanished'));
        };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.onblocked = () => reject(Error('database-blocked'));
      });
      try {
        const stores = [...db.objectStoreNames].sort();
        add([entry.name, 'version'], String(db.version));
        if (!stores.length) continue;
        const captured = await new Promise((resolve, reject) => {
          const tx = db.transaction(stores, 'readonly'),
            all = [];
          for (const name of stores) {
            const store = tx.objectStore(name),
              keys = store.getAllKeys(),
              values = store.getAll();
            const schema = {
              name,
              keyPath: store.keyPath,
              autoIncrement: store.autoIncrement,
              indexes: [...store.indexNames].map((n) => {
                const i = store.index(n);
                return { name: n, keyPath: i.keyPath, unique: i.unique, multiEntry: i.multiEntry };
              }),
            };
            all.push({ schema, keys, values });
          }
          tx.oncomplete = () =>
            resolve(
              all.map(({ schema, keys, values }) => ({
                schema,
                keys: keys.result,
                values: values.result,
              })),
            );
          tx.onabort = () => reject(tx.error ?? Error('transaction-aborted'));
        });
        for (const { schema, keys, values } of captured) {
          await walk(schema, [entry.name, schema.name, 'schema']);
          for (let i = 0; i < keys.length; i++) {
            await walk(keys[i], [entry.name, schema.name, 'key', i]);
            // Key retained losslessly in locator for exact field policy, and scanned independently above.
            await walk(values[i], [entry.name, schema.name, 'value', keys[i]]);
          }
        }
      } finally {
        db.close();
      }
    }
    const after = (await indexedDB.databases()).sort((a, b) => a.name.localeCompare(b.name));
    if (JSON.stringify(dbs) !== JSON.stringify(after)) throw Error('database-inventory-changed');
  });
  for (const name of ['localStorage', 'sessionStorage'])
    await surface(name, async (add) => {
      const s = globalThis[name],
        keys = Array.from({ length: s.length }, (_, i) => s.key(i)).sort();
      for (const key of keys) {
        if (key === null) throw Error('storage-key-vanished');
        const value = s.getItem(key);
        if (value === null) throw Error('storage-value-vanished');
        add(['key', key], key);
        add(['value', key], value);
      }
      if (
        JSON.stringify(keys) !==
        JSON.stringify(Array.from({ length: s.length }, (_, i) => s.key(i)).sort())
      )
        throw Error('storage-inventory-changed');
    });
  await surface('cacheStorage', async (add, walk) => {
    if (!globalThis.caches) throw Error('unsupported-cache-storage');
    const names = (await caches.keys()).sort();
    for (const name of names) {
      add(['cache', name], name);
      const cache = await caches.open(name);
      for (const req of await cache.keys()) {
        const p = [name, req.url];
        await walk({ url: req.url, method: req.method, headers: [...req.headers] }, [
          ...p,
          'request',
        ]);
        const res = await cache.match(req);
        if (!res || res.type === 'opaque' || res.type === 'opaqueredirect')
          throw Error('unreadable-cache-response');
        await walk({ status: res.status, statusText: res.statusText, headers: [...res.headers] }, [
          ...p,
          'response',
        ]);
        const reader = res.body?.getReader(),
          chunks = [];
        let size = 0;
        if (reader)
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              size += value.length;
              if (size > limits.valueBytes) throw Error('acquisition-byte-budget');
              chunks.push(value);
            }
          } finally {
            await reader.cancel();
          }
        const b = new Uint8Array(size);
        let i = 0;
        for (const chunk of chunks) {
          b.set(chunk, i);
          i += chunk.length;
        }
        add([...p, 'body'], b, 'bytes');
      }
    }
    if (JSON.stringify(names) !== JSON.stringify((await caches.keys()).sort()))
      throw Error('cache-inventory-changed');
  });
  await surface('opfs', async (add) => {
    if (!navigator.storage?.getDirectory) throw Error('unsupported-opfs');
    const root = await navigator.storage.getDirectory();
    const visit = async (dir, path, depth) => {
      if (depth > limits.cloneDepth) throw Error('directory-depth-budget');
      const entries = [];
      for await (const [name, entry] of dir.entries()) entries.push([name, entry]);
      entries.sort(([a], [b]) => a.localeCompare(b));
      for (const [name, entry] of entries) {
        add([...path, 'name', name], name);
        if (entry.kind === 'directory') await visit(entry, [...path, name], depth + 1);
        else {
          const file = await entry.getFile();
          if (file.size > limits.valueBytes) throw Error('acquisition-byte-budget');
          const bytes = new Uint8Array(await file.arrayBuffer());
          add(
            [...path, name, 'bytes'],
            fault === 'truncate' ? bytes.subarray(0, Math.min(65536, bytes.length)) : bytes,
            'file',
          );
        }
      }
    };
    await visit(root, [], 0);
  });
  return results;
}

/** Lossless bounded console argument capture; jsonValue()/console.text() alone lose Blob/view data. */
export async function captureDiagnostic(value) {
  const entries = [],
    seen = new WeakSet();
  let total = 0;
  const add = (location, v) => {
    const b = typeof v === 'string' ? new TextEncoder().encode(v) : v;
    total += b.length;
    if (total > 64 * 1024 ** 2) throw Error('diagnostic-byte-budget');
    let s = '';
    for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
    entries.push({ location, raw: btoa(s) });
  };
  const walk = async (v, path, depth) => {
    if (depth > 64) throw Error('diagnostic-depth-budget');
    if (typeof v === 'string') {
      add(path, v);
      return;
    }
    if (v == null || ['number', 'boolean', 'undefined', 'bigint'].includes(typeof v)) {
      add(path, String(v));
      return;
    }
    if (seen.has(v)) return;
    seen.add(v);
    if (v instanceof Blob) {
      if (v.size > 64 * 1024 ** 2) throw Error('diagnostic-byte-budget');
      add(path, new Uint8Array(await v.arrayBuffer()));
      add([...path, 'type'], v.type);
      if (v instanceof File) add([...path, 'name'], v.name);
      return;
    }
    if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) {
      add(
        path,
        v instanceof ArrayBuffer
          ? new Uint8Array(v)
          : new Uint8Array(v.buffer, v.byteOffset, v.byteLength),
      );
      return;
    }
    if (v instanceof Date) {
      add(path, v.toISOString());
      return;
    }
    if (v instanceof Map) {
      let i = 0;
      for (const [k, x] of v) {
        await walk(k, [...path, 'key', i], depth + 1);
        await walk(x, [...path, 'value', i++], depth + 1);
      }
      return;
    }
    if (v instanceof Set) {
      let i = 0;
      for (const x of v) await walk(x, [...path, i++], depth + 1);
      return;
    }
    if (v instanceof CryptoKey) {
      await walk(
        { type: v.type, usages: v.usages, algorithm: v.algorithm },
        [...path, 'opaque-key'],
        depth + 1,
      );
      return;
    }
    if (
      !Array.isArray(v) &&
      !(v instanceof Error) &&
      ![Object.prototype, null].includes(Object.getPrototypeOf(v))
    )
      throw Error('unsupported-diagnostic-type');
    if (Array.isArray(v) && v.length && v.every((n) => Number.isInteger(n) && n >= 0 && n < 256))
      add([...path, 'byte-array'], new Uint8Array(v));
    for (const key of Reflect.ownKeys(v)) {
      if (typeof key !== 'string') throw Error('unsupported-diagnostic-symbol');
      add([...path, 'key', key], key);
      const d = Object.getOwnPropertyDescriptor(v, key);
      if (!('value' in d)) throw Error('unsupported-diagnostic-accessor');
      await walk(d.value, [...path, key], depth + 1);
    }
  };
  await walk(value, [], 0);
  return entries;
}
