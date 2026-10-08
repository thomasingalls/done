/** A terminal proof route; it cannot authorize content reads, writes, invitations or subscriptions. */
import type { DatabaseSync } from 'node:sqlite';
import { json, same, verifySignature } from '../account-protocol/admission.ts';
import { digest } from '../account-protocol/recovery.ts';
import {
  parseRemovalDiscoveryRequest,
  parseRemovalDiscoveryResponse,
  verifyRemovalDiscoveryRequest,
  removalDiscoveryResponseMessage,
} from '../account-protocol/removalDiscovery.ts';
import { MEMBERSHIP_DISCOVERY_LIFETIME_MS } from '../account-protocol/membershipLocator.ts';
import { parseMembershipRotation } from '../account-protocol/membership.ts';
import {
  read,
  snapshot,
  snapshotBytes,
  selectPublisher,
  census,
  verifyCurrentWorkspaceAuthority,
  type DeliveryIssuer,
  type DeliveryHook,
} from './delivery.ts';
import { membershipProofChain } from './membershipLocator.ts';
import { membershipEnabled } from './membershipStore.ts';
import { rethrowAuthorization } from './authorization.ts';
type Response = ReturnType<typeof parseRemovalDiscoveryResponse>;
export interface RemovalDiscoveryIssuer extends DeliveryIssuer {
  discovery(value: Omit<Response, 'signature'>): Promise<Response>;
}
const no = (refusal: string) => ({ ok: false as const, refusal });
export async function discoverRemoval(
  db: DatabaseSync,
  input: unknown,
  issuer: RemovalDiscoveryIssuer,
  now: () => number,
  hook: DeliveryHook,
) {
  if (!membershipEnabled(db)) return no('unavailable');
  let request;
  try {
    request = parseRemovalDiscoveryRequest(input);
  } catch {
    return no('malformed');
  }
  for (let retry = 0; retry < 4; retry++) {
    try {
      const before = read(db, request.workspaceId, request.credentialId);
      if (!before) return no('unavailable');
      const auth = await verifyCurrentWorkspaceAuthority(before, issuer);
      const removed = before.rotations
        ?.map((r) => parseMembershipRotation(JSON.parse(r.artifact)))
        .find((p) => p.epoch.finalization.credential === request.credentialId);
      if (!removed) return no('unavailable');
      const all = membershipProofChain(before),
        base = { pin: issuer.pin, request: auth.request, receipt: auth.receipt };
      // Do not disclose membership or distributions committed after this device's removal.
      const proofs = {
        ...all,
        continuations: all.continuations.filter((p) => p.epoch.epoch <= removed.epoch.epoch),
      };
      const checked = await verifyRemovalDiscoveryRequest(request, issuer.pin, base, proofs, now());
      if (checked.member.state === 'certified')
        await census(before, selectPublisher(auth, request.credentialId));
      else if (before.rows.length || before.publisherWitness)
        throw Error('Pending removed device has a ledger');
      hook('after-verify', 'discover-removal');
      const body = {
        v: 1 as const,
        kind: 'removal-discovery' as const,
        requestHash: await digest(json(request)),
        proofs,
      };
      const response = parseRemovalDiscoveryResponse(await issuer.discovery(body));
      const { signature, ...actual } = response;
      if (!same(actual, body)) throw Error('Removal discovery changed');
      await verifySignature(
        issuer.pin.authRoot,
        signature,
        await removalDiscoveryResponseMessage(response),
      );
      db.exec('BEGIN');
      if (
        snapshotBytes(snapshot(db, request.workspaceId, request.credentialId)) !==
        snapshotBytes(before)
      ) {
        db.exec('ROLLBACK');
        continue;
      }
      const complete = issuer.authorize?.(db, {
        kind: 'removal',
        workspaceId: request.workspaceId,
        credentialId: request.credentialId,
        action: 'discover',
      });
      hook('before-commit', 'discover-removal');
      const at = now();
      if (
        !Number.isSafeInteger(at) ||
        at < 0 ||
        request.expiresAt <= at ||
        request.expiresAt - at > MEMBERSHIP_DISCOVERY_LIFETIME_MS
      )
        throw Error('Removal discovery expired');
      issuer.check(auth.seal, before.promotion.request_digest, auth.a.acceptanceKey);
      complete?.();
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
