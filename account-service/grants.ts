import type { DatabaseSync } from 'node:sqlite';
import { parseAuthorityPin, type AuthorityPin } from '../account-protocol/authority.ts';
import { closed, accountIdentifier } from '../account-protocol/preparation.ts';
import { unhex } from '../account-protocol/recovery.ts';
import {
  GRANT_CHALLENGE_MS,
  GRANT_LIFETIME_MS,
  grantActions,
  grantMessage,
  parseGrantScope,
  type GrantChallenge,
  type GrantScope,
  type GrantResult,
  type GrantRefusal,
} from '../account-protocol/scopedGrant.ts';
import {
  snapshotWorkspaceAuthority,
  verifyWorkspaceAuthority,
  type DeliveryIssuer,
} from './delivery.ts';
import { enrollmentSnapshot, verifyEnrollmentRow, type EnrollmentRow } from './enrollment.ts';
import type { AccountSessions } from './sessions.ts';
import { canonical, fresh, hash, retryHash } from './protocol.ts';
import { AuthorizationRefused, type OperationAuthorization } from './authorization.ts';

export const GRANT_LIMITS = Object.freeze({ challenges: 1024, grants: 4096, perSession: 16 });
type Issuer = Pick<DeliveryIssuer, 'pin' | 'check'>;
type Capture = {
  authority: NonNullable<ReturnType<typeof snapshotWorkspaceAuthority>>;
  preparation: EnrollmentRow | null;
};
interface Pending {
  challenge: GrantChallenge;
  key: CryptoKey;
  fingerprint: string;
  deadline: number;
}
interface Grant extends Omit<Pending, 'key'> {
  expiresAt: number;
}
const no = (refusal: GrantRefusal): Extract<GrantResult, { ok: false }> => ({ ok: false, refusal });
// Append-only content changes are not membership changes. Keep all retained authority evidence,
// including fixed successor boundaries, but omit the changing first publisher's ledger witness.
function fingerprint(c: Capture): string {
  const { delivery_witness: _witness, ...promotion } = c.authority.promotion;
  return hash(canonical({ ...c, authority: { ...c.authority, promotion } }));
}

/** Ephemeral grants, owned by the same AccountCore as sessions and domain transactions. Restart
 * loses grants/challenges, never durable login. No renewal token or content key enters this owner. */
export class ScopedGrants {
  #db: DatabaseSync;
  #sessions: AccountSessions;
  #pin: AuthorityPin;
  #now: () => number;
  #pending = new Map<string, Pending>();
  #grants = new Map<string, Grant>();
  #closed = false;
  constructor(db: DatabaseSync, sessions: AccountSessions, pin: AuthorityPin, now: () => number) {
    this.#db = db;
    this.#sessions = sessions;
    this.#pin = parseAuthorityPin(pin);
    this.#now = now;
  }
  close(): void {
    this.#closed = true;
    this.#pending.clear();
    this.#grants.clear();
  }
  #time(): number {
    const now = this.#now();
    if (
      this.#closed ||
      !Number.isSafeInteger(now) ||
      now < 0 ||
      now > Number.MAX_SAFE_INTEGER - GRANT_LIFETIME_MS
    )
      throw new AuthorizationRefused('storage-unavailable');
    return now;
  }
  #prune(now: number): void {
    for (const [id, p] of this.#pending) if (p.challenge.expiresAt <= now) this.#pending.delete(id);
    for (const [id, g] of this.#grants) if (g.expiresAt <= now) this.#grants.delete(id);
  }
  #capture(scope: GrantScope): Capture {
    if (!this.#db.isTransaction) throw new AuthorizationRefused('storage-unavailable');
    const authority = snapshotWorkspaceAuthority(this.#db, scope.workspaceId);
    if (!authority) throw new AuthorizationRefused('insufficient-scope');
    const preparation =
      scope.kind === 'enrollment'
        ? (this.#db
            .prepare('SELECT * FROM enrollment_preparations WHERE id=?')
            .get(scope.attemptId) as unknown as EnrollmentRow | undefined)
        : null;
    if (
      scope.kind === 'enrollment' &&
      (!preparation || preparation.workspace_id !== scope.workspaceId)
    )
      throw new AuthorizationRefused('insufficient-scope');
    return { authority, preparation: preparation ?? null };
  }
  async begin(accessToken: unknown, input: unknown, issuer: Issuer): Promise<GrantResult> {
    let scope: GrantScope;
    try {
      scope = parseGrantScope(input);
    } catch {
      return no('malformed');
    }
    if (this.#closed || this.#db.isTransaction) return no('storage-unavailable');
    try {
      if (canonical(issuer.pin) !== canonical(this.#pin)) return no('insufficient-scope');
      const now = this.#time();
      this.#prune(now);
      this.#db.exec('BEGIN');
      let captured: Capture;
      try {
        captured = this.#capture(scope);
      } finally {
        this.#db.exec('ROLLBACK');
      }
      const accountId = captured.authority.account.id;
      const parent = this.#sessions.withAccess(accessToken, accountId, (identity) => ({
        ok: true as const,
        identity,
      }));
      if (!parent.ok) return parent;
      const auth = await verifyWorkspaceAuthority(captured.authority, issuer);
      let key = auth.members.find((member) => member.id === scope.credentialId)?.key;
      let deadline = Number.MAX_SAFE_INTEGER;
      if (scope.kind === 'enrollment') {
        const row = captured.preparation!;
        if (row.stage !== 'prepared' || !row.receipt) return no('insufficient-scope');
        await verifyEnrollmentRow(row, issuer);
        const receipt = JSON.parse(row.receipt);
        if (auth.successor) {
          if (
            captured.authority.successor!.preparation_id !== scope.attemptId ||
            JSON.stringify(auth.successor.epoch.preparation) !== row.receipt
          )
            return no('insufficient-scope');
        } else {
          // Only an unexpired preparation against the still-current authority can admit a device.
          this.#db.exec('BEGIN');
          let token;
          try {
            token = enrollmentSnapshot(this.#db, scope.workspaceId)?.token;
          } finally {
            this.#db.exec('ROLLBACK');
          }
          if (token !== row.authority_hash) return no('authority-changed');
          deadline = receipt.expiresAt;
          if (deadline <= this.#time()) return no('expired');
        }
        const candidate = receipt.context.candidate;
        if (scope.credentialId === candidate.credentialId)
          key = await crypto.subtle.importKey('raw', unhex(candidate.sPub, 32), 'Ed25519', false, [
            'verify',
          ]);
        else if (scope.credentialId !== auth.request.candidate.signer)
          return no('insufficient-scope');
      }
      if (!key) return no('insufficient-scope');
      const verifiedKey = key,
        binding = fingerprint(captured);
      const result = this.#sessions.withAccess(accessToken, accountId, (identity, db) => {
        if (identity.sessionId !== parent.identity.sessionId) return no('wrong-account');
        if (fingerprint(this.#capture(scope)) !== binding) return no('authority-changed');
        const at = this.#time();
        this.#prune(at);
        const live = this.#sessions.checkGrantParent(db, identity.sessionId, accountId);
        if (!live.ok) return live;
        if (
          this.#pending.size >= GRANT_LIMITS.challenges ||
          [...this.#pending.values()].filter((p) => p.challenge.sessionId === identity.sessionId)
            .length >= GRANT_LIMITS.perSession
        )
          return no('capacity');
        const expiresAt = Math.min(at + GRANT_CHALLENGE_MS, live.expiresAt, deadline);
        if (expiresAt <= at) return no('expired');
        const challenge: GrantChallenge = {
          v: 1,
          pin: { ...this.#pin },
          accountId,
          sessionId: identity.sessionId,
          scope,
          head: auth.a.head,
          actions: grantActions(scope),
          challengeId: fresh(),
          expiresAt,
        };
        return { ok: true as const, stage: 'challenge' as const, challenge };
      });
      // Publish only after the session transaction commits, and retain an independent copy.
      if (result.ok)
        this.#pending.set(result.challenge.challengeId, {
          challenge: structuredClone(result.challenge),
          key: verifiedKey,
          fingerprint: binding,
          deadline,
        });
      return result;
    } catch (cause) {
      return no(cause instanceof AuthorizationRefused ? cause.refusal : 'storage-unavailable');
    }
  }
  async finish(accessToken: unknown, input: unknown): Promise<GrantResult> {
    let id: string, signature: Uint8Array<ArrayBuffer>;
    try {
      const v = closed(input, ['challengeId', 'signature']);
      id = accountIdentifier(v['challengeId']);
      signature = unhex(v['signature'], 64);
    } catch {
      return no('malformed');
    }
    try {
      this.#prune(this.#time());
      const pending = this.#pending.get(id);
      if (!pending) return no('unknown-attempt');
      const c = pending.challenge;
      const inspected = this.#sessions.withAccess(accessToken, c.accountId, (identity) =>
        identity.sessionId === c.sessionId ? { ok: true as const } : no('insufficient-scope'),
      );
      if (!inspected.ok) return inspected;
      if (!(await crypto.subtle.verify('Ed25519', pending.key, signature, grantMessage(c))))
        return no('invalid-proof');
      const result = this.#sessions.withAccess(accessToken, c.accountId, (identity, db) => {
        const now = this.#time();
        this.#prune(now);
        if (this.#pending.get(id) !== pending) return no('unknown-attempt');
        if (identity.sessionId !== c.sessionId) return no('insufficient-scope');
        if (fingerprint(this.#capture(c.scope)) !== pending.fingerprint)
          return no('authority-changed');
        const live = this.#sessions.checkGrantParent(db, c.sessionId, c.accountId);
        if (!live.ok) return live;
        if (
          this.#grants.size >= GRANT_LIMITS.grants ||
          [...this.#grants.values()].filter((g) => g.challenge.sessionId === c.sessionId).length >=
            GRANT_LIMITS.perSession
        )
          return no('capacity');
        const expiresAt = Math.min(now + GRANT_LIFETIME_MS, live.expiresAt, pending.deadline);
        if (expiresAt <= now) return no('expired');
        return {
          ok: true as const,
          stage: 'granted' as const,
          grantToken: fresh(),
          expiresAt,
          scope: structuredClone(c.scope),
        };
      });
      if (result.ok) {
        this.#pending.delete(id);
        this.#grants.set(retryHash(result.grantToken), {
          challenge: c,
          fingerprint: pending.fingerprint,
          deadline: pending.deadline,
          expiresAt: result.expiresAt,
        });
      }
      // A lost result requires another fresh device proof, with no durable side effect or user prompt.
      return result;
    } catch (cause) {
      return no(cause instanceof AuthorizationRefused ? cause.refusal : 'storage-unavailable');
    }
  }
  /** Bind only the bearer here. The domain supplies the verified operation/actor/attempt target. */
  authorize(grantToken: unknown): OperationAuthorization {
    let digest = '';
    try {
      digest = retryHash(grantToken);
    } catch {
      /* Uniform denial at the owned boundary. */
    }
    return (db, target) => {
      if (db !== this.#db || !db.isTransaction)
        throw new AuthorizationRefused('storage-unavailable');
      const check = () => {
        const now = this.#time(),
          grant = this.#grants.get(digest);
        if (!grant || grant.expiresAt <= now) throw new AuthorizationRefused('grant-required');
        const c = grant.challenge;
        const parent = this.#sessions.checkGrantParent(db, c.sessionId, c.accountId);
        if (!parent.ok) throw new AuthorizationRefused(parent.refusal);
        return grant;
      };
      const grant = check(),
        c = grant.challenge;
      const { action, ...scope } = target;
      if (canonical(scope) !== canonical(c.scope) || !c.actions.includes(action))
        throw new AuthorizationRefused('insufficient-scope');
      if (fingerprint(this.#capture(c.scope)) !== grant.fingerprint)
        throw new AuthorizationRefused('authority-changed');
      return () => {
        check();
      };
    };
  }
}
