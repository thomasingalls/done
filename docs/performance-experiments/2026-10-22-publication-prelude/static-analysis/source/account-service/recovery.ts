import { createHash } from 'node:crypto';
import { lp, unhex, confirmationBytes } from '../account-protocol/recovery.ts';
import { fresh } from './protocol.ts';
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/server';
import type { Refusal } from './protocol.ts';
export type RecoveryResult =
  | { ok: false; refusal: Refusal }
  | {
      ok: true;
      stage: 'recovery-ceremony';
      recoveryId: string;
      accountId: string;
      draftDigest: string;
      expiresAt: number;
      options: PublicKeyCredentialRequestOptionsJSON;
    }
  | {
      ok: true;
      stage: 'recovery-confirmed';
      recoveryId: string;
      accountId: string;
      draftDigest: string;
      recoveryStateDigest: string;
      receiptId: string;
    }
  | { ok: true; stage: 'recovery-cancelled'; recoveryId: string };
export interface RecoveryRow {
  account_id: string;
  attempt_id: string;
  id: string;
  draft: string;
  digest: string;
  challenge: string;
  expires: number;
  state: 'open' | 'done' | 'cancelled' | 'expired';
  proof_hash: string | null;
  result: string | null;
}
export const recoveryChallenge = (
  attempt: string,
  account: string,
  id: string,
  digest: string,
  rpId: string,
  origin: string,
): string =>
  createHash('sha256')
    .update(
      lp('done/account/finalize-recovery/v1', attempt, account, id, digest, rpId, origin, fresh()),
    )
    .digest('base64url');
export async function verifyRecoveryProof(
  signer: string,
  challenge: string,
  digest: string,
  proof: unknown,
) {
  const key = await crypto.subtle.importKey('raw', unhex(signer, 32), 'Ed25519', false, ['verify']);
  if (
    !(await crypto.subtle.verify(
      'Ed25519',
      key,
      unhex(proof, 64),
      confirmationBytes(challenge, digest),
    ))
  )
    throw Error('Invalid recovery possession proof');
}
