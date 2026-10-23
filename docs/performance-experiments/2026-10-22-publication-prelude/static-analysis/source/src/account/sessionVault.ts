/** Additional custody, serialized by the existing slot owner. Never edits content/custody records. */
import { hkdf, fields, random, hex, utf8, type Bytes } from '../crdt/custodyCrypto';
import { unhex } from '../../account-protocol/recovery';
import { pinBytes, type AuthorityPin } from '../../account-protocol/authority';
import { contentTransaction } from '../crdt/contentDatabase';
import type { SessionTask } from '../crdt/writeSession';

export const SESSION_DB = 'done.account-login.v1';
export interface SessionScope {
  pin: AuthorityPin;
  slotId: string;
  rootId: string;
  accountId: string;
}
export type SessionOutbox = { pin: AuthorityPin } & (
  | { operation: 'revoke'; body: { sessionId: string; revokeToken: string } }
  | { operation: 'cancel'; body: { attemptId: string; retryKey: string } }
);
interface Row {
  salt: string;
  counter: number;
  generation: number;
  seal: { sequence: number; ct: string } | null;
}
const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    let abandoned = false;
    const r = indexedDB.open(SESSION_DB, 1);
    const timer = setTimeout(() => {
      abandoned = true;
      reject(Error('Login storage timed out'));
    }, 10000);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('slots');
      r.result.createObjectStore('outbox');
    };
    r.onsuccess = () => {
      clearTimeout(timer);
      if (abandoned) r.result.close();
      else resolve(r.result);
    };
    r.onerror = () => {
      clearTimeout(timer);
      reject(r.error);
    };
    r.onblocked = () => {
      clearTimeout(timer);
      abandoned = true;
      reject(Error('Login storage is busy'));
    };
  });
function row(input: unknown): Row {
  const r = input as Row;
  if (
    !r ||
    Object.keys(r).sort().join() !== 'counter,generation,salt,seal' ||
    !Number.isInteger(r.counter) ||
    r.counter < 0 ||
    r.counter > 0xffffffff ||
    !Number.isSafeInteger(r.generation) ||
    r.generation < 0
  )
    throw Error('Invalid login record');
  unhex(r.salt, 32);
  if (
    r.seal &&
    (Object.keys(r.seal).sort().join() !== 'ct,sequence' ||
      !Number.isInteger(r.seal.sequence) ||
      r.seal.sequence < 1 ||
      r.seal.sequence > r.counter ||
      typeof r.seal.ct !== 'string' ||
      r.seal.ct.length > 262144)
  )
    throw Error('Invalid login seal');
  return r;
}
const nonce = (n: number) => {
  const bytes = new Uint8Array(12);
  new DataView(bytes.buffer).setUint32(8, n);
  return bytes;
};

export async function openSessionVault(task: SessionTask, root: Bytes, scope: SessionScope) {
  // Root bytes never escape this initialization; only a non-extractable domain key survives.
  const db = await open();
  try {
    task.step(() => {});
  } catch (e) {
    db.close();
    throw e;
  }
  let key: CryptoKey | undefined;
  const context = fields(
    'done/account-login-carrier/v1',
    hex(pinBytes(scope.pin)),
    scope.accountId,
    scope.slotId,
    scope.rootId,
  );
  const transaction = <T>(
    t: SessionTask,
    mode: IDBTransactionMode,
    fn: (r: Row | undefined, tx: IDBTransaction, result: (v: T) => void) => void,
  ) =>
    t.wait(() =>
      contentTransaction<T>(db, t, ['slots', 'outbox'], mode, (tx, result, guard) => {
        const q = tx.objectStore('slots').get(scope.slotId);
        q.onsuccess = () =>
          guard(() => fn(q.result === undefined ? undefined : row(q.result), tx, result));
      }),
    );
  let held: Row;
  try {
    held = await transaction(task, 'readwrite', (r, tx, result) => {
      const initial = r ?? { salt: hex(random(32)), counter: 0, generation: 0, seal: null };
      if (!r) tx.objectStore('slots').add(initial, scope.slotId);
      result(initial);
    });
    key = await task.wait(() =>
      hkdf(root, unhex(held.salt, 32), context, { name: 'AES-GCM', length: 256 }, [
        'encrypt',
        'decrypt',
      ]),
    );
  } catch (e) {
    db.close();
    throw e;
  }
  const aad = (generation: number, sequence: number) =>
    fields(hex(context), String(generation), String(sequence));
  const current = (r: Row | undefined) => {
    if (
      !key ||
      !r ||
      r.salt !== held.salt ||
      r.generation !== held.generation ||
      r.counter !== held.counter ||
      JSON.stringify(r.seal) !== JSON.stringify(held.seal)
    )
      throw Error('Login generation changed');
    return r;
  };
  return {
    async load(t: SessionTask): Promise<unknown> {
      await transaction(t, 'readonly', (r, _tx, result) => result(current(r)));
      if (!held.seal) return null;
      const bytes = new Uint8Array(
        await t.wait(() =>
          crypto.subtle.decrypt(
            {
              name: 'AES-GCM',
              iv: nonce(held.seal!.sequence),
              additionalData: aad(held.generation, held.seal!.sequence),
            },
            key!,
            unhex(held.seal!.ct, held.seal!.ct.length / 2),
          ),
        ),
      );
      try {
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      } finally {
        bytes.fill(0);
      }
    },
    async save(t: SessionTask, value: unknown, signOut: readonly SessionOutbox[] = []) {
      // Reserve and commit before encryption. An abort burns the nonce, including across restart.
      held = await transaction(t, 'readwrite', (r, tx, result) => {
        const old = current(r);
        if (old.counter === 0xffffffff) throw Error('Login nonce budget exhausted');
        const next = { ...old, counter: old.counter + 1 };
        tx.objectStore('slots').put(next, scope.slotId);
        result(next);
      });
      const generation = held.generation + (signOut.length || value === 'signed-out' ? 1 : 0);
      if (!Number.isSafeInteger(generation)) throw Error('Login generation exhausted');
      const plain = utf8(JSON.stringify(value));
      if (plain.length > 131056) {
        plain.fill(0);
        throw Error('Login state too large');
      }
      let ct: string;
      try {
        ct = hex(
          new Uint8Array(
            await t.wait(() =>
              crypto.subtle.encrypt(
                {
                  name: 'AES-GCM',
                  iv: nonce(held.counter),
                  additionalData: aad(generation, held.counter),
                },
                key!,
                plain,
              ),
            ),
          ),
        );
      } finally {
        plain.fill(0);
      }
      held = await transaction(t, 'readwrite', (r, tx, result) => {
        const old = current(r),
          next = { ...old, generation, seal: { sequence: old.counter, ct } };
        tx.objectStore('slots').put(next, scope.slotId);
        for (const item of signOut)
          tx.objectStore('outbox').put(
            item,
            JSON.stringify([scope.slotId, old.salt, generation, item.operation, item.body]),
          );
        result(next);
      });
    },
    close() {
      key = undefined;
      db.close();
    },
  };
}
export type SessionVault = Awaited<ReturnType<typeof openSessionVault>>;

/** No factor or renewal secret is needed to deliver these narrowly destructive capabilities. */
export async function drainSessionOutbox(
  pin: AuthorityPin,
  send: (item: SessionOutbox) => Promise<boolean>,
  observe?: (pending: number) => void,
) {
  const db = await open();
  try {
    const entries = await new Promise<{ key: IDBValidKey; value: SessionOutbox }[]>(
      (resolve, reject) => {
        const tx = db.transaction('outbox'),
          q = tx.objectStore('outbox').openCursor();
        const items: { key: IDBValidKey; value: SessionOutbox }[] = [];
        q.onsuccess = () => {
          const c = q.result;
          if (c) {
            items.push({ key: c.key, value: c.value });
            if (items.length < 256) c.continue();
          }
        };
        tx.oncomplete = () => resolve(items);
        tx.onabort = () => reject(tx.error);
      },
    );
    let pending = entries.length;
    observe?.(pending);
    for (const { key, value } of entries) {
      // Corrupt records cannot redirect secrets off-origin or become broader requests.
      try {
        if (
          hex(pinBytes(value.pin)) !== hex(pinBytes(pin)) ||
          !['revoke', 'cancel'].includes(value.operation)
        )
          continue;
        const names =
          value.operation === 'revoke' ? ['revokeToken', 'sessionId'] : ['attemptId', 'retryKey'];
        if (
          Object.keys(value.body).sort().join() !== names.sort().join() ||
          Object.values(value.body).some((v) => !/^[A-Za-z0-9_-]{43}$/.test(v))
        )
          continue;
        if (!(await send(value))) continue;
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('outbox', 'readwrite', { durability: 'strict' });
          tx.objectStore('outbox').delete(key);
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
        });
        --pending;
        observe?.(pending);
      } catch {
        /* Retain pending revocation for a later bounded attempt. */
      }
    }
    return pending;
  } finally {
    db.close();
  }
}
