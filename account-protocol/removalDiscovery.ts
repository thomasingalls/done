import { proofWork, type ProofCheckpoint } from './proofWork.ts';
/** A removed credential may learn its own terminal proof, never current content authority. */
import { closed } from './preparation.ts';
import { same, json, domainMessage, verifySignature } from './admission.ts';
import { parseAuthorityPin, type AuthorityPin } from './authority.ts';
import { digest, unhex } from './recovery.ts';
import { type SuccessorBase } from './successor.ts';
import { membershipState } from './membership.ts';
import {
  historyMembership,
  extendMembershipHistory,
  verifyEarlyHistory,
} from './admissionHistory.ts';
import {
  parseMembershipChain,
  verifyMembershipChain,
  MEMBERSHIP_CHAIN_LIMIT,
  MEMBERSHIP_DISCOVERY_LIFETIME_MS,
} from './membershipLocator.ts';
const hex = (v: unknown, n: number) => {
  unhex(v, n);
  return v as string;
};
export function parseRemovalDiscoveryRequest(input: unknown) {
  const r = closed(input, [
    'v',
    'kind',
    'pin',
    'workspaceId',
    'lineageId',
    'credentialId',
    'nonce',
    'expiresAt',
    'signature',
  ]);
  if (
    r['v'] !== 1 ||
    r['kind'] !== 'removal-discovery-request' ||
    !Number.isSafeInteger(r['expiresAt']) ||
    (r['expiresAt'] as number) < 0
  )
    throw Error('Invalid removal discovery');
  return {
    v: 1 as const,
    kind: 'removal-discovery-request' as const,
    pin: parseAuthorityPin(r['pin']),
    workspaceId: hex(r['workspaceId'], 16),
    lineageId: hex(r['lineageId'], 32),
    credentialId: hex(r['credentialId'], 16),
    nonce: hex(r['nonce'], 32),
    expiresAt: r['expiresAt'] as number,
    signature: hex(r['signature'], 64),
  };
}
export const removalDiscoveryRequestMessage = (input: unknown) => {
  const { signature: _, ...r } = parseRemovalDiscoveryRequest(input);
  return domainMessage('done/removal-discovery-request/v1', r);
};
export async function verifyRemovalDiscoveryRequest(
  input: unknown,
  pin: AuthorityPin,
  base: SuccessorBase,
  chainInput: unknown,
  now: number,
  checkpoint?: ProofCheckpoint,
) {
  const r = parseRemovalDiscoveryRequest(input),
    proofs = parseMembershipChain(chainInput);
  const final = proofs.continuations.at(-1);
  if (
    !final ||
    !(final.kind === 'membership-rotation'
      ? final.epoch.finalization.credential === r.credentialId
      : final.kind === 'recovery-successor' &&
        final.epoch.finalizations.some((f) => f.credential === r.credentialId))
  )
    throw Error('Not this device removal');
  const before =
    !proofs.certification && proofs.continuations.length === 1
      ? {
          history: await proofWork(
            checkpoint,
            verifyEarlyHistory(base, proofs.successor, checkpoint),
          ),
        }
      : await proofWork(
          checkpoint,
          verifyMembershipChain(
            { ...proofs, continuations: proofs.continuations.slice(0, -1) },
            base,
            checkpoint,
          ),
        );
  const parent = membershipState(historyMembership(before.history)),
    member = parent.roster.find((m) => m.id === r.credentialId);
  const history = await proofWork(
    checkpoint,
    extendMembershipHistory(final, before.history, checkpoint),
  );
  if (
    !member ||
    !same(r.pin, pin) ||
    !same(base.pin, pin) ||
    r.workspaceId !== parent.workspaceId ||
    r.lineageId !== parent.lineageId ||
    !Number.isSafeInteger(now) ||
    now < 0 ||
    r.expiresAt <= now ||
    r.expiresAt - now > MEMBERSHIP_DISCOVERY_LIFETIME_MS
  )
    throw Error('Removal discovery scope or lifetime changed');
  await proofWork(
    checkpoint,
    verifySignature(
      member.sPub,
      r.signature,
      await proofWork(checkpoint, removalDiscoveryRequestMessage(r)),
    ),
  );
  return { request: r, proofs, history, member };
}
export function parseRemovalDiscoveryResponse(input: unknown) {
  if (json(input).length > MEMBERSHIP_CHAIN_LIMIT + 1024)
    throw Error('Oversized removal discovery');
  const r = closed(input, ['v', 'kind', 'requestHash', 'proofs', 'signature']);
  if (r['v'] !== 1 || r['kind'] !== 'removal-discovery')
    throw Error('Invalid removal discovery reply');
  return {
    v: 1 as const,
    kind: 'removal-discovery' as const,
    requestHash: hex(r['requestHash'], 32),
    proofs: parseMembershipChain(r['proofs']),
    signature: hex(r['signature'], 64),
  };
}
export const removalDiscoveryResponseMessage = (input: unknown) => {
  const { signature: _, ...r } = parseRemovalDiscoveryResponse(input);
  return domainMessage('done/removal-discovery/v1', r);
};
export async function verifyRemovalDiscoveryResponse(
  input: unknown,
  requestInput: unknown,
  base: SuccessorBase,
  now: number,
  checkpoint?: ProofCheckpoint,
) {
  const response = parseRemovalDiscoveryResponse(input),
    request = parseRemovalDiscoveryRequest(requestInput),
    capturedBase = structuredClone(base);
  if (response.requestHash !== (await proofWork(checkpoint, digest(json(request)))))
    throw Error('Removal discovery request changed');
  await proofWork(
    checkpoint,
    verifySignature(
      capturedBase.pin.authRoot,
      response.signature,
      await proofWork(checkpoint, removalDiscoveryResponseMessage(response)),
    ),
  );
  const checked = await proofWork(
    checkpoint,
    verifyRemovalDiscoveryRequest(
      request,
      capturedBase.pin,
      capturedBase,
      response.proofs,
      now,
      checkpoint,
    ),
  );
  return { response, ...checked };
}
