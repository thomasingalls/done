/** Disposable carrier fixture shared by focused Node and native Chromium checks. No live account. */
import { createContentOwner, type ContentCrypto } from '../../src/crdt/contentStore';
import { contentTransaction, openContentDb } from '../../src/crdt/contentDatabase';
import {
  CONTENT_STORES,
  parseCounter,
  recordAAD,
  type ContentIdentity,
} from '../../src/crdt/contentRecord';
import type { DiskState } from '../../src/crdt/contentCompaction';
import {
  baselineAuthenticationPayload,
  encodeLocalBaseline,
} from '../../src/crdt/localBaselineRecord';
import { anchorLocalBaseline, readEncryptedBaseline } from '../../src/crdt/localBaselineStorage';
import { deriveStoreName } from '../../src/crdt/storeName';
import { hex, type Bytes } from '../../src/crdt/custodyCrypto';
import type { SessionTask } from '../../src/crdt/writeSession';
import { Y } from '../../src/crdt/yjs';

const zero = '0'.repeat(64),
  intent = 'ab'.repeat(16);
export const identity = (id: string): ContentIdentity => ({
  slotId: id,
  principalId: id,
  workspaceId: id,
  storeId: 'bc'.repeat(16),
  rootId: 'cd'.repeat(16),
});
export async function keys() {
  return {
    aes: await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]),
    hmac: await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
      'verify',
    ]),
  };
}
export function cryptFor(
  scope: ContentIdentity,
  material: Awaited<ReturnType<typeof keys>>,
): ContentCrypto {
  return {
    allowSpoolCounter: true,
    validate: () => {},
    sign: (t, b) =>
      t.wait(async () => new Uint8Array(await crypto.subtle.sign('HMAC', material.hmac, b))),
    verify: (t, b, m) => t.wait(() => crypto.subtle.verify('HMAC', material.hmac, m, b)),
    seal: (t, h, b) =>
      t.wait(async () => {
        const nonce = crypto.getRandomValues(new Uint8Array(12));
        return {
          ...h,
          nonce,
          ct: new Uint8Array(
            await crypto.subtle.encrypt(
              { name: 'AES-GCM', iv: nonce, additionalData: recordAAD(scope, h) },
              material.aes,
              b,
            ),
          ),
        };
      }),
    open: (t, r) =>
      t.wait(
        async () =>
          new Uint8Array(
            await crypto.subtle.decrypt(
              { name: 'AES-GCM', iv: r.nonce, additionalData: recordAAD(scope, r) },
              material.aes,
              r.ct,
            ),
          ),
      ),
  };
}
export async function setup(task: SessionTask, id = 'anchor-fixture', chars = 400000) {
  const scope = identity(id),
    k = await keys(),
    crypt = cryptFor(scope, k),
    carrier = createContentOwner(scope, 1, crypt);
  await carrier.initialize(task, { intent, checkCreation() {} });
  await carrier.enableSpool(task);
  const doc = new Y.Doc({ gc: false });
  doc.getText('text').insert(0, 'PRIVATE-FIXTURE-' + 'x'.repeat(chars));
  const snapshot = new Uint8Array(Y.encodeStateAsUpdate(doc));
  doc.destroy();
  await carrier.append(task, [{ kind: 'state', bytes: snapshot }]);
  const db = await openContentDb(
    task,
    await deriveStoreName(scope.principalId, scope.workspaceId),
    false,
  );
  const owner = {
    db,
    identity: scope,
    generation: 1,
    intent,
    crypt,
    assertCurrent: async () => {},
    checkCommit: () => {},
  };
  const census = await readCensus(task, owner);
  const counter = census.counter!;
  if (counter.v !== 2) throw Error('spool counter missing');
  const payload = encodeLocalBaseline({
    identity: scope,
    generation: 1,
    revision: 1,
    predecessor: zero,
    authority: zero,
    authorityState: { epoch: 1, head: zero, generation: 1, cutsHash: zero },
    cut: {
      intent,
      sequence: 1,
      nextSequence: counter.next_seq,
      reserved: [[1, counter.reserved[1]!]],
      witness: counter.spool,
    },
    snapshot,
    own: { position: 0, link: zero, attempts: 0, receipt: null },
    sources: [],
    streams: [],
    history: null,
  });
  const input = {
    baseline: { payload, mac: await crypt.sign(task, baselineAuthenticationPayload(payload)) },
    anchor: {
      revision: 1,
      hash: hex(new Uint8Array(await crypto.subtle.digest('SHA-256', payload))),
    },
  };
  return {
    owner,
    carrier,
    census,
    input,
    keys: k,
    anchor: () => anchorLocalBaseline(task, owner, census, input),
    read: () => readEncryptedBaseline(task, owner),
    close: () => {
      db.close();
      carrier.dispose();
    },
  };
}
export async function readCensus(
  task: SessionTask,
  owner: { db: IDBDatabase; identity: ContentIdentity; intent: string },
): Promise<DiskState> {
  return contentTransaction(
    owner.db,
    task,
    [...CONTENT_STORES],
    'readonly',
    (tx, result, guard) => {
      const census: DiskState = { counter: null, rows: [] };
      result(census);
      for (const name of CONTENT_STORES) {
        const s = tx.objectStore(name),
          v = s.getAll(),
          k = s.getAllKeys();
        k.onsuccess = () =>
          guard(() =>
            k.result.forEach((key, i) => {
              if (name === 'meta') {
                if (key !== 'counter') throw Error('unexpected fixture metadata');
                census.counter = parseCounter(v.result[i], owner.identity, owner.intent);
              } else census.rows.push({ store: name, key, value: v.result[i] });
            }),
          );
      }
    },
  );
}
export const bytesEqual = (a: Bytes, b: Bytes) =>
  a.length === b.length && a.every((n, i) => n === b[i]);
