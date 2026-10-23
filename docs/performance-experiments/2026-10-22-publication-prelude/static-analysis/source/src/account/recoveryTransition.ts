/** Prepare one exact recovery commit after cold replay. The owner must seal it before sending. */
import { verifyLostRecoveryPrepared } from '../../account-protocol/lostDeviceRecovery';
import { verifyEarlyHistory, historyMembership } from '../../account-protocol/admissionHistory';
import {
  recoveryIntentMessage,
  verifyRecoveryIntent,
} from '../../account-protocol/recoveryTransition';
import {
  recoveryCheckpointDigest,
  parseRecoveryCommit,
} from '../../account-protocol/recoveryCommit';
import { checkpointAAD, generationInfo } from '../../account-protocol/genesis';
import { hex, unhex } from '../../account-protocol/recovery';
import { readRecoverySource, type RecoverySourceOptions } from '../crdt/recoverySource';
import { fields, hkdf, random } from '../crdt/custodyCrypto';
import { sealGeneration } from './generationWrap';
export async function prepareRecoveryCommit(options: RecoverySourceOptions) {
  const input = {
    ...options,
    prepared: structuredClone(options.prepared),
    begin: structuredClone(options.begin),
    pin: structuredClone(options.pin),
    bootstrap: structuredClone(options.bootstrap),
    sign: options.sign.bind(options),
    read: options.read.bind(options),
    assertCurrent: options.assertCurrent.bind(options),
  };
  const checked = await verifyLostRecoveryPrepared(input.prepared, input.begin, input.pin);
  const source = await readRecoverySource(input),
    key = random(32);
  try {
    const generation = source.generation + 1,
      epoch = source.epoch + 1,
      base = checked.prepared.base.request.candidate,
      salt = random(16),
      nonce = random(12);
    const info = generationInfo({ ...base, generation });
    const checkpoint = {
      v: 1 as const,
      salt: hex(salt),
      nonce: hex(nonce),
      ct: hex(
        new Uint8Array(
          await crypto.subtle.encrypt(
            {
              name: 'AES-GCM',
              iv: nonce,
              additionalData: checkpointAAD({ ...base, generation, proposedEpoch: epoch }),
            },
            await hkdf(
              key,
              salt,
              fields('done/checkpoint/v1', base.workspaceId),
              { name: 'AES-GCM', length: 256 },
              ['encrypt'],
              crypto.subtle,
            ),
            source.snapshot,
          ),
        ),
      ),
    };
    input.assertCurrent();
    const body = {
      v: 1 as const,
      kind: 'recovery-transition-intent' as const,
      attemptId: checked.prepared.challenge.context.attemptId,
      head: checked.prepared.head,
      bootstrap: input.bootstrap,
      generation,
      heads: source.heads,
      sources: source.sources,
      ...(source.historyCheckpoint ? { historyCheckpoint: source.historyCheckpoint } : {}),
      checkpointDigest: await recoveryCheckpointDigest(checkpoint),
      deviceWrap: await sealGeneration(unhex(input.bootstrap.newWPub, 32), info, key),
      recoveryWrap: await sealGeneration(unhex(checked.context.recovery.rPub, 32), info, key),
      signature: '00'.repeat(64),
    };
    body.signature = await input.sign(await recoveryIntentMessage(body));
    const history =
      checked.history &&
      (checked.prepared.proofs?.certification || checked.prepared.proofs?.continuations.length)
        ? checked.history
        : await verifyEarlyHistory(
            checked.prepared.base,
            checked.prepared.proofs?.successor ?? null,
          );
    await verifyRecoveryIntent(body, historyMembership(history), checked.context.recovery);
    input.assertCurrent();
    return {
      request: parseRecoveryCommit({
        retryKey: (input.begin as { retryKey: string }).retryKey,
        intent: body,
        checkpoint,
      }),
      key,
    };
  } catch (error) {
    key.fill(0);
    throw error;
  } finally {
    source.snapshot.fill(0);
  }
}
