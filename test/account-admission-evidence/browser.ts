export * from '../account-admission-bounds/browser';
export { activationOptions } from '../../account-protocol/activation';
import { Y, genesisCoverageParts } from '../../src/crdt/yjs';
import { openJournalSession, withRecoveryUnderPermit } from '../../src/crdt/custody';
import { replayRecovery } from '../../src/crdt/admissionDocument';
import { registerWorkspaceActor } from '../../src/crdt/actors';
import { openTree } from '../../src/crdt/doc';
import type { CustodyScope } from '../../src/crdt/custodyRecord';
import { withPromotionSlot } from '../../src/crdt/writeSession';
import {
  readPromotion,
  withPromotionRoot,
  signPromotion,
  writePromotion,
} from '../../src/crdt/promotionRecord';
import { hex, openCredential } from '../../src/crdt/custodyCrypto';
import { claimScope } from '../../src/crdt/localGenesisRecord';
import {
  parseReceipt,
  completionBodies,
  manifestMessage,
  semanticMessage,
} from '../../account-protocol/admission';
const hash = async (b: Uint8Array<ArrayBuffer>) =>
  hex(new Uint8Array(await crypto.subtle.digest('SHA-256', b)));

/** Actual retained Yjs text, persisted in batches below the content-store limit. */
export async function seedSized(scope: CustodyScope, code: string, target: number) {
  const session = await openJournalSession(
    { ...scope, resolvePrincipal: () => scope.principalId },
    code,
  );
  const doc = new Y.Doc({ gc: false });
  doc.clientID = 424242;
  try {
    const actor = registerWorkspaceActor(doc, {
      id: scope.principalId,
      actor: { kind: 'human', name: 'Fixture', color: '#123456' },
      device: { id: 'size-fixture', name: 'fixture' },
    });
    openTree(doc, actor.origin);
    await session.appendBatch([
      { kind: 'update', bytes: new Uint8Array(Y.encodeStateAsUpdate(doc)) },
    ]);
    const text = doc.getText('master');
    for (let i = 0; i < 15; i++) {
      const sv = Y.encodeStateVector(doc);
      text.insert(text.length, 'x'.repeat(1024 * 1024));
      await session.appendBatch([
        { kind: 'update', bytes: new Uint8Array(Y.encodeStateAsUpdate(doc, sv)) },
      ]);
    }
    const base = Y.encodeStateAsUpdate(doc),
      sv = Y.encodeStateVector(doc);
    let n = target - base.length;
    for (let tries = 0; tries < 5; tries++) {
      const probe = new Y.Doc({ gc: false });
      try {
        Y.applyUpdate(probe, base);
        probe.clientID = 424242;
        probe.getText('master').insert(text.length, 'x'.repeat(n));
        const encoded = Y.encodeStateAsUpdate(probe);
        if (encoded.length === target) {
          const delta = new Uint8Array(Y.encodeStateAsUpdate(probe, sv));
          Y.applyUpdate(doc, delta);
          await session.appendBatch([{ kind: 'update', bytes: delta }]);
          return {
            bytes: encoded.length,
            sha256: await hash(new Uint8Array(encoded)),
            textLength: probe.getText('master').length,
          };
        }
        n += target - encoded.length;
      } finally {
        probe.destroy();
      }
    }
    throw Error('Could not construct exact snapshot boundary');
  } finally {
    doc.destroy();
    await session.close();
  }
}
export async function recovered(scope: CustodyScope, code: string) {
  return withPromotionSlot(scope.slotId, code, (task) =>
    withRecoveryUnderPermit(
      task,
      { ...scope, resolvePrincipal: () => scope.principalId },
      code,
      async (source) => {
        const doc = new Y.Doc({ gc: false });
        try {
          replayRecovery(doc, source);
          const update = new Uint8Array(Y.encodeStateAsUpdate(doc)),
            parts = genesisCoverageParts(doc);
          return {
            bytes: update.length,
            sha256: await hash(update),
            textLength: doc.getText('master').length,
            parts: { sv: hex(parts.sv), ds: hex(parts.ds) },
          };
        } finally {
          doc.destroy();
        }
      },
    ),
  );
}
/** A test-owned, correctly MACed carrier. The service-issued receipt is preserved verbatim. */
export async function retainReceipt(slotId: string, code: string, input: unknown) {
  const receipt = parseReceipt(input);
  await withPromotionSlot(slotId, code, async (task) => {
    const { claim, record, marker } = await readPromotion(task, slotId, code);
    await withPromotionRoot(task, claim, record, code, async (root, subtle) => {
      const next = await signPromotion(
        root,
        {
          ...marker!,
          stage: 'admission-receipted',
          admission: {
            ...marker!.admission!,
            offer: receipt.offer,
            completion: receipt.completion,
            receipt,
          },
        },
        subtle,
      );
      await writePromotion(task, claim, record, record, marker, next);
    });
  });
}
export async function forgeCompletion(
  slotId: string,
  code: string,
  parts: { sv: string; ds: string },
) {
  await withPromotionSlot(slotId, code, async (task) => {
    const { claim, record, marker } = await readPromotion(task, slotId, code);
    await withPromotionRoot(task, claim, record, code, async (root, subtle) => {
      const retained = marker!.admission!;
      const c = await completionBodies(retained.request, retained.offer!, parts);
      const signer = await openCredential(claimScope(claim), root, marker!.credentials![1], subtle);
      const sign = async (b: Uint8Array<ArrayBuffer>) =>
        hex(new Uint8Array(await subtle.sign('Ed25519', signer, b)));
      c.manifest.signature = await sign(await manifestMessage(c.manifest));
      c.admission.signature = await sign(await semanticMessage(c.admission));
      const next = await signPromotion(
        root,
        { ...marker!, admission: { ...retained, completion: c } },
        subtle,
      );
      await writePromotion(task, claim, record, record, marker, next);
    });
  });
}
/** Hash each binary/string value before serialization, avoiding huge numeric-array census strings. */
async function fingerprint(v: unknown): Promise<unknown> {
  if (v instanceof Uint8Array) return { binary: v.length, sha256: await hash(new Uint8Array(v)) };
  if (typeof v === 'string')
    return { string: v.length, sha256: await hash(new TextEncoder().encode(v)) };
  if (Array.isArray(v)) return Promise.all(v.map(fingerprint));
  if (v && typeof v === 'object')
    return Object.fromEntries(
      await Promise.all(Object.entries(v).map(async ([k, x]) => [k, await fingerprint(x)])),
    );
  return v;
}
export async function census(omitMarker = false) {
  const all: unknown[] = [];
  for (const entry of (await indexedDB.databases()).sort((a, b) =>
    a.name!.localeCompare(b.name!),
  )) {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(entry.name!);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      for (const store of [...db.objectStoreNames]) {
        const rows = await new Promise<unknown[]>((resolve, reject) => {
          const tx = db.transaction(store),
            s = tx.objectStore(store),
            ks = s.getAllKeys(),
            vs = s.getAll();
          tx.oncomplete = () =>
            resolve(
              ks.result.flatMap((k, i) =>
                omitMarker && Array.isArray(k) && k[1] === 'application-upgrade'
                  ? []
                  : [[k, vs.result[i]]],
              ),
            );
          tx.onabort = () => reject(tx.error);
        });
        all.push([entry.name, store, await fingerprint(rows)]);
      }
    } finally {
      db.close();
    }
  }
  all.push(
    await fingerprint(
      Object.keys(localStorage)
        .sort()
        .map((k) => [k, localStorage.getItem(k)]),
    ),
  );
  return hash(new TextEncoder().encode(JSON.stringify(all)));
}
export function observe() {
  const seals: { bytes: number; zero?: boolean }[] = [],
    inputs: Uint8Array[] = [];
  const puts: { store: string; stage: unknown }[] = [];
  const encrypt = SubtleCrypto.prototype.encrypt,
    put = IDBObjectStore.prototype.put;
  SubtleCrypto.prototype.encrypt = async function (...args: Parameters<SubtleCrypto['encrypt']>) {
    const a = args[0] as AesGcmParams;
    const bytes = (v: BufferSource) =>
      v instanceof ArrayBuffer
        ? new Uint8Array(v)
        : new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    if (
      a.additionalData &&
      new TextDecoder().decode(bytes(a.additionalData)).includes('done/cp/v1')
    ) {
      const b = bytes(args[2]);
      seals.push({ bytes: b.length });
      inputs.push(b);
    }
    return encrypt.apply(this, args);
  };
  IDBObjectStore.prototype.put = function (v, k) {
    puts.push({ store: this.name, stage: v?.stage ?? null });
    return k === undefined ? put.call(this, v) : put.call(this, v, k);
  };
  return () => ({
    seals: seals.map((s, i) => ({ ...s, zero: inputs[i]!.every((b) => b === 0) })),
    puts,
  });
}
