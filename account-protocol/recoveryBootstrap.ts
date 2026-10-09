/** Total-device-loss proof bytes. Verification is not account login, a commit or a content grant. */
import { closed } from './preparation.ts';
import { parseAuthorityPin, type AuthorityPin } from './authority.ts';
import { json, same, verifySignature } from './admission.ts';
import {
  lp,
  unhex,
  parseDraft,
  rootCommitment,
  recoveryStateDigest,
  type RecoveryDraft,
} from './recovery.ts';

export const RECOVERY_BOOTSTRAP_LIMIT = 4096;
const fixed = (value: unknown, bytes = 32): string => {
  unhex(value, bytes);
  return value as string;
};
const integer = (value: unknown, minimum: number): number => {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || Object.is(value, -0))
    throw Error('Invalid recovery integer');
  return value as number;
};
const bound = (value: unknown) => {
  if (json(value).length > RECOVERY_BOOTSTRAP_LIMIT) throw Error('Oversized recovery proof');
};

export interface RecoveryHeadAssertion {
  v: 1;
  workspaceId: string;
  epoch: number;
  head: string;
  clientNonce: string;
  issuedAt: number;
  signature: string;
}
export function parseRecoveryHeadAssertion(input: unknown): RecoveryHeadAssertion {
  bound(input);
  const r = closed(input, [
    'v',
    'workspaceId',
    'epoch',
    'head',
    'clientNonce',
    'issuedAt',
    'signature',
  ]);
  if (r['v'] !== 1) throw Error('Invalid recovery head version');
  return {
    v: 1,
    workspaceId: fixed(r['workspaceId'], 16),
    epoch: integer(r['epoch'], 1),
    head: fixed(r['head']),
    clientNonce: fixed(r['clientNonce']),
    issuedAt: integer(r['issuedAt'], 0),
    signature: fixed(r['signature'], 64),
  };
}
/** TRD 13.5: issuedAt is signed display information, never a recovering device's clock gate. */
export function recoveryHeadAssertionMessage(input: unknown) {
  const r = parseRecoveryHeadAssertion(input);
  return lp(
    'done/head-assert/v1',
    r.workspaceId,
    String(r.epoch),
    r.head,
    r.clientNonce,
    String(r.issuedAt),
  );
}
export interface VerifiedRecoveryHead {
  readonly pin: Readonly<AuthorityPin>;
  readonly assertion: Readonly<RecoveryHeadAssertion>;
}
const heads = new WeakSet<VerifiedRecoveryHead>();
export async function verifyRecoveryHeadAssertion(
  input: unknown,
  pinInput: AuthorityPin,
  expected: { workspaceId: string; clientNonce: string },
): Promise<VerifiedRecoveryHead> {
  const assertion = parseRecoveryHeadAssertion(input),
    pin = parseAuthorityPin(pinInput);
  const workspaceId = fixed(expected.workspaceId, 16),
    clientNonce = fixed(expected.clientNonce);
  if (assertion.workspaceId !== workspaceId || assertion.clientNonce !== clientNonce)
    throw Error('Recovery head request changed');
  await verifySignature(pin.authRoot, assertion.signature, recoveryHeadAssertionMessage(assertion));
  const verified = Object.freeze({ pin: Object.freeze(pin), assertion: Object.freeze(assertion) });
  heads.add(verified);
  return verified;
}

export interface RecoveryBootstrap {
  v: 1;
  kind: 'recovery-bootstrap';
  workspaceId: string;
  lineageId: string;
  observedEpoch: number;
  observedHeadDigest: string;
  clientNonce: string;
  priorRecoveryStateDigest: string;
  recoveredRoot: string;
  newCredentialId: string;
  newWPub: string;
  newSPub: string;
  newRecoveryStateDigest: string;
  conflictParent: string;
  signature: string;
  countersignature: string;
}
export function parseRecoveryBootstrap(input: unknown): RecoveryBootstrap {
  bound(input);
  const r = closed(input, [
    'v',
    'kind',
    'workspaceId',
    'lineageId',
    'observedEpoch',
    'observedHeadDigest',
    'clientNonce',
    'priorRecoveryStateDigest',
    'recoveredRoot',
    'newCredentialId',
    'newWPub',
    'newSPub',
    'newRecoveryStateDigest',
    'conflictParent',
    'signature',
    'countersignature',
  ]);
  if (r['v'] !== 1 || r['kind'] !== 'recovery-bootstrap') throw Error('Invalid recovery bootstrap');
  return {
    v: 1,
    kind: 'recovery-bootstrap',
    workspaceId: fixed(r['workspaceId'], 16),
    lineageId: fixed(r['lineageId']),
    observedEpoch: integer(r['observedEpoch'], 1),
    observedHeadDigest: fixed(r['observedHeadDigest']),
    clientNonce: fixed(r['clientNonce']),
    priorRecoveryStateDigest: fixed(r['priorRecoveryStateDigest']),
    recoveredRoot: fixed(r['recoveredRoot']),
    newCredentialId: fixed(r['newCredentialId'], 16),
    newWPub: fixed(r['newWPub']),
    newSPub: fixed(r['newSPub']),
    newRecoveryStateDigest: fixed(r['newRecoveryStateDigest']),
    conflictParent: fixed(r['conflictParent']),
    signature: fixed(r['signature'], 64),
    countersignature: fixed(r['countersignature'], 64),
  };
}
/** TRD 13.8's ordered bytes; its service_nonce position carries 13.5's client nonce unchanged. */
export function recoveryBootstrapMessage(input: unknown) {
  const r = parseRecoveryBootstrap(input);
  return lp(
    'done/recovery-bootstrap/v1',
    String(r.v),
    r.workspaceId,
    r.lineageId,
    String(r.observedEpoch),
    r.observedHeadDigest,
    r.clientNonce,
    r.priorRecoveryStateDigest,
    r.recoveredRoot,
    r.newCredentialId,
    r.newWPub,
    r.newSPub,
    r.newRecoveryStateDigest,
    r.conflictParent,
  );
}
export interface RecoveryBootstrapContext {
  head: VerifiedRecoveryHead;
  /** From current verified membership/service state, not the submitted bootstrap. On the client,
   * the actual code must also open this envelope before any bootstrap signature is produced. */
  recovery: RecoveryDraft;
  currentRecoveryStateDigest: string;
  /** Locally retained new keys on the client; account-authorized attempt keys on the service. */
  candidate: { credentialId: string; wPub: string; sPub: string };
  /** Held attempt parent, not a value selected from an incoming reply. */
  conflictParent: string;
}
/** Copies every caller-controlled field before the first await. This increment preserves the
 * existing recovery code/state; code replacement is a separate transition. The returned request
 * has zero signature placeholders and cannot pass verification until both parties sign it. */
export async function prepareRecoveryBootstrap(input: RecoveryBootstrapContext) {
  const head = input.head;
  if (!heads.has(head)) throw Error('Unverified recovery head');
  const recovery = parseDraft(input.recovery),
    currentRecoveryStateDigest = fixed(input.currentRecoveryStateDigest),
    candidate = Object.freeze({
      credentialId: fixed(input.candidate.credentialId, 16),
      wPub: fixed(input.candidate.wPub),
      sPub: fixed(input.candidate.sPub),
    }),
    conflictParent = fixed(input.conflictParent);
  const a = head.assertion;
  if (
    recovery.workspaceId !== a.workspaceId ||
    recovery.authRoot !== head.pin.authRoot ||
    recovery.rootCommitment !== (await rootCommitment(recovery)) ||
    (await recoveryStateDigest(recovery)) !== currentRecoveryStateDigest
  )
    throw Error('Recovery state or authority changed');
  Object.freeze(recovery.envelope);
  const context = Object.freeze({
    head,
    recovery: Object.freeze(recovery),
    currentRecoveryStateDigest,
    candidate,
    conflictParent,
  });
  const request = Object.freeze(
    parseRecoveryBootstrap({
      v: 1,
      kind: 'recovery-bootstrap',
      workspaceId: a.workspaceId,
      lineageId: recovery.lineageId,
      observedEpoch: a.epoch,
      observedHeadDigest: a.head,
      clientNonce: a.clientNonce,
      priorRecoveryStateDigest: currentRecoveryStateDigest,
      recoveredRoot: head.pin.authRoot,
      newCredentialId: candidate.credentialId,
      newWPub: candidate.wPub,
      newSPub: candidate.sPub,
      newRecoveryStateDigest: currentRecoveryStateDigest,
      conflictParent,
      signature: '00'.repeat(64),
      countersignature: '00'.repeat(64),
    }),
  );
  return Object.freeze({ context, request });
}
/** Stateless proof check. Exact replay remains valid here: the service must recheck account
 * authorization/current parent and atomically consume the attempt with its exact commit outcome. */
export async function verifyRecoveryBootstrap(input: unknown, expected: RecoveryBootstrapContext) {
  const r = parseRecoveryBootstrap(input);
  const prepared = await prepareRecoveryBootstrap(expected);
  const { signature, countersignature, ...body } = r;
  const { signature: _, countersignature: __, ...wanted } = prepared.request;
  if (!same(body, wanted)) throw Error('Recovery bootstrap target changed');
  const message = recoveryBootstrapMessage(r);
  await verifySignature(prepared.context.recovery.bootstrapSigner, signature, message);
  await verifySignature(r.newSPub, countersignature, message);
  return Object.freeze(r);
}
