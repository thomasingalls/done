// Synthetic factor custody setup is shared with D4; all carrier operations below use D5's actual owners.
import { setup as custodySetup } from '../account-counter-contract/native-browser';
import { openJournalSession, type JournalSession } from '../../src/crdt/custody';
import { deriveStoreName } from '../../src/crdt/storeName';
import { hex, type Bytes } from '../../src/crdt/custodyCrypto';
import { type RecordKind, type StoredRecord } from '../../src/crdt/contentRecord';
let saved: Awaited<ReturnType<typeof custodySetup>>, session: JournalSession | undefined;
export const configure = (value: typeof saved) => {
  saved = value;
};
export async function setup() {
  saved = await custodySetup('store-native-🙂');
  return saved;
}
export async function open() {
  session = await openJournalSession(
    { ...saved.scope, resolvePrincipal: () => saved.scope.principalId },
    saved.code,
  );
}
export async function close() {
  await session?.close();
  session = undefined;
}
export async function append() {
  await session!.appendBatch(
    (['update', 'state', 'heads', 'outbound'] as RecordKind[]).map((kind, i) => ({
      kind,
      bytes: new Uint8Array([i, 0, 255, 1]),
    })),
  );
  return [0, 1].map((i) => session!.appendLocal(new Uint8Array([20 + i, 0, 255])));
}
export const local = () => session!.appendLocal(new Uint8Array([22, 0, 255]));
export const flush = () => session!.flushJournal();
export async function recover() {
  const r = await session!.loadRecovery();
  return {
    records: r.records.map((v) => ({ ...v, bytes: hex(v.bytes) })),
    journal: r.journal.map((v) => ({ ...v, bytes: hex(v.bytes) })),
  };
}
export async function raw<T>(
  store: string,
  mode: IDBTransactionMode,
  op: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const name = await deriveStoreName(saved.scope.principalId, saved.scope.workspaceId),
    db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open(name);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  try {
    return await new Promise<T>((res, rej) => {
      const tx = db.transaction(store, mode),
        r = op(tx.objectStore(store));
      tx.oncomplete = () => res(r.result);
      tx.onabort = () => rej(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function snapshot() {
  const rows = [];
  for (const store of ['content', 'heads', 'outbound'])
    for (const r of await raw<StoredRecord[]>(store, 'readonly', (s) => s.getAll()))
      rows.push({ store, ...r, nonce: hex(r.nonce), ct: hex(r.ct) });
  return {
    name: await deriveStoreName(saved.scope.principalId, saved.scope.workspaceId),
    rows,
    journal: Object.entries(localStorage)
      .filter(([k]) => k.startsWith('done.pending-update.'))
      .sort(),
  };
}
export async function setRow(
  row: {
    store: string;
    v: 1;
    gen: number;
    seq: number;
    kind: RecordKind;
    nonce: string;
    ct: string;
  },
  primary: number,
) {
  const unhex = (s: string): Bytes => new Uint8Array(s.match(/../g)!.map((v) => parseInt(v, 16))),
    { store, ...r } = row;
  await raw(store, 'readwrite', (s) =>
    s.put({ ...r, nonce: unhex(row.nonce), ct: unhex(row.ct) }, primary),
  );
}
