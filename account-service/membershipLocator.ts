import type { DeliveryVerification } from './deliveryVerification.ts';
import { LedgerIntegrityError } from './publisherTips.ts';
import { unchanged, verifiedCensus } from './delivery.ts';
import { parseRecoverySuccessor } from '../account-protocol/recoveryTransition.ts';
/** Private continuation locators. Returned proof chains do not grant keys or install client state. */
import type { DatabaseSync } from 'node:sqlite';
import { same, json, verifySignature } from '../account-protocol/admission.ts';
import { digest } from '../account-protocol/recovery.ts';
import {
  parseMembershipChain,
  parseMembershipBootstrapRequest,
  parseMembershipBootstrapResponse,
  membershipBootstrapMessage,
  verifyMembershipInvitation,
  parseMembershipDiscoveryRequest,
  verifyMembershipDiscoveryRequest,
  parseMembershipDiscoveryResponse,
  membershipDiscoveryResponseMessage,
  MEMBERSHIP_DISCOVERY_LIFETIME_MS,
} from '../account-protocol/membershipLocator.ts';
import {
  parseMembershipAdmission,
  parseMembershipRotation,
  parseMembershipCertification,
  parseMembershipCancellation,
} from '../account-protocol/membership.ts';
import { membershipEnabled } from './membershipStore.ts';
import { rethrowAuthorization } from './authorization.ts';
import {
  snapshotWorkspaceAuthority,
  verifyCurrentWorkspaceAuthorityWithHistory,
  read,
  selectPublisher,
  type WorkspaceAuthoritySnapshot,
  type DeliveryIssuer,
  type DeliveryHook,
} from './delivery.ts';

type BootstrapResponse = ReturnType<typeof parseMembershipBootstrapResponse>;
type DiscoveryResponse = ReturnType<typeof parseMembershipDiscoveryResponse>;
export interface MembershipLocatorIssuer extends DeliveryIssuer {
  bootstrap(value: Omit<BootstrapResponse, 'signature'>): Promise<BootstrapResponse>;
  discovery(value: Omit<DiscoveryResponse, 'signature'>): Promise<DiscoveryResponse>;
}
const no = (refusal: 'malformed' | 'unavailable' | 'state-changed' | 'ledger-integrity') => ({
  ok: false as const,
  refusal,
});
export function membershipProofChain(s: WorkspaceAuthoritySnapshot) {
  const continuations = (s.continuations ?? []).flatMap((row) => {
    const admission = parseMembershipAdmission(JSON.parse(row.artifact));
    const transfer = s.membershipTransfers?.find((r) => r.preparation_id === row.preparation_id);
    const cancellation = s.membershipCancellations?.find(
      (r) => r.preparation_id === row.preparation_id,
    );
    return [
      admission,
      ...(transfer?.artifact ? [parseMembershipCertification(JSON.parse(transfer.artifact))] : []),
      ...(cancellation ? [parseMembershipCancellation(JSON.parse(cancellation.artifact))] : []),
    ];
  });
  return parseMembershipChain({
    successor: s.successor ? JSON.parse(s.successor.artifact) : null,
    certification: s.transfer?.artifact ? JSON.parse(s.transfer.artifact) : null,
    continuations: [
      ...continuations,
      ...(s.recoveries ?? []).map((r) => parseRecoverySuccessor(JSON.parse(r.artifact))),
      ...(s.rotations ?? []).map((r) => parseMembershipRotation(JSON.parse(r.artifact))),
    ].sort((a, b) => a.epoch.epoch - b.epoch.epoch),
  });
}
export async function membershipBootstrap(
  db: DatabaseSync,
  input: unknown,
  issuer: MembershipLocatorIssuer,
) {
  if (!membershipEnabled(db)) return no('unavailable');
  let request;
  try {
    request = parseMembershipBootstrapRequest(input);
  } catch {
    return no('malformed');
  }
  for (let retry = 0; retry < 4; retry++) {
    try {
      db.exec('BEGIN');
      let before;
      try {
        before = snapshotWorkspaceAuthority(db, request.workspaceId);
      } finally {
        db.exec('ROLLBACK');
      }
      if (!before) return no('unavailable');
      const { authority: auth, history } = await verifyCurrentWorkspaceAuthorityWithHistory(
        before,
        issuer,
      );
      const base = { pin: issuer.pin, request: auth.request, receipt: auth.receipt },
        proofs = membershipProofChain(before);
      if (history.current.head !== auth.a.head) throw Error('Bootstrap current head changed');
      await verifyMembershipInvitation(request.invitation, history);
      const body = {
        v: 2 as const,
        kind: 'membership-bootstrap' as const,
        requestHash: await digest(json(request)),
        base,
        proofs,
      };
      const response = parseMembershipBootstrapResponse(await issuer.bootstrap(body));
      const { signature, ...actual } = response;
      if (!same(body, actual)) throw Error('Bootstrap issuer changed response');
      await verifySignature(
        issuer.pin.authRoot,
        signature,
        await membershipBootstrapMessage(response),
      );
      db.exec('BEGIN');
      try {
        if (!same(snapshotWorkspaceAuthority(db, request.workspaceId), before)) continue;
        issuer.check(auth.seal, before.promotion.request_digest, auth.a.acceptanceKey);
        return response;
      } finally {
        db.exec('ROLLBACK');
      }
    } catch {
      if (db.isTransaction) db.exec('ROLLBACK');
      return no('unavailable');
    }
  }
  return no('state-changed');
}
export async function discoverMembership(
  db: DatabaseSync,
  input: unknown,
  issuer: MembershipLocatorIssuer,
  now: () => number,
  hook: DeliveryHook,
  reuse?: DeliveryVerification,
) {
  if (!membershipEnabled(db)) return no('unavailable');
  let request;
  try {
    request = parseMembershipDiscoveryRequest(input);
  } catch {
    return no('malformed');
  }
  for (let retry = 0; retry < 4; retry++) {
    try {
      const before = read(db, request.workspaceId, request.credentialId, reuse, {
        purpose: 'membership-discovery',
      });
      if (!before) return no('unavailable');
      const { authority, history } = await verifyCurrentWorkspaceAuthorityWithHistory(
        before,
        issuer,
      );
      const auth = selectPublisher(authority, request.credentialId),
        proofs = membershipProofChain(before);
      if (history.current.head !== auth.a.head) throw Error('Discovery current head changed');
      await verifyMembershipDiscoveryRequest(request, issuer.pin, history, now());
      // Keep the requesting publisher's complete-history interlock. Discovery must not hide a
      // missing accepted prefix behind a correctly signed current pointer.
      await verifiedCensus(before, auth, reuse);
      hook('after-verify', 'discover-membership');
      const body = {
        v: 2 as const,
        kind: 'membership-discovery' as const,
        requestHash: await digest(json(request)),
        proofs,
      };
      const response = parseMembershipDiscoveryResponse(await issuer.discovery(body));
      const { signature, ...actual } = response;
      if (!same(body, actual)) throw Error('Discovery issuer changed response');
      await verifySignature(
        issuer.pin.authRoot,
        signature,
        await membershipDiscoveryResponseMessage(response),
      );
      db.exec('BEGIN');
      if (!unchanged(db, before, reuse, 'membership-discovery')) {
        db.exec('ROLLBACK');
        continue;
      }
      const authorize = issuer.authorize?.(db, {
        kind: 'workspace',
        workspaceId: request.workspaceId,
        credentialId: request.credentialId,
        action: 'discover',
      });
      hook('before-commit', 'discover-membership');
      const at = now();
      if (
        !Number.isSafeInteger(at) ||
        at < 0 ||
        request.expiresAt <= at ||
        request.expiresAt - at > MEMBERSHIP_DISCOVERY_LIFETIME_MS
      )
        throw Error('Discovery expired before commit');
      issuer.check(auth.seal, before.promotion.request_digest, auth.a.acceptanceKey);
      authorize?.();
      db.exec('COMMIT');
      return response;
    } catch (cause) {
      if (db.isTransaction) db.exec('ROLLBACK');
      if (cause instanceof LedgerIntegrityError) return no('ledger-integrity');
      rethrowAuthorization(cause);
      return no('unavailable');
    }
  }
  return no('state-changed');
}
