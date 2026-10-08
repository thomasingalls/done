/** Private continuation locators. Returned proof chains do not grant keys or install client state. */
import type { DatabaseSync } from 'node:sqlite';
import { same, json, verifySignature } from '../account-protocol/admission.ts';
import { digest } from '../account-protocol/recovery.ts';
import {
  parseMembershipChain,
  verifyMembershipChain,
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
  parseMembershipCertification,
} from '../account-protocol/membership.ts';
import { membershipEnabled } from './membershipStore.ts';
import { rethrowAuthorization } from './authorization.ts';
import {
  snapshotWorkspaceAuthority,
  verifyCurrentWorkspaceAuthority,
  read,
  snapshot,
  snapshotBytes,
  selectPublisher,
  census,
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
const no = (refusal: 'malformed' | 'unavailable' | 'state-changed') => ({
  ok: false as const,
  refusal,
});
function chain(s: WorkspaceAuthoritySnapshot) {
  const continuations = (s.continuations ?? []).flatMap((row) => {
    const admission = parseMembershipAdmission(JSON.parse(row.artifact));
    const transfer = s.membershipTransfers?.find((r) => r.preparation_id === row.preparation_id);
    return [
      admission,
      ...(transfer?.artifact ? [parseMembershipCertification(JSON.parse(transfer.artifact))] : []),
    ];
  });
  return parseMembershipChain({
    successor: s.successor ? JSON.parse(s.successor.artifact) : null,
    certification: s.transfer?.artifact ? JSON.parse(s.transfer.artifact) : null,
    continuations,
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
      const auth = await verifyCurrentWorkspaceAuthority(before, issuer),
        base = { pin: issuer.pin, request: auth.request, receipt: auth.receipt },
        { history, proofs } = await verifyMembershipChain(chain(before), base);
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
      const before = read(db, request.workspaceId, request.credentialId);
      if (!before) return no('unavailable');
      const auth = selectPublisher(
          await verifyCurrentWorkspaceAuthority(before, issuer),
          request.credentialId,
        ),
        base = { pin: issuer.pin, request: auth.request, receipt: auth.receipt },
        { history, proofs } = await verifyMembershipChain(chain(before), base);
      if (history.current.head !== auth.a.head) throw Error('Discovery current head changed');
      await verifyMembershipDiscoveryRequest(request, issuer.pin, history, now());
      // Keep the requesting publisher's complete-history interlock. Discovery must not hide a
      // missing accepted prefix behind a correctly signed current pointer.
      await census(before, auth);
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
      if (
        snapshotBytes(snapshot(db, request.workspaceId, request.credentialId)) !==
        snapshotBytes(before)
      ) {
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
      rethrowAuthorization(cause);
      return no('unavailable');
    }
  }
  return no('state-changed');
}
