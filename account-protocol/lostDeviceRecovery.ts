import { parseBindingProof, verifyBindingProof } from './slot.ts';
import type { SessionIssuanceResult } from './session.ts';
/** Fresh account authentication for total-device-loss recovery; never a membership grant. */
import { closed, accountIdentifier } from './preparation.ts';
import { parseAuthorityPin, type AuthorityPin } from './authority.ts';
import { digest, unhex, lp, recoveryStateDigest } from './recovery.ts';
import {
  json,
  same,
  domainMessage,
  parseAdmissionRequest,
  parseReceipt,
  verifyReceipt,
  verifySignature,
} from './admission.ts';
import { parseSuccessor } from './successor.ts';
import {
  parseMembershipChain,
  verifyMembershipChain,
  MEMBERSHIP_BOOTSTRAP_LIMIT,
} from './membershipLocator.ts';
import { verifyAdmissionHistory, historyMembership } from './admissionHistory.ts';
import { membershipState } from './membership.ts';
import { parseRecoveryHeadAssertion, verifyRecoveryHeadAssertion } from './recoveryBootstrap.ts';

export const LOST_RECOVERY_REQUEST_LIMIT = 128 * 1024;
export const LOST_RECOVERY_RESULT_LIMIT = MEMBERSHIP_BOOTSTRAP_LIMIT;
export const LOST_RECOVERY_LIFETIME_MS = 10 * 60 * 1000;
export const LOST_RECOVERY_ATTEMPT_LIMIT = 128;
const fixed = (v: unknown, n = 32): string => {
  unhex(v, n);
  return v as string;
};
const integer = (v: unknown, min = 0): number => {
  if (!Number.isSafeInteger(v) || Object.is(v, -0) || (v as number) < min)
    throw Error('Invalid recovery integer');
  return v as number;
};
const bounded = (v: unknown, limit: number) => {
  if (json(v).length > limit) throw Error('Recovery size limit');
};
export function parseRecoveryCandidate(input: unknown) {
  const c = closed(input, ['credentialId', 'wPub', 'sPub']);
  return {
    credentialId: fixed(c['credentialId'], 16),
    wPub: fixed(c['wPub']),
    sPub: fixed(c['sPub']),
  };
}
export function parseLostRecoveryBegin(input: unknown) {
  bounded(input, LOST_RECOVERY_REQUEST_LIMIT);
  const combined = input !== null && typeof input === 'object' && 'login' in input;
  const r = closed(input, ['retryKey', 'candidate', 'clientNonce', ...(combined ? ['login'] : [])]);
  if (combined && r['login'] !== true) throw Error('Invalid recovery login request');
  return {
    retryKey: accountIdentifier(r['retryKey']),
    candidate: parseRecoveryCandidate(r['candidate']),
    clientNonce: fixed(r['clientNonce']),
    ...(combined ? { login: true as const } : {}),
  };
}
export function parseLostRecoveryRetry(input: unknown) {
  bounded(input, LOST_RECOVERY_REQUEST_LIMIT);
  const r = closed(input, ['retryKey']);
  return { retryKey: accountIdentifier(r['retryKey']) };
}
export function parseLostRecoveryFinish(input: unknown) {
  bounded(input, LOST_RECOVERY_REQUEST_LIMIT);
  const r = closed(input, ['retryKey', 'attemptId', 'response', 'possession']);
  // The WebAuthn verifier owns the response grammar. Capture the bounded JSON before any await.
  return {
    retryKey: accountIdentifier(r['retryKey']),
    attemptId: accountIdentifier(r['attemptId']),
    response: JSON.parse(JSON.stringify(r['response'])) as unknown,
    possession: fixed(r['possession'], 64),
  };
}
export function parseLostRecoveryContext(input: unknown) {
  const combined = input !== null && typeof input === 'object' && 'login' in input;
  const r = closed(input, [
    'v',
    'purpose',
    'pin',
    'attemptId',
    'retryHash',
    'candidate',
    'clientNonce',
    'nonce',
    'expiresAt',
    ...(combined ? ['login'] : []),
  ]);
  if (r['v'] !== 1 || r['purpose'] !== 'lost-device-recovery-v1')
    throw Error('Wrong recovery purpose');
  let login: { purpose: 'recovery-and-login-v1'; attemptId: string; retryHash: string } | undefined;
  if (combined) {
    const l = closed(r['login'], ['purpose', 'attemptId', 'retryHash']);
    if (l['purpose'] !== 'recovery-and-login-v1') throw Error('Wrong recovery login purpose');
    login = {
      purpose: 'recovery-and-login-v1',
      attemptId: accountIdentifier(l['attemptId']),
      retryHash: fixed(l['retryHash']),
    };
  }
  return {
    v: 1 as const,
    purpose: 'lost-device-recovery-v1' as const,
    pin: parseAuthorityPin(r['pin']),
    attemptId: accountIdentifier(r['attemptId']),
    retryHash: fixed(r['retryHash']),
    candidate: parseRecoveryCandidate(r['candidate']),
    clientNonce: fixed(r['clientNonce']),
    nonce: fixed(r['nonce']),
    expiresAt: integer(r['expiresAt'], 1),
    ...(login ? { login } : {}),
  };
}
export type LostRecoveryContext = ReturnType<typeof parseLostRecoveryContext>;
export function parseLostRecoveryChallenge(input: unknown) {
  bounded(input, 4096);
  const r = closed(input, ['context', 'signature']);
  return { context: parseLostRecoveryContext(r['context']), signature: fixed(r['signature'], 64) };
}
export type LostRecoveryChallenge = ReturnType<typeof parseLostRecoveryChallenge>;
export const lostRecoveryChallengeMessage = (input: unknown) =>
  lp('done/lost-device-recovery-challenge/v1', JSON.stringify(parseLostRecoveryContext(input)));
export const lostRecoveryPossessionMessage = (input: unknown) =>
  lp('done/lost-device-recovery-possession/v1', JSON.stringify(parseLostRecoveryContext(input)));
export const lostRecoveryAssertionMessage = (input: unknown) => {
  const c = parseLostRecoveryContext(input);
  return lp(
    c.login ? 'done/recovery-and-session-assertion/v1' : 'done/lost-device-recovery-assertion/v1',
    JSON.stringify(c),
  );
};
export async function lostRecoveryNonce(input: unknown) {
  const raw = unhex(await digest(lostRecoveryAssertionMessage(input)), 32);
  return btoa(String.fromCharCode(...raw))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
export async function verifyLostRecoveryChallenge(
  input: unknown,
  beginInput: unknown,
  pinInput: AuthorityPin,
) {
  const challenge = parseLostRecoveryChallenge(input),
    begin = parseLostRecoveryBegin(beginInput),
    pin = parseAuthorityPin(pinInput);
  const retry = Uint8Array.from(
    atob(begin.retryKey.replaceAll('-', '+').replaceAll('_', '/')),
    (c) => c.charCodeAt(0),
  );
  if (
    !same(challenge.context.pin, pin) ||
    !same(challenge.context.candidate, begin.candidate) ||
    challenge.context.clientNonce !== begin.clientNonce ||
    challenge.context.retryHash !== (await digest(retry))
  )
    throw Error('Recovery challenge target changed');
  if (Boolean(challenge.context.login) !== Boolean(begin.login))
    throw Error('Recovery login purpose changed');
  if (begin.login && challenge.context.login?.retryHash !== challenge.context.retryHash)
    throw Error('Recovery login target changed');
  await verifySignature(
    pin.authRoot,
    challenge.signature,
    lostRecoveryChallengeMessage(challenge.context),
  );
  return challenge;
}
function parseProofs(input: unknown) {
  if (input === null) return null;
  const p = closed(input, ['successor', 'certification', 'continuations']);
  if (
    p['certification'] !== null ||
    (Array.isArray(p['continuations']) && p['continuations'].length)
  )
    return parseMembershipChain(input);
  if (!Array.isArray(p['continuations']) || p['continuations'].length)
    throw Error('Missing certification anchor');
  return { successor: parseSuccessor(p['successor']), certification: null, continuations: [] };
}
export function parseLostRecoveryPrepared(input: unknown) {
  const hasBinding = input !== null && typeof input === 'object' && 'binding' in input;
  bounded(input, LOST_RECOVERY_RESULT_LIMIT);
  const r = closed(input, [
    'v',
    'kind',
    'challenge',
    'accountId',
    'passkeyId',
    'base',
    'proofs',
    'head',
    'signature',
    ...(hasBinding ? ['binding'] : []),
  ]);
  if (r['v'] !== 1 || r['kind'] !== 'lost-device-recovery-prepared')
    throw Error('Wrong prepared recovery');
  const b = closed(r['base'], ['pin', 'request', 'receipt']);
  if (typeof r['passkeyId'] !== 'string' || !/^[A-Za-z0-9_-]{1,1364}$/.test(r['passkeyId']))
    throw Error('Invalid recovery passkey');
  return {
    v: 1 as const,
    kind: 'lost-device-recovery-prepared' as const,
    challenge: parseLostRecoveryChallenge(r['challenge']),
    accountId: accountIdentifier(r['accountId']),
    passkeyId: r['passkeyId'],
    base: {
      pin: parseAuthorityPin(b['pin']),
      request: parseAdmissionRequest(b['request']),
      receipt: parseReceipt(b['receipt']),
    },
    proofs: parseProofs(r['proofs']),
    head: parseRecoveryHeadAssertion(r['head']),
    ...(hasBinding ? { binding: parseBindingProof(r['binding']) } : {}),
    signature: fixed(r['signature'], 64),
  };
}
export type LostRecoveryPrepared = ReturnType<typeof parseLostRecoveryPrepared>;
export const lostRecoveryPreparedMessage = (input: unknown) => {
  const { signature: _, ...body } = parseLostRecoveryPrepared(input);
  return domainMessage('done/lost-device-recovery-prepared/v1', body);
};
export async function verifyLostRecoveryPrepared(
  input: unknown,
  beginInput: unknown,
  pinInput: AuthorityPin,
) {
  const prepared = parseLostRecoveryPrepared(input),
    begin = parseLostRecoveryBegin(beginInput),
    pin = parseAuthorityPin(pinInput);
  await verifyLostRecoveryChallenge(prepared.challenge, begin, pin);
  if (
    !same(prepared.base.pin, pin) ||
    prepared.accountId !== prepared.base.request.candidate.accountId ||
    prepared.passkeyId !== prepared.base.receipt.activation.context.credentialId
  )
    throw Error('Recovery account changed');
  await verifySignature(
    pin.authRoot,
    prepared.signature,
    await lostRecoveryPreparedMessage(prepared),
  );
  await verifyReceipt(prepared.base.receipt, prepared.base.request, pin);
  if (prepared.challenge.context.login && !prepared.binding)
    throw Error('Missing recovery slot binding');
  if (prepared.binding)
    await verifyBindingProof(prepared.binding, prepared.base.request, prepared.base.receipt, pin);
  const history = prepared.proofs
    ? prepared.proofs.certification || prepared.proofs.continuations.length
      ? (await verifyMembershipChain(prepared.proofs, prepared.base)).history
      : await verifyAdmissionHistory(prepared.proofs.successor, prepared.base, {
          epoch: 1,
          head: prepared.base.receipt.offer.head,
        })
    : null;
  const epoch = history?.current.tip ?? 1,
    headDigest = history?.current.head ?? prepared.base.receipt.offer.head;
  if (prepared.head.epoch !== epoch || prepared.head.head !== headDigest)
    throw Error('Recovery history does not reach asserted head');
  const head = await verifyRecoveryHeadAssertion(prepared.head, pin, {
    workspaceId: prepared.base.request.candidate.workspaceId,
    clientNonce: begin.clientNonce,
  });
  const stateDigest =
    history && (prepared.proofs?.certification || prepared.proofs?.continuations.length)
      ? membershipState(historyMembership(history)).certificate.recoveryStateDigest
      : prepared.base.request.certification.recoveryStateDigest;
  if (stateDigest !== (await recoveryStateDigest(prepared.base.request.recovery)))
    throw Error('Recovery state changed');
  return {
    prepared,
    history,
    context: {
      head,
      recovery: prepared.base.request.recovery,
      currentRecoveryStateDigest: stateDigest,
      candidate: begin.candidate,
      conflictParent: headDigest,
    },
  };
}
export type LostRecoveryRefusal =
  | 'malformed'
  | 'unknown-attempt'
  | 'request-conflict'
  | 'proof-conflict'
  | 'invalid-proof'
  | 'expired'
  | 'cancelled'
  | 'state-changed'
  | 'unavailable'
  | 'capacity'
  | 'storage-unavailable';
export type LostRecoveryResult =
  | { ok: false; refusal: LostRecoveryRefusal }
  | { ok: true; stage: 'challenge'; challenge: LostRecoveryChallenge }
  | { ok: true; stage: 'prepared'; prepared: LostRecoveryPrepared; login?: SessionIssuanceResult }
  | { ok: true; stage: 'cancelled' };
