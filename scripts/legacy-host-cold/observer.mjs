import { createHash } from 'node:crypto';

const methods = new Set([
  'Browser.getVersion',
  'Browser.getBrowserCommandLine',
  'Target.getTargets',
  'Target.attachToTarget',
  'Target.detachFromTarget',
  'Page.getFrameTree',
  'Storage.getStorageKeyForFrame',
  'DOMStorage.enable',
  'DOMStorage.getDOMStorageItems',
  'IndexedDB.enable',
  'IndexedDB.requestDatabaseNames',
  'IndexedDB.requestDatabase',
  'IndexedDB.getMetadata',
  'IndexedDB.requestData',
  'CacheStorage.requestCacheNames',
  'CacheStorage.requestEntries',
  'CacheStorage.requestCachedResponse',
  'Runtime.getProperties',
  'Runtime.releaseObject',
  'Runtime.releaseObjectGroup',
]);
export const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function readerChannel(cdp) {
  return Object.freeze({
    send(method, params, sessionId) {
      if (!methods.has(method)) throw Error('observer-command-forbidden');
      return cdp.send(method, params, sessionId);
    },
  });
}
const maxRows = 4096,
  maxValueBytes = 65536,
  maxTotalBytes = 16 * 1024 * 1024;
const refuse = (reason) => {
  throw Error(reason);
};
/** No previews, calls, getters or source-string evaluation. Only supported primitive/byte values. */
export async function decodeValue(channel, session, value) {
  if (value.type === 'number' && Number.isFinite(value.value)) return value.value;
  if (value.type === 'string' && typeof value.value === 'string') {
    if (Buffer.byteLength(value.value) > maxValueBytes) refuse('observer-value-bound');
    return value.value;
  }
  if (value.type === 'boolean' && typeof value.value === 'boolean') return value.value;
  if (value.type === 'object' && value.subtype === 'null') return null;
  if (
    value.type !== 'object' ||
    value.subtype !== 'typedarray' ||
    value.className !== 'Uint8Array' ||
    typeof value.objectId !== 'string'
  )
    refuse('observer-value-unsupported');
  try {
    // Inspector description supplies an independent expected cardinality, never byte contents.
    const match = /^Uint8Array\((0|[1-9][0-9]*)\)$/u.exec(value.description ?? '');
    if (!match) refuse('observer-byte-length-unavailable');
    const length = Number(match[1]);
    if (length > maxValueBytes) refuse('observer-value-bound');
    const properties = await channel.send(
      'Runtime.getProperties',
      {
        objectId: value.objectId,
        ownProperties: true,
        generatePreview: false,
      },
      session,
    );
    if (properties.exceptionDetails) refuse('observer-property-exception');
    const bytes = Array.from({ length }),
      seen = new Set();
    for (const entry of properties.result) {
      if (entry.get || entry.set || !entry.value || entry.isOwn === false)
        refuse('observer-accessor');
      if (!/^(0|[1-9][0-9]*)$/u.test(entry.name)) refuse('observer-byte-property');
      const index = Number(entry.name),
        byte = entry.value.value;
      if (
        index >= length ||
        seen.has(index) ||
        entry.value.type !== 'number' ||
        !Number.isInteger(byte) ||
        byte < 0 ||
        byte > 255
      )
        refuse('observer-byte-property');
      seen.add(index);
      bytes[index] = byte;
    }
    if (seen.size !== length) refuse('observer-byte-truncation');
    return { bytes };
  } finally {
    await channel.send('Runtime.releaseObject', { objectId: value.objectId }, session);
  }
}

export async function readInventory(cdp, targetId, expectedOrigin, { pageSize = 7 } = {}) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 128) refuse('observer-page-bound');
  const channel = readerChannel(cdp);
  const { sessionId } = await channel.send('Target.attachToTarget', { targetId, flatten: true });
  try {
    const { frameTree } = await channel.send('Page.getFrameTree', {}, sessionId);
    const frame = frameTree.frame;
    if (new URL(frame.url).origin !== expectedOrigin) refuse('observer-origin-mismatch');
    const { storageKey } = await channel.send(
      'Storage.getStorageKeyForFrame',
      { frameId: frame.id },
      sessionId,
    );
    const binding = [frame.id, frame.loaderId, frame.url, storageKey];
    await channel.send('DOMStorage.enable', {}, sessionId);
    const { entries } = await channel.send(
      'DOMStorage.getDOMStorageItems',
      {
        storageId: { storageKey, isLocalStorage: true },
      },
      sessionId,
    );
    const local = entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    if (local.length > maxRows || new Set(local.map(([k]) => k)).size !== local.length)
      refuse('observer-local-bound');
    let total = Buffer.byteLength(JSON.stringify(local));
    if (total > maxTotalBytes) refuse('observer-total-bound');
    await channel.send('IndexedDB.enable', {}, sessionId);
    const names = await channel.send('IndexedDB.requestDatabaseNames', { storageKey }, sessionId);
    if (
      names.databaseNames.length > 32 ||
      new Set(names.databaseNames).size !== names.databaseNames.length
    )
      refuse('observer-database-bound');
    const databases = [];
    for (const databaseName of names.databaseNames.sort()) {
      const { databaseWithObjectStores: schema } = await channel.send(
        'IndexedDB.requestDatabase',
        { storageKey, databaseName },
        sessionId,
      );
      if (schema.name !== databaseName || schema.objectStores.length > 32)
        refuse('observer-schema-bound');
      const stores = [];
      for (const store of schema.objectStores.sort((a, b) => a.name.localeCompare(b.name))) {
        const params = { storageKey, databaseName, objectStoreName: store.name };
        const metadata = await channel.send('IndexedDB.getMetadata', params, sessionId);
        if (
          !Number.isSafeInteger(metadata.entriesCount) ||
          metadata.entriesCount < 0 ||
          metadata.entriesCount > maxRows
        )
          refuse('observer-row-bound');
        const rows = [],
          seen = new Set();
        for (;;) {
          const page = await channel.send(
            'IndexedDB.requestData',
            { ...params, skipCount: rows.length, pageSize },
            sessionId,
          );
          if (
            page.objectStoreDataEntries.length > pageSize ||
            (page.hasMore && !page.objectStoreDataEntries.length)
          )
            refuse('observer-pagination');
          for (const entry of page.objectStoreDataEntries) {
            const key = await decodeValue(channel, sessionId, entry.primaryKey);
            if (typeof key !== 'number' && typeof key !== 'string')
              refuse('observer-key-unsupported');
            if (seen.has(JSON.stringify(key))) refuse('observer-duplicate-row');
            seen.add(JSON.stringify(key));
            const value = await decodeValue(channel, sessionId, entry.value);
            total += Buffer.byteLength(JSON.stringify([key, value]));
            if (total > maxTotalBytes || rows.length >= maxRows) refuse('observer-total-bound');
            rows.push([key, value]);
          }
          if (!page.hasMore) break;
        }
        if (rows.length !== metadata.entriesCount) refuse('observer-pagination');
        const lastMetadata = await channel.send('IndexedDB.getMetadata', params, sessionId);
        if (hash(lastMetadata) !== hash(metadata))
          refuse(
            'observer-storage-changed: ' +
              JSON.stringify({
                databaseName,
                store: store.name,
                before: metadata,
                after: lastMetadata,
              }),
          );
        stores.push({ name: store.name, schema: store, rows, metadata });
      }
      databases.push({ name: databaseName, version: schema.version, stores });
    }
    const caches = [];
    const cacheNames = await channel.send(
      'CacheStorage.requestCacheNames',
      { storageKey },
      sessionId,
    );
    if (cacheNames.caches.length > 32) refuse('observer-cache-bound');
    for (const cache of cacheNames.caches.sort((a, b) => a.cacheName.localeCompare(b.cacheName))) {
      const entries = [],
        seen = new Set();
      for (let skipCount = 0; ;) {
        const page = await channel.send(
          'CacheStorage.requestEntries',
          { cacheId: cache.cacheId, skipCount, pageSize: 128 },
          sessionId,
        );
        for (const entry of page.cacheDataEntries) {
          const key = JSON.stringify([entry.requestURL, entry.requestMethod, entry.requestHeaders]);
          if (seen.has(key)) refuse('observer-cache-pagination');
          seen.add(key);
          const result = await channel.send(
            'CacheStorage.requestCachedResponse',
            {
              cacheId: cache.cacheId,
              requestURL: entry.requestURL,
              requestHeaders: entry.requestHeaders,
            },
            sessionId,
          );
          const bytes = Buffer.from(result.response.body, 'base64');
          total += bytes.length;
          if (total > maxTotalBytes || entries.length >= maxRows) refuse('observer-total-bound');
          entries.push({
            ...entry,
            url: entry.requestURL,
            method: entry.requestMethod,
            bodyHash: createHash('sha256').update(bytes).digest('hex'),
          });
        }
        skipCount += page.cacheDataEntries.length;
        if (skipCount === page.returnCount) break;
        if (!page.cacheDataEntries.length || skipCount > page.returnCount)
          refuse('observer-cache-pagination');
      }
      caches.push({
        name: cache.cacheName,
        entries: entries.sort((a, b) => a.url.localeCompare(b.url)),
      });
    }
    const last = (await channel.send('Page.getFrameTree', {}, sessionId)).frameTree.frame;
    const lastKey = await channel.send(
      'Storage.getStorageKeyForFrame',
      { frameId: last.id },
      sessionId,
    );
    if (hash([last.id, last.loaderId, last.url, lastKey.storageKey]) !== hash(binding))
      refuse('observer-context-changed');
    return { local, databases, caches };
  } finally {
    await channel
      .send('Runtime.releaseObjectGroup', { objectGroup: 'indexeddb' }, sessionId)
      .catch(() => {});
    await channel.send('Target.detachFromTarget', { sessionId }).catch(() => {});
  }
}
