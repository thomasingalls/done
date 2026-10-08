/** Replacement snapshot encryption/replay. The native producer must independently prove accepted cuts. */
import {
  replacementCheckpointHeads,
  replacementCheckpointAAD,
  replacementCheckpointMessage,
  verifyReplacementCheckpoint,
  type ReplacementCheckpoint,
} from '../../account-protocol/replacementCheckpoint';
import { checkpointHeadDigest } from '../../account-protocol/contentCheckpoint';
import { membershipState, type VerifiedMembership } from '../../account-protocol/membership';
import { digest, unhex } from '../../account-protocol/recovery';
import { GENESIS_LIMIT } from '../../account-protocol/genesis';
import { hkdf, fields, hex, random, type Bytes } from './custodyCrypto';
import { Y, genesisCoverageParts, sameDocState, hasPendingUpdates, type YDoc } from './yjs';
import { actors } from './promotionGenesis';

const keyFor = (key: Bytes, c: ReplacementCheckpoint) =>
  hkdf(
    key,
    unhex(c.salt, 16),
    fields(
      'done/replacement-checkpoint-key/v1',
      c.manifest.workspaceId,
      c.manifest.lineageId,
      String(c.manifest.generation),
    ),
    { name: 'AES-GCM', length: 256 },
    ['encrypt', 'decrypt'],
    crypto.subtle,
  );
const ownKey = (key: Bytes) => {
  if (!(key instanceof Uint8Array) || key.length !== 32) throw Error('Invalid replacement key');
  return key.slice();
};

/** Internal construction primitive, not publication permission. `accepted` must be cold-replayed from
 * authenticated baseline + every publisher through the admission cuts. `local` adds durable originals
 * (including journal writing), without advancing those cuts. The caller retains exact output before send. */
export async function createReplacementCheckpoint(
  accepted: YDoc,
  local: YDoc,
  key: Bytes,
  parent: VerifiedMembership,
  producer: string,
  candidate: string,
  sign: (bytes: Bytes) => Promise<string>,
): Promise<ReplacementCheckpoint> {
  const p = membershipState(parent),
    preparation = p.preparations.find((r) => r.credentialId === candidate);
  if (
    p.generation < 2 ||
    !preparation ||
    !p.roster.some((r) => r.id === candidate && r.state === 'pending') ||
    !p.certificate.members.some((r) => r.id === producer) ||
    hasPendingUpdates(accepted)
  )
    throw Error('Replacement source authority or dependencies are incomplete');
  const heldKey = ownKey(key),
    doc = new Y.Doc({ gc: false });
  let bytes: Bytes | undefined;
  try {
    // Capture both documents before the first await; callers cannot change an in-flight snapshot.
    for (const source of [accepted, local]) {
      const update = new Uint8Array(Y.encodeStateAsUpdate(source));
      try {
        Y.applyUpdate(doc, update);
      } finally {
        update.fill(0);
      }
    }
    if (hasPendingUpdates(doc)) throw Error('Replacement writing has unresolved dependencies');
    actors(doc, p.principalId, producer);
    bytes = new Uint8Array(Y.encodeStateAsUpdate(doc));
    if (bytes.length > GENESIS_LIMIT) throw Error('Replacement checkpoint exceeds supported size');
    const parts = genesisCoverageParts(doc),
      heads = replacementCheckpointHeads(parent);
    const c: ReplacementCheckpoint = {
      v: 1,
      kind: 'replacement-checkpoint',
      salt: hex(random(16)),
      nonce: hex(random(12)),
      ct: '',
      manifest: {
        workspaceId: p.workspaceId,
        lineageId: p.lineageId,
        epoch: p.epoch,
        epochHead: p.head,
        generation: p.generation,
        producer,
        candidate,
        preparationId: preparation.attemptId,
        checkpointDigest: '00'.repeat(32),
        sv: hex(parts.sv),
        ds: hex(parts.ds),
        headVectorDigest: await checkpointHeadDigest(heads),
      },
      heads,
      signature: '00'.repeat(64),
    };
    const encrypted = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: unhex(c.nonce, 12), additionalData: replacementCheckpointAAD(c) },
        await keyFor(heldKey, c),
        bytes,
      ),
    );
    c.ct = hex(encrypted);
    c.manifest.checkpointDigest = await digest(encrypted);
    c.signature = await sign(await replacementCheckpointMessage(c));
    const reopened = await openReplacementCheckpoint(c, heldKey, parent);
    try {
      if (!sameDocState(doc, reopened)) throw Error('Replacement checkpoint replay changed');
    } finally {
      reopened.destroy();
    }
    return c;
  } finally {
    doc.destroy();
    heldKey.fill(0);
    bytes?.fill(0);
  }
}

/** Signature checks establish the producer's coverage claim. Decryption also checks complete Yjs
 * integration, exact sv/ds and current actor schema. The caller owns and must destroy the returned doc. */
export async function openReplacementCheckpoint(
  input: unknown,
  key: Bytes,
  parent: VerifiedMembership,
): Promise<YDoc> {
  const heldKey = ownKey(key),
    doc = new Y.Doc({ gc: false });
  let plain: Bytes | undefined;
  try {
    const c = await verifyReplacementCheckpoint(input, parent);
    plain = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: unhex(c.nonce, 12), additionalData: replacementCheckpointAAD(c) },
        await keyFor(heldKey, c),
        unhex(c.ct, c.ct.length / 2),
      ),
    );
    if (plain.length > GENESIS_LIMIT) throw Error('Replacement checkpoint exceeds supported size');
    Y.applyUpdate(doc, plain);
    const parts = genesisCoverageParts(doc);
    if (
      hasPendingUpdates(doc) ||
      hex(parts.sv) !== c.manifest.sv ||
      hex(parts.ds) !== c.manifest.ds
    )
      throw Error('Replacement checkpoint coverage differs');
    actors(doc, membershipState(parent).principalId, c.manifest.producer);
    return doc;
  } catch (cause) {
    doc.destroy();
    throw cause;
  } finally {
    plain?.fill(0);
    heldKey.fill(0);
  }
}
