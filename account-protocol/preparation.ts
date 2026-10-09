/** Fixed-purpose current pending-account observation. Never an activation or recipient grant. */
import { parseAuthorityPin, pinBytes, type AuthorityPin } from './authority.ts';
import {
  parseDraft,
  lp,
  hex,
  unhex,
  draftDigest,
  recoveryStateDigest,
  rootCommitment,
  type RecoveryDraft,
} from './recovery.ts';
export interface PendingState {
  v: 1;
  accountId: string;
  attemptId: string;
  status: 'eligible' | 'abandoned';
  draft: RecoveryDraft | null;
  confirmation: null | {
    recoveryId: string;
    draftDigest: string;
    recoveryStateDigest: string;
    receiptId: string;
  };
}
export interface PendingProof {
  v: 1;
  pin: AuthorityPin;
  nonce: string;
  state: PendingState;
  signature: string;
}
export const closed = (value: unknown, keys: string[]): Record<string, unknown> => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join() !== [...keys].sort().join()
  )
    throw Error('Malformed preparation');
  return value as Record<string, unknown>;
};
export const accountIdentifier = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value))
    throw Error('Malformed account identifier');
  return value;
};
export const parsePendingState = (input: unknown): PendingState => {
  const r = closed(input, ['v', 'accountId', 'attemptId', 'status', 'draft', 'confirmation']);
  if (r['v'] !== 1 || !['eligible', 'abandoned'].includes(String(r['status'])))
    throw Error('Unknown preparation state');
  const draft = r['draft'] === null ? null : parseDraft(r['draft']);
  let confirmation: PendingState['confirmation'] = null;
  if (r['confirmation'] !== null) {
    const c = closed(r['confirmation'], [
      'recoveryId',
      'draftDigest',
      'recoveryStateDigest',
      'receiptId',
    ]);
    unhex(c['draftDigest'], 32);
    unhex(c['recoveryStateDigest'], 32);
    confirmation = {
      recoveryId: accountIdentifier(c['recoveryId']),
      receiptId: accountIdentifier(c['receiptId']),
      draftDigest: c['draftDigest'] as string,
      recoveryStateDigest: c['recoveryStateDigest'] as string,
    };
  }
  if ((confirmation && !draft) || (r['status'] === 'eligible' && (!draft || !confirmation)))
    throw Error('Incomplete preparation state');
  return {
    v: 1,
    accountId: accountIdentifier(r['accountId']),
    attemptId: accountIdentifier(r['attemptId']),
    status: r['status'] as PendingState['status'],
    draft,
    confirmation,
  };
};
// Parsers reconstruct a fixed property order, including nested draft/envelope/receipt fields.
export const pendingBytes = (state: PendingState) => JSON.stringify(parsePendingState(state));
export const pendingMessage = (pin: AuthorityPin, nonce: string, state: PendingState) => {
  unhex(nonce, 32);
  return lp('done/pending-account-observation/v1', hex(pinBytes(pin)), nonce, pendingBytes(state));
};
export async function verifyPendingProof(
  expected: AuthorityPin,
  nonce: string,
  input: unknown,
): Promise<PendingState> {
  const pin = parseAuthorityPin(expected),
    r = closed(input, ['v', 'pin', 'nonce', 'state', 'signature']);
  if (
    r['v'] !== 1 ||
    r['nonce'] !== nonce ||
    hex(pinBytes(parseAuthorityPin(r['pin']))) !== hex(pinBytes(pin))
  )
    throw Error('Pending proof target or nonce changed');
  const state = parsePendingState(r['state']),
    signature = unhex(r['signature'], 64),
    message = pendingMessage(pin, nonce, state);
  const key = await crypto.subtle.importKey('raw', unhex(pin.authRoot, 32), 'Ed25519', false, [
    'verify',
  ]);
  if (!(await crypto.subtle.verify('Ed25519', key, signature, message)))
    throw Error('Invalid pending proof');
  if (state.draft) {
    if (
      state.draft.authRoot !== pin.authRoot ||
      (await rootCommitment(state.draft)) !== state.draft.rootCommitment
    )
      throw Error('Recovery root changed');
    if (
      state.confirmation &&
      ((await draftDigest(state.draft)) !== state.confirmation.draftDigest ||
        (await recoveryStateDigest(state.draft)) !== state.confirmation.recoveryStateDigest)
    )
      throw Error('Recovery confirmation changed');
  }
  return state;
}
