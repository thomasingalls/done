import { rethrowAuthorization } from './authorization.ts';
/** Private signed locator. No ciphertext, wrapping key or publication capability is returned. */
import type { DatabaseSync } from 'node:sqlite';
import {
  parseDiscoveryRequest,
  parseDiscoveryResponse,
  verifyDiscoveryRequest,
  verifyDiscoveryResponse,
  discoveryRequestHash,
  DISCOVERY_LIFETIME_MS,
  type AuthorityDiscoveryResponse,
} from '../account-protocol/successor.ts';
import {
  read,
  snapshot,
  snapshotBytes,
  verifyWorkspaceAuthority,
  census,
  type DeliveryIssuer,
} from './delivery.ts';
import type { DeliveryVerification } from './deliveryVerification.ts';
import {
  causeCode,
  reportDiagnostic,
  type DiagnosticSink,
} from '../account-protocol/diagnostics.ts';

export interface DiscoveryIssuer extends DeliveryIssuer {
  discovery(
    value: Omit<AuthorityDiscoveryResponse, 'signature'>,
  ): Promise<AuthorityDiscoveryResponse>;
}
export type DiscoveryResult =
  | AuthorityDiscoveryResponse
  | {
      ok: false;
      refusal: 'invalid-request' | 'unavailable' | 'state-changed' | 'storage-unavailable';
    };
const refused = (
  refusal: Exclude<DiscoveryResult, AuthorityDiscoveryResponse>['refusal'],
): DiscoveryResult => ({ ok: false, refusal });
type Hook = (point: 'after-verify' | 'before-commit' | 'after-commit', operation: string) => void;
export async function discoverAuthority(
  db: DatabaseSync,
  input: unknown,
  issuer: DiscoveryIssuer,
  now: () => number,
  hook: Hook,
  reuse?: DeliveryVerification,
  diagnostics?: DiagnosticSink,
): Promise<DiscoveryResult> {
  let request: ReturnType<typeof parseDiscoveryRequest>;
  try {
    request = parseDiscoveryRequest(input);
  } catch {
    return refused('invalid-request');
  }
  for (let retry = 0; retry < 4; retry++) {
    let phase: 'storage' | 'verify' | 'response' = 'storage';
    try {
      const before = read(db, request.workspaceId);
      if (!before) return refused('unavailable');
      phase = 'verify';
      const auth = await verifyWorkspaceAuthority(before, issuer),
        base = { pin: issuer.pin, request: auth.request, receipt: auth.receipt };
      // This older locator cannot represent epoch 3. Never advertise epoch 2 as current.
      if (auth.certificationSuccessor) return refused('unavailable');
      await verifyDiscoveryRequest(request, base, auth.successor, now());
      // A signed pointer alone is insufficient: preserve the same complete-history interlock as reads.
      await census(before, auth, reuse);
      hook('after-verify', 'discover-authority');
      phase = 'response';
      const result = parseDiscoveryResponse(
        await issuer.discovery({
          v: 1,
          kind: 'authority-discovery-response',
          requestHash: await discoveryRequestHash(request),
          successor: auth.successor,
        }),
      );
      await verifyDiscoveryResponse(result, request, base, now());
      db.exec('BEGIN');
      if (snapshotBytes(snapshot(db, request.workspaceId)) !== snapshotBytes(before)) {
        db.exec('ROLLBACK');
        continue;
      }
      const completeAuthorization = issuer.authorize?.(db, {
        kind: 'workspace',
        workspaceId: request.workspaceId,
        credentialId: request.credentialId,
        action: 'discover',
      });
      hook('before-commit', 'discover-authority');
      const at = now();
      if (request.expiresAt <= at || request.expiresAt - at > DISCOVERY_LIFETIME_MS) {
        db.exec('ROLLBACK');
        return refused('invalid-request');
      }
      issuer.check(auth.seal, before.promotion.request_digest, auth.a.acceptanceKey);
      completeAuthorization?.();
      db.exec('COMMIT');
      return result;
    } catch (cause) {
      if (db.isTransaction) db.exec('ROLLBACK');
      rethrowAuthorization(cause);
      reuse?.clear();
      reportDiagnostic(diagnostics, { operation: 'discovery', phase, code: causeCode(cause) });
      return refused(phase === 'storage' ? 'storage-unavailable' : 'unavailable');
    }
  }
  return refused('state-changed');
}
