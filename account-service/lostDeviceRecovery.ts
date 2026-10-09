/** Durable, separately purposed account proof for recovery. No membership or content writes. */
import type { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import {
  LOST_RECOVERY_LIFETIME_MS,
  LOST_RECOVERY_ATTEMPT_LIMIT,
  LOST_RECOVERY_RESULT_LIMIT,
  parseLostRecoveryBegin,
  parseLostRecoveryRetry,
  parseLostRecoveryFinish,
  parseLostRecoveryChallenge,
  parseLostRecoveryPrepared,
  lostRecoveryNonce,
  lostRecoveryPossessionMessage,
  verifyLostRecoveryPrepared,
  verifyLostRecoveryChallenge,
  type LostRecoveryContext,
  type LostRecoveryChallenge,
  type LostRecoveryPrepared,
  type LostRecoveryResult,
  type LostRecoveryRefusal,
} from '../account-protocol/lostDeviceRecovery.ts';
import { verifySignature, same } from '../account-protocol/admission.ts';
import type { RecoveryHeadAssertion } from '../account-protocol/recoveryBootstrap.ts';
import type { AuthorityPin } from '../account-protocol/authority.ts';
import { assertion, type Policy, type StoredCredential } from './webauthn.ts';
import { canonical, fresh, hash, retryHash, object } from './protocol.ts';
import { enrollmentSnapshot } from './enrollment.ts';
import { verifyCurrentWorkspaceAuthority } from './delivery.ts';
import { membershipProofChain } from './membershipLocator.ts';
import { membershipEnabled } from './membershipStore.ts';

export const LOST_RECOVERY_SCHEMA = `CREATE TABLE lost_device_recovery (
 id TEXT PRIMARY KEY, retry_hash TEXT UNIQUE NOT NULL, request TEXT NOT NULL,
 challenge TEXT NOT NULL, expires INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('challenge','prepared','cancelled')),
 account_id TEXT REFERENCES accounts(id), workspace_id TEXT, authority_hash TEXT,
 credential_hash TEXT, proof_hash TEXT, result TEXT,
 CHECK((proof_hash IS NULL) = (result IS NULL)),
 CHECK((account_id IS NULL) = (result IS NULL)));
 CREATE INDEX lost_recovery_expiry ON lost_device_recovery(expires);`;
export interface LostRecoveryIssuer {
  pin: AuthorityPin;
  check(seal: unknown, id: string, pub: string): void;
  challenge(context: LostRecoveryContext): LostRecoveryChallenge;
  head(body: Omit<RecoveryHeadAssertion, 'signature'>): RecoveryHeadAssertion;
  prepared(body: Omit<LostRecoveryPrepared, 'signature'>): Promise<LostRecoveryPrepared>;
}
export type LostRecoveryOperation = 'begin' | 'finish' | 'resume' | 'cancel';
type Hook = (point: 'before-commit' | 'after-commit' | 'after-verify', operation: string) => void;
interface Row {
  id: string;
  retry_hash: string;
  request: string;
  challenge: string;
  expires: number;
  state: 'challenge' | 'prepared' | 'cancelled';
  account_id: string | null;
  workspace_id: string | null;
  authority_hash: string | null;
  credential_hash: string | null;
  proof_hash: string | null;
  result: string | null;
}
const no = (refusal: LostRecoveryRefusal): LostRecoveryResult => ({ ok: false, refusal });
const credentialHash = (credential: StoredCredential) => {
  const { counter: _, public_key, ...rest } = credential;
  return hash(canonical({ ...rest, public_key: Buffer.from(public_key).toString('hex') }));
};
export class LostDeviceRecovery {
  private db: DatabaseSync;
  private policy: Policy;
  private issuer: LostRecoveryIssuer;
  private now: () => number;
  private hook: Hook;
  constructor(
    db: DatabaseSync,
    policy: Policy,
    issuer: LostRecoveryIssuer,
    now: () => number,
    hook: Hook,
  ) {
    this.db = db;
    this.policy = policy;
    this.issuer = issuer;
    this.now = now;
    this.hook = hook;
  }
  private row(key: string): Row | undefined {
    return this.db
      .prepare('SELECT * FROM lost_device_recovery WHERE retry_hash=?')
      .get(retryHash(key)) as unknown as Row | undefined;
  }
  private transaction(
    op: string,
    work: () => LostRecoveryResult,
    final?: () => void,
  ): LostRecoveryResult {
    try {
      this.db.exec('BEGIN IMMEDIATE');
      const result = work();
      this.hook('before-commit', op);
      final?.();
      this.db.exec('COMMIT');
      this.hook('after-commit', op);
      return result;
    } catch {
      if (this.db.isTransaction) this.db.exec('ROLLBACK');
      return no('storage-unavailable');
    }
  }
  private snapshot(account: string) {
    const rows = this.db
      .prepare(
        "SELECT workspace_id FROM promotions WHERE account_id=? AND state='admitted' LIMIT 2",
      )
      .all(account);
    if (rows.length !== 1) return null;
    return enrollmentSnapshot(this.db, rows[0]!.workspace_id as string);
  }
  private terminal(row: Row): LostRecoveryResult | null {
    if (row.state === 'cancelled') return no('cancelled');
    if (this.now() >= row.expires) return no('expired');
    return null;
  }
  private eligible(row: Row) {
    if (!row.account_id) return null;
    const current = this.snapshot(row.account_id);
    return current &&
      current.token === row.authority_hash &&
      credentialHash(current.credential) === row.credential_hash
      ? current
      : null;
  }
  private view(row: Row): LostRecoveryResult {
    const terminal = this.terminal(row);
    if (terminal) return terminal;
    if (row.state === 'challenge')
      return {
        ok: true,
        stage: 'challenge',
        challenge: parseLostRecoveryChallenge(JSON.parse(row.challenge)),
      };
    if (!this.eligible(row)) return no('state-changed');
    return {
      ok: true,
      stage: 'prepared',
      prepared: parseLostRecoveryPrepared(JSON.parse(row.result!)),
    };
  }
  async run(operation: LostRecoveryOperation, input: unknown): Promise<LostRecoveryResult> {
    if (!membershipEnabled(this.db)) return no('unavailable');
    let request:
      | (ReturnType<typeof parseLostRecoveryBegin> & { operation: 'begin' })
      | (ReturnType<typeof parseLostRecoveryFinish> & { operation: 'finish' })
      | (ReturnType<typeof parseLostRecoveryRetry> & { operation: 'resume' | 'cancel' });
    try {
      request =
        operation === 'begin'
          ? { ...parseLostRecoveryBegin(input), operation }
          : operation === 'finish'
            ? { ...parseLostRecoveryFinish(input), operation }
            : { ...parseLostRecoveryRetry(input), operation };
    } catch {
      return no('malformed');
    }
    const op = `lost-recovery-${operation}`;
    try {
      const prior = this.row(request.retryKey);
      if (prior) {
        const begin = { ...JSON.parse(prior.request), retryKey: request.retryKey };
        await verifyLostRecoveryChallenge(JSON.parse(prior.challenge), begin, this.issuer.pin);
        if (prior.result) {
          const checked = await verifyLostRecoveryPrepared(
            JSON.parse(prior.result),
            begin,
            this.issuer.pin,
          );
          if (
            !same(checked.prepared.challenge, JSON.parse(prior.challenge)) ||
            checked.prepared.accountId !== prior.account_id ||
            checked.prepared.head.workspaceId !== prior.workspace_id
          )
            return no('unavailable');
        }
      }
      if (operation === 'cancel')
        return this.transaction(op, () => {
          const row = this.row(request.retryKey);
          if (!row) return no('unknown-attempt');
          this.db
            .prepare("UPDATE lost_device_recovery SET state='cancelled' WHERE id=?")
            .run(row.id);
          return { ok: true, stage: 'cancelled' };
        });
      if (request.operation === 'begin') {
        const { retryKey, operation: _operation, ...body } = request;
        return this.transaction(op, () => {
          const row = this.row(retryKey);
          if (row)
            return row.request === JSON.stringify(body) ? this.view(row) : no('request-conflict');
          // No nonce is reused: expired attempts are inaccessible even if a key is presented later.
          this.db.prepare('DELETE FROM lost_device_recovery WHERE expires<=?').run(this.now());
          if (
            Number(this.db.prepare('SELECT count(*) AS n FROM lost_device_recovery').get()!.n) >=
            LOST_RECOVERY_ATTEMPT_LIMIT
          )
            return no('capacity');
          const context: LostRecoveryContext = {
            v: 1,
            purpose: 'lost-device-recovery-v1',
            pin: this.issuer.pin,
            attemptId: fresh(),
            retryHash: retryHash(retryKey),
            candidate: body.candidate,
            clientNonce: body.clientNonce,
            nonce: randomBytes(32).toString('hex'),
            expiresAt: this.now() + LOST_RECOVERY_LIFETIME_MS,
          };
          const challenge = parseLostRecoveryChallenge(this.issuer.challenge(context));
          if (!same(challenge.context, context)) throw Error('Recovery issuer changed challenge');
          this.db
            .prepare(
              "INSERT INTO lost_device_recovery VALUES (?,?,?,?,?,'challenge',NULL,NULL,NULL,NULL,NULL,NULL)",
            )
            .run(
              context.attemptId,
              context.retryHash,
              JSON.stringify(body),
              JSON.stringify(challenge),
              context.expiresAt,
            );
          return { ok: true, stage: 'challenge', challenge };
        });
      }
      if (!prior) return no('unknown-attempt');
      let proofHash: string | null = null;
      if (request.operation === 'finish') {
        if (request.attemptId !== prior.id) return no('unknown-attempt');
        proofHash = hash(canonical({ response: request.response, possession: request.possession }));
        if (prior.proof_hash && prior.proof_hash !== proofHash) return no('proof-conflict');
      }
      if (operation !== 'finish' || prior.state !== 'challenge' || this.terminal(prior))
        return this.transaction(op, () => {
          const row = this.row(request.retryKey);
          if (!row || row.id !== prior.id) return no('unknown-attempt');
          if (proofHash && row.proof_hash && row.proof_hash !== proofHash)
            return no('proof-conflict');
          return this.view(row);
        });
      if (
        request.operation !== 'finish' ||
        !object(request.response) ||
        typeof request.response.id !== 'string'
      )
        return no('invalid-proof');
      const credential = this.db
        .prepare('SELECT * FROM credentials WHERE id=?')
        .get(request.response.id) as unknown as StoredCredential | undefined;
      if (!credential || credential.state !== 'confirmed') return no('invalid-proof');
      const challenge = parseLostRecoveryChallenge(JSON.parse(prior.challenge));
      let counter;
      try {
        await verifySignature(
          challenge.context.candidate.sPub,
          request.possession,
          lostRecoveryPossessionMessage(challenge.context),
        );
        counter = await assertion(
          request.response,
          await lostRecoveryNonce(challenge.context),
          this.policy,
          credential,
        );
      } catch {
        return no('invalid-proof');
      }
      this.db.exec('BEGIN');
      let before;
      try {
        before = this.snapshot(credential.account_id);
      } finally {
        this.db.exec('ROLLBACK');
      }
      if (!before || credentialHash(before.credential) !== credentialHash(credential))
        return no('unavailable');
      const auth = await verifyCurrentWorkspaceAuthority(before.base, this.issuer);
      const candidate = challenge.context.candidate;
      if ((auth.historicalMembers ?? auth.members).some((m) => m.id === candidate.credentialId))
        return no('request-conflict');
      if (auth.removal) return no('state-changed');
      const prepared = parseLostRecoveryPrepared(
        await this.issuer.prepared({
          v: 1,
          kind: 'lost-device-recovery-prepared',
          challenge,
          accountId: credential.account_id,
          passkeyId: credential.id,
          base: { pin: this.issuer.pin, request: auth.request, receipt: auth.receipt },
          proofs: before.base.transfer?.artifact
            ? membershipProofChain(before.base)
            : before.base.successor
              ? {
                  successor: JSON.parse(before.base.successor.artifact),
                  certification: null,
                  continuations: [],
                }
              : null,
          head: this.issuer.head({
            v: 1,
            workspaceId: auth.a.workspace,
            epoch: auth.a.tip,
            head: auth.a.head,
            clientNonce: challenge.context.clientNonce,
            issuedAt: this.now(),
          }),
        }),
      );
      await verifyLostRecoveryPrepared(
        prepared,
        { ...JSON.parse(prior.request), retryKey: request.retryKey },
        this.issuer.pin,
      );
      this.hook('after-verify', op);
      let issued = false;
      return this.transaction(
        op,
        () => {
          const row = this.row(request.retryKey);
          if (!row || row.id !== prior.id) return no('unknown-attempt');
          if (row.proof_hash && row.proof_hash !== proofHash) return no('proof-conflict');
          if (row.state !== 'challenge' || this.terminal(row)) return this.view(row);
          const current = this.snapshot(credential.account_id);
          if (
            current?.token !== before!.token ||
            credentialHash(current.credential) !== credentialHash(credential)
          )
            return no('state-changed');
          this.issuer.check(auth.seal, before!.base.promotion.request_digest, auth.a.acceptanceKey);
          const value = JSON.stringify(prepared);
          const bytes = Number(
            this.db
              .prepare(
                'SELECT coalesce(sum(length(CAST(result AS BLOB))),0) AS n FROM lost_device_recovery',
              )
              .get()!.n,
          );
          if (bytes + Buffer.byteLength(value) > 2 * LOST_RECOVERY_RESULT_LIMIT)
            return no('capacity');
          this.db
            .prepare(
              "UPDATE lost_device_recovery SET state='prepared',account_id=?,workspace_id=?,authority_hash=?,credential_hash=?,proof_hash=?,result=? WHERE id=?",
            )
            .run(
              credential.account_id,
              auth.a.workspace,
              before!.token,
              credentialHash(credential),
              proofHash,
              value,
              prior.id,
            );
          this.db
            .prepare('UPDATE credentials SET counter=? WHERE id=?')
            .run(counter, credential.id);
          issued = true;
          return { ok: true, stage: 'prepared', prepared };
        },
        () => {
          if (
            issued &&
            (this.now() >= prior.expires ||
              this.snapshot(credential.account_id)?.token !== before!.token)
          )
            throw Error('Recovery eligibility changed');
        },
      );
    } catch {
      if (this.db.isTransaction) this.db.exec('ROLLBACK');
      return no('unavailable');
    }
  }
}
