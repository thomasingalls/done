/** Immutable committed recovery baseline, usable without historical generation keys. */
import { closed } from '../../account-protocol/preparation';
import {
  parseRecoveryCheckpoint,
  recoveryCheckpointDigest,
  RECOVERY_CHECKPOINT_BYTES,
} from '../../account-protocol/recoveryCommit';
import {
  parseRecoverySuccessor,
  recoverySuccessorMessage,
} from '../../account-protocol/recoveryTransition';
import { parseBindingProof, verifyBindingProof } from '../../account-protocol/slot';
import { digest, unhex } from '../../account-protocol/recovery';
import { verifySignature } from '../../account-protocol/admission';
import {
  historyAuthority,
  historyGeneration,
  historyPublisher,
  type AdmissionHistory,
} from '../../account-protocol/admissionHistory';
import type { HistoryCheckpointAuthority } from '../../account-protocol/contentCheckpoint';
import { checkpointAAD } from '../../account-protocol/genesis';
import { fields, hkdf, type Bytes } from './custodyCrypto';
import { Y, hasPendingUpdates } from './yjs';
import { actors } from './promotionGenesis';
export function captureRecoveryReading(input: unknown) {
  const r = closed(input, ['v', 'kind', 'epoch', 'head', 'checkpoint', 'successor', 'binding']);
  const successor = parseRecoverySuccessor(r['successor']);
  if (
    r['v'] !== 1 ||
    r['kind'] !== 'recovery-reading' ||
    r['epoch'] !== successor.epoch.epoch ||
    r['head'] !== successor.head
  )
    throw Error('Recovery baseline target changed');
  return {
    v: 1 as const,
    kind: 'recovery-reading' as const,
    epoch: successor.epoch.epoch,
    head: successor.head,
    checkpoint: parseRecoveryCheckpoint(r['checkpoint']),
    successor,
    binding: parseBindingProof(r['binding']),
  };
}
export type RecoveryReading = ReturnType<typeof captureRecoveryReading>;
export async function verifyRecoveryReading(
  input: unknown,
  a: HistoryCheckpointAuthority,
  history: AdmissionHistory,
  reader: string,
) {
  const r = captureRecoveryReading(input),
    s = r.successor,
    b = s.epoch.intent.bootstrap;
  historyAuthority(history, {
    ...history.current,
    tip: r.epoch,
    head: r.head,
    acceptanceKey: s.epoch.acceptancePublicKey,
  });
  const publisher = historyPublisher(history, reader);
  if (
    b.newCredentialId !== reader ||
    b.newSPub !== publisher.signingKey ||
    s.epoch.workspaceId !== a.base.request.candidate.workspaceId ||
    s.epoch.lineageId !== a.base.request.candidate.lineageId ||
    s.epoch.generation !== historyGeneration(history, r.epoch) ||
    s.head !== (await digest(await recoverySuccessorMessage(s))) ||
    s.epoch.intent.checkpointDigest !== (await recoveryCheckpointDigest(r.checkpoint))
  )
    throw Error('Recovery baseline differs from authenticated history');
  await verifySignature(a.base.pin.authRoot, s.signature, await recoverySuccessorMessage(s));
  await verifyBindingProof(r.binding, a.base.request, a.base.receipt, a.base.pin);
  return r;
}
export async function openRecoveryReading(
  input: unknown,
  key: Bytes,
  a: HistoryCheckpointAuthority,
  history: AdmissionHistory,
  reader: string,
) {
  const held = key.slice(),
    authority = structuredClone(a),
    captured = captureRecoveryReading(input),
    doc = new Y.Doc({ gc: false });
  let plain: Bytes | undefined;
  try {
    if (held.length !== 32) throw Error('Invalid recovery key');
    const r = await verifyRecoveryReading(captured, authority, history, reader),
      c = r.checkpoint;
    plain = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: unhex(c.nonce, 12),
          additionalData: checkpointAAD({
            ...authority.base.request.candidate,
            generation: r.successor.epoch.generation,
            proposedEpoch: r.epoch,
          }),
        },
        await hkdf(
          held,
          unhex(c.salt, 16),
          fields('done/checkpoint/v1', authority.base.request.candidate.workspaceId),
          { name: 'AES-GCM', length: 256 },
          ['decrypt'],
          crypto.subtle,
        ),
        unhex(c.ct, c.ct.length / 2),
      ),
    );
    if (plain.length > RECOVERY_CHECKPOINT_BYTES)
      throw Error('Recovery baseline exceeds supported size');
    Y.applyUpdate(doc, plain);
    if (hasPendingUpdates(doc)) throw Error('Recovery baseline has unresolved dependencies');
    actors(doc, authority.base.request.candidate.principalId, reader);
    return doc;
  } catch (error) {
    doc.destroy();
    throw error;
  } finally {
    held.fill(0);
    plain?.fill(0);
  }
}
