import {
  enrollmentAssertionMessage,
  type EnrollmentContext,
} from '../account-protocol/enrollment.ts';
import {
  lostRecoveryAssertionMessage,
  type LostRecoveryContext,
} from '../account-protocol/lostDeviceRecovery.ts';
import {
  parseSessionUnlock,
  sessionUnlockMessage,
  type SessionUnlockContext,
  type SessionUnlockInput,
} from '../account-protocol/sessionUnlock.ts';
import type { AuthorityPin } from '../account-protocol/authority.ts';
import type { DatabaseSync } from 'node:sqlite';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { parseAuthorityPin } from '../account-protocol/authority.ts';
import {
  SESSION_ACCESS_MS,
  SESSION_LIFETIME_MS,
  SESSION_REQUEST_LIMIT,
  SESSION_RETRY_MS,
  type SessionIssued,
  type SessionIssuanceResult,
  type SessionOperation,
  type SessionRefusal,
  type SessionResult,
} from '../account-protocol/session.ts';
import { assertion, type Policy, type StoredCredential } from './webauthn.ts';
import { bytes, canonical, fields, fresh, hash, object, retryHash } from './protocol.ts';
import { SessionCustody, type SessionConfiguration } from './session-custody.ts';

export const SESSION_SCHEMA = `
  CREATE TABLE session_custody (id INTEGER PRIMARY KEY CHECK(id=1), context TEXT NOT NULL,
    salt TEXT NOT NULL, key_check TEXT NOT NULL, seal_counter INTEGER NOT NULL CHECK(seal_counter>=0 AND seal_counter<=4294967295));
  CREATE TABLE session_attempts (id TEXT PRIMARY KEY, retry_hash TEXT UNIQUE NOT NULL,
    account_id TEXT NOT NULL, challenge TEXT UNIQUE NOT NULL, expires INTEGER NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('open','issued','cancelled','expired')), proof_hash TEXT);
  CREATE TABLE network_sessions (id TEXT PRIMARY KEY, attempt_id TEXT UNIQUE NOT NULL REFERENCES session_attempts(id),
    account_id TEXT NOT NULL REFERENCES accounts(id), credential_id TEXT NOT NULL REFERENCES credentials(id),
    credential_binding TEXT NOT NULL, issued_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('active','revoked','expired')),
    renewal_hash TEXT UNIQUE NOT NULL, revoke_hash TEXT UNIQUE NOT NULL,
    retry_expires INTEGER NOT NULL, result_seal TEXT);
`;
export const SESSION_UNLOCK_SCHEMA = `ALTER TABLE session_attempts ADD COLUMN unlock_context TEXT;`;
export const SESSION_ENROLLMENT_SCHEMA = `ALTER TABLE session_attempts ADD COLUMN purpose TEXT NOT NULL DEFAULT 'login' CHECK(purpose IN ('login','enrollment'));
CREATE TABLE enrollment_session_links (
  enrollment_id TEXT PRIMARY KEY REFERENCES enrollment_preparations(id),
  session_attempt_id TEXT UNIQUE NOT NULL REFERENCES session_attempts(id) ON DELETE CASCADE);`;
/** Rebuild referencing tables in the same offline upgrade transaction; retain all session seals. */
export const SESSION_RECOVERY_SCHEMA = `
CREATE TEMP TABLE recovery_upgrade_links AS SELECT * FROM enrollment_session_links;
CREATE TEMP TABLE recovery_upgrade_sessions AS SELECT * FROM network_sessions;
CREATE TEMP TABLE recovery_upgrade_attempts AS SELECT * FROM session_attempts;
DROP TABLE enrollment_session_links;
DROP TABLE network_sessions;
DROP TABLE session_attempts;
CREATE TABLE session_attempts (id TEXT PRIMARY KEY, retry_hash TEXT UNIQUE NOT NULL,
 account_id TEXT NOT NULL, challenge TEXT UNIQUE NOT NULL, expires INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('open','issued','cancelled','expired')), proof_hash TEXT,
 unlock_context TEXT, purpose TEXT NOT NULL DEFAULT 'login' CHECK(purpose IN ('login','enrollment','recovery')));
${SESSION_SCHEMA.slice(SESSION_SCHEMA.indexOf('  CREATE TABLE network_sessions'))}
CREATE TABLE enrollment_session_links (
 enrollment_id TEXT PRIMARY KEY REFERENCES enrollment_preparations(id),
 session_attempt_id TEXT UNIQUE NOT NULL REFERENCES session_attempts(id) ON DELETE CASCADE);
INSERT INTO session_attempts SELECT * FROM recovery_upgrade_attempts;
INSERT INTO network_sessions SELECT * FROM recovery_upgrade_sessions;
INSERT INTO enrollment_session_links SELECT * FROM recovery_upgrade_links;
DROP TABLE recovery_upgrade_attempts;
DROP TABLE recovery_upgrade_sessions;
DROP TABLE recovery_upgrade_links;`;
export class EnrollmentLoginRefused extends Error {
  constructor() {
    super('Enrollment login unavailable');
  }
}
export const SESSION_LIMITS = Object.freeze({
  attempts: 4096,
  sessions: 1024,
  perAccount: 32,
  accessPerSession: 8,
});
type Hook = (point: 'before-commit' | 'after-commit' | 'after-verify', operation: string) => void;
type Denial = { ok: false; refusal: SessionRefusal };
const no = (refusal: SessionRefusal): Denial => ({ ok: false, refusal });
interface Attempt {
  id: string;
  retry_hash: string;
  account_id: string;
  challenge: string;
  expires: number;
  state: 'open' | 'issued' | 'cancelled' | 'expired';
  proof_hash: string | null;
  unlock_context: string | null;
  purpose: 'login' | 'enrollment' | 'recovery';
}
interface Session {
  id: string;
  attempt_id: string;
  account_id: string;
  credential_id: string;
  credential_binding: string;
  issued_at: number;
  expires_at: number;
  state: 'active' | 'revoked' | 'expired';
  renewal_hash: string;
  revoke_hash: string;
  retry_expires: number;
  result_seal: string | null;
}
interface Access {
  sessionId: string;
  expires: number;
}
export interface SessionIdentity {
  accountId: string;
  credentialId: string;
  sessionId: string;
}
const sameHash = (a: string, b: string) =>
  timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
const credentialBinding = (c: StoredCredential) =>
  hash(
    canonical({
      id: c.id,
      accountId: c.account_id,
      state: c.state,
      spki: c.spki,
      publicKey: Buffer.from(c.public_key).toString('base64url'),
    }),
  );

/** Owned by AccountCore's connection. Never opened by the current development adapter. */
export class AccountSessions {
  #db: DatabaseSync;
  #policy: Policy;
  #pin: AuthorityPin;
  #custody: SessionCustody;
  #now: () => number;
  #hook: Hook;
  #closed = false;
  #access = new Map<string, Access>();
  #sweep: ReturnType<typeof setInterval>;
  constructor(
    db: DatabaseSync,
    policy: Policy,
    config: SessionConfiguration,
    now: () => number,
    hook: Hook,
    initialize = false,
  ) {
    this.#db = db;
    this.#policy = { ...policy };
    this.#now = now;
    this.#hook = hook;
    const pin = parseAuthorityPin(config.pin);
    this.#pin = pin;
    if (pin.origin !== policy.origin || pin.rpId !== policy.rpId)
      throw Error('Session service policy changed');
    const row = db.prepare('SELECT * FROM session_custody WHERE id=1').get();
    if (!row && !initialize) throw Error('Missing retained session custody');
    const salt = row ? String(row.salt) : randomBytes(32).toString('hex');
    this.#custody = new SessionCustody({ ...config, pin }, salt);
    try {
      if (row) {
        if (row.context !== this.#custody.context) throw Error('Session service identity changed');
        this.#custody.check(String(row.key_check));
      } else
        db.prepare('INSERT INTO session_custody VALUES (1,?,?,?,0)').run(
          this.#custody.context,
          salt,
          this.#custody.tag(),
        );
    } catch (cause) {
      this.#custody.close();
      throw cause;
    }
    this.#sweep = setInterval(() => this.sweep(), 60000);
    this.#sweep.unref();
  }
  close(): void {
    this.#closed = true;
    clearInterval(this.#sweep);
    this.#access.clear();
    this.#custody.close();
  }
  /** Expired retries are unusable immediately; idle processes also retire their database copies. */
  sweep(): { ok: true } | Denial {
    return this.#transaction('sweep', () => {
      this.#prune(this.#time());
      return { ok: true };
    });
  }
  #time(): number {
    const now = this.#now();
    if (
      !Number.isSafeInteger(now) ||
      now < 0 ||
      now > Number.MAX_SAFE_INTEGER - SESSION_LIFETIME_MS - SESSION_RETRY_MS
    )
      throw Error('Invalid service clock');
    return now;
  }
  #transaction<T>(op: string, work: () => T): T | Denial {
    // A nested BEGIN failure must never roll back somebody else's transaction.
    if (this.#closed || this.#db.isTransaction) return no('storage-unavailable');
    try {
      this.#db.exec('BEGIN IMMEDIATE');
      const result = work();
      if (result && typeof result === 'object' && 'then' in result)
        throw Error('Async session transaction');
      this.#hook('before-commit', 'session-' + op);
      this.#db.exec('COMMIT');
      this.#hook('after-commit', 'session-' + op);
      return result;
    } catch {
      if (this.#db.isTransaction) this.#db.exec('ROLLBACK');
      return no('storage-unavailable');
    }
  }
  #prune(now: number): void {
    this.#db
      .prepare(
        "UPDATE network_sessions SET state='expired',result_seal=NULL WHERE state='active' AND expires_at<=?",
      )
      .run(now);
    this.#db
      .prepare('UPDATE network_sessions SET result_seal=NULL WHERE retry_expires<=?')
      .run(now);
    this.#db
      .prepare('DELETE FROM network_sessions WHERE expires_at<=?')
      .run(now - SESSION_RETRY_MS);
    this.#db
      .prepare(`DELETE FROM session_attempts WHERE expires<=? AND
      NOT EXISTS(SELECT 1 FROM network_sessions WHERE attempt_id=session_attempts.id)`)
      .run(now - SESSION_RETRY_MS);
    for (const [key, access] of this.#access) if (access.expires <= now) this.#access.delete(key);
  }
  #attempt(retry: unknown): Attempt | undefined {
    return this.#db
      .prepare('SELECT * FROM session_attempts WHERE retry_hash=?')
      .get(retryHash(retry)) as unknown as Attempt | undefined;
  }
  #session(id: unknown): Session | undefined {
    return this.#db
      .prepare('SELECT * FROM network_sessions WHERE id=?')
      .get(String(id)) as unknown as Session | undefined;
  }
  #credential(id: string): StoredCredential | undefined {
    return this.#db.prepare('SELECT * FROM credentials WHERE id=?').get(id) as unknown as
      | StoredCredential
      | undefined;
  }
  #eligible(c: StoredCredential): boolean {
    return (
      c.state === 'confirmed' &&
      this.#db.prepare('SELECT state FROM accounts WHERE id=?').get(c.account_id)?.state ===
        'active'
    );
  }
  #live(s: Session, now: number): boolean {
    if (s.state !== 'active') return false;
    const c = this.#credential(s.credential_id);
    if (
      s.expires_at <= now ||
      !c ||
      !this.#eligible(c) ||
      credentialBinding(c) !== s.credential_binding
    ) {
      this.#db
        .prepare('UPDATE network_sessions SET state=?,result_seal=NULL WHERE id=?')
        .run(s.expires_at <= now ? 'expired' : 'revoked', s.id);
      this.#dropAccess(s.id);
      return false;
    }
    return true;
  }
  #dropAccess(id: string): void {
    for (const [key, access] of this.#access) if (access.sessionId === id) this.#access.delete(key);
  }
  #binding(s: Session): string {
    return canonical([
      s.id,
      s.attempt_id,
      s.account_id,
      s.credential_id,
      s.credential_binding,
      s.issued_at,
      s.expires_at,
      s.retry_expires,
      s.renewal_hash,
      s.revoke_hash,
    ]);
  }
  #view(a: Attempt, now: number, proof?: string): SessionResult {
    if (a.state === 'cancelled') return no('cancelled');
    if (a.state === 'issued') {
      if (proof === undefined) return no('retry-unavailable'); // begin never discloses issued credentials
      if (proof !== a.proof_hash) return no('proof-conflict');
      const s = this.#db
        .prepare('SELECT * FROM network_sessions WHERE attempt_id=?')
        .get(a.id) as unknown as Session | undefined;
      if (!s || !this.#live(s, now)) return no('sign-in-required');
      if (!s.result_seal || s.retry_expires <= now) return no('retry-unavailable');
      return JSON.parse(this.#custody.open(s.result_seal, this.#binding(s))) as SessionIssued;
    }
    if (a.state === 'expired' || a.expires <= now) {
      this.#db.prepare("UPDATE session_attempts SET state='expired' WHERE id=?").run(a.id);
      return no('expired');
    }
    return {
      ok: true,
      stage: 'challenge',
      attemptId: a.id,
      ...(a.purpose === 'login' && a.unlock_context
        ? { unlock: JSON.parse(a.unlock_context) as SessionUnlockContext }
        : {}),
      expiresAt: a.expires,
      options: {
        challenge: a.challenge,
        rpId: this.#policy.rpId,
        timeout: SESSION_RETRY_MS,
        userVerification: 'required',
      },
    };
  }
  begin(input: unknown): SessionResult {
    if (
      !object(input) ||
      !fields(
        input,
        'unlock' in input ? ['accountId', 'retryKey', 'unlock'] : ['accountId', 'retryKey'],
      )
    )
      return no('malformed');
    let account: string, retry: string, unlock: SessionUnlockInput | undefined;
    try {
      account = bytes(input.accountId, 32, 32).toString('base64url');
      retry = retryHash(input.retryKey);
      if ('unlock' in input) unlock = parseSessionUnlock(input.unlock);
    } catch {
      return no('malformed');
    }
    return this.#transaction('begin', () => {
      const now = this.#time();
      this.#prune(now);
      const prior = this.#db
        .prepare('SELECT * FROM session_attempts WHERE retry_hash=?')
        .get(retry) as unknown as Attempt | undefined;
      if (prior) {
        if (prior.purpose !== 'login') return no('request-conflict');
        const held = prior.unlock_context
          ? (JSON.parse(prior.unlock_context) as SessionUnlockContext)
          : undefined;
        const sameUnlock = held
          ? unlock &&
            held.nonce === unlock.nonce &&
            held.principalId === unlock.principalId &&
            held.credentialId === unlock.credentialId
          : !unlock;
        return prior.account_id === account && sameUnlock
          ? this.#view(prior, now)
          : no('request-conflict');
      }
      if (
        Number(this.#db.prepare('SELECT COUNT(*) AS n FROM session_attempts').get()!.n) >=
        SESSION_LIMITS.attempts
      )
        return no('capacity');
      const id = fresh();
      const context: SessionUnlockContext | undefined = unlock
        ? {
            v: 1,
            pin: this.#pin,
            accountId: account,
            attemptId: id,
            retryHash: retry,
            serverNonce: fresh(),
            expiresAt: now + SESSION_RETRY_MS,
            ...unlock,
          }
        : undefined;
      const challenge = Buffer.from(
        context
          ? hash(sessionUnlockMessage(context))
          : hash(
              canonical([
                'done/account-session-login/v1',
                this.#custody.context,
                id,
                account,
                retry,
                fresh(),
              ]),
            ),
        'hex',
      ).toString('base64url');
      this.#db
        .prepare("INSERT INTO session_attempts VALUES (?,?,?,?,?,'open',NULL,?,'login')")
        .run(
          id,
          retry,
          account,
          challenge,
          now + SESSION_RETRY_MS,
          context ? JSON.stringify(context) : null,
        );
      return this.#view(this.#attempt(input.retryKey)!, now);
    });
  }
  async finish(input: unknown): Promise<SessionResult> {
    let request: { retryKey: string; attemptId: string; response: Record<string, unknown> },
      digest: string;
    try {
      const serialized = canonical(input);
      if (Buffer.byteLength(serialized) > SESSION_REQUEST_LIMIT) return no('malformed');
      const value: unknown = JSON.parse(serialized);
      if (
        !object(value) ||
        !fields(value, ['retryKey', 'attemptId', 'response']) ||
        !object(value.response)
      )
        return no('malformed');
      bytes(value.attemptId, 32, 32);
      retryHash(value.retryKey);
      request = value as typeof request;
      digest = hash(canonical(request.response));
    } catch {
      return no('malformed');
    }
    let credential: StoredCredential | undefined,
      token = '',
      challenge = '';
    const inspect = (): SessionResult => {
      const a = this.#attempt(request.retryKey);
      if (!a || a.id !== request.attemptId) return no('unknown-attempt');
      if (a.purpose !== 'login') return no('invalid-proof');
      return this.#view(a, this.#time(), digest);
    };
    const checked = this.#transaction('inspect', () => {
      const v = inspect();
      if (!v.ok || v.stage !== 'challenge') return v;
      const a = this.#attempt(request.retryKey)!;
      credential = this.#credential(String(request.response.id));
      if (!credential || !this.#eligible(credential) || credential.account_id !== a.account_id)
        return no('invalid-proof');
      if (v.unlock && v.unlock.credentialId !== credential.id) return no('invalid-proof');
      token = credentialBinding(credential);
      challenge = v.options.challenge;
      return v;
    });
    if (!checked.ok || checked.stage !== 'challenge') return checked;
    let counter: number;
    try {
      counter = await assertion(request.response, challenge, this.#policy, credential!);
    } catch {
      return no('invalid-proof');
    }
    try {
      this.#hook('after-verify', 'session-finish');
    } catch {
      return no('storage-unavailable');
    }
    // Reserve in a separate committed transaction. An aborted issuance burns this nonce.
    const reserved = this.#transaction('reserve', () => {
      const v = inspect();
      if (!v.ok || v.stage !== 'challenge') return v;
      const row = this.#db.prepare('SELECT seal_counter FROM session_custody WHERE id=1').get()!;
      const nonce = Number(row.seal_counter) + 1;
      if (nonce > 0xffffffff) return no('capacity');
      this.#db.prepare('UPDATE session_custody SET seal_counter=? WHERE id=1').run(nonce);
      return { nonce };
    });
    if (!('nonce' in reserved)) return reserved;
    return this.#transaction('finish', () => {
      const v = inspect();
      if (!v.ok || v.stage !== 'challenge') return v;
      const current = this.#credential(credential!.id);
      if (!current || !this.#eligible(current) || credentialBinding(current) !== token)
        return no('invalid-proof');
      const result = this.#issue(current, token, request.attemptId, digest, reserved.nonce);
      if (result.ok)
        this.#db.prepare('UPDATE credentials SET counter=? WHERE id=?').run(counter, current.id);
      return result;
    });
  }
  #issue(
    current: StoredCredential,
    token: string,
    attemptId: string,
    proofHash: string,
    nonce: number,
  ): SessionIssuanceResult {
    const now = this.#time();
    this.#prune(now);
    const total = Number(this.#db.prepare('SELECT COUNT(*) AS n FROM network_sessions').get()!.n);
    const count = Number(
      this.#db
        .prepare("SELECT COUNT(*) AS n FROM network_sessions WHERE account_id=? AND state='active'")
        .get(current.account_id)!.n,
    );
    if (total >= SESSION_LIMITS.sessions || count >= SESSION_LIMITS.perAccount)
      return no('capacity');
    const result: SessionIssued = {
      ok: true,
      stage: 'issued',
      sessionId: fresh(),
      accountId: current.account_id,
      credentialId: current.id,
      issuedAt: now,
      expiresAt: now + SESSION_LIFETIME_MS,
      renewalToken: fresh(),
      revokeToken: fresh(),
    };
    const s: Session = {
      id: result.sessionId,
      attempt_id: attemptId,
      account_id: current.account_id,
      credential_id: current.id,
      credential_binding: token,
      issued_at: now,
      expires_at: result.expiresAt,
      state: 'active',
      renewal_hash: retryHash(result.renewalToken),
      revoke_hash: retryHash(result.revokeToken),
      retry_expires: now + SESSION_RETRY_MS,
      result_seal: null,
    };
    const seal = this.#custody.seal(JSON.stringify(result), this.#binding(s), nonce);
    this.#db
      .prepare("INSERT INTO network_sessions VALUES (?,?,?,?,?,?,?,'active',?,?,?,?)")
      .run(
        s.id,
        s.attempt_id,
        s.account_id,
        s.credential_id,
        s.credential_binding,
        s.issued_at,
        s.expires_at,
        s.renewal_hash,
        s.revoke_hash,
        s.retry_expires,
        seal,
      );
    this.#db
      .prepare("UPDATE session_attempts SET state='issued',proof_hash=? WHERE id=?")
      .run(proofHash, attemptId);
    return result;
  }
  /** The account is intentionally unknown until the discoverable recovery assertion selects it. */
  createRecovery(db: DatabaseSync, context: LostRecoveryContext, retryKey: string): void {
    this.#owned(db);
    const login = context.login;
    if (
      !login ||
      login.retryHash !== retryHash(retryKey) ||
      login.retryHash !== context.retryHash ||
      canonical(context.pin) !== canonical(this.#pin)
    )
      throw new EnrollmentLoginRefused();
    this.#prune(this.#time());
    if (
      this.#attempt(retryKey) ||
      Number(db.prepare('SELECT COUNT(*) AS n FROM session_attempts').get()!.n) >=
        SESSION_LIMITS.attempts
    )
      throw new EnrollmentLoginRefused();
    db.prepare("INSERT INTO session_attempts VALUES (?,?,?,?,?,'open',NULL,?,'recovery')").run(
      login.attemptId,
      login.retryHash,
      '',
      Buffer.from(hash(lostRecoveryAssertionMessage(context)), 'hex').toString('base64url'),
      context.expiresAt,
      JSON.stringify(context),
    );
  }
  recoveryResult(
    db: DatabaseSync,
    context: LostRecoveryContext,
    retryKey: string,
    proofHash: string,
  ): SessionResult {
    this.#owned(db);
    this.#prune(this.#time());
    const a = this.#attempt(retryKey),
      login = context.login;
    if (
      !a ||
      !login ||
      a.purpose !== 'recovery' ||
      a.id !== login.attemptId ||
      a.retry_hash !== login.retryHash ||
      a.unlock_context !== JSON.stringify(context) ||
      a.challenge !==
        Buffer.from(hash(lostRecoveryAssertionMessage(context)), 'hex').toString('base64url')
    )
      return no('unknown-attempt');
    return this.#view(a, this.#time(), proofHash);
  }
  /** Called only after fresh recovery WebAuthn AND candidate possession checks.
   * Reservation is durable before the owning preparation transaction; rollback burns the nonce. */
  reserveRecovery(
    context: LostRecoveryContext,
    retryKey: string,
    proofHash: string,
  ):
    | SessionResult
    | { commit: (db: DatabaseSync, credential: StoredCredential) => SessionIssuanceResult } {
    const reserved = this.#transaction('recovery-reserve', () => {
      const v = this.recoveryResult(this.#db, context, retryKey, proofHash);
      if (!v.ok || v.stage !== 'challenge') return v;
      const nonce =
        Number(
          this.#db.prepare('SELECT seal_counter FROM session_custody WHERE id=1').get()!
            .seal_counter,
        ) + 1;
      if (nonce > 0xffffffff) return no('capacity');
      this.#db.prepare('UPDATE session_custody SET seal_counter=? WHERE id=1').run(nonce);
      return { nonce };
    });
    if (!('nonce' in reserved)) return reserved;
    let used = false;
    return {
      commit: (db, credential) => {
        this.#owned(db);
        if (used) throw new EnrollmentLoginRefused();
        used = true;
        const view = this.recoveryResult(db, context, retryKey, proofHash);
        if (!view.ok || view.stage === 'issued') return view;
        if (view.stage !== 'challenge') return no('invalid-proof');
        const current = this.#credential(credential.id);
        if (
          !current ||
          !this.#eligible(current) ||
          credentialBinding(current) !== credentialBinding(credential)
        )
          return no('invalid-proof');
        db.prepare('UPDATE session_attempts SET account_id=? WHERE id=?').run(
          current.account_id,
          context.login!.attemptId,
        );
        return this.#issue(
          current,
          credentialBinding(current),
          context.login!.attemptId,
          proofHash,
          reserved.nonce,
        );
      },
    };
  }
  cancelRecovery(db: DatabaseSync, context: LostRecoveryContext): void {
    this.#owned(db);
    if (!context.login) return;
    const a = db
      .prepare('SELECT * FROM session_attempts WHERE id=?')
      .get(context.login.attemptId) as unknown as Attempt | undefined;
    if (a?.purpose === 'recovery' && a.unlock_context === JSON.stringify(context))
      this.#cancelAttempt(a.id);
  }
  #enrollment(attemptId: string): string | undefined {
    return this.#db
      .prepare('SELECT enrollment_id FROM enrollment_session_links WHERE session_attempt_id=?')
      .get(attemptId)?.enrollment_id as string | undefined;
  }
  #owned(db: DatabaseSync): void {
    if (this.#closed || db !== this.#db || !db.isTransaction) throw new EnrollmentLoginRefused();
  }
  /** Called after the owning enrollment row is inserted, in that same transaction. */
  createEnrollment(db: DatabaseSync, context: EnrollmentContext, retryKey: string): void {
    this.#owned(db);
    const login = context.login;
    if (
      !login ||
      login.retryHash !== retryHash(retryKey) ||
      canonical(context.pin) !== canonical(this.#pin)
    )
      throw new EnrollmentLoginRefused();
    this.#prune(this.#time());
    if (
      this.#attempt(retryKey) ||
      Number(db.prepare('SELECT COUNT(*) AS n FROM session_attempts').get()!.n) >=
        SESSION_LIMITS.attempts
    )
      throw new EnrollmentLoginRefused();
    db.prepare("INSERT INTO session_attempts VALUES (?,?,?,?,?,'open',NULL,NULL,'enrollment')").run(
      login.attemptId,
      login.retryHash,
      context.accountId,
      Buffer.from(hash(enrollmentAssertionMessage(context)), 'hex').toString('base64url'),
      context.expiresAt,
    );
    db.prepare('INSERT INTO enrollment_session_links VALUES (?,?)').run(
      context.attemptId,
      login.attemptId,
    );
  }
  enrollmentResult(
    db: DatabaseSync,
    context: EnrollmentContext,
    retryKey: string,
    proofHash: string,
  ): SessionResult {
    this.#owned(db);
    this.#prune(this.#time());
    const login = context.login,
      a = this.#attempt(retryKey);
    if (
      !login ||
      !a ||
      a.purpose !== 'enrollment' ||
      a.id !== login.attemptId ||
      a.retry_hash !== login.retryHash ||
      a.account_id !== context.accountId ||
      this.#enrollment(a.id) !== context.attemptId ||
      a.challenge !==
        Buffer.from(hash(enrollmentAssertionMessage(context)), 'hex').toString('base64url')
    )
      return no('unknown-attempt');
    return this.#view(a, this.#time(), proofHash);
  }
  /** Reserve before the enrollment commit. The one-use closure cannot reuse a nonce after rollback.
   * Only EnrollmentPreparation calls this, after verifying BOTH fresh proofs. */
  reserveEnrollment(
    context: EnrollmentContext,
    retryKey: string,
    proofHash: string,
  ):
    | SessionResult
    | { commit: (db: DatabaseSync, credential: StoredCredential) => SessionIssuanceResult } {
    const reserved = this.#transaction('enrollment-reserve', () => {
      const v = this.enrollmentResult(this.#db, context, retryKey, proofHash);
      if (!v.ok || v.stage !== 'challenge') return v;
      const nonce =
        Number(
          this.#db.prepare('SELECT seal_counter FROM session_custody WHERE id=1').get()!
            .seal_counter,
        ) + 1;
      if (nonce > 0xffffffff) return no('capacity');
      this.#db.prepare('UPDATE session_custody SET seal_counter=? WHERE id=1').run(nonce);
      return { nonce };
    });
    if (!('nonce' in reserved)) return reserved;
    let used = false;
    return {
      commit: (db, credential) => {
        this.#owned(db);
        if (used) throw new EnrollmentLoginRefused();
        used = true;
        const view = this.enrollmentResult(db, context, retryKey, proofHash);
        if (!view.ok || view.stage === 'issued') return view;
        if (view.stage !== 'challenge') return no('invalid-proof');
        const current = this.#credential(credential.id);
        if (
          !current ||
          current.id !== context.passkeyId ||
          current.account_id !== context.accountId ||
          !this.#eligible(current) ||
          credentialBinding(current) !== credentialBinding(credential)
        )
          return no('invalid-proof');
        return this.#issue(
          current,
          credentialBinding(current),
          context.login!.attemptId,
          proofHash,
          reserved.nonce,
        );
      },
    };
  }
  cancelEnrollment(db: DatabaseSync, enrollmentId: string): void {
    this.#owned(db);
    const link = db
      .prepare('SELECT session_attempt_id FROM enrollment_session_links WHERE enrollment_id=?')
      .get(enrollmentId);
    if (link) this.#cancelAttempt(String(link.session_attempt_id));
  }
  #cancelAttempt(attemptId: string): void {
    this.#db.prepare("UPDATE session_attempts SET state='cancelled' WHERE id=?").run(attemptId);
    const s = this.#db.prepare('SELECT id FROM network_sessions WHERE attempt_id=?').get(attemptId);
    if (s) {
      this.#db
        .prepare("UPDATE network_sessions SET state='revoked',result_seal=NULL WHERE id=?")
        .run(s.id);
      this.#dropAccess(String(s.id));
    }
  }
  cancel(input: unknown): SessionResult {
    if (!object(input) || !fields(input, ['retryKey', 'attemptId'])) return no('malformed');
    try {
      retryHash(input.retryKey);
      bytes(input.attemptId, 32, 32);
    } catch {
      return no('malformed');
    }
    return this.#transaction('cancel', () => {
      const a = this.#attempt(input.retryKey);
      if (!a || a.id !== input.attemptId) return no('unknown-attempt');
      this.#cancelAttempt(a.id);
      return { ok: true, stage: 'cancelled' };
    });
  }
  #secret(
    input: unknown,
    field: 'renewalToken' | 'revokeToken',
  ): { id: string; digest: string } | null {
    if (!object(input) || !fields(input, ['sessionId', field])) return null;
    try {
      return {
        id: bytes(input.sessionId, 32, 32).toString('base64url'),
        digest: retryHash(input[field]),
      };
    } catch {
      return null;
    }
  }
  acknowledge(input: unknown): SessionResult {
    const value = this.#secret(input, 'renewalToken');
    if (!value) return no('malformed');
    return this.#transaction('acknowledge', () => {
      const s = this.#session(value.id);
      if (!s || !sameHash(value.digest, s.renewal_hash) || !this.#live(s, this.#time()))
        return no('sign-in-required');
      this.#db.prepare('UPDATE network_sessions SET result_seal=NULL WHERE id=?').run(s.id);
      return { ok: true, stage: 'acknowledged' };
    });
  }
  renew(input: unknown): SessionResult {
    const value = this.#secret(input, 'renewalToken');
    if (!value) return no('malformed');
    const result = this.#transaction('renew', () => {
      const now = this.#time();
      this.#prune(now);
      const s = this.#session(value.id);
      if (!s || !sameHash(value.digest, s.renewal_hash) || !this.#live(s, now))
        return no('sign-in-required');
      return {
        ok: true as const,
        stage: 'access' as const,
        sessionId: s.id,
        accountId: s.account_id,
        accessToken: fresh(),
        expiresAt: Math.min(now + SESSION_ACCESS_MS, s.expires_at),
      };
    });
    // Rotate only this login's oldest-issued access, and only after validation commits.
    // A rapid reopen or a lost reply must not strand a valid remembered login at capacity.
    // Map insertion order stays stable on use; identical expiry times cannot reorder it.
    if (result.ok) {
      const previous = [...this.#access]
        .filter(([, access]) => access.sessionId === result.sessionId)
        .map(([token]) => token);
      while (previous.length >= SESSION_LIMITS.accessPerSession)
        this.#access.delete(previous.shift()!);
      this.#access.set(retryHash(result.accessToken), {
        sessionId: result.sessionId,
        expires: result.expiresAt,
      });
    }
    return result;
  }
  revoke(input: unknown): SessionResult {
    const value = this.#secret(input, 'revokeToken');
    if (!value) return no('malformed');
    return this.#transaction('revoke', () => {
      const s = this.#session(value.id);
      // Random IDs are never reused. A pruned/nonexistent session has no live grants.
      if (!s) return { ok: true, stage: 'revoked' };
      if (!sameHash(value.digest, s.revoke_hash)) return no('invalid-proof');
      this.#db
        .prepare("UPDATE network_sessions SET state='revoked',result_seal=NULL WHERE id=?")
        .run(s.id);
      this.#dropAccess(s.id);
      return { ok: true, stage: 'revoked' };
    });
  }
  /** Trusted synchronous service composition only. The identity is NOT a device/relay grant.
   * Run after any async verification, at the actual mutation boundary, never just in middleware. */
  /** Budget attribution only; withAccess remains the operation's authorization boundary. */
  requestBudgetKey(accessToken: unknown): string | undefined {
    if (this.#closed) return;
    try {
      const access = this.#access.get(retryHash(accessToken));
      return access && access.expires > this.#time() ? access.sessionId : undefined;
    } catch {
      return;
    }
  }
  withAccess<T extends { ok: boolean }>(
    accessToken: unknown,
    accountId: string,
    work: (identity: SessionIdentity & { accessExpiresAt: number }, db: DatabaseSync) => T,
  ): T | Denial {
    if (Object.prototype.toString.call(work) === '[object AsyncFunction]')
      return no('storage-unavailable');
    let token: string;
    try {
      token = retryHash(accessToken);
      bytes(accountId, 32, 32);
    } catch {
      return no('access-required');
    }
    return this.#transaction('access', () => {
      const now = this.#time(),
        access = this.#access.get(token);
      if (!access || access.expires <= now) return no('access-required');
      const s = this.#session(access.sessionId);
      if (!s || !this.#live(s, now)) return no('sign-in-required');
      if (s.account_id !== accountId) return no('wrong-account');
      return work(
        {
          accountId: s.account_id,
          credentialId: s.credential_id,
          sessionId: s.id,
          accessExpiresAt: access.expires,
        },
        this.#db,
      );
    });
  }
  /** For a domain transaction already owned by this same AccountCore connection. This neither
   * begins nor commits/rolls back the caller's transaction. Session IDs here come only from a
   * service-held grant; accepting an HTTP sessionId as authority would be a bypass. */
  checkGrantParent(
    db: DatabaseSync,
    sessionId: string,
    accountId: string,
  ): { ok: true; identity: SessionIdentity; expiresAt: number } | Denial {
    if (this.#closed || db !== this.#db || !db.isTransaction) return no('storage-unavailable');
    const s = this.#session(sessionId);
    if (!s || !this.#live(s, this.#time())) return no('sign-in-required');
    if (s.account_id !== accountId) return no('wrong-account');
    return {
      ok: true,
      identity: { accountId, credentialId: s.credential_id, sessionId },
      expiresAt: s.expires_at,
    };
  }
  run(operation: SessionOperation, input: unknown): SessionResult | Promise<SessionResult> {
    switch (operation) {
      case 'begin':
        return this.begin(input);
      case 'finish':
        return this.finish(input);
      case 'cancel':
        return this.cancel(input);
      case 'acknowledge':
        return this.acknowledge(input);
      case 'renew':
        return this.renew(input);
      case 'revoke':
        return this.revoke(input);
    }
  }
}
