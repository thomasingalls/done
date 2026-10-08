/** Read the immutable original baseline under current membership; this grants no new authority. */
import { closed } from './preparation.ts';
import { parseAuthorityPin, type AuthorityPin } from './authority.ts';
import { domainMessage, json, same, semanticMessage, verifySignature } from './admission.ts';
import { unhex } from './recovery.ts';
import {
  historyAuthority,
  historyReader,
  historyMembership,
  historyPublisher,
  type AdmissionHistory,
} from './admissionHistory.ts';
import { membershipState } from './membership.ts';
import {
  verifyContentCheckpoint,
  checkpointAdmissionBody,
  type CheckpointAuthority,
  type ContentCheckpoint,
  type CheckpointAdmission,
} from './contentCheckpoint.ts';

export const MEMBERSHIP_CHECKPOINT_REQUEST_LIMIT = 4096;
export const MEMBERSHIP_CHECKPOINT_LIFETIME_MS = 60_000;
const hex = (value: unknown, bytes = 32): string => {
  unhex(value, bytes);
  return value as string;
};
export function parseMembershipCheckpointRequest(input: unknown) {
  if (json(input).length > MEMBERSHIP_CHECKPOINT_REQUEST_LIMIT)
    throw Error('Membership checkpoint request too large');
  const r = closed(input, [
    'v',
    'kind',
    'pin',
    'workspaceId',
    'lineageId',
    'credentialId',
    'epoch',
    'head',
    'nonce',
    'expiresAt',
    'signature',
  ]);
  if (
    r['v'] !== 2 ||
    r['kind'] !== 'membership-checkpoint-read' ||
    !Number.isSafeInteger(r['epoch']) ||
    (r['epoch'] as number) < 4 ||
    !Number.isSafeInteger(r['expiresAt']) ||
    (r['expiresAt'] as number) < 0
  )
    throw Error('Invalid membership checkpoint request');
  return {
    v: 2 as const,
    kind: 'membership-checkpoint-read' as const,
    pin: parseAuthorityPin(r['pin']),
    workspaceId: hex(r['workspaceId'], 16),
    lineageId: hex(r['lineageId']),
    credentialId: hex(r['credentialId'], 16),
    epoch: r['epoch'] as number,
    head: hex(r['head']),
    nonce: hex(r['nonce']),
    expiresAt: r['expiresAt'] as number,
    signature: hex(r['signature'], 64),
  };
}
export const membershipCheckpointRequestMessage = (input: unknown) => {
  const { signature: _, ...body } = parseMembershipCheckpointRequest(input);
  return domainMessage('done/membership-checkpoint-read/v2', body);
};
export function checkMembershipCheckpointLifetime(expiresAt: number, now: number) {
  if (
    !Number.isSafeInteger(now) ||
    now < 0 ||
    expiresAt <= now ||
    expiresAt - now > MEMBERSHIP_CHECKPOINT_LIFETIME_MS
  )
    throw Error('Membership checkpoint request expired');
}
export async function verifyMembershipCheckpointRequest(
  input: unknown,
  pin: AuthorityPin,
  history: AdmissionHistory,
  now: number,
) {
  const r = parseMembershipCheckpointRequest(input),
    state = membershipState(historyMembership(history)),
    member = history.readers.find((m) => m.id === r.credentialId);
  checkMembershipCheckpointLifetime(r.expiresAt, now);
  if (
    !same(r.pin, pin) ||
    r.workspaceId !== history.current.workspace ||
    r.lineageId !== history.current.lineage ||
    r.epoch !== history.current.tip ||
    r.head !== history.current.head ||
    state.generation !== 1 ||
    !member ||
    !historyReader(history, member.id, member.publicKey)
  )
    throw Error('Membership checkpoint reader or authority changed');
  await verifySignature(member.publicKey, r.signature, await membershipCheckpointRequestMessage(r));
  return r;
}
/** The caller still has to decrypt/replay and durably admit its own installation. */
export async function verifyMembershipCheckpoint(
  input: unknown,
  authority: CheckpointAuthority,
  history: AdmissionHistory,
) {
  const a = structuredClone(authority),
    original = historyPublisher(history, a.base.request.candidate.signer);
  historyAuthority(original, { ...original.current, tip: 3, head: a.certification.head });
  if (
    original.first.head !== a.base.receipt.offer.head ||
    membershipState(historyMembership(history)).generation !== 1
  )
    throw Error('Historical checkpoint anchor changed');
  return verifyContentCheckpoint(input, a);
}
/** Each later reader admits the historical snapshot under its own current certified parent. */
export async function membershipCheckpointAdmissionBody(
  checkpoint: ContentCheckpoint,
  credential: string,
  history: AdmissionHistory,
): Promise<CheckpointAdmission> {
  const member = history.readers.find((m) => m.id === credential);
  if (
    !member ||
    !historyReader(history, credential, member.publicKey) ||
    history.current.tip < 5 ||
    credential === checkpoint.manifest.producer
  )
    throw Error('A later certified reader must admit its own baseline');
  return {
    ...(await checkpointAdmissionBody(checkpoint, credential)),
    decisionParent: history.current.head,
  };
}
export async function verifyMembershipCheckpointAdmission(
  input: unknown,
  checkpoint: ContentCheckpoint,
  history: AdmissionHistory,
) {
  const r = closed(input, [
    'v',
    'workspaceId',
    'checkpointDigest',
    'manifestDigest',
    'derivedSv',
    'derivedDs',
    'headBaselineDigest',
    'derivation',
    'admittingCredential',
    'selfAdmitted',
    'decisionParent',
    'signature',
  ]);
  const credential = hex(r['admittingCredential'], 16),
    signature = hex(r['signature'], 64),
    captured = structuredClone(r),
    c = structuredClone(checkpoint);
  const expected = {
    ...(await membershipCheckpointAdmissionBody(c, credential, history)),
    signature,
  };
  if (!same(expected, captured)) throw Error('Later reader baseline admission changed');
  const member = history.readers.find((m) => m.id === credential)!;
  await verifySignature(member.publicKey, signature, await semanticMessage(expected));
  return expected;
}
