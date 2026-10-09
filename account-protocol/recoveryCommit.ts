import { closed, accountIdentifier } from './preparation.ts';
import { digest, unhex } from './recovery.ts';
import { domainMessage, json } from './admission.ts';
import { parseRecoveryIntent, type RecoverySuccessor } from './recoveryTransition.ts';
import type { LostRecoveryRefusal } from './lostDeviceRecovery.ts';
export const RECOVERY_CHECKPOINT_BYTES = 4 * 1024 * 1024;
export const RECOVERY_COMMIT_LIMIT = 2 * RECOVERY_CHECKPOINT_BYTES + 128 * 1024;
const fixed = (v: unknown, n: number): string => {
  unhex(v, n);
  return v as string;
};
export function parseRecoveryCheckpoint(input: unknown) {
  const c = closed(input, ['v', 'salt', 'nonce', 'ct']);
  if (
    c['v'] !== 1 ||
    typeof c['ct'] !== 'string' ||
    c['ct'].length < 36 ||
    c['ct'].length > 2 * (RECOVERY_CHECKPOINT_BYTES + 16) ||
    c['ct'].length % 2 ||
    !/^[0-9a-f]+$/.test(c['ct'])
  )
    throw Error('Invalid recovery checkpoint');
  return { v: 1 as const, salt: fixed(c['salt'], 16), nonce: fixed(c['nonce'], 12), ct: c['ct'] };
}
export const recoveryCheckpointDigest = async (input: unknown) =>
  digest(await domainMessage('done/recovery-checkpoint/v1', parseRecoveryCheckpoint(input)));
export function parseRecoveryCommit(input: unknown) {
  if (json(input).length > RECOVERY_COMMIT_LIMIT) throw Error('Recovery commit too large');
  const r = closed(input, ['retryKey', 'intent', 'checkpoint']);
  return {
    retryKey: accountIdentifier(r['retryKey']),
    intent: parseRecoveryIntent(r['intent']),
    checkpoint: parseRecoveryCheckpoint(r['checkpoint']),
  };
}
export type RecoveryCommitResult =
  | { ok: false; refusal: LostRecoveryRefusal }
  | { ok: true; stage: 'committed'; successor: RecoverySuccessor };
