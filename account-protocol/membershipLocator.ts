import { CLOCK_SKEW_ALLOWANCE_MS } from './clockSkew.ts';
import { proofWork, type ProofCheckpoint } from './proofWork.ts';
/** Bounded, request-bound membership discovery. Proof verification never installs an authority. */
import { parseRecoverySuccessor } from './recoveryTransition.ts';
import { closed } from './preparation.ts';
import { parseAuthorityPin, type AuthorityPin } from './authority.ts';
import {
  parseAdmissionRequest,
  parseReceipt,
  same,
  json,
  domainMessage,
  verifySignature,
} from './admission.ts';
import { parseSuccessor, type SuccessorBase } from './successor.ts';
import { parseCertificationSuccessor } from './contentDelivery.ts';
import {
  parseMembershipAdmission,
  parseMembershipCertification,
  parseMembershipCancellation,
  parseMembershipRotation,
  MEMBERSHIP_CREDENTIAL_LIMIT,
  MEMBERSHIP_PROOF_LIMIT,
} from './membership.ts';
import {
  verifyCertificationHistory,
  verifyEarlyHistory,
  extendMembershipHistory,
  historyAuthority,
  historyReader,
  type AdmissionHistory,
} from './admissionHistory.ts';
import { digest, unhex } from './recovery.ts';

export const MEMBERSHIP_CHAIN_LIMIT =
  (2 * MEMBERSHIP_CREDENTIAL_LIMIT + 2) * MEMBERSHIP_PROOF_LIMIT;
export const MEMBERSHIP_BOOTSTRAP_LIMIT = 80 * 1024 * 1024;
export const MEMBERSHIP_LOCATOR_REQUEST_LIMIT = 4096;
export const MEMBERSHIP_DISCOVERY_LIFETIME_MS = 60_000;
const hex = (v: unknown, bytes = 32): string => {
  unhex(v, bytes);
  return v as string;
};
const bounded = (v: unknown, max: number) => {
  if (json(v).length > max) throw Error('Membership locator too large');
};
const integer = (v: unknown, min: number): number => {
  if (!Number.isSafeInteger(v) || (v as number) < min)
    throw Error('Invalid membership locator integer');
  return v as number;
};
const anchor = (v: unknown) => {
  const a = closed(v, ['epoch', 'head']);
  return { epoch: integer(a['epoch'], 1), head: hex(a['head']) };
};
export function parseMembershipChain(input: unknown) {
  bounded(input, MEMBERSHIP_CHAIN_LIMIT);
  const p = closed(input, ['successor', 'certification', 'continuations']);
  if (
    !Array.isArray(p['continuations']) ||
    p['continuations'].length > 2 * MEMBERSHIP_CREDENTIAL_LIMIT
  )
    throw Error('Invalid membership chain length');
  if (p['certification'] === null && p['continuations'][0]?.kind !== 'recovery-successor')
    throw Error('Missing certified or recovery membership anchor');
  if (p['certification'] !== null && p['successor'] === null)
    throw Error('Certification without admission');
  return {
    successor: p['successor'] === null ? null : parseSuccessor(p['successor']),
    certification:
      p['certification'] === null ? null : parseCertificationSuccessor(p['certification']),
    continuations: p['continuations'].map((proof) =>
      proof?.kind === 'recovery-successor'
        ? parseRecoverySuccessor(proof)
        : proof?.kind === 'membership-admission'
          ? parseMembershipAdmission(proof)
          : proof?.kind === 'membership-cancellation'
            ? parseMembershipCancellation(proof)
            : proof?.kind === 'membership-rotation'
              ? parseMembershipRotation(proof)
              : parseMembershipCertification(proof),
    ),
  };
}
export async function verifyMembershipChain(
  input: unknown,
  base: SuccessorBase,
  checkpoint?: ProofCheckpoint,
) {
  const proofs = parseMembershipChain(input);
  const capturedBase = structuredClone(base);
  let history = proofs.certification
    ? await proofWork(
        checkpoint,
        verifyCertificationHistory(
          proofs.certification,
          proofs.successor,
          capturedBase,
          {
            epoch: 3,
            head: proofs.certification.head,
          },
          checkpoint,
        ),
      )
    : await proofWork(checkpoint, verifyEarlyHistory(capturedBase, proofs.successor, checkpoint));
  for (const proof of proofs.continuations)
    history = await proofWork(checkpoint, extendMembershipHistory(proof, history, checkpoint));
  return { proofs, history };
}
function memberAt(
  history: AdmissionHistory,
  credential: string,
  held: { epoch: number; head: string },
) {
  const authority = historyAuthority(history, {
    ...history.current,
    tip: held.epoch,
    head: held.head,
  });
  const member = history.readers.find((m) => m.id === credential);
  if (!member || !historyReader(history, member.id, member.publicKey, authority))
    throw Error('Uncertified membership locator actor');
  return member;
}
export function parseMembershipInvitation(input: unknown) {
  bounded(input, MEMBERSHIP_LOCATOR_REQUEST_LIMIT);
  const r = closed(input, [
    'v',
    'workspaceId',
    'lineageId',
    'credentialId',
    'epoch',
    'head',
    'nonce',
    'signature',
  ]);
  if (r['v'] !== 2) throw Error('Invalid membership invitation version');
  return {
    v: 2 as const,
    workspaceId: hex(r['workspaceId'], 16),
    lineageId: hex(r['lineageId']),
    credentialId: hex(r['credentialId'], 16),
    ...anchor({ epoch: r['epoch'], head: r['head'] }),
    nonce: hex(r['nonce']),
    signature: hex(r['signature'], 64),
  };
}
export const membershipInvitationMessage = (input: unknown) => {
  const { signature: _, ...body } = parseMembershipInvitation(input);
  return domainMessage('done/membership-invitation/v2', body);
};
export async function verifyMembershipInvitation(input: unknown, history: AdmissionHistory) {
  const r = parseMembershipInvitation(input),
    member = memberAt(history, r.credentialId, r);
  if (r.workspaceId !== history.current.workspace || r.lineageId !== history.current.lineage)
    throw Error('Membership invitation scope changed');
  await verifySignature(member.publicKey, r.signature, await membershipInvitationMessage(r));
  return r;
}
export function parseMembershipBootstrapRequest(input: unknown) {
  bounded(input, MEMBERSHIP_LOCATOR_REQUEST_LIMIT);
  const r = closed(input, ['v', 'workspaceId', 'nonce', 'invitation']);
  if (r['v'] !== 2) throw Error('Invalid membership bootstrap version');
  const result = {
    v: 2 as const,
    workspaceId: hex(r['workspaceId'], 16),
    nonce: hex(r['nonce']),
    invitation: parseMembershipInvitation(r['invitation']),
  };
  if (result.invitation.workspaceId !== result.workspaceId)
    throw Error('Bootstrap workspace changed');
  return result;
}
export function parseMembershipBootstrapResponse(input: unknown) {
  bounded(input, MEMBERSHIP_BOOTSTRAP_LIMIT);
  const r = closed(input, ['v', 'kind', 'requestHash', 'base', 'proofs', 'signature']);
  if (r['v'] !== 2 || r['kind'] !== 'membership-bootstrap')
    throw Error('Invalid membership bootstrap response');
  const b = closed(r['base'], ['pin', 'request', 'receipt']);
  return {
    v: 2 as const,
    kind: 'membership-bootstrap' as const,
    requestHash: hex(r['requestHash']),
    base: {
      pin: parseAuthorityPin(b['pin']),
      request: parseAdmissionRequest(b['request']),
      receipt: parseReceipt(b['receipt']),
    },
    proofs: parseMembershipChain(r['proofs']),
    signature: hex(r['signature'], 64),
  };
}
export const membershipBootstrapMessage = (input: unknown) => {
  const { signature: _, ...body } = parseMembershipBootstrapResponse(input);
  return domainMessage('done/membership-bootstrap/v2', body);
};
export async function verifyMembershipBootstrapResponse(
  input: unknown,
  requestInput: unknown,
  pinInput: AuthorityPin,
) {
  const response = parseMembershipBootstrapResponse(input),
    request = parseMembershipBootstrapRequest(requestInput),
    pin = parseAuthorityPin(pinInput);
  if (!same(response.base.pin, pin) || response.requestHash !== (await digest(json(request))))
    throw Error('Membership bootstrap request or pin changed');
  await verifySignature(
    pin.authRoot,
    response.signature,
    await membershipBootstrapMessage(response),
  );
  const { history } = await verifyMembershipChain(response.proofs, response.base);
  await verifyMembershipInvitation(request.invitation, history);
  return { response, history };
}
export function parseMembershipDiscoveryRequest(input: unknown) {
  bounded(input, MEMBERSHIP_LOCATOR_REQUEST_LIMIT);
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
  if (r['v'] !== 2 || r['kind'] !== 'membership-discovery-request')
    throw Error('Invalid membership discovery request');
  return {
    v: 2 as const,
    kind: 'membership-discovery-request' as const,
    pin: parseAuthorityPin(r['pin']),
    workspaceId: hex(r['workspaceId'], 16),
    lineageId: hex(r['lineageId']),
    credentialId: hex(r['credentialId'], 16),
    ...anchor({ epoch: r['epoch'], head: r['head'] }),
    nonce: hex(r['nonce']),
    expiresAt: integer(r['expiresAt'], 0),
    signature: hex(r['signature'], 64),
  };
}
export const membershipDiscoveryRequestMessage = (input: unknown) => {
  const { signature: _, ...body } = parseMembershipDiscoveryRequest(input);
  return domainMessage('done/membership-discovery-request/v2', body);
};
export async function verifyMembershipDiscoveryRequest(
  input: unknown,
  pin: AuthorityPin,
  history: AdmissionHistory,
  now: number,
  checkpoint?: ProofCheckpoint,
) {
  const r = parseMembershipDiscoveryRequest(input),
    member = memberAt(history, r.credentialId, r);
  if (
    !Number.isSafeInteger(now) ||
    now < 0 ||
    r.expiresAt <= now ||
    r.expiresAt - now > MEMBERSHIP_DISCOVERY_LIFETIME_MS + CLOCK_SKEW_ALLOWANCE_MS ||
    !same(r.pin, pin) ||
    r.workspaceId !== history.current.workspace ||
    r.lineageId !== history.current.lineage
  )
    throw Error('Membership discovery scope or lifetime changed');
  await proofWork(
    checkpoint,
    verifySignature(
      member.publicKey,
      r.signature,
      await proofWork(checkpoint, membershipDiscoveryRequestMessage(r)),
    ),
  );
  return r;
}
export function parseMembershipDiscoveryResponse(input: unknown) {
  bounded(input, MEMBERSHIP_CHAIN_LIMIT + 1024);
  const r = closed(input, ['v', 'kind', 'requestHash', 'proofs', 'signature']);
  if (r['v'] !== 2 || r['kind'] !== 'membership-discovery')
    throw Error('Invalid membership discovery response');
  return {
    v: 2 as const,
    kind: 'membership-discovery' as const,
    requestHash: hex(r['requestHash']),
    proofs: parseMembershipChain(r['proofs']),
    signature: hex(r['signature'], 64),
  };
}
export const membershipDiscoveryResponseMessage = (input: unknown) => {
  const { signature: _, ...body } = parseMembershipDiscoveryResponse(input);
  return domainMessage('done/membership-discovery/v2', body);
};
export async function verifyMembershipDiscoveryResponse(
  input: unknown,
  requestInput: unknown,
  baseInput: SuccessorBase,
  now: number,
  checkpoint?: ProofCheckpoint,
) {
  const response = parseMembershipDiscoveryResponse(input),
    request = parseMembershipDiscoveryRequest(requestInput),
    base = structuredClone(baseInput);
  if (response.requestHash !== (await proofWork(checkpoint, digest(json(request)))))
    throw Error('Membership discovery request changed');
  await proofWork(
    checkpoint,
    verifySignature(
      base.pin.authRoot,
      response.signature,
      await proofWork(checkpoint, membershipDiscoveryResponseMessage(response)),
    ),
  );
  const { history } = await proofWork(
    checkpoint,
    verifyMembershipChain(response.proofs, base, checkpoint),
  );
  await proofWork(
    checkpoint,
    verifyMembershipDiscoveryRequest(request, base.pin, history, now, checkpoint),
  );
  return { response, history };
}
