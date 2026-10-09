import { manifestMessage, verifyReceipt } from '../../account-protocol/admission';
import { digest, unhex } from '../../account-protocol/recovery';
import { GENESIS_LIMIT, checkpointAAD } from '../../account-protocol/genesis';
import {
  contentCheckpointAAD,
  checkpointHeadDigest,
  verifyContentCheckpoint,
  type ContentCheckpoint,
  type CheckpointAuthority,
} from '../../account-protocol/contentCheckpoint';
import { hkdf, fields, hex, random, type Bytes } from './custodyCrypto';
import {
  Y,
  genesisCoverageParts,
  genesisCoverage,
  coversGenesis,
  hasPendingUpdates,
  type YDoc,
} from './yjs';
import { actors as checkpointActors } from './promotionGenesis';
import type { BindingProof } from '../../account-protocol/slot';
const keyFor = (key: Bytes, salt: string, workspace: string) =>
  hkdf(
    key,
    unhex(salt, 16),
    fields('done/checkpoint/v1', workspace),
    { name: 'AES-GCM', length: 256 },
    ['encrypt', 'decrypt'],
    crypto.subtle,
  );
export async function createContentCheckpoint(
  doc: YDoc,
  key: Bytes,
  a: CheckpointAuthority,
  binding: BindingProof,
  sign: (bytes: Bytes) => Promise<string>,
): Promise<ContentCheckpoint> {
  if (hasPendingUpdates(doc)) throw Error('Writing has unresolved dependencies');
  checkpointActors(doc, a.base.request.candidate.principalId, a.base.request.candidate.signer);
  const bytes = new Uint8Array(Y.encodeStateAsUpdate(doc));
  try {
    if (bytes.length > GENESIS_LIMIT) throw Error('Checkpoint exceeds the supported size');
    const parts = genesisCoverageParts(doc);
    const c: ContentCheckpoint = {
      v: 1,
      kind: 'content-checkpoint',
      salt: hex(random(16)),
      nonce: hex(random(12)),
      ct: '',
      manifest: {
        v: 2,
        workspaceId: a.base.request.candidate.workspaceId,
        epoch: 3,
        epochHead: a.certification.head,
        generation: 1,
        checkpointDigest: '00'.repeat(32),
        sv: hex(parts.sv),
        ds: hex(parts.ds),
        headVectorDigest: await checkpointHeadDigest(a.certification.epoch.heads),
        producer: a.base.request.candidate.signer,
        signature: '00'.repeat(64),
      },
      heads: structuredClone(a.certification.epoch.heads),
      binding,
    };
    c.ct = hex(
      new Uint8Array(
        await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv: unhex(c.nonce, 12), additionalData: contentCheckpointAAD(c) },
          await keyFor(key, c.salt, c.manifest.workspaceId),
          bytes,
        ),
      ),
    );
    c.manifest.checkpointDigest = await digest(unhex(c.ct, c.ct.length / 2));
    c.manifest.signature = await sign(await manifestMessage(c.manifest));
    const reopened = await openContentCheckpoint(c, key, a);
    try {
      if (!coversGenesis(doc, reopened) || !coversGenesis(reopened, doc))
        throw Error('Checkpoint replay changed');
    } finally {
      reopened.destroy();
    }
    return c;
  } finally {
    bytes.fill(0);
  }
}
/** Returns only a fully verified document. The caller owns and must destroy it. */
export async function openContentCheckpoint(
  input: unknown,
  key: Bytes,
  a: CheckpointAuthority,
): Promise<YDoc> {
  const c = await verifyContentCheckpoint(input, a),
    doc = new Y.Doc({ gc: false }),
    genesis = new Y.Doc({ gc: false });
  const open = async (
    cp: { salt: string; nonce: string; ct: string },
    aad: Bytes,
    target: YDoc,
  ) => {
    const plain = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: unhex(cp.nonce, 12), additionalData: aad },
        await keyFor(key, cp.salt, c.manifest.workspaceId),
        unhex(cp.ct, cp.ct.length / 2),
      ),
    );
    try {
      if (plain.length > GENESIS_LIMIT) throw Error('Checkpoint too large');
      Y.applyUpdate(target, plain);
    } finally {
      plain.fill(0);
    }
  };
  try {
    await open(c, contentCheckpointAAD(c), doc);
    const original = a.base.request.candidate;
    await open(original.checkpoint, checkpointAAD(original), genesis);
    const parts = genesisCoverageParts(doc),
      gp = genesisCoverageParts(genesis);
    if (
      hasPendingUpdates(doc) ||
      hasPendingUpdates(genesis) ||
      hex(parts.sv) !== c.manifest.sv ||
      hex(parts.ds) !== c.manifest.ds ||
      hex(genesisCoverage(genesis)) !== original.coverage.snapshot ||
      !coversGenesis(doc, genesis)
    )
      throw Error('Checkpoint coverage or ancestry differs');
    await verifyReceipt(a.base.receipt, a.base.request, a.base.pin, {
      sv: hex(gp.sv),
      ds: hex(gp.ds),
    });
    checkpointActors(doc, original.principalId, original.signer);
    return doc;
  } catch (cause) {
    doc.destroy();
    throw cause;
  } finally {
    genesis.destroy();
  }
}
