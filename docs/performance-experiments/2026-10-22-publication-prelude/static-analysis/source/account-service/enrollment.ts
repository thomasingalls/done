import type { DatabaseSync } from 'node:sqlite';
import {
  ENROLLMENT_LIFETIME_MS,
  ENROLLMENT_REQUEST_LIMIT,
  ENROLLMENT_RESULT_LIMIT,
  ENROLLMENT_WORKSPACE_LIMIT,
  ENROLLMENT_TOTAL_LIMIT,
  parseEnrollmentBegin,
  parseEnrollmentFinish,
  parseEnrollmentRetry,
  parseEnrollmentChallenge,
  parseEnrollmentReceipt,
  parseEnrollmentResult,
  verifyEnrollmentChallenge,
  verifyEnrollmentReceipt,
  verifyEnrollmentPossession,
  enrollmentNonce,
  type EnrollmentContext,
  type EnrollmentChallenge,
  type EnrollmentReceipt,
  type EnrollmentResult,
  type EnrollmentStage,
  type EnrollmentRefusal,
} from '../account-protocol/enrollment.ts';
import type { AuthorityPin } from '../account-protocol/authority.ts';
import {
  snapshotWorkspaceAuthority,
  verifyCurrentWorkspaceAuthority,
  type WorkspaceAuthoritySnapshot,
} from './delivery.ts';
import { assertion, type Policy, type StoredCredential } from './webauthn.ts';
import { canonical, fresh, hash, retryHash } from './protocol.ts';
import { randomBytes } from 'node:crypto';
import { causeCode, type DiagnosticSink } from '../account-protocol/diagnostics.ts';
import { AccountSessions, EnrollmentLoginRefused } from './sessions.ts';
import { historyMembership } from '../account-protocol/admissionHistory.ts';
import { membershipState } from '../account-protocol/membership.ts';

export interface EnrollmentIssuer {
  pin: AuthorityPin;
  check(seal: unknown, id: string, pub: string): void;
  challenge(context: EnrollmentContext): EnrollmentChallenge;
  receipt(value: EnrollmentReceipt): EnrollmentReceipt;
}
export type EnrollmentOperation = 'begin' | 'finish' | 'resume' | 'cancel';
type Hook = (point: 'before-commit' | 'after-commit' | 'after-verify', operation: string) => void;
export interface EnrollmentRow {
  id: string;
  retry_hash: string;
  workspace_id: string;
  credential_id: string;
  candidate: string;
  authority_hash: string;
  challenge: string;
  stage: EnrollmentStage;
  proof_hash: string | null;
  receipt: string | null;
}
interface Snapshot {
  base: WorkspaceAuthoritySnapshot;
  credential: StoredCredential;
  token: string;
}
const refuse = (refusal: EnrollmentRefusal): EnrollmentResult => ({ ok: false, refusal });
export const ENROLLMENT_SCHEMA = `
  CREATE TABLE IF NOT EXISTS enrollment_preparations (
    id TEXT PRIMARY KEY, retry_hash TEXT UNIQUE NOT NULL,
    workspace_id TEXT NOT NULL, credential_id TEXT NOT NULL, candidate TEXT NOT NULL,
    authority_hash TEXT NOT NULL, challenge TEXT NOT NULL,
    stage TEXT NOT NULL CHECK(stage IN ('challenge','prepared','cancelled','expired','stale')),
    proof_hash TEXT, receipt TEXT, CHECK((proof_hash IS NULL) = (receipt IS NULL)));
  CREATE UNIQUE INDEX IF NOT EXISTS enrollment_candidate ON enrollment_preparations(workspace_id,credential_id)
    WHERE proof_hash IS NOT NULL;
`;
export function enrollmentSnapshot(db: DatabaseSync, workspace: string): Snapshot | null {
  const base = snapshotWorkspaceAuthority(db, workspace);
  if (!base) return null;
  const credential = db
    .prepare('SELECT * FROM credentials WHERE id=?')
    .get(base.credential.id) as unknown as StoredCredential;
  if (!credential || credential.account_id !== base.account.id || credential.state !== 'confirmed')
    return null;
  // Ciphertext appends and passkey counter observations are not authority changes.
  const { delivery_witness: _witness, successor_head: _head, ...promotion } = base.promotion;
  const { successor, ...original } = base;
  const { counter: _counter, public_key, ...key } = credential;
  const token = hash(
    canonical({
      ...original,
      promotion,
      ...(successor ? { successor } : {}),
      passkey: { ...key, public_key: Buffer.from(public_key).toString('hex') },
    }),
  );
  return { base, credential, token };
}

export async function verifyEnrollmentRow(
  row: EnrollmentRow,
  issuer: Pick<EnrollmentIssuer, 'pin'>,
) {
  if (
    (row.proof_hash === null) !== (row.receipt === null) ||
    (row.stage === 'prepared' && row.receipt === null) ||
    (row.stage === 'challenge' && row.receipt !== null)
  )
    throw Error('Inconsistent retained enrollment state');
  const challenge = parseEnrollmentChallenge(JSON.parse(row.challenge));
  const c = challenge.context;
  if (
    c.attemptId !== row.id ||
    c.candidate.workspaceId !== row.workspace_id ||
    c.candidate.credentialId !== row.credential_id ||
    JSON.stringify(c.candidate) !== row.candidate
  )
    throw Error('Retained enrollment identity changed');
  // Verify historical challenge bytes; eligibility/expiry is evaluated separately under the transaction.
  await verifyEnrollmentChallenge(challenge, issuer.pin, c.candidate, c.expiresAt - 1);
  if (row.receipt) {
    const r = await verifyEnrollmentReceipt(JSON.parse(row.receipt), issuer.pin, c.candidate);
    if (
      JSON.stringify(r.context) !== JSON.stringify(c) ||
      row.proof_hash !== hash(r.assertionHash + r.possessionHash)
    )
      throw Error('Retained enrollment evidence changed');
  }
}

/** A short-lived operation object; all durable authority is held by the shared SQLite owner. */
export class EnrollmentPreparation {
  private db: DatabaseSync;
  private policy: Policy;
  private issuer: EnrollmentIssuer;
  private now: () => number;
  private hook: Hook;
  private diagnostic: DiagnosticSink;
  private sessions?: AccountSessions;
  constructor(
    db: DatabaseSync,
    policy: Policy,
    issuer: EnrollmentIssuer,
    now: () => number,
    hook: Hook,
    diagnostic: DiagnosticSink,
    sessions?: AccountSessions,
  ) {
    this.db = db;
    this.policy = policy;
    this.issuer = issuer;
    this.now = now;
    this.hook = hook;
    this.diagnostic = diagnostic;
    this.sessions = sessions;
  }
  private transaction(
    op: string,
    work: () => EnrollmentResult,
    finalCheck?: () => void,
  ): EnrollmentResult {
    try {
      this.db.exec('BEGIN IMMEDIATE');
      const result = parseEnrollmentResult(work());
      if (Buffer.byteLength(JSON.stringify(result)) > ENROLLMENT_RESULT_LIMIT)
        throw Error('Oversized enrollment result');
      this.hook('before-commit', op);
      finalCheck?.();
      this.db.exec('COMMIT');
      this.hook('after-commit', op);
      return result;
    } catch (cause) {
      if (this.db.isTransaction) this.db.exec('ROLLBACK');
      if (cause instanceof EnrollmentLoginRefused) return refuse('login-unavailable');
      this.diagnostic({ operation: 'enrollment', phase: 'commit', code: causeCode(cause) });
      return refuse('storage-unavailable');
    }
  }
  private row(retryKey: string): EnrollmentRow | undefined {
    return this.db
      .prepare('SELECT * FROM enrollment_preparations WHERE retry_hash=?')
      .get(retryHash(retryKey)) as unknown as EnrollmentRow | undefined;
  }
  private snapshot(workspace: string): Snapshot | null {
    return enrollmentSnapshot(this.db, workspace);
  }
  private pendingConnection(workspace: string, token: string): boolean {
    // Unauthenticated challenges must not reserve the account. Reserve only after the passkey
    // and possession proofs, in the same transaction that creates the preparation receipt.
    const rows = this.db
      .prepare("SELECT * FROM enrollment_preparations WHERE workspace_id=? AND stage='prepared'")
      .all(workspace) as unknown as EnrollmentRow[];
    return rows.some((row) => {
      if (row.authority_hash !== token || !row.receipt) return false;
      const receipt = parseEnrollmentReceipt(JSON.parse(row.receipt));
      return receipt.v === 2 && this.now() < receipt.expiresAt;
    });
  }
  private view(row: EnrollmentRow, current: Snapshot | null): EnrollmentResult {
    const challenge = parseEnrollmentChallenge(JSON.parse(row.challenge));
    const receipt = row.receipt ? parseEnrollmentReceipt(JSON.parse(row.receipt)) : null;
    let stage = row.stage;
    const consumed =
      current?.base.successor?.preparation_id === row.id
        ? current.base.successor
        : current?.base.continuations?.find((r) => r.preparation_id === row.id);
    if (consumed) {
      const successor = JSON.parse(consumed.artifact);
      if (
        stage !== 'prepared' ||
        !receipt ||
        JSON.stringify(successor.epoch.preparation) !== JSON.stringify(receipt)
      )
        throw Error('Consumed preparation changed');
      return { ok: true, stage: 'admitted', challenge, receipt };
    }
    if (stage === 'challenge' || stage === 'prepared') {
      if (!current || row.authority_hash !== current.token) stage = 'stale';
      else if (this.now() >= (receipt?.expiresAt ?? challenge.context.expiresAt)) stage = 'expired';
      if (stage !== row.stage)
        this.db.prepare('UPDATE enrollment_preparations SET stage=? WHERE id=?').run(stage, row.id);
    }
    return { ok: true, stage, challenge, receipt };
  }
  async run(operation: EnrollmentOperation, input: unknown): Promise<EnrollmentResult> {
    let request:
      | ({ operation: 'begin' } & ReturnType<typeof parseEnrollmentBegin>)
      | ({ operation: 'finish' } & ReturnType<typeof parseEnrollmentFinish>)
      | ({ operation: 'resume' | 'cancel' } & ReturnType<typeof parseEnrollmentRetry>);
    try {
      const encoded = canonical(input);
      if (Buffer.byteLength(encoded) > ENROLLMENT_REQUEST_LIMIT) return refuse('malformed');
      const copy: unknown = JSON.parse(encoded);
      request =
        operation === 'begin'
          ? { operation, ...parseEnrollmentBegin(copy) }
          : operation === 'finish'
            ? { operation, ...parseEnrollmentFinish(copy) }
            : { operation, ...parseEnrollmentRetry(copy) };
    } catch {
      return refuse('malformed');
    }
    const op = `enrollment-${operation}`;
    try {
      if (
        this.issuer.pin.origin !== this.policy.origin ||
        this.issuer.pin.rpId !== this.policy.rpId
      )
        return refuse('unavailable');
      let prior: EnrollmentRow | undefined, snapshot: Snapshot | null;
      this.db.exec('BEGIN');
      try {
        prior = this.row(request.retryKey);
        if (operation !== 'begin' && !prior) return refuse('unknown-attempt');
        if (
          'candidate' in request &&
          prior &&
          prior.candidate !== JSON.stringify(request.candidate)
        )
          return refuse('request-conflict');
        snapshot = this.snapshot(
          prior?.workspace_id ?? ('candidate' in request ? request.candidate.workspaceId : ''),
        );
      } finally {
        this.db.exec('ROLLBACK');
      }
      if (prior) await verifyEnrollmentRow(prior, this.issuer);
      if (request.operation === 'begin' || request.operation === 'finish') {
        const login = prior
          ? parseEnrollmentChallenge(JSON.parse(prior.challenge)).context.login
          : null;
        if (
          prior &&
          (login
            ? !request.loginRetryKey || login.retryHash !== retryHash(request.loginRetryKey)
            : !!request.loginRetryKey)
        )
          return refuse('request-conflict');
        if (request.loginRetryKey && !this.sessions) return refuse('login-unavailable');
      }
      const auth = snapshot
        ? await verifyCurrentWorkspaceAuthority(snapshot.base, this.issuer)
        : null;
      const pending = auth?.history
        ? membershipState(historyMembership(auth.history)).roster.some((m) => m.state === 'pending')
        : false;
      if (operation === 'cancel')
        return this.transaction(op, () => {
          const row = this.row(request.retryKey)!;
          const current = this.snapshot(row.workspace_id);
          if (
            current?.base.successor?.preparation_id === row.id ||
            current?.base.continuations?.some((r) => r.preparation_id === row.id)
          )
            return this.view(row, current);
          // Preserve terminal reasons and historical receipts. Cancellation never removes a tombstone.
          if (row.stage === 'challenge' || row.stage === 'prepared') {
            this.sessions?.cancelEnrollment(this.db, row.id);
            row.stage = 'cancelled';
            this.db
              .prepare("UPDATE enrollment_preparations SET stage='cancelled' WHERE id=?")
              .run(row.id);
          }
          return this.view(row, null);
        });
      if (operation === 'begin' && 'candidate' in request && !prior) {
        if (pending || auth?.removal) return refuse('connection-in-progress');
        const candidate = request.candidate;
        if (
          !snapshot ||
          !auth ||
          auth.a.head !== candidate.head ||
          auth.a.lineage !== candidate.lineageId ||
          (auth.a.tip !== 1 && auth.a.tip < 3 && !auth.history)
        )
          return refuse('unavailable');
        if (auth.members.some((m) => m.id === candidate.credentialId))
          return refuse('candidate-in-use');
        this.hook('after-verify', op);
        return this.transaction(op, () => {
          const current = this.snapshot(candidate.workspaceId),
            winner = this.row(request.retryKey);
          if (winner)
            return winner.candidate === JSON.stringify(candidate)
              ? this.view(winner, current)
              : refuse('request-conflict');
          if (current?.token !== snapshot!.token) return refuse('unavailable');
          if (auth.a.tip !== 1 && this.pendingConnection(candidate.workspaceId, current.token))
            return refuse('connection-in-progress');
          if (
            this.db
              .prepare(
                'SELECT id FROM enrollment_preparations WHERE workspace_id=? AND credential_id=? AND proof_hash IS NOT NULL',
              )
              .get(candidate.workspaceId, candidate.credentialId)
          )
            return refuse('candidate-in-use');
          const count = (sql: string, ...args: string[]) =>
            Number(this.db.prepare(sql).get(...args)!.n);
          if (
            count('SELECT count(*) AS n FROM enrollment_preparations') >= ENROLLMENT_TOTAL_LIMIT ||
            count(
              'SELECT count(*) AS n FROM enrollment_preparations WHERE workspace_id=?',
              candidate.workspaceId,
            ) >= ENROLLMENT_WORKSPACE_LIMIT
          )
            return refuse('capacity');
          const id = fresh(),
            context: EnrollmentContext = {
              v: auth.a.tip === 1 ? 1 : 2,
              pin: this.issuer.pin,
              accountId: snapshot!.base.account.id,
              attemptId: id,
              candidate,
              epoch: auth.a.tip,
              certifiedSetDigest: hash(JSON.stringify(auth.certification)),
              recoveryStateDigest: auth.certification.recoveryStateDigest,
              passkeyId: snapshot!.credential.id,
              nonce: randomBytes(32).toString('hex'),
              expiresAt: this.now() + ENROLLMENT_LIFETIME_MS,
              ...(request.loginRetryKey
                ? {
                    login: {
                      purpose: 'enrollment-and-login-v1' as const,
                      attemptId: fresh(),
                      retryHash: retryHash(request.loginRetryKey),
                    },
                  }
                : {}),
            };
          const challenge = parseEnrollmentChallenge(this.issuer.challenge(context));
          this.db
            .prepare(
              "INSERT INTO enrollment_preparations VALUES (?,?,?,?,?,?,?,'challenge',NULL,NULL)",
            )
            .run(
              id,
              retryHash(request.retryKey),
              candidate.workspaceId,
              candidate.credentialId,
              JSON.stringify(candidate),
              snapshot!.token,
              JSON.stringify(challenge),
            );
          if (request.loginRetryKey)
            this.sessions!.createEnrollment(this.db, context, request.loginRetryKey);
          return this.view(this.row(request.retryKey)!, current);
        });
      }
      if (!prior) return refuse('unknown-attempt');
      const retained = prior;
      // Return terminal/current views before requesting another proof. Finish retries still bind exact proof bytes.
      let assertionHash = '',
        possessionHash = '',
        proofHash = '';
      if ('response' in request) {
        if (request.attemptId !== retained.id) return refuse('unknown-attempt');
        assertionHash = hash(canonical(request.response));
        possessionHash = hash(Buffer.from(request.possession, 'hex'));
        proofHash = hash(assertionHash + possessionHash);
        if (retained.proof_hash && retained.proof_hash !== proofHash)
          return refuse('proof-conflict');
      }
      const finishView = (row: EnrollmentRow, current: Snapshot | null): EnrollmentResult => {
        const view = this.view(row, current);
        if (request.operation !== 'finish' || !request.loginRetryKey || !view.ok || !view.receipt)
          return view;
        // A receipt and its session are created together. Only the original two proofs and both
        // retry capabilities can retrieve the sealed issuance; begin/resume disclose no secrets.
        const login = this.sessions!.enrollmentResult(
          this.db,
          view.challenge.context,
          request.loginRetryKey,
          proofHash,
        );
        if (login.ok && login.stage !== 'issued') throw new EnrollmentLoginRefused();
        return { ...view, login };
      };
      if (
        operation !== 'finish' ||
        retained.stage !== 'challenge' ||
        !snapshot ||
        snapshot.token !== retained.authority_hash ||
        this.now() >= JSON.parse(retained.challenge).context.expiresAt
      ) {
        return this.transaction(op, () =>
          finishView(this.row(request.retryKey)!, this.snapshot(retained.workspace_id)),
        );
      }
      if (!('response' in request)) return refuse('malformed');
      const context = parseEnrollmentChallenge(JSON.parse(retained.challenge)).context;
      let counter: number;
      try {
        await verifyEnrollmentPossession(context, request.possession);
        counter = await assertion(
          request.response,
          await enrollmentNonce(context),
          this.policy,
          snapshot.credential,
        );
      } catch {
        return refuse('invalid-proof');
      }
      this.hook('after-verify', op);
      const reservation =
        context.login && request.loginRetryKey
          ? this.sessions!.reserveEnrollment(context, request.loginRetryKey, proofHash)
          : undefined;
      if (reservation && !('commit' in reservation)) {
        return this.transaction(op, () => {
          const row = this.row(request.retryKey)!;
          return row.receipt
            ? finishView(row, this.snapshot(row.workspace_id))
            : refuse('login-unavailable');
        });
      }
      let issuedNow = false;
      return this.transaction(
        op,
        () => {
          const row = this.row(request.retryKey)!,
            current = this.snapshot(row.workspace_id);
          if (row.proof_hash && row.proof_hash !== proofHash) return refuse('proof-conflict');
          const view = this.view(row, current);
          if (!view.ok || view.stage !== 'challenge') return finishView(row, current);
          if (context.v === 2 && this.pendingConnection(row.workspace_id, current!.token))
            return refuse('connection-in-progress');
          if (
            this.db
              .prepare(
                'SELECT id FROM enrollment_preparations WHERE workspace_id=? AND credential_id=? AND proof_hash IS NOT NULL',
              )
              .get(row.workspace_id, row.credential_id)
          )
            return refuse('candidate-in-use');
          const preparedAt = this.now();
          if (reservation && 'commit' in reservation) {
            const login = reservation.commit(this.db, snapshot!.credential);
            if (!login.ok) throw new EnrollmentLoginRefused();
            issuedNow = true;
          }
          const receipt = parseEnrollmentReceipt(
            this.issuer.receipt({
              v: context.v,
              kind: 'enrollment-preparation-receipt',
              context,
              receiptId: fresh(),
              preparedAt,
              expiresAt: preparedAt + ENROLLMENT_LIFETIME_MS,
              assertionHash,
              possessionHash,
              signature: '00'.repeat(64),
            }),
          );
          this.db
            .prepare(
              "UPDATE enrollment_preparations SET stage='prepared',proof_hash=?,receipt=? WHERE id=?",
            )
            .run(proofHash, JSON.stringify(receipt), row.id);
          this.db
            .prepare('UPDATE credentials SET counter=? WHERE id=?')
            .run(counter, context.passkeyId);
          return finishView(this.row(request.retryKey)!, current);
        },
        () => {
          if (issuedNow && this.now() >= context.expiresAt) throw new EnrollmentLoginRefused();
          // Retire a cancelled/closed session owner even if its closure races the final hook.
          if (issuedNow) {
            const result = this.sessions!.enrollmentResult(
              this.db,
              context,
              request.loginRetryKey!,
              proofHash,
            );
            if (!result.ok || result.stage !== 'issued') throw new EnrollmentLoginRefused();
          }
        },
      );
    } catch (cause) {
      this.diagnostic({ operation: 'enrollment', phase: 'verify', code: causeCode(cause) });
      return refuse('unavailable');
    }
  }
}
