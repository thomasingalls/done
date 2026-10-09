import {
  beginCustodyEnrollment,
  openCustodySession,
  type CustodySession,
} from '../../src/crdt/custody';
import { parseRecord, type CustodyRecord } from '../../src/crdt/custodyRecord';
import { hex } from '../../src/crdt/custodyCrypto';
export const scope = {
  slotId: 'native-custody-slot',
  principalId: 'native-custody-pr-é',
  workspaceId: 'native-custody-ws-🙂',
};
let code = '',
  session: CustodySession | undefined;
const authority = () => ({ ...scope, resolvePrincipal: () => scope.principalId });
export const configure = (c: string) => {
  code = c;
};
export async function raw<T>(
  mode: IDBTransactionMode,
  operation: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('done.custody');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction('entries', mode),
        r = operation(tx.objectStore('entries'));
      tx.oncomplete = () => resolve(r.result);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
const key = () => [scope.slotId, scope.principalId, scope.workspaceId];
const read = () => raw<CustodyRecord>('readonly', (s) => s.get(key()));
const write = (r: CustodyRecord) => raw('readwrite', (s) => s.put(r, key()));
const plain = (v: unknown): unknown =>
  v instanceof Uint8Array
    ? hex(v)
    : Array.isArray(v)
      ? v.map(plain)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]))
        : v;
const typed = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(typed)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.entries(v).map(([k, x]) => [
            k,
            ['nonce', 'ct', 'salt', 'publicKey', 'mac'].includes(k) && typeof x === 'string'
              ? new Uint8Array(x.match(/../g)!.map((b) => parseInt(b, 16)))
              : typed(x),
          ]),
        )
      : v;
export const record = async () => plain(await read());
export const put = async (v: unknown) => {
  await write(typed(v) as CustodyRecord);
};
export const stateShape = async (form: 'array' | 'boxed') => {
  const r = await read();
  (r as unknown as { state: unknown }).state =
    form === 'boxed' ? Object('protected') : ['protected'];
  await write(r);
};
export async function parserProbe() {
  try {
    return { accepted: true, type: typeof parseRecord(await read(), scope).state };
  } catch (e) {
    return { accepted: false, error: (e as { code?: string }).code };
  }
}
export async function begin() {
  const e = beginCustodyEnrollment(authority(), { checkCreation: () => {} });
  code = e.displayCode!;
  try {
    return { ok: true, code, descriptor: plain(await e.confirm(code)) };
  } catch (e) {
    return { ok: false, code, error: (e as { code?: string }).code };
  }
}
export async function open() {
  try {
    session = await openCustodySession(authority(), code);
    return {
      ok: true,
      descriptor: plain({
        scope: session.scope,
        rootId: session.rootId,
        storeId: session.storeId,
        publicCredentials: session.publicCredentials,
      }),
    };
  } catch (e) {
    return { ok: false, error: (e as { code?: string }).code };
  }
}
export const close = async () => {
  await session?.close();
  session = undefined;
};
let temporaries: Array<{ kind: string; bytes: Uint8Array }> = [],
  traces: unknown[] = [],
  raceFired = false;
export function observe(race = false) {
  temporaries = [];
  traces = [];
  raceFired = false;
  const originalSign = crypto.subtle.sign.bind(crypto.subtle);
  for (const method of [
    'encrypt',
    'decrypt',
    'importKey',
    'exportKey',
    'deriveKey',
    'sign',
  ] as const) {
    const original = (crypto.subtle[method] as (...args: any[]) => Promise<any>).bind(
      crypto.subtle,
    );
    (crypto.subtle as unknown as Record<string, unknown>)[method] = async (...args: any[]) => {
      if (method === 'encrypt') {
        temporaries.push({ kind: 'encrypted-plaintext', bytes: args[2] });
        traces.push({
          kind: 'encrypt',
          aad: hex(args[0].additionalData ?? new Uint8Array()),
          length: args[2].byteLength,
        });
      }
      if (method === 'importKey' && args[0] === 'pkcs8')
        temporaries.push({ kind: 'imported-private', bytes: args[1] });
      const result = await original(...args);
      if (method === 'decrypt')
        temporaries.push({ kind: 'opened-plaintext', bytes: new Uint8Array(result) });
      if (method === 'exportKey' && args[0] === 'pkcs8')
        temporaries.push({ kind: 'exported-private', bytes: new Uint8Array(result) });
      if (
        method === 'deriveKey' &&
        args[0].info &&
        new TextDecoder().decode(args[0].info).includes('done/custody-metadata/v2')
      )
        traces.push({
          kind: 'metadata-key',
          info: hex(args[0].info),
          salt: hex(args[0].salt),
          extractable: result.extractable,
          usages: result.usages,
          probe: hex(
            new Uint8Array(
              await originalSign('HMAC', result, new TextEncoder().encode('d6-native-probe')),
            ),
          ),
        });
      if (method === 'sign' && args[0] === 'HMAC' && race && !raceFired) {
        let v;
        try {
          v = JSON.parse(new TextDecoder().decode(args[2]));
        } catch {
          /* fixed probe */
        }
        if (v?.[0] === 'done/custody-metadata/v2' && v[2] === 'creating' && v[9] === 3) {
          const r = await read();
          r.mac[0] = r.mac[0]! ^ 1;
          await write(r);
          raceFired = true;
        }
      }
      return result;
    };
  }
}
export const observations = () => ({
  traces,
  raceFired,
  temporaries: temporaries.map((v) => ({
    kind: v.kind,
    length: v.bytes.length,
    zero: v.bytes.every((b) => b === 0),
  })),
});
