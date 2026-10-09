/** Content-only checkpoint primitives. Owners supply independently verified accepted replay and cuts. */
import {
  EMPTY_HISTORY_CHECKPOINT,
  historyCheckpointAAD,
  historyCheckpointMessage,
  historyCheckpointHash,
  historyCheckpointAdmissionBody,
  historyCheckpointAdmissionMessage,
  verifyHistoryCheckpoint,
  verifyHistoryCheckpointAdmission,
  verifyHistoryCheckpointParent,
  verifyHistoryHeads,
  type HistoryCheckpoint,
  type HistoryHead,
} from '../../account-protocol/historyCheckpoint';
import { checkpointHeadDigest } from '../../account-protocol/contentCheckpoint';
import { membershipState, type VerifiedMembership } from '../../account-protocol/membership';
import { digest, unhex } from '../../account-protocol/recovery';
import { GENESIS_LIMIT } from '../../account-protocol/genesis';
import { fields, hkdf, hex, random, type Bytes } from './custodyCrypto';
import { Y, genesisCoverageParts, sameDocState, hasPendingUpdates, type YDoc } from './yjs';
import { actors } from './promotionGenesis';

const keyFor = (key: Bytes, c: HistoryCheckpoint) =>
  hkdf(
    key,
    unhex(c.salt, 16),
    fields(
      'done/history-checkpoint-key/v1',
      c.manifest.workspaceId,
      c.manifest.lineageId,
      String(c.manifest.generation),
    ),
    { name: 'AES-GCM', length: 256 },
    ['encrypt', 'decrypt'],
    crypto.subtle,
  );
const copyKey = (key: Bytes) => {
  if (!(key instanceof Uint8Array) || key.length !== 32)
    throw Error('Invalid history checkpoint key');
  return key.slice();
};
const apply = (target: YDoc, source: YDoc) => {
  const bytes = new Uint8Array(Y.encodeStateAsUpdate(source));
  try {
    Y.applyUpdate(target, bytes);
  } finally {
    bytes.fill(0);
  }
};
/** Pending data may not be hidden by snapshot encoding. This helper intentionally refuses it. */
function requireComplete(doc: YDoc) {
  if (hasPendingUpdates(doc)) throw Error('History checkpoint dependencies are incomplete');
}
/** Does not admit, install, or authorize deletion. The caller retains exact bytes before publication. */
export async function createHistoryCheckpoint(
  accepted: YDoc,
  local: YDoc,
  key: Bytes,
  authority: VerifiedMembership,
  producer: string,
  heads: readonly HistoryHead[],
  previous: HistoryCheckpoint | null,
  sign: (bytes: Bytes) => Promise<string>,
): Promise<HistoryCheckpoint> {
  const p = membershipState(authority),
    cuts = verifyHistoryHeads(heads, authority),
    prior = structuredClone(previous);
  if (!p.certificate.members.some((m) => m.id === producer))
    throw Error('Uncertified checkpoint producer');
  requireComplete(accepted);
  requireComplete(local);
  const held = copyKey(key),
    doc = new Y.Doc({ gc: false });
  let bytes: Bytes | undefined;
  try {
    // Capture both sources before the first asynchronous boundary.
    apply(doc, accepted);
    apply(doc, local);
    requireComplete(doc);
    actors(doc, p.principalId, producer);
    bytes = new Uint8Array(Y.encodeStateAsUpdate(doc));
    if (bytes.length > GENESIS_LIMIT) throw Error('History checkpoint exceeds supported size');
    const parts = genesisCoverageParts(doc);
    const c: HistoryCheckpoint = {
      v: 1,
      kind: 'history-checkpoint',
      salt: hex(random(16)),
      nonce: hex(random(12)),
      ct: '',
      manifest: {
        workspaceId: p.workspaceId,
        lineageId: p.lineageId,
        epoch: p.epoch,
        epochHead: p.head,
        generation: p.generation,
        sequence: prior ? prior.manifest.sequence + 1 : 1,
        parent: prior ? await historyCheckpointHash(prior) : EMPTY_HISTORY_CHECKPOINT,
        producer,
        checkpointDigest: EMPTY_HISTORY_CHECKPOINT,
        sv: hex(parts.sv),
        ds: hex(parts.ds),
        headVectorDigest: await checkpointHeadDigest(cuts),
      },
      heads: cuts,
      signature: '00'.repeat(64),
    };
    await verifyHistoryCheckpointParent(c, prior);
    const sealed = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: unhex(c.nonce, 12), additionalData: historyCheckpointAAD(c) },
        await keyFor(held, c),
        bytes,
      ),
    );
    c.ct = hex(sealed);
    c.manifest.checkpointDigest = await digest(sealed);
    c.signature = await sign(await historyCheckpointMessage(c));
    const reopened = await openHistoryCheckpoint(c, held, authority);
    try {
      if (!sameDocState(doc, reopened)) throw Error('History checkpoint replay changed');
    } finally {
      reopened.destroy();
    }
    return c;
  } finally {
    bytes?.fill(0);
    held.fill(0);
    doc.destroy();
  }
}
/** Decryption checks actual insertion/deletion coverage; signatures alone cannot establish this. */
export async function openHistoryCheckpoint(
  input: unknown,
  key: Bytes,
  authority: VerifiedMembership,
): Promise<YDoc> {
  const held = copyKey(key),
    doc = new Y.Doc({ gc: false });
  let plain: Bytes | undefined;
  try {
    const c = await verifyHistoryCheckpoint(input, authority);
    plain = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: unhex(c.nonce, 12), additionalData: historyCheckpointAAD(c) },
        await keyFor(held, c),
        unhex(c.ct, c.ct.length / 2),
      ),
    );
    if (plain.length > GENESIS_LIMIT) throw Error('History checkpoint exceeds supported size');
    Y.applyUpdate(doc, plain);
    requireComplete(doc);
    const parts = genesisCoverageParts(doc);
    if (hex(parts.sv) !== c.manifest.sv || hex(parts.ds) !== c.manifest.ds)
      throw Error('History checkpoint coverage differs');
    actors(doc, membershipState(authority).principalId, c.manifest.producer);
    return doc;
  } catch (cause) {
    doc.destroy();
    throw cause;
  } finally {
    plain?.fill(0);
    held.fill(0);
  }
}
/** `accepted` must be reconstructed independently through exactly these cuts, including the previous
 * admitted baseline and durable handoff snapshots. Merely opening the proposed snapshot is insufficient. */
export async function admitHistoryCheckpoint(
  input: unknown,
  key: Bytes,
  authority: VerifiedMembership,
  credential: string,
  accepted: YDoc,
  sign: (bytes: Bytes) => Promise<string>,
) {
  requireComplete(accepted);
  const held = copyKey(key),
    baseline = new Y.Doc({ gc: false });
  let doc: YDoc | undefined, check: YDoc | undefined;
  try {
    apply(baseline, accepted);
    const c = await verifyHistoryCheckpoint(input, authority);
    doc = await openHistoryCheckpoint(c, held, authority);
    check = new Y.Doc({ gc: false });
    apply(check, doc);
    apply(check, baseline);
    requireComplete(check);
    if (!sameDocState(doc, check)) throw Error('History checkpoint omits accepted writing');
    const a = await historyCheckpointAdmissionBody(c, credential);
    // Construct from decrypted coverage, never a claimed coverage pair.
    const parts = genesisCoverageParts(doc);
    a.derivedSv = hex(parts.sv);
    a.derivedDs = hex(parts.ds);
    a.signature = await sign(await historyCheckpointAdmissionMessage(a));
    return await verifyHistoryCheckpointAdmission(a, c, authority);
  } finally {
    held.fill(0);
    baseline.destroy();
    doc?.destroy();
    check?.destroy();
  }
}
