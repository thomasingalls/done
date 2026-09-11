import {
  beginCustodyEnrollment,
  initializeContentStore,
  prepareAccountCustody,
  openContentSession,
} from '../../src/crdt/custody';
import {
  fields,
  hkdf,
  hex,
  normalizeDeviceCode,
  openFactor,
  openEnvelope,
  utf8,
  type Bytes,
} from '../../src/crdt/custodyCrypto';
import { type CustodyRecord } from '../../src/crdt/custodyRecord';
import { withExclusiveSlot } from '../../src/crdt/writeSession';
import { deriveStoreName } from '../../src/crdt/storeName';
import {
  counterPayload,
  witnessPayload,
  type ContentCounter,
  type ContentWitness,
  type ContentIdentity,
} from '../../src/crdt/contentRecord';
import { extendSpoolWitness, verifySpoolWitness } from '../../src/crdt/spoolRecord';
let scope: ContentIdentity, code: string, generation: Bytes, metadata: CryptoKey;
const raw = async <T>(
  name: string,
  store: string,
  mode: IDBTransactionMode,
  op: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(name);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode),
        r = op(tx.objectStore(store));
      tx.oncomplete = () => resolve(r.result);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
};
const dbName = () => deriveStoreName(scope.principalId, scope.workspaceId);
export const getCounter = async () =>
  raw<ContentCounter>(await dbName(), 'meta', 'readonly', (s) => s.get('counter'));
export const putCounter = async (c: ContentCounter) => {
  await raw(await dbName(), 'meta', 'readwrite', (s) => s.put(c, 'counter'));
};
const witnessKey = () => [scope.slotId, scope.principalId, scope.workspaceId, 'content-v1'];
export const getWitness = () =>
  raw<ContentWitness>('done.custody', 'entries', 'readonly', (s) => s.get(witnessKey()));
export const putWitness = async (w: ContentWitness) => {
  await raw('done.custody', 'entries', 'readwrite', (s) => s.put(w, witnessKey()));
};
const authority = () => ({ ...scope, resolvePrincipal: () => scope.principalId });
export async function configure(saved: {
  scope: ContentIdentity;
  code: string;
  generation: string;
}) {
  scope = saved.scope;
  code = saved.code;
  generation = new Uint8Array(saved.generation.match(/../g)!.map((s) => parseInt(s, 16)));
  metadata = await hkdf(
    generation,
    new Uint8Array(),
    fields(
      'done/content-metadata/v1',
      scope.slotId,
      scope.principalId,
      scope.workspaceId,
      scope.storeId,
    ),
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    ['sign', 'verify'],
  );
}
export async function setup(slotId: string) {
  const a = {
      slotId,
      principalId: 'counter-native-pr',
      workspaceId: 'counter-native-ws',
      resolvePrincipal: () => 'counter-native-pr',
    },
    checkCreation = () => {};
  const e = beginCustodyEnrollment(a, { checkCreation });
  code = e.displayCode!;
  await e.confirm(code);
  const descriptor = await initializeContentStore(a, code, { checkCreation });
  const record = await raw<CustodyRecord>('done.custody', 'entries', 'readonly', (s) =>
    s.get([a.slotId, a.principalId, a.workspaceId]),
  );
  scope = { ...a, storeId: descriptor.storeId, rootId: record.root_id };
  const root = await openFactor(a, utf8(normalizeDeviceCode(code)), record.seals[0]!);
  try {
    generation = await openEnvelope(a, root, record.envelope!);
  } finally {
    root.fill(0);
  }
  const saved = {
    scope: {
      slotId: scope.slotId,
      principalId: scope.principalId,
      workspaceId: scope.workspaceId,
      storeId: scope.storeId,
      rootId: scope.rootId,
    },
    code,
    generation: hex(generation),
  };
  await configure(saved);
  return saved;
}
export async function signCounter(c: ContentCounter) {
  return {
    ...c,
    mac: new Uint8Array(await crypto.subtle.sign('HMAC', metadata, counterPayload(scope, c))),
  };
}
export async function signWitness(w: ContentWitness) {
  return {
    ...w,
    mac: new Uint8Array(await crypto.subtle.sign('HMAC', metadata, witnessPayload(scope, w))),
  };
}
export async function run(action: 'read' | 'enable' | 'event', text = 'test-event') {
  return withExclusiveSlot(scope.slotId, async (task) => {
    const owner = prepareAccountCustody(
      authority(),
      code,
      async (rows, _task, c) => {
        await verifySpoolWitness(
          {
            events: rows
              .filter((r) => r.kind === 'heads')
              .sort((a, b) => a.seq - b.seq)
              .map((r) => r.bytes),
          } as Parameters<typeof verifySpoolWitness>[0],
          c,
          crypto.subtle,
        );
      },
      true,
    );
    try {
      await owner.initialize(task);
      if (action === 'enable') await owner.carrier.enableSpool(task);
      if (action === 'event') {
        const before = await owner.carrier.spoolWitness(task),
          b = utf8(text),
          after = await extendSpoolWitness(before, b, crypto.subtle);
        await owner.carrier.appendSpool(task, { kind: 'heads', bytes: b }, { before, after });
      }
      const rows = await owner.carrier.load(task);
      return {
        rows: rows.map((r) => ({ seq: r.seq, kind: r.kind, hex: hex(r.bytes) })),
        counter: await getCounter(),
      };
    } finally {
      owner.dispose();
    }
  });
}
export async function ordinaryOpen() {
  const s = await openContentSession(authority(), code);
  await s.close();
}
export async function snapshot() {
  const c = await getCounter(),
    w = await getWitness();
  return { counter: { ...c, mac: hex(c.mac) }, witness: { ...w, mac: hex(w.mac) } };
}
