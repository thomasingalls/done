import { decideSubmission, type DeliveryIssuer } from './delivery.ts';
import { parseBindingProof, type BindingProof } from '../account-protocol/slot.ts';
import {
  parseAdmissionRequest,
  requestDigest,
  verifyAdmissionRequest,
  verifyOffer,
  verifyCompletion,
  verifyReceipt,
  parseOffer,
  parseReceipt,
  parseCompletion,
  same,
  ADMISSION_LIMIT,
  type AdmissionRequest,
  type AdmissionOffer,
  type AdmissionReceipt,
} from '../account-protocol/admission.ts';
import { pendingBytes } from '../account-protocol/preparation.ts';
import type { PromotionIssuer } from './promotion.ts';
import { parsePendingState, type PendingState } from '../account-protocol/preparation.ts';
import {
  parseDraft,
  rootCommitment,
  draftDigest,
  recoveryStateDigest,
} from '../account-protocol/recovery.ts';
import {
  recoveryChallenge,
  verifyRecoveryProof,
  type RecoveryRow,
  type RecoveryResult,
} from './recovery.ts';
import { DatabaseSync } from 'node:sqlite';
import {
  assertion,
  registration,
  validatePolicy,
  validateCredentialKey,
  type Policy,
  type StoredCredential,
} from './webauthn.ts';
import {
  bytes,
  canonical,
  challenge,
  fields,
  fresh,
  hash,
  object,
  refuse,
  retryHash,
  type Operation,
  type Result,
  type Refusal,
} from './protocol.ts';

export const CEREMONY_LIFETIME_MS = 10 * 60 * 1000;
interface Attempt {
  id: string;
  retry_hash: string;
  mode: 'register' | 'authenticate';
  state: 'open' | 'done' | 'cancelled' | 'expired';
  account_id: string | null;
  current_id: string;
  result: string | null;
}
interface Ceremony {
  id: string;
  attempt_id: string;
  operation: Operation;
  challenge: string;
  expires: number;
  options: string;
  credential_id: string | null;
  proof_hash: string | null;
  result: string | null;
}
interface PromotionRow {
  account_id: string;
  workspace_id: string;
  lineage_id: string;
  request_digest: string;
  request: string;
  offer: string;
  acceptance_seal: string;
  state: 'proposed' | 'admitted' | 'cancelled';
  result: string | null;
}
type Hook = (point: 'before-commit' | 'after-commit' | 'after-verify', operation: string) => void;

/** Private account and first-admission transactions. No plaintext content or relay. */
export class AccountCore {
  #db: DatabaseSync;
  #policy: Policy;
  #now: () => number;
  #hook: Hook;

  constructor(
    path: string,
    policy: Policy,
    instrumentation: {
      now?: () => number;
      hook?: Hook;
      upgradeFromV1?: boolean;
      upgradeFromV2?: boolean;
      upgradeFromV3?: boolean;
    } = {},
  ) {
    validatePolicy(policy);
    this.#policy = { ...policy };
    this.#now = instrumentation.now ?? Date.now;
    this.#hook = instrumentation.hook ?? (() => {});
    this.#db = new DatabaseSync(path);
    try {
      this.#db.exec(
        'PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;',
      );
      this.#db.exec('BEGIN IMMEDIATE');
      const version = this.#db.prepare('PRAGMA user_version').get()!.user_version;
      if (version === 0) {
        if (this.#db.prepare("SELECT name FROM sqlite_master WHERE type='table'").get())
          throw Error('Unclassified account database');
        this.#db.exec(`
          CREATE TABLE policy (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
          CREATE TABLE accounts (id TEXT PRIMARY KEY, state TEXT NOT NULL CHECK(state IN ('pending','active')));
          CREATE TABLE attempts (id TEXT PRIMARY KEY, retry_hash TEXT UNIQUE NOT NULL,
            mode TEXT NOT NULL CHECK(mode IN ('register','authenticate')),
            state TEXT NOT NULL CHECK(state IN ('open','done','cancelled','expired')),
            account_id TEXT REFERENCES accounts(id), current_id TEXT NOT NULL, result TEXT);
          CREATE TABLE credentials (id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
            public_key BLOB NOT NULL, spki TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('staged','confirmed')),
            counter INTEGER NOT NULL, UNIQUE(account_id));
          CREATE TABLE ceremonies (id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES attempts(id),
            operation TEXT NOT NULL CHECK(operation IN ('register','confirm-registration','authenticate')),
            challenge TEXT UNIQUE NOT NULL, expires INTEGER NOT NULL, options TEXT NOT NULL,
            credential_id TEXT, proof_hash TEXT, result TEXT,
            UNIQUE(attempt_id,operation), CHECK((proof_hash IS NULL) = (result IS NULL)));
          PRAGMA user_version=1;
        `);
        this.#db.prepare('INSERT INTO policy VALUES (1,?)').run(canonical(this.#policy));
      } else if (
        version !== 4 &&
        !(version === 3 && instrumentation.upgradeFromV3) &&
        !(version === 2 && instrumentation.upgradeFromV2) &&
        !(version === 1 && instrumentation.upgradeFromV1)
      )
        throw Error('Unsupported account schema; older versions require explicit offline upgrade');
      if (version === 0 || version === 1) {
        this.#db.exec(`CREATE TABLE recovery (
          account_id TEXT PRIMARY KEY REFERENCES accounts(id), attempt_id TEXT UNIQUE NOT NULL REFERENCES attempts(id),
          id TEXT UNIQUE NOT NULL, draft TEXT NOT NULL, digest TEXT NOT NULL, challenge TEXT UNIQUE NOT NULL,
          expires INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('open','done','cancelled','expired')),
          proof_hash TEXT, result TEXT, CHECK((proof_hash IS NULL) = (result IS NULL)));
          PRAGMA user_version=2;`);
      }
      if (version < 3) {
        this.#db.exec(`CREATE TABLE promotions (
          account_id TEXT PRIMARY KEY REFERENCES accounts(id),workspace_id TEXT NOT NULL,lineage_id TEXT NOT NULL,
          request_digest TEXT UNIQUE NOT NULL,request TEXT NOT NULL,offer TEXT NOT NULL,acceptance_seal TEXT NOT NULL,
          state TEXT NOT NULL CHECK(state IN ('proposed','admitted','cancelled')),result TEXT);
          CREATE UNIQUE INDEX promotion_workspace ON promotions(workspace_id) WHERE state != 'cancelled';
          CREATE UNIQUE INDEX promotion_lineage ON promotions(lineage_id) WHERE state != 'cancelled';
          PRAGMA user_version=3;`);
      }
      if (version < 4) {
        this.#db.exec(`ALTER TABLE promotions ADD COLUMN delivery_witness TEXT;
          CREATE TABLE delivery_decisions (
            account_id TEXT NOT NULL REFERENCES accounts(id),
            ordinal INTEGER NOT NULL CHECK(ordinal>0),
            position INTEGER NOT NULL CHECK(position>0),
            digest TEXT NOT NULL, envelope_epoch INTEGER NOT NULL CHECK(envelope_epoch>0),
            kind TEXT NOT NULL CHECK(kind IN ('accepted','refused')),
            submission BLOB NOT NULL, response BLOB NOT NULL,
            PRIMARY KEY(account_id,position,digest,envelope_epoch), UNIQUE(account_id,ordinal));
          CREATE UNIQUE INDEX delivery_accepted_position ON delivery_decisions(account_id,position) WHERE kind='accepted';
          PRAGMA user_version=4;`);
      }
      if (
        this.#db.prepare('SELECT value FROM policy WHERE id=1').get()?.value !==
        canonical(this.#policy)
      )
        throw Error('Account origin/RP policy changed');
      this.#db.exec('COMMIT');
    } catch (error) {
      if (this.#db.isTransaction) this.#db.exec('ROLLBACK');
      this.#db.close();
      throw error;
    }
  }

  /** Private service composition; transport cannot supply an issuer or authenticated membership. */
  decideSubmission(input: unknown, issuer: DeliveryIssuer) {
    return decideSubmission(this.#db, input, issuer, this.#hook);
  }
  close(): void {
    this.#db.close();
  }

  #transaction<T extends { ok: boolean }>(
    operation: string,
    work: () => T,
  ): T | { ok: false; refusal: Refusal } {
    try {
      this.#db.exec('BEGIN IMMEDIATE');
      const result = work();
      this.#hook('before-commit', operation);
      this.#db.exec('COMMIT');
      this.#hook('after-commit', operation);
      return result;
    } catch {
      if (this.#db.isTransaction) this.#db.exec('ROLLBACK');
      return refuse('storage-unavailable');
    }
  }

  #attempt(retryKey: unknown): Attempt | undefined {
    return this.#db
      .prepare('SELECT * FROM attempts WHERE retry_hash=?')
      .get(retryHash(retryKey)) as unknown as Attempt | undefined;
  }
  #ceremony(id: string): Ceremony {
    return this.#db.prepare('SELECT * FROM ceremonies WHERE id=?').get(id) as unknown as Ceremony;
  }
  #credential(id: string): StoredCredential | undefined {
    return this.#db.prepare('SELECT * FROM credentials WHERE id=?').get(id) as unknown as
      | StoredCredential
      | undefined;
  }
  #active(id: string): boolean {
    return this.#db.prepare('SELECT state FROM accounts WHERE id=?').get(id)?.state === 'active';
  }
  #available(attempt: Attempt, ceremony: Ceremony): Result | null {
    if (attempt.state === 'cancelled') return refuse('cancelled');
    if (attempt.state === 'expired') return refuse('expired');
    if (attempt.state === 'open' && this.#now() >= ceremony.expires) {
      this.#db.prepare("UPDATE attempts SET state='expired' WHERE id=?").run(attempt.id);
      return refuse('expired');
    }
    return null;
  }
  #view(attempt: Attempt): Result {
    const ceremony = this.#ceremony(attempt.current_id);
    const refused = this.#available(attempt, ceremony);
    if (refused) return refused;
    if (attempt.result) return JSON.parse(attempt.result) as Result;
    return {
      ok: true,
      stage: 'ceremony',
      operation: ceremony.operation,
      attemptId: attempt.id,
      ceremonyId: ceremony.id,
      expiresAt: ceremony.expires,
      options: JSON.parse(ceremony.options),
    };
  }
  #mint(
    attemptId: string,
    operation: Operation,
    accountId: string,
    credentialId?: string,
  ): Ceremony {
    const id = fresh();
    const nonce = challenge(
      operation,
      attemptId,
      accountId,
      this.#policy.rpId,
      this.#policy.origin,
    );
    const expires = this.#now() + CEREMONY_LIFETIME_MS;
    const options =
      operation === 'register'
        ? {
            challenge: nonce,
            rp: { id: this.#policy.rpId, name: 'done' },
            user: {
              id: accountId,
              name: `Pending ${accountId.slice(0, 8)}`,
              displayName: 'Pending done account',
            },
            pubKeyCredParams: [
              { type: 'public-key', alg: -8 },
              { type: 'public-key', alg: -7 },
            ],
            timeout: CEREMONY_LIFETIME_MS,
            attestation: 'none',
            authenticatorSelection: {
              residentKey: 'required',
              requireResidentKey: true,
              userVerification: 'required',
            },
          }
        : {
            challenge: nonce,
            rpId: this.#policy.rpId,
            timeout: CEREMONY_LIFETIME_MS,
            userVerification: 'required',
            ...(credentialId
              ? { allowCredentials: [{ type: 'public-key', id: credentialId }] }
              : {}),
          };
    return {
      id,
      attempt_id: attemptId,
      operation,
      challenge: nonce,
      expires,
      options: JSON.stringify(options),
      credential_id: credentialId ?? null,
      proof_hash: null,
      result: null,
    };
  }
  #insert(ceremony: Ceremony): void {
    this.#db
      .prepare(`INSERT INTO ceremonies
      (id,attempt_id,operation,challenge,expires,options,credential_id) VALUES (?,?,?,?,?,?,?)`)
      .run(
        ceremony.id,
        ceremony.attempt_id,
        ceremony.operation,
        ceremony.challenge,
        ceremony.expires,
        ceremony.options,
        ceremony.credential_id,
      );
  }

  begin(input: unknown): Result {
    if (
      !object(input) ||
      !fields(input, ['operation', 'retryKey']) ||
      (input.operation !== 'register' && input.operation !== 'authenticate')
    )
      return refuse('malformed');
    let digest: string;
    try {
      digest = retryHash(input.retryKey);
    } catch {
      return refuse('malformed');
    }
    const mode = input.operation;
    return this.#transaction('begin', () => {
      const prior = this.#attempt(input.retryKey);
      if (prior) return prior.mode === mode ? this.#view(prior) : refuse('operation-mismatch');
      const id = fresh();
      const accountId = mode === 'register' ? fresh() : null;
      const ceremony = this.#mint(id, mode, accountId ?? '');
      if (accountId) this.#db.prepare("INSERT INTO accounts VALUES (?,'pending')").run(accountId);
      this.#db
        .prepare("INSERT INTO attempts VALUES (?, ?, ?, 'open', ?, ?, NULL)")
        .run(id, digest, mode, accountId, ceremony.id);
      this.#insert(ceremony);
      return this.#view(this.#attempt(input.retryKey)!);
    });
  }

  resume(input: unknown): Result {
    if (!object(input) || !fields(input, ['retryKey'])) return refuse('malformed');
    try {
      retryHash(input.retryKey);
    } catch {
      return refuse('malformed');
    }
    return this.#transaction('resume', () => {
      const attempt = this.#attempt(input.retryKey);
      return attempt ? this.#view(attempt) : refuse('unknown-attempt');
    });
  }

  cancel(input: unknown): Result {
    if (!object(input) || !fields(input, ['retryKey'])) return refuse('malformed');
    try {
      retryHash(input.retryKey);
    } catch {
      return refuse('malformed');
    }
    return this.#transaction('cancel', () => {
      const attempt = this.#attempt(input.retryKey);
      if (!attempt) return refuse('unknown-attempt');
      if (attempt.state === 'done') return refuse('already-finished');
      this.#db.prepare("UPDATE attempts SET state='cancelled' WHERE id=?").run(attempt.id);
      return { ok: true, stage: 'cancelled', attemptId: attempt.id };
    });
  }

  async finish(input: unknown): Promise<Result> {
    if (
      !object(input) ||
      !fields(input, ['retryKey', 'ceremonyId', 'operation', 'response']) ||
      !['register', 'confirm-registration', 'authenticate'].includes(String(input.operation))
    )
      return refuse('malformed');
    // Copy once before an await: caller mutation cannot switch the committed proof or credential.
    let request: typeof input;
    let digest: string;
    try {
      const serialized = canonical(input);
      if (Buffer.byteLength(serialized) > 131072) return refuse('malformed');
      request = JSON.parse(serialized);
      retryHash(request.retryKey);
      bytes(request.ceremonyId, 32, 32);
      digest = hash(canonical(request.response));
    } catch {
      return refuse('malformed');
    }
    let attempt: Attempt | undefined;
    let ceremony: Ceremony;
    let credential: StoredCredential | undefined;
    const inspect = (): Result | null => {
      attempt = this.#attempt(request.retryKey);
      if (!attempt) return refuse('unknown-attempt');
      ceremony = this.#ceremony(request.ceremonyId as string);
      if (!ceremony || ceremony.attempt_id !== attempt.id) return refuse('unknown-attempt');
      if (ceremony.operation !== request.operation) return refuse('operation-mismatch');
      const refused = this.#available(attempt, this.#ceremony(attempt.current_id));
      if (refused) return refused;
      if (ceremony.proof_hash !== null)
        return ceremony.proof_hash === digest
          ? (JSON.parse(ceremony.result!) as Result)
          : refuse('proof-conflict');
      if (attempt.current_id !== ceremony.id || attempt.state !== 'open')
        return refuse('already-finished');
      return null;
    };
    // The challenge and credential must be one snapshot. Another process can complete
    // confirmation immediately after this transaction; crypto must still use the staged
    // key we inspected, then resolve that winner through the final receipt check.
    let prior: Result | null = null;
    const checked = this.#transaction('inspect', () => {
      prior = inspect();
      if (prior) return prior;
      if (ceremony.operation !== 'register') {
        const value = request.response;
        if (!object(value) || typeof value.id !== 'string') return refuse('invalid-proof');
        credential = this.#credential(value.id);
        if (!credential) return refuse('invalid-proof');
        if (ceremony.operation === 'confirm-registration') {
          if (
            credential.id !== ceremony.credential_id ||
            credential.account_id !== attempt!.account_id ||
            credential.state !== 'staged'
          )
            return refuse('invalid-proof');
        } else if (credential.state !== 'confirmed' || !this.#active(credential.account_id))
          return refuse('account-not-active');
      }
      return this.#view(attempt!);
    });
    if (!checked.ok) return checked;
    if (prior) return prior;
    let registered: Awaited<ReturnType<typeof registration>> | undefined;
    let counter = 0;
    try {
      if (ceremony!.operation === 'register') {
        registered = await registration(request.response, ceremony!.challenge, this.#policy);
      } else {
        counter = await assertion(request.response, ceremony!.challenge, this.#policy, credential!);
      }
    } catch {
      return refuse('invalid-proof');
    }
    try {
      this.#hook('after-verify', ceremony!.operation);
    } catch {
      return refuse('storage-unavailable');
    }
    return this.#transaction(request.operation as string, () => {
      const changed = inspect();
      if (changed) return changed;
      let result: Result;
      if (registered) {
        if (this.#credential(registered.id)) return refuse('credential-in-use');
        this.#db
          .prepare("INSERT INTO credentials VALUES (?,?,?,?,'staged',?)")
          .run(
            registered.id,
            attempt!.account_id!,
            registered.publicKey,
            registered.spki,
            registered.counter,
          );
        const next = this.#mint(
          attempt!.id,
          'confirm-registration',
          attempt!.account_id!,
          registered.id,
        );
        this.#insert(next);
        this.#db.prepare('UPDATE attempts SET current_id=? WHERE id=?').run(next.id, attempt!.id);
        result = this.#view(this.#attempt(request.retryKey)!);
      } else {
        const current = this.#credential(credential!.id);
        if (
          !current ||
          current.state !== credential!.state ||
          current.spki !== credential!.spki ||
          current.account_id !== credential!.account_id ||
          !Buffer.from(current.public_key).equals(Buffer.from(credential!.public_key))
        )
          return refuse('invalid-proof');
        if (ceremony!.operation === 'authenticate' && !this.#active(current.account_id))
          return refuse('account-not-active');
        this.#db
          .prepare("UPDATE credentials SET state='confirmed',counter=? WHERE id=?")
          .run(counter, current.id);
        result = {
          ok: true,
          stage: ceremony!.operation === 'authenticate' ? 'account-proof' : 'credential-confirmed',
          attemptId: attempt!.id,
          accountId: current.account_id,
          credentialId: current.id,
          receiptId: fresh(),
        };
        this.#db
          .prepare("UPDATE attempts SET state='done',account_id=?,result=? WHERE id=?")
          .run(current.account_id, JSON.stringify(result), attempt!.id);
      }
      this.#db
        .prepare('UPDATE ceremonies SET proof_hash=?,result=? WHERE id=?')
        .run(digest, JSON.stringify(result), ceremony!.id);
      return result;
    });
  }

  #promotionCurrent(
    retryKey: string,
    request: AdmissionRequest,
    issuer: PromotionIssuer,
  ): { ok: true; state: PendingState; row?: PromotionRow } | { ok: false; refusal: Refusal } {
    const attempt = this.#attempt(retryKey),
      accountId = request.candidate.accountId;
    if (!attempt || attempt.mode !== 'register' || attempt.account_id !== accountId)
      return refuse('unknown-attempt');
    const account = this.#db.prepare('SELECT state FROM accounts WHERE id=?').get(accountId);
    const credential = this.#db
      .prepare("SELECT id FROM credentials WHERE account_id=? AND state='confirmed'")
      .get(accountId);
    const recovery = this.#recovery(attempt);
    const row = this.#db
      .prepare('SELECT * FROM promotions WHERE account_id=?')
      .get(accountId) as unknown as PromotionRow | undefined;
    if (
      attempt.state !== 'done' ||
      !credential ||
      recovery?.state !== 'done' ||
      !recovery.result ||
      row?.state === 'cancelled' ||
      (account?.state !== 'pending' && !(account?.state === 'active' && row?.state === 'admitted'))
    )
      return refuse('account-not-pending');
    if (row) {
      if (!same(parseAdmissionRequest(JSON.parse(row.request)), request))
        return refuse('proof-conflict');
      const offer = parseOffer(JSON.parse(row.offer));
      issuer.check(
        JSON.parse(row.acceptance_seal),
        row.request_digest,
        offer.epoch.acceptancePublicKey,
      );
    }
    const receipt = JSON.parse(recovery.result);
    const state = parsePendingState({
      v: 1,
      accountId,
      attemptId: attempt.id,
      status: 'eligible',
      draft: JSON.parse(recovery.draft),
      confirmation: {
        recoveryId: receipt.recoveryId,
        draftDigest: receipt.draftDigest,
        recoveryStateDigest: receipt.recoveryStateDigest,
        receiptId: receipt.receiptId,
      },
    });
    return { ok: true, state, ...(row ? { row } : {}) };
  }
  #promotionView(row: PromotionRow): AdmissionOffer | AdmissionReceipt {
    return row.state === 'admitted'
      ? parseReceipt(JSON.parse(row.result!))
      : parseOffer(JSON.parse(row.offer));
  }
  async beginPromotion(
    input: unknown,
    issuer: PromotionIssuer,
  ): Promise<AdmissionOffer | AdmissionReceipt | { ok: false; refusal: Refusal }> {
    let retryKey: string, request: AdmissionRequest, id: string;
    try {
      if (!object(input) || !fields(input, ['retryKey', 'request'])) return refuse('malformed');
      const raw = canonical(input);
      if (Buffer.byteLength(raw) > ADMISSION_LIMIT) return refuse('malformed');
      const copied = JSON.parse(raw);
      retryKey = copied.retryKey;
      retryHash(retryKey);
      request = parseAdmissionRequest(copied.request);
      id = await requestDigest(request);
    } catch {
      return refuse('malformed');
    }
    const before = this.#transaction('inspect-promotion', () =>
      this.#promotionCurrent(retryKey, request, issuer),
    );
    if (!before.ok) return before;
    try {
      await verifyAdmissionRequest(request, before.state);
      if (request.candidate.authRoot !== issuer.pin.authRoot) return refuse('invalid-proof');
      if (before.row) {
        await verifyOffer(JSON.parse(before.row.offer), request, issuer.pin);
        return this.#promotionView(before.row);
      }
      const proposed = await issuer.prepare(request);
      await verifyOffer(proposed.offer, request, issuer.pin);
      issuer.check(proposed.seal, id, proposed.offer.epoch.acceptancePublicKey);
      this.#hook('after-verify', 'offer-promotion');
      const result = this.#transaction('offer-promotion', () => {
        const now = this.#promotionCurrent(retryKey, request, issuer);
        if (!now.ok) return now;
        if (now.row) return { ok: true as const, value: this.#promotionView(now.row) };
        if (pendingBytes(now.state) !== pendingBytes(before.state)) return refuse('invalid-proof');
        if (
          this.#db
            .prepare(
              "SELECT account_id FROM promotions WHERE state != 'cancelled' AND (workspace_id=? OR lineage_id=?)",
            )
            .get(request.candidate.workspaceId, request.candidate.lineageId)
        )
          return refuse('proof-conflict');
        this.#db
          .prepare(
            "INSERT INTO promotions (account_id,workspace_id,lineage_id,request_digest,request,offer,acceptance_seal,state,result) VALUES (?,?,?,?,?,?,?,'proposed',NULL)",
          )
          .run(
            request.candidate.accountId,
            request.candidate.workspaceId,
            request.candidate.lineageId,
            id,
            JSON.stringify(request),
            JSON.stringify(proposed.offer),
            JSON.stringify(proposed.seal),
          );
        return { ok: true as const, value: proposed.offer };
      });
      return result.ok ? result.value : result;
    } catch {
      return refuse('invalid-proof');
    }
  }
  async finishPromotion(
    input: unknown,
    issuer: PromotionIssuer,
  ): Promise<AdmissionReceipt | { ok: false; refusal: Refusal }> {
    let retryKey: string,
      id: string,
      completion: ReturnType<typeof parseCompletion>,
      request: AdmissionRequest;
    try {
      if (!object(input) || !fields(input, ['retryKey', 'requestDigest', 'completion']))
        return refuse('malformed');
      const raw = canonical(input);
      if (Buffer.byteLength(raw) > ADMISSION_LIMIT) return refuse('malformed');
      const copied = JSON.parse(raw);
      retryKey = copied.retryKey;
      retryHash(retryKey);
      id = copied.requestDigest;
      if (!/^[0-9a-f]{64}$/.test(id)) return refuse('malformed');
      completion = parseCompletion(copied.completion);
      const row = this.#db.prepare('SELECT request FROM promotions WHERE request_digest=?').get(id);
      if (!row) return refuse('unknown-attempt');
      request = parseAdmissionRequest(JSON.parse(row.request as string));
    } catch {
      return refuse('malformed');
    }
    const before = this.#transaction('inspect-admission', () =>
      this.#promotionCurrent(retryKey, request, issuer),
    );
    if (!before.ok) return before;
    if (!before.row) return refuse('unknown-attempt');
    try {
      if ((await requestDigest(request)) !== id) return refuse('invalid-proof');
      await verifyAdmissionRequest(request, before.state);
      const offer = await verifyOffer(JSON.parse(before.row.offer), request, issuer.pin);
      await verifyCompletion(completion, request, offer);
      if (before.row.state === 'admitted') {
        const receipt = parseReceipt(JSON.parse(before.row.result!));
        return same(receipt.completion, completion) ? receipt : refuse('proof-conflict');
      }
      const receipt = await issuer.complete(offer, completion);
      this.#hook('after-verify', 'admit-promotion');
      const result = this.#transaction('admit-promotion', () => {
        const now = this.#promotionCurrent(retryKey, request, issuer);
        if (!now.ok) return now;
        if (!now.row) return refuse('unknown-attempt');
        if (now.row.state === 'admitted') {
          const existing = parseReceipt(JSON.parse(now.row.result!));
          return same(existing.completion, completion)
            ? { ok: true as const, value: existing }
            : refuse('proof-conflict');
        }
        if (
          canonical(now.row) !== canonical(before.row) ||
          pendingBytes(now.state) !== pendingBytes(before.state)
        )
          return refuse('proof-conflict');
        this.#db
          .prepare("UPDATE promotions SET state='admitted',result=? WHERE account_id=?")
          .run(JSON.stringify(receipt), request.candidate.accountId);
        this.#db
          .prepare("UPDATE accounts SET state='active' WHERE id=?")
          .run(request.candidate.accountId);
        return { ok: true as const, value: receipt };
      });
      return result.ok ? result.value : result;
    } catch {
      return refuse('invalid-proof');
    }
  }

  /** Fixed public binding for the admitted creating account; no caller-supplied key. */
  async promotionBinding(
    input: unknown,
    issuer: PromotionIssuer,
  ): Promise<BindingProof | { ok: false; refusal: Refusal }> {
    let retryKey: string, id: string;
    try {
      if (!object(input) || !fields(input, ['retryKey', 'requestDigest']))
        return refuse('malformed');
      retryKey = input.retryKey as string;
      retryHash(retryKey);
      id = input.requestDigest as string;
      if (typeof id !== 'string' || !/^[0-9a-f]{64}$/.test(id)) return refuse('malformed');
    } catch {
      return refuse('malformed');
    }
    const current = () => {
      const row = this.#db
        .prepare('SELECT * FROM promotions WHERE request_digest=?')
        .get(id) as unknown as PromotionRow | undefined;
      if (!row || row.state !== 'admitted') return refuse('account-not-pending');
      const request = parseAdmissionRequest(JSON.parse(row.request));
      const state = this.#promotionCurrent(retryKey, request, issuer);
      const account = this.#db.prepare('SELECT state FROM accounts WHERE id=?').get(row.account_id);
      if (!state.ok || account?.state !== 'active') return refuse('account-not-pending');
      const credential = this.#db
        .prepare("SELECT * FROM credentials WHERE account_id=? AND state='confirmed'")
        .get(row.account_id) as unknown as StoredCredential;
      validateCredentialKey(credential);
      const receipt = parseReceipt(JSON.parse(row.result!));
      return { ok: true as const, row, request, receipt, credential };
    };
    const before = this.#transaction('inspect-slot-binding', current);
    if (!before.ok) return before;
    try {
      await verifyReceipt(before.receipt, before.request, issuer.pin);
      if ((await requestDigest(before.request)) !== id) return refuse('invalid-proof');
      const proof = parseBindingProof({
        v: 1,
        kind: 'promotion-slot-binding',
        requestDigest: id,
        epochHead: before.receipt.offer.head,
        stored: {
          binding: {
            v: 1,
            accountId: before.row.account_id,
            principalId: before.request.candidate.principalId,
            rpId: this.#policy.rpId,
            epoch: 1,
            credId: before.credential.id,
            publicKey: before.credential.spki,
          },
          bindingSignature: '00'.repeat(64),
        },
      });
      proof.stored.bindingSignature = await issuer.bind(proof.stored.binding);
      this.#hook('after-verify', 'slot-binding');
      const final = this.#transaction('slot-binding', () => {
        const now = current();
        if (!now.ok) return now;
        if (
          canonical(now.row) !== canonical(before.row) ||
          canonical(now.credential) !== canonical(before.credential)
        )
          return refuse('proof-conflict');
        return { ok: true as const, value: proof };
      });
      return final.ok ? final.value : final;
    } catch {
      return refuse('invalid-proof');
    }
  }

  /** Current state only; old recovery receipts cannot authorize new preparation. Abandonment
   * permanently cancels this pending registration, retaining its audit/proof rows. */
  pendingPreparation(
    input: unknown,
    abandon = false,
  ): { ok: true; state: PendingState } | { ok: false; refusal: Refusal } {
    if (!object(input) || !fields(input, ['retryKey', 'accountId'])) return refuse('malformed');
    try {
      retryHash(input.retryKey);
      bytes(input.accountId, 32, 32);
    } catch {
      return refuse('malformed');
    }
    return this.#transaction(abandon ? 'abandon-preparation' : 'inspect-preparation', () => {
      const attempt = this.#attempt(input.retryKey);
      if (!attempt || attempt.mode !== 'register' || attempt.account_id !== input.accountId)
        return refuse('unknown-attempt');
      if (
        this.#db.prepare('SELECT state FROM accounts WHERE id=?').get(attempt.account_id)?.state !==
        'pending'
      )
        return refuse('account-not-pending');
      const row = this.#recovery(attempt);
      if (!abandon && (!this.#pendingCredential(attempt) || row?.state !== 'done' || !row.result))
        return refuse('account-not-pending');
      const receipt = row?.result ? JSON.parse(row.result) : null;
      const state = parsePendingState({
        v: 1,
        accountId: attempt.account_id,
        attemptId: attempt.id,
        status: abandon ? 'abandoned' : 'eligible',
        draft: row ? JSON.parse(row.draft) : null,
        confirmation: receipt
          ? {
              recoveryId: receipt.recoveryId,
              draftDigest: receipt.draftDigest,
              recoveryStateDigest: receipt.recoveryStateDigest,
              receiptId: receipt.receiptId,
            }
          : null,
      });
      if (abandon) {
        this.#db
          .prepare(
            "UPDATE promotions SET state='cancelled' WHERE account_id=? AND state='proposed'",
          )
          .run(attempt.account_id);
        this.#db.prepare("UPDATE attempts SET state='cancelled' WHERE id=?").run(attempt.id);
        if (row) this.#db.prepare("UPDATE recovery SET state='cancelled' WHERE id=?").run(row.id);
      }
      return { ok: true, state };
    });
  }

  abandonPreparation(input: unknown) {
    return this.pendingPreparation(input, true);
  }

  #recovery(attempt: Attempt): RecoveryRow | undefined {
    return this.#db
      .prepare('SELECT * FROM recovery WHERE attempt_id=?')
      .get(attempt.id) as unknown as RecoveryRow | undefined;
  }
  #pendingCredential(attempt: Attempt): StoredCredential | undefined {
    if (
      attempt.mode !== 'register' ||
      attempt.state !== 'done' ||
      this.#db.prepare('SELECT state FROM accounts WHERE id=?').get(attempt.account_id)?.state !==
        'pending'
    )
      return;
    return this.#db
      .prepare("SELECT * FROM credentials WHERE account_id=? AND state='confirmed'")
      .get(attempt.account_id) as unknown as StoredCredential | undefined;
  }
  #recoveryView(row: RecoveryRow, credentialId: string): RecoveryResult {
    if (row.state === 'cancelled') return refuse('cancelled');
    if (row.state === 'expired') return refuse('expired');
    if (row.result) return JSON.parse(row.result) as RecoveryResult;
    if (this.#now() >= row.expires) {
      this.#db.prepare("UPDATE recovery SET state='expired' WHERE id=?").run(row.id);
      return refuse('expired');
    }
    return {
      ok: true,
      stage: 'recovery-ceremony',
      recoveryId: row.id,
      accountId: row.account_id,
      draftDigest: row.digest,
      expiresAt: row.expires,
      options: {
        challenge: row.challenge,
        rpId: this.#policy.rpId,
        timeout: CEREMONY_LIFETIME_MS,
        userVerification: 'required',
        allowCredentials: [{ type: 'public-key', id: credentialId }],
      },
    };
  }
  async beginRecovery(input: unknown): Promise<RecoveryResult> {
    if (!object(input) || !fields(input, ['retryKey', 'draft'])) return refuse('malformed');
    let retryKey: string, draft: ReturnType<typeof parseDraft>, digest: string;
    try {
      retryHash(input.retryKey);
      retryKey = input.retryKey as string;
      draft = parseDraft(input.draft);
      if ((await rootCommitment(draft)) !== draft.rootCommitment) return refuse('malformed');
      digest = await draftDigest(draft);
    } catch {
      return refuse('malformed');
    }
    return this.#transaction<RecoveryResult>('begin-recovery', () => {
      const attempt = this.#attempt(retryKey);
      if (!attempt) return refuse('unknown-attempt');
      const prior = this.#recovery(attempt);
      if (prior && (prior.digest !== digest || prior.draft !== canonical(draft)))
        return refuse('recovery-conflict');
      const credential = this.#pendingCredential(attempt);
      // Completed results are historical receipts. Promotion must recheck current eligibility.
      if (prior?.result) return JSON.parse(prior.result) as RecoveryResult;
      if (!credential) return refuse('account-not-pending');
      if (prior) return this.#recoveryView(prior, credential.id);
      const id = fresh();
      this.#db
        .prepare("INSERT INTO recovery VALUES (?,?,?,?,?,?,?,'open',NULL,NULL)")
        .run(
          attempt.account_id!,
          attempt.id,
          id,
          canonical(draft),
          digest,
          recoveryChallenge(
            attempt.id,
            attempt.account_id!,
            id,
            digest,
            this.#policy.rpId,
            this.#policy.origin,
          ),
          this.#now() + CEREMONY_LIFETIME_MS,
        );
      return this.#recoveryView(this.#recovery(attempt)!, credential.id);
    });
  }
  resumeRecovery(input: unknown): RecoveryResult {
    return this.#recoveryAction(input, false);
  }
  cancelRecovery(input: unknown): RecoveryResult {
    return this.#recoveryAction(input, true);
  }
  #recoveryAction(input: unknown, cancel: boolean): RecoveryResult {
    if (!object(input) || !fields(input, ['retryKey'])) return refuse('malformed');
    try {
      retryHash(input.retryKey);
    } catch {
      return refuse('malformed');
    }
    return this.#transaction<RecoveryResult>(cancel ? 'cancel-recovery' : 'resume-recovery', () => {
      const attempt = this.#attempt(input.retryKey);
      const row = attempt && this.#recovery(attempt);
      if (!row) return refuse('unknown-attempt');
      if (row.result)
        return cancel ? refuse('already-finished') : (JSON.parse(row.result) as RecoveryResult);
      if (cancel) {
        this.#db.prepare("UPDATE recovery SET state='cancelled' WHERE id=?").run(row.id);
        return { ok: true, stage: 'recovery-cancelled', recoveryId: row.id };
      }
      const credential = this.#pendingCredential(attempt!);
      return credential ? this.#recoveryView(row, credential.id) : refuse('account-not-pending');
    });
  }
  async finishRecovery(input: unknown): Promise<RecoveryResult> {
    if (!object(input) || !fields(input, ['retryKey', 'recoveryId', 'response', 'recoveryProof']))
      return refuse('malformed');
    let request: typeof input, proofHash: string;
    try {
      const raw = canonical(input);
      if (Buffer.byteLength(raw) > 131072) return refuse('malformed');
      request = JSON.parse(raw);
      retryHash(request.retryKey);
      bytes(request.recoveryId, 32, 32);
      proofHash = hash(canonical([request.response, request.recoveryProof]));
    } catch {
      return refuse('malformed');
    }
    let row: RecoveryRow | undefined, credential: StoredCredential | undefined;
    const inspect = (): RecoveryResult => {
      const attempt = this.#attempt(request.retryKey);
      row = attempt && this.#recovery(attempt);
      if (!row || row.id !== request.recoveryId) return refuse('unknown-attempt');
      if (row.result)
        return row.proof_hash === proofHash
          ? (JSON.parse(row.result) as RecoveryResult)
          : refuse('proof-conflict');
      credential = this.#pendingCredential(attempt!);
      return credential ? this.#recoveryView(row, credential.id) : refuse('account-not-pending');
    };
    const checked = this.#transaction<RecoveryResult>('inspect-recovery', inspect);
    if (!checked.ok || checked.stage !== 'recovery-ceremony') return checked;
    const snapshot = { row: row!, credential: credential! };
    let counter: number, stateDigest: string;
    try {
      const draft = parseDraft(JSON.parse(snapshot.row.draft));
      await verifyRecoveryProof(
        draft.bootstrapSigner,
        snapshot.row.challenge,
        snapshot.row.digest,
        request.recoveryProof,
      );
      counter = await assertion(
        request.response,
        snapshot.row.challenge,
        this.#policy,
        snapshot.credential,
      );
      stateDigest = await recoveryStateDigest(draft);
      this.#hook('after-verify', 'finalize-recovery');
    } catch {
      return refuse('invalid-proof');
    }
    return this.#transaction<RecoveryResult>('finalize-recovery', () => {
      const current = inspect();
      if (!current.ok || current.stage !== 'recovery-ceremony') return current;
      if (
        canonical(credential) !== canonical(snapshot.credential) ||
        canonical(row) !== canonical(snapshot.row)
      )
        return refuse('invalid-proof');
      const result: RecoveryResult = {
        ok: true,
        stage: 'recovery-confirmed',
        recoveryId: row!.id,
        accountId: row!.account_id,
        draftDigest: row!.digest,
        recoveryStateDigest: stateDigest,
        receiptId: fresh(),
      };
      this.#db
        .prepare("UPDATE recovery SET state='done', proof_hash=?, result=? WHERE id=?")
        .run(proofHash, canonical(result), row!.id);
      this.#db.prepare('UPDATE credentials SET counter=? WHERE id=?').run(counter, credential!.id);
      return result;
    });
  }
}
