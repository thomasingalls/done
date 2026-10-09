import { RECOVERY_SUCCESSOR_SCHEMA } from './recoveryStore.ts';
import {
  LostDeviceRecovery,
  LOST_RECOVERY_SCHEMA,
  type LostRecoveryIssuer,
  type LostRecoveryOperation,
} from './lostDeviceRecovery.ts';
import { discoverRemoval, type RemovalDiscoveryIssuer } from './removalDiscovery.ts';
import { commitRotation, type RotationIssuer } from './rotation.ts';
import { REMOVAL_SCHEMA, ROTATION_SCHEMA } from './removalStore.ts';
import { prepareRemoval, type RemovalIssuer } from './removalPreparation.ts';
import {
  membershipBootstrap,
  discoverMembership,
  type MembershipLocatorIssuer,
} from './membershipLocator.ts';
import { ScopedGrants } from './grants.ts';
import {
  MEMBERSHIP_SCHEMA,
  MEMBERSHIP_CEREMONY_SCHEMA,
  MEMBERSHIP_TRANSFER_SCHEMA,
  MEMBERSHIP_CANCELLATION_SCHEMA,
  enableMembershipStore,
  membershipEnabled,
} from './membershipStore.ts';
import { admitMembership, type MembershipIssuer } from './membership.ts';
import { cancelMembership, type MembershipCancellationIssuer } from './membershipCancellation.ts';
import { transferMembership, type MembershipTransferIssuer } from './membershipTransfer.ts';
import { exchangeCheckpoint, CONTENT_CHECKPOINT_SCHEMA } from './contentCheckpoint.ts';
import { readMembershipCheckpoint } from './membershipCheckpoint.ts';
import {
  exchangeReplacementCheckpoint,
  REPLACEMENT_CHECKPOINT_SCHEMA,
} from './replacementCheckpoint.ts';
import {
  CEREMONY_SCHEMA,
  ceremonyBootstrap,
  relayCeremony,
  type CeremonyIssuer,
} from './ceremony.ts';
import {
  CONTENT_TRANSFER_SCHEMA,
  transferContent,
  type ContentTransferIssuer,
} from './contentTransfer.ts';
import { discoverAuthority, type DiscoveryIssuer } from './discovery.ts';
import { admitPrepared, type SuccessorIssuer } from './successor.ts';
import {
  EnrollmentPreparation,
  ENROLLMENT_SCHEMA,
  type EnrollmentIssuer,
  type EnrollmentOperation,
} from './enrollment.ts';
import { createDiagnostics, causeCode } from '../account-protocol/diagnostics.ts';
import { createDeliveryVerification } from './deliveryVerification.ts';
import { randomBytes } from 'node:crypto';
import {
  AccountSessions,
  SESSION_SCHEMA,
  SESSION_UNLOCK_SCHEMA,
  SESSION_ENROLLMENT_SCHEMA,
} from './sessions.ts';
import type { SessionConfiguration } from './session-custody.ts';
import {
  ACTIVATION_LIFETIME_MS,
  activationNonce,
  activationMessage,
  requireActivationTarget,
  parseRetainedActivation,
  type ActivationChallenge,
} from '../account-protocol/activation.ts';
import {
  PUBLISHER_SCHEMA,
  decideSubmission,
  readAccepted,
  readInbound,
  type InboundReadIssuer,
  type ReadIssuer,
  type DeliveryIssuer,
} from './delivery.ts';
import { parseBindingProof, type BindingProof } from '../account-protocol/slot.ts';
import {
  parseAdmissionRequest,
  requestDigest,
  verifyAdmissionRequest,
  verifyOffer,
  verifyCompletion,
  verifyReceipt,
  verifySignature,
  activationTarget,
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
  activation: string | null;
  state: 'proposed' | 'admitted' | 'cancelled';
  result: string | null;
}
type Hook = (point: 'before-commit' | 'after-commit' | 'after-verify', operation: string) => void;

/** Private account and first-admission transactions. No plaintext content or relay. */
export class AccountCore {
  #db: DatabaseSync;
  #deliveryVerification = createDeliveryVerification();
  #diagnostics = createDiagnostics();
  get diagnostics() {
    return this.#diagnostics.read();
  }
  #policy: Policy;
  #now: () => number;
  #hook: Hook;
  #sessions?: AccountSessions;
  #grants?: ScopedGrants;
  get grants(): ScopedGrants {
    if (!this.#grants) throw Error('Scoped grants are not configured');
    return this.#grants;
  }
  get sessions(): AccountSessions {
    if (!this.#sessions) throw Error('Account sessions are not configured');
    return this.#sessions;
  }

  constructor(
    path: string,
    policy: Policy,
    instrumentation: {
      now?: () => number;
      hook?: Hook;
      upgradeFromV1?: boolean;
      upgradeFromV2?: boolean;
      upgradeFromV3?: boolean;
      upgradeFromV4?: boolean;
      upgradeFromV5?: boolean;
      upgradeFromV6?: boolean;
      upgradeFromV7?: boolean;
      upgradeFromV8?: boolean;
      upgradeFromV9?: boolean;
      upgradeFromV10?: boolean;
      upgradeFromV11?: boolean;
      upgradeFromV12?: boolean;
      upgradeFromV13?: boolean;
      upgradeFromV14?: boolean;
      upgradeFromV15?: boolean;
      upgradeFromV16?: boolean;
      upgradeFromV17?: boolean;
      upgradeFromV18?: boolean;
      upgradeFromV19?: boolean;
      upgradeFromV20?: boolean;
      upgradeFromV21?: boolean;
      upgradeFromV22?: boolean;
      /** Private integration gate; default hosts must not expose continuation routes. */
      membershipContinuation?: boolean;
      sessions?: SessionConfiguration;
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
      if (instrumentation.membershipContinuation && !instrumentation.sessions)
        throw Error('Membership continuation requires the session owner');
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
        version !== 11 &&
        !(version === 23 && instrumentation.sessions && instrumentation.membershipContinuation) &&
        !(
          version === 22 &&
          instrumentation.sessions &&
          instrumentation.membershipContinuation &&
          instrumentation.upgradeFromV22
        ) &&
        !(
          version === 21 &&
          instrumentation.sessions &&
          instrumentation.membershipContinuation &&
          instrumentation.upgradeFromV21
        ) &&
        !(
          version === 20 &&
          instrumentation.sessions &&
          instrumentation.membershipContinuation &&
          instrumentation.upgradeFromV20
        ) &&
        !(
          version === 19 &&
          instrumentation.sessions &&
          instrumentation.membershipContinuation &&
          instrumentation.upgradeFromV19
        ) &&
        !(
          version === 18 &&
          instrumentation.sessions &&
          instrumentation.membershipContinuation &&
          instrumentation.upgradeFromV18
        ) &&
        !(
          version === 17 &&
          instrumentation.sessions &&
          instrumentation.membershipContinuation &&
          instrumentation.upgradeFromV17
        ) &&
        !(
          version === 16 &&
          instrumentation.sessions &&
          instrumentation.membershipContinuation &&
          instrumentation.upgradeFromV16
        ) &&
        !(
          version === 15 &&
          instrumentation.sessions &&
          instrumentation.membershipContinuation &&
          instrumentation.upgradeFromV15
        ) &&
        !(
          version === 14 &&
          instrumentation.sessions &&
          (!instrumentation.membershipContinuation || instrumentation.upgradeFromV14)
        ) &&
        !(version === 13 && instrumentation.sessions && instrumentation.upgradeFromV13) &&
        !(version === 12 && instrumentation.sessions && instrumentation.upgradeFromV12) &&
        !(version === 10 && instrumentation.upgradeFromV10) &&
        !(version === 9 && instrumentation.upgradeFromV9) &&
        !(version === 8 && instrumentation.upgradeFromV8) &&
        !(version === 7 && instrumentation.upgradeFromV7) &&
        !(version === 6 && instrumentation.upgradeFromV6) &&
        !(version === 5 && instrumentation.upgradeFromV5) &&
        !(version === 4 && instrumentation.upgradeFromV4) &&
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
      if (version < 5)
        this.#db.exec('ALTER TABLE promotions ADD COLUMN activation TEXT; PRAGMA user_version=5;');
      if (version < 6) {
        this.#db.exec(ENROLLMENT_SCHEMA);
        this.#db.exec('PRAGMA user_version=6;');
      }
      if (version < 7) {
        this.#db.exec(`ALTER TABLE promotions ADD COLUMN successor_head TEXT;
          CREATE TABLE workspace_successors (
            workspace_id TEXT PRIMARY KEY, preparation_id TEXT UNIQUE NOT NULL,
            artifact TEXT NOT NULL, boundary_witness TEXT);
          PRAGMA user_version=7;`);
      }
      if (version < 8) {
        this.#db.exec(CEREMONY_SCHEMA);
        this.#db.exec('PRAGMA user_version=8;');
      }
      if (version < 9) {
        this.#db.exec(CONTENT_TRANSFER_SCHEMA);
        this.#db.exec('PRAGMA user_version=9;');
      }
      if (version < 10) {
        this.#db.exec(CONTENT_CHECKPOINT_SCHEMA);
        this.#db.exec('PRAGMA user_version=10;');
      }
      if (version < 11) {
        this.#db.exec(PUBLISHER_SCHEMA);
        this.#db.exec('PRAGMA user_version=11;');
      }
      if (instrumentation.sessions) {
        if (version !== 0 && version < 12 && !instrumentation.upgradeFromV11)
          throw Error('Sessions require explicit offline upgrade from schema 11');
        if (version < 12) {
          this.#db.exec(SESSION_SCHEMA);
          this.#db.exec('PRAGMA user_version=12;');
        }
        if (version < 13) {
          this.#db.exec(SESSION_UNLOCK_SCHEMA);
          this.#db.exec('PRAGMA user_version=13;');
        }
        if (version < 14) {
          this.#db.exec(SESSION_ENROLLMENT_SCHEMA);
          this.#db.exec('PRAGMA user_version=14;');
        }
        if (instrumentation.membershipContinuation) {
          if (version < 15) {
            this.#db.exec(MEMBERSHIP_SCHEMA);
            this.#db.exec('PRAGMA user_version=15;');
          }
          if (version < 16) {
            this.#db.exec(MEMBERSHIP_CEREMONY_SCHEMA);
            this.#db.exec('PRAGMA user_version=16;');
          }
          if (version < 17) {
            this.#db.exec(MEMBERSHIP_TRANSFER_SCHEMA);
            this.#db.exec('PRAGMA user_version=17;');
          }
          if (version < 18) {
            this.#db.exec(MEMBERSHIP_CANCELLATION_SCHEMA);
            this.#db.exec('PRAGMA user_version=18;');
          }
          if (version < 19) {
            this.#db.exec(REMOVAL_SCHEMA);
            this.#db.exec('PRAGMA user_version=19;');
          }
          if (version < 20) {
            this.#db.exec(ROTATION_SCHEMA);
            this.#db.exec('PRAGMA user_version=20;');
          }
          if (version < 21) {
            this.#db.exec(REPLACEMENT_CHECKPOINT_SCHEMA);
            this.#db.exec('PRAGMA user_version=21;');
          }
          if (version < 22) {
            this.#db.exec(LOST_RECOVERY_SCHEMA);
            this.#db.exec('PRAGMA user_version=22;');
          }
          if (version < 23) {
            // Rebuild together with the referencing tables; preserve every historical row and FK.
            for (const table of [
              'membership_ceremonies',
              'membership_transfers',
              'membership_cancellations',
              'replacement_checkpoints',
            ]) {
              this.#db.exec(
                `CREATE TEMP TABLE upgrade_${table} AS SELECT * FROM ${table}; DROP TABLE ${table};`,
              );
            }
            this.#db.exec(
              `CREATE TEMP TABLE upgrade_membership AS SELECT * FROM membership_admissions; DROP TABLE membership_admissions;`,
            );
            this.#db.exec(MEMBERSHIP_SCHEMA.replace('CHECK(epoch>=4)', 'CHECK(epoch>=3)'));
            this.#db.exec(
              'INSERT INTO membership_admissions SELECT * FROM upgrade_membership; DROP TABLE upgrade_membership;',
            );
            this.#db.exec(
              MEMBERSHIP_CEREMONY_SCHEMA +
                MEMBERSHIP_TRANSFER_SCHEMA +
                MEMBERSHIP_CANCELLATION_SCHEMA +
                REPLACEMENT_CHECKPOINT_SCHEMA,
            );
            for (const table of [
              'membership_ceremonies',
              'membership_transfers',
              'membership_cancellations',
              'replacement_checkpoints',
            ]) {
              this.#db.exec(
                `INSERT INTO ${table} SELECT * FROM upgrade_${table}; DROP TABLE upgrade_${table};`,
              );
            }
            this.#db.exec(RECOVERY_SUCCESSOR_SCHEMA);
            this.#db.exec('PRAGMA user_version=23;');
          }
          enableMembershipStore(this.#db);
        }
        this.#sessions = new AccountSessions(
          this.#db,
          this.#policy,
          instrumentation.sessions,
          this.#now,
          this.#hook,
          version < 12,
        );
        this.#grants = new ScopedGrants(
          this.#db,
          this.#sessions,
          instrumentation.sessions.pin,
          this.#now,
        );
      }
      if (
        this.#db.prepare('SELECT value FROM policy WHERE id=1').get()?.value !==
        canonical(this.#policy)
      )
        throw Error('Account origin/RP policy changed');
      this.#db.exec('COMMIT');
    } catch (error) {
      this.#grants?.close();
      this.#sessions?.close();
      if (this.#db.isTransaction) this.#db.exec('ROLLBACK');
      this.#db.close();
      throw error;
    }
  }

  get membershipContinuationEnabled(): boolean {
    return membershipEnabled(this.#db);
  }
  membershipBootstrap(input: unknown, issuer: MembershipLocatorIssuer) {
    return membershipBootstrap(this.#db, input, issuer);
  }
  discoverMembership(input: unknown, issuer: MembershipLocatorIssuer) {
    return discoverMembership(this.#db, input, issuer, this.#now, this.#hook);
  }
  ceremonyBootstrap(input: unknown, issuer: CeremonyIssuer) {
    return ceremonyBootstrap(this.#db, input, issuer);
  }
  admitMembership(input: unknown, issuer: MembershipIssuer) {
    return admitMembership(
      this.#db,
      input,
      issuer,
      this.#now,
      this.#hook,
      this.#diagnostics.record,
    );
  }
  discoverRemoval(input: unknown, issuer: RemovalDiscoveryIssuer) {
    return discoverRemoval(this.#db, input, issuer, this.#now, this.#hook);
  }
  commitRotation(input: unknown, issuer: RotationIssuer) {
    return commitRotation(this.#db, input, issuer, this.#hook);
  }
  prepareRemoval(input: unknown, issuer: RemovalIssuer) {
    return prepareRemoval(this.#db, input, issuer, this.#hook);
  }
  cancelMembership(input: unknown, issuer: MembershipCancellationIssuer) {
    return cancelMembership(this.#db, input, issuer, this.#hook);
  }
  relayCeremony(input: unknown, issuer: DeliveryIssuer) {
    return relayCeremony(this.#db, input, issuer, this.#now, this.#hook);
  }
  relayMembershipCeremony(input: unknown, issuer: DeliveryIssuer) {
    return relayCeremony(this.#db, input, issuer, this.#now, this.#hook, true);
  }
  transferMembership(input: unknown, issuer: MembershipTransferIssuer) {
    return transferMembership(this.#db, input, issuer, this.#hook);
  }
  transferContent(input: unknown, issuer: ContentTransferIssuer) {
    return transferContent(this.#db, input, issuer, this.#hook);
  }

  discoverAuthority(input: unknown, issuer: DiscoveryIssuer) {
    return discoverAuthority(
      this.#db,
      input,
      issuer,
      this.#now,
      this.#hook,
      this.#deliveryVerification,
      this.#diagnostics.record,
    );
  }

  admitPrepared(input: unknown, issuer: SuccessorIssuer) {
    return admitPrepared(
      this.#db,
      input,
      issuer,
      this.#now,
      this.#hook,
      this.#deliveryVerification,
      this.#diagnostics.record,
    );
  }

  commitRecovery(input: unknown, issuer: LostRecoveryIssuer) {
    return new LostDeviceRecovery(this.#db, this.#policy, issuer, this.#now, this.#hook).commit(
      input,
    );
  }
  readRecovery(input: unknown, issuer: LostRecoveryIssuer) {
    return new LostDeviceRecovery(this.#db, this.#policy, issuer, this.#now, this.#hook).read(
      input,
    );
  }

  lostDeviceRecovery(operation: LostRecoveryOperation, input: unknown, issuer: LostRecoveryIssuer) {
    return new LostDeviceRecovery(this.#db, this.#policy, issuer, this.#now, this.#hook).run(
      operation,
      input,
    );
  }

  enrollment(operation: EnrollmentOperation, input: unknown, issuer: EnrollmentIssuer) {
    return new EnrollmentPreparation(
      this.#db,
      this.#policy,
      issuer,
      this.#now,
      this.#hook,
      this.#diagnostics.record,
      this.#sessions,
    ).run(operation, input);
  }

  /** Private service composition; transport cannot supply an issuer or authenticated membership. */
  readAccepted(input: unknown, issuer: ReadIssuer) {
    return readAccepted(
      this.#db,
      input,
      issuer,
      this.#hook,
      this.#deliveryVerification,
      this.#diagnostics.record,
    );
  }
  exchangeCheckpoint(input: unknown, issuer: DeliveryIssuer) {
    return exchangeCheckpoint(this.#db, input, issuer, this.#hook);
  }
  readMembershipCheckpoint(input: unknown, issuer: DeliveryIssuer) {
    return readMembershipCheckpoint(this.#db, input, issuer, this.#now, this.#hook);
  }
  exchangeReplacementCheckpoint(input: unknown, issuer: DeliveryIssuer) {
    return exchangeReplacementCheckpoint(this.#db, input, issuer, this.#hook);
  }
  readInbound(input: unknown, issuer: InboundReadIssuer) {
    return readInbound(
      this.#db,
      input,
      issuer,
      this.#hook,
      this.#deliveryVerification,
      this.#diagnostics.record,
    );
  }
  decideSubmission(input: unknown, issuer: DeliveryIssuer) {
    return decideSubmission(
      this.#db,
      input,
      issuer,
      this.#hook,
      this.#deliveryVerification,
      this.#diagnostics.record,
    );
  }
  close(): void {
    this.#grants?.close();
    this.#sessions?.close();
    this.#diagnostics.clear();
    this.#deliveryVerification.clear();
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
    } catch (cause) {
      this.#diagnostics.record({
        operation: 'account-transaction',
        phase: 'commit',
        code: causeCode(cause),
      });
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
  ):
    | { ok: true; state: PendingState; credential: StoredCredential; row?: PromotionRow }
    | { ok: false; refusal: Refusal } {
    const attempt = this.#attempt(retryKey),
      accountId = request.candidate.accountId;
    if (!attempt || attempt.mode !== 'register' || attempt.account_id !== accountId)
      return refuse('unknown-attempt');
    const account = this.#db.prepare('SELECT state FROM accounts WHERE id=?').get(accountId);
    const credential = this.#db
      .prepare("SELECT * FROM credentials WHERE account_id=? AND state='confirmed'")
      .get(accountId) as unknown as StoredCredential | undefined;
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
    // A confirmed passkey must be the one in this completed registration, not a supplied member ID.
    const registration = JSON.parse(attempt.result ?? 'null');
    if (
      !registration ||
      registration.ok !== true ||
      registration.stage !== 'credential-confirmed' ||
      registration.attemptId !== attempt.id ||
      registration.accountId !== accountId ||
      registration.credentialId !== credential.id
    )
      return refuse('invalid-proof');
    if (row) {
      if (!same(parseAdmissionRequest(JSON.parse(row.request)), request))
        return refuse('proof-conflict');
      const offer = parseOffer(JSON.parse(row.offer));
      if (row.state === 'admitted') {
        const receipt = this.#promotionView(row) as AdmissionReceipt;
        if (receipt.activation.context.credentialId !== credential.id)
          return refuse('invalid-proof');
      }
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
    return { ok: true, state, credential, ...(row ? { row } : {}) };
  }
  #promotionView(row: PromotionRow): AdmissionOffer | AdmissionReceipt {
    if (row.state !== 'admitted') return parseOffer(JSON.parse(row.offer));
    const receipt = parseReceipt(JSON.parse(row.result!));
    const retained = parseRetainedActivation(JSON.parse(row.activation ?? 'null'));
    if (
      !retained.proofHash ||
      !same(receipt.activation, {
        context: retained.challenge.context,
        proofHash: retained.proofHash,
      })
    )
      throw Error('Activation record changed');
    return receipt;
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
        const result = this.#promotionView(before.row);
        if (result.kind === 'promotion-receipt') await verifyReceipt(result, request, issuer.pin);
        return result;
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
  challengePromotion(input: unknown, issuer: PromotionIssuer) {
    return this.#completePromotion(input, issuer, true);
  }
  finishPromotion(input: unknown, issuer: PromotionIssuer) {
    return this.#completePromotion(input, issuer, false);
  }
  async #completePromotion(
    input: unknown,
    issuer: PromotionIssuer,
    challengeOnly: boolean,
  ): Promise<AdmissionReceipt | ActivationChallenge | { ok: false; refusal: Refusal }> {
    let retryKey: string,
      id: string,
      completion: ReturnType<typeof parseCompletion>,
      request: AdmissionRequest;
    let proof: { nonce: string; response: unknown } | undefined, proofHash: string | undefined;
    try {
      if (
        !object(input) ||
        !fields(
          input,
          challengeOnly
            ? ['retryKey', 'requestDigest', 'completion']
            : ['retryKey', 'requestDigest', 'completion', 'activation'],
        )
      )
        return refuse('malformed');
      const raw = canonical(input);
      if (Buffer.byteLength(raw) > ADMISSION_LIMIT) return refuse('malformed');
      const copied = JSON.parse(raw);
      retryKey = copied.retryKey;
      retryHash(retryKey);
      id = copied.requestDigest;
      if (!/^[0-9a-f]{64}$/.test(id)) return refuse('malformed');
      completion = parseCompletion(copied.completion);
      if (!challengeOnly) {
        if (
          !object(copied.activation) ||
          !fields(copied.activation, ['nonce', 'response']) ||
          typeof copied.activation.nonce !== 'string' ||
          !/^[0-9a-f]{64}$/.test(copied.activation.nonce)
        )
          return refuse('malformed');
        const rawProof = canonical(copied.activation.response);
        if (Buffer.byteLength(rawProof) > 131072) return refuse('malformed');
        proof = { nonce: copied.activation.nonce, response: copied.activation.response };
        proofHash = hash(rawProof);
      }
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
      const target = await activationTarget(request, offer, completion);
      const saved =
        before.row.activation === null
          ? null
          : parseRetainedActivation(JSON.parse(before.row.activation));
      if (saved) {
        requireActivationTarget(saved.challenge.context, target, issuer.pin);
        if (saved.challenge.context.credentialId !== before.credential.id)
          return refuse('invalid-proof');
        await verifySignature(
          issuer.pin.authRoot,
          saved.challenge.signature,
          await activationMessage(saved.challenge.context),
        );
      }
      if (before.row.state === 'admitted') {
        const receipt = await verifyReceipt(JSON.parse(before.row.result!), request, issuer.pin);
        if (
          !same(receipt.completion, completion) ||
          !saved?.proofHash ||
          !same(receipt.activation, {
            context: saved.challenge.context,
            proofHash: saved.proofHash,
          })
        )
          return refuse('proof-conflict');
        return challengeOnly ||
          (proof!.nonce === saved.challenge.context.nonce && proofHash === saved.proofHash)
          ? receipt
          : refuse('proof-conflict');
      }
      if (saved?.proofHash) return refuse('proof-conflict');
      if (challengeOnly) {
        const challenge =
          saved && this.#now() < saved.challenge.context.expiresAt
            ? saved.challenge
            : await issuer.challenge({
                v: 1,
                pin: issuer.pin,
                ...target,
                credentialId: before.credential.id,
                nonce: randomBytes(32).toString('hex'),
                expiresAt: this.#now() + ACTIVATION_LIFETIME_MS,
              });
        const result = this.#transaction('challenge-promotion', () => {
          const now = this.#promotionCurrent(retryKey, request, issuer);
          if (!now.ok) return now;
          if (!now.row || canonical(now.credential) !== canonical(before.credential))
            return refuse('proof-conflict');
          if (now.row.state === 'admitted') {
            const receipt = parseReceipt(JSON.parse(now.row.result!));
            return same(receipt.completion, completion)
              ? { ok: true as const, value: receipt }
              : refuse('proof-conflict');
          }
          if (canonical(now.row) !== canonical(before.row)) {
            const current =
              now.row.activation === null
                ? null
                : parseRetainedActivation(JSON.parse(now.row.activation));
            if (
              current &&
              !current.proofHash &&
              same(
                {
                  ...current.challenge.context,
                  nonce: challenge.context.nonce,
                  expiresAt: challenge.context.expiresAt,
                },
                challenge.context,
              ) &&
              this.#now() < current.challenge.context.expiresAt
            )
              return { ok: true as const, value: current.challenge };
            return refuse('proof-conflict');
          }
          if (this.#now() >= challenge.context.expiresAt) return refuse('expired');
          if (!saved || !same(saved.challenge, challenge))
            this.#db
              .prepare('UPDATE promotions SET activation=? WHERE account_id=?')
              .run(JSON.stringify({ challenge, proofHash: null }), target.accountId);
          return { ok: true as const, value: challenge };
        });
        return result.ok ? result.value : result;
      }
      if (!saved || saved.challenge.context.nonce !== proof!.nonce) return refuse('invalid-proof');
      if (this.#now() >= saved.challenge.context.expiresAt) return refuse('expired');
      const counter = await assertion(
        proof!.response,
        await activationNonce(saved.challenge.context),
        this.#policy,
        before.credential,
      );
      const authorization = { context: saved.challenge.context, proofHash: proofHash! };
      const receipt = await issuer.complete(offer, completion, authorization);
      this.#hook('after-verify', 'admit-promotion');
      const result = this.#transaction('admit-promotion', () => {
        const now = this.#promotionCurrent(retryKey, request, issuer);
        if (!now.ok) return now;
        if (!now.row) return refuse('unknown-attempt');
        if (now.row.state === 'admitted') {
          const existing = parseReceipt(JSON.parse(now.row.result!));
          return same(existing, receipt)
            ? { ok: true as const, value: existing }
            : refuse('proof-conflict');
        }
        if (
          canonical(now.row) !== canonical(before.row) ||
          canonical(now.credential) !== canonical(before.credential) ||
          pendingBytes(now.state) !== pendingBytes(before.state)
        )
          return refuse('proof-conflict');
        // Expiry is checked at the serialized activation boundary, after all asynchronous work.
        if (this.#now() >= saved.challenge.context.expiresAt) return refuse('expired');
        this.#db
          .prepare(
            "UPDATE promotions SET state='admitted',result=?,activation=? WHERE account_id=?",
          )
          .run(JSON.stringify(receipt), JSON.stringify({ ...saved, proofHash }), target.accountId);
        this.#db
          .prepare('UPDATE credentials SET counter=? WHERE id=?')
          .run(Math.max(counter, now.credential.counter), now.credential.id);
        this.#db.prepare("UPDATE accounts SET state='active' WHERE id=?").run(target.accountId);
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
