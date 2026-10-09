import { captureRecoveryHistory, verifyRecoveryHistory } from './recoveryHistory.ts';
import { historySources } from './historySources.ts';
import type { AccountSessions } from './sessions.ts';
import { recoveryCheckpoints, recoveryCheckpoint } from './recoveryCheckpoints.ts';
import type { SlotBinding } from '../account-protocol/slot.ts';
import { retainedRecoveryCheckpoint } from './recoveryStore.ts';
import {
  parseRecoveryCommit,
  recoveryCheckpointDigest,
  type RecoveryCommitResult,
} from '../account-protocol/recoveryCommit.ts';
import {
  parseRecoverySuccessor,
  verifyRecoveryIntent,
  type RecoverySuccessor,
} from '../account-protocol/recoveryTransition.ts';
import {
  historyMembership,
  verifyEarlyHistory,
  extendMembershipHistory,
} from '../account-protocol/admissionHistory.ts';
import { membershipState } from '../account-protocol/membership.ts';
import { parseMembershipChain } from '../account-protocol/membershipLocator.ts';
import { parseWitness } from './deliveryWitness.ts';
import type { AcceptedHead } from '../account-protocol/positionDecision.ts';
import type { DeliveryIssuer, Snapshot } from './delivery.ts';
import {
  parseRecoveryRead,
  parseRecoveryReadPage,
  verifyRecoveryRead,
  RECOVERY_READ_PAGE_LIMIT,
  type RecoveryReadPage,
} from '../account-protocol/recoveryRead.ts';
import { digest, hex } from '../account-protocol/recovery.ts';
import { json } from '../account-protocol/admission.ts';
import { decodeSubmission } from '../account-protocol/submission.ts';
import { read, snapshot, snapshotBytes, selectPublisher, census } from './delivery.ts';
/** Fresh account recovery preparation, reads and an exact atomic membership replacement. */
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
export interface LostRecoveryIssuer extends Pick<DeliveryIssuer, 'pin' | 'check' | 'witness'> {
  bind(binding: SlotBinding): Promise<string>;
  finalize(seal: unknown, id: string, pub: string, value: AcceptedHead): AcceptedHead;
  successor(value: RecoverySuccessor['epoch']): Promise<RecoverySuccessor>;
  challenge(context: LostRecoveryContext): LostRecoveryChallenge;
  head(body: Omit<RecoveryHeadAssertion, 'signature'>): RecoveryHeadAssertion;
  page(body: Omit<RecoveryReadPage, 'signature'>): Promise<RecoveryReadPage>;
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
  private sessions: AccountSessions | undefined;
  constructor(
    db: DatabaseSync,
    policy: Policy,
    issuer: LostRecoveryIssuer,
    now: () => number,
    hook: Hook,
    sessions?: AccountSessions,
  ) {
    this.db = db;
    this.policy = policy;
    this.issuer = issuer;
    this.now = now;
    this.hook = hook;
    this.sessions = sessions;
  }
  private issuance(
    result: import('../account-protocol/session.ts').SessionResult,
  ): import('../account-protocol/session.ts').SessionIssuanceResult {
    if (!result.ok || result.stage === 'issued') return result;
    throw Error('Recovery login is not issued');
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
    const workspace = rows[0]!.workspace_id as string;
    const value = enrollmentSnapshot(this.db, workspace);
    return value
      ? {
          ...value,
          token: hash(
            canonical({
              authority: value.token,
              checkpoints: recoveryCheckpoints(this.db, workspace),
            }),
          ),
        }
      : null;
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
  async commit(input: unknown): Promise<RecoveryCommitResult> {
    if (!membershipEnabled(this.db)) return { ok: false, refusal: 'unavailable' };
    let request;
    try {
      request = parseRecoveryCommit(input);
    } catch {
      return { ok: false, refusal: 'malformed' };
    }
    const no = (
      refusal: import('../account-protocol/lostDeviceRecovery.ts').LostRecoveryRefusal,
    ): RecoveryCommitResult => ({ ok: false, refusal });
    try {
      const { intent, checkpoint } = request,
        workspace = intent.head.workspaceId;
      if ((await recoveryCheckpointDigest(checkpoint)) !== intent.checkpointDigest)
        return no('invalid-proof');
      const requestHash = hash(JSON.stringify(request));
      const saved = this.db
        .prepare(
          'SELECT workspace_id,head,artifact,attempt_id,request_hash FROM recovery_successors WHERE retry_hash=?',
        )
        .get(retryHash(request.retryKey));
      if (saved) {
        if (saved.request_hash !== requestHash || saved.attempt_id !== intent.attemptId)
          return no('request-conflict');
        const root = read(this.db, workspace);
        if (!root) return no('state-changed');
        await verifyCurrentWorkspaceAuthority(root, this.issuer);
        const successor = parseRecoverySuccessor(JSON.parse(saved.artifact as string));
        if (
          !same(successor.epoch.intent, intent) ||
          retainedRecoveryCheckpoint(this.db, workspace, saved.head as string) !==
            JSON.stringify(checkpoint) ||
          !root.recoveries?.some((r) => r.head === successor.head && r.request_hash === requestHash)
        )
          return no('unavailable');
        this.db.exec('BEGIN');
        try {
          if (snapshotBytes(root) !== snapshotBytes(snapshot(this.db, workspace)))
            return no('state-changed');
          return { ok: true, stage: 'committed', successor };
        } finally {
          this.db.exec('ROLLBACK');
        }
      }
      const row = this.row(request.retryKey);
      if (!row || row.id !== intent.attemptId) return no('unknown-attempt');
      if (row.state === 'cancelled') return no('cancelled');
      if (this.now() >= row.expires) return no('expired');
      if (row.state !== 'prepared' || !row.result) return no('invalid-proof');
      const checked = await verifyLostRecoveryPrepared(
        JSON.parse(row.result),
        { ...JSON.parse(row.request), retryKey: request.retryKey },
        this.issuer.pin,
      );
      if (
        row.account_id !== checked.prepared.accountId ||
        row.workspace_id !== workspace ||
        !same(checked.prepared.head, intent.head) ||
        !same(checked.context.candidate, {
          credentialId: intent.bootstrap.newCredentialId,
          wPub: intent.bootstrap.newWPub,
          sPub: intent.bootstrap.newSPub,
        })
      )
        return no('invalid-proof');
      const history =
        checked.history &&
        (checked.prepared.proofs?.certification || checked.prepared.proofs?.continuations.length)
          ? checked.history!
          : await verifyEarlyHistory(
              checked.prepared.base,
              checked.prepared.proofs?.successor ?? null,
            );
      const parent = historyMembership(history),
        p = membershipState(parent);
      await verifyRecoveryIntent(intent, parent, checked.context.recovery);
      // All existing publishers, including finalized historical writers, participate in the CAS.
      this.db.exec('BEGIN');
      let root, before, historyBaseline;
      try {
        root = snapshot(this.db, workspace);
        before = intent.heads.map((h) => snapshot(this.db, workspace, h.credentialId));
        if (!this.eligible(row)) return no('state-changed');
        historyBaseline = captureRecoveryHistory(this.db, workspace);
        if (!root || !same(intent.sources ?? [], historySources(this.db, workspace, root).sources))
          return no('state-changed');
        if (
          (intent.historyCheckpoint ?? '00'.repeat(32)) !==
          (historyBaseline?.catalog.latest ?? '00'.repeat(32))
        )
          return no('state-changed');
      } finally {
        this.db.exec('ROLLBACK');
      }
      if (!root || before.some((s) => !s)) return no('unavailable');
      await verifyRecoveryHistory(historyBaseline, checked.prepared.base, checked.prepared.proofs);
      const auth = await verifyCurrentWorkspaceAuthority(root, this.issuer);
      if (auth.a.head !== p.head || auth.a.tip !== p.epoch || auth.removal)
        return no('state-changed');
      const ledgers = [];
      for (const [i, source] of (before as Snapshot[]).entries()) {
        const publisher = selectPublisher(auth, intent.heads[i]!.credentialId),
          ledger = await census(source, publisher);
        if (
          !same(intent.heads[i], {
            credentialId: publisher.credential,
            position: ledger.through,
            link: ledger.previous,
          })
        )
          return no('state-changed');
        const raw = source.publisher ? source.publisherWitness : source.promotion.delivery_witness;
        ledgers.push({ publisher, ledger, witness: raw ? parseWitness(JSON.parse(raw)) : null });
      }
      const finalizations = p.certificate.members.map((m) => {
        const cut = intent.heads.find((h) => h.credentialId === m.id)!;
        return this.issuer.finalize(
          auth.seal,
          root.promotion.request_digest,
          p.acceptancePublicKey,
          {
            workspace,
            credential: m.id,
            position: cut.position,
            link: cut.link,
            epoch: p.epoch + 1,
            final: true,
            signature: '00'.repeat(64),
          },
        );
      });
      const epoch: RecoverySuccessor['epoch'] = {
        v: 1,
        kind: 'recovery-epoch',
        workspaceId: workspace,
        lineageId: p.lineageId,
        epoch: p.epoch + 1,
        parent: p.head,
        generation: p.generation + 1,
        acceptancePublicKey: p.acceptancePublicKey,
        intent,
        recovery: checked.context.recovery,
        heads: [
          ...intent.heads,
          ...p.roster
            .filter((m) => m.state === 'pending')
            .map((m) => ({ credentialId: m.id, position: 0, link: '00'.repeat(32) })),
          { credentialId: intent.bootstrap.newCredentialId, position: 0, link: '00'.repeat(32) },
        ].sort((a, b) => a.credentialId.localeCompare(b.credentialId)),
        finalizations,
      };
      const successor = parseRecoverySuccessor(await this.issuer.successor(epoch));
      if (!same(successor.epoch, epoch)) throw Error('Recovery issuer changed intent');
      await extendMembershipHistory(successor, history);
      const proofs = checked.prepared.proofs ?? {
        successor: null,
        certification: null,
        continuations: [],
      };
      parseMembershipChain({ ...proofs, continuations: [...proofs.continuations, successor] });
      const closing = ledgers.filter((l) =>
        p.certificate.members.some((m) => m.id === l.publisher.credential),
      );
      const replacements = closing.map(({ publisher, ledger }) => ({
        credentialId: publisher.credential,
        witness: ledger.count
          ? this.issuer.witness(
              auth.seal,
              root.promotion.request_digest,
              p.acceptancePublicKey,
              { ...publisher.scope, head: successor.head },
              { events: ledger.count, hash: ledger.commitment },
            )
          : null,
      }));
      this.hook('after-verify', 'commit-recovery');
      this.db.exec('BEGIN IMMEDIATE');
      const current = this.row(request.retryKey);
      if (
        !current ||
        current.state !== 'prepared' ||
        current.result !== row.result ||
        this.now() >= row.expires ||
        !this.eligible(current) ||
        snapshotBytes(snapshot(this.db, workspace)) !== snapshotBytes(root) ||
        before.some(
          (s, i) =>
            snapshotBytes(s) !==
            snapshotBytes(snapshot(this.db, workspace, intent.heads[i]!.credentialId)),
        )
      ) {
        this.db.exec('ROLLBACK');
        return no('state-changed');
      }
      this.issuer.check(auth.seal, root.promotion.request_digest, p.acceptancePublicKey);
      const checkpointFence = recoveryCheckpoints(this.db, workspace);
      this.db.prepare('INSERT INTO recovery_successors VALUES (?,?,?,?,?,?,?,?,?,?)').run(
        workspace,
        epoch.epoch,
        p.head,
        successor.head,
        JSON.stringify(successor),
        JSON.stringify(
          closing.map(({ publisher, witness }) => ({
            credentialId: publisher.credential,
            witness,
          })),
        ),
        row.id,
        retryHash(request.retryKey),
        requestHash,
        JSON.stringify(checkpoint),
      );
      this.db
        .prepare('UPDATE promotions SET successor_head=? WHERE account_id=?')
        .run(successor.head, row.account_id!);
      for (const r of replacements) {
        if (r.credentialId === auth.request.candidate.signer)
          this.db
            .prepare('UPDATE promotions SET delivery_witness=? WHERE account_id=?')
            .run(r.witness ? JSON.stringify(r.witness) : null, row.account_id!);
        else if (r.witness)
          this.db
            .prepare(
              'INSERT INTO publisher_witnesses VALUES (?,?,?) ON CONFLICT(account_id,credential_id) DO UPDATE SET witness=excluded.witness',
            )
            .run(row.account_id!, r.credentialId, JSON.stringify(r.witness));
      }
      this.hook('before-commit', 'commit-recovery');
      // Recheck the account/passkey at the commit boundary, after the instrumentation hook.
      const live = this.snapshot(row.account_id!);
      if (
        !same(checkpointFence, recoveryCheckpoints(this.db, workspace, successor.head)) ||
        !live ||
        credentialHash(live.credential) !== row.credential_hash ||
        this.now() >= row.expires ||
        this.row(request.retryKey)?.state !== 'prepared' ||
        live.base.promotion.successor_head !== successor.head
      )
        throw Error('Recovery eligibility changed');
      this.issuer.check(auth.seal, root.promotion.request_digest, p.acceptancePublicKey);
      this.db.exec('COMMIT');
      this.hook('after-commit', 'commit-recovery');
      return { ok: true, stage: 'committed', successor };
    } catch {
      if (this.db.isTransaction) this.db.exec('ROLLBACK');
      return no('unavailable');
    }
  }
  async read(input: unknown): Promise<RecoveryReadPage | LostRecoveryResult> {
    if (!membershipEnabled(this.db)) return no('unavailable');
    let request;
    try {
      request = parseRecoveryRead(input);
    } catch {
      return no('malformed');
    }
    try {
      const row = this.row(request.retryKey);
      if (!row || row.id !== request.attemptId) return no('unknown-attempt');
      const terminal = this.terminal(row);
      if (terminal) return terminal;
      if (row.state !== 'prepared' || !row.result) return no('invalid-proof');
      const checked = await verifyLostRecoveryPrepared(
        JSON.parse(row.result),
        { ...JSON.parse(row.request), retryKey: request.retryKey },
        this.issuer.pin,
      );
      if (
        checked.prepared.challenge.context.attemptId !== row.id ||
        !same(checked.prepared.challenge, JSON.parse(row.challenge)) ||
        checked.prepared.accountId !== row.account_id ||
        checked.prepared.head.workspaceId !== row.workspace_id
      )
        return no('unavailable');
      try {
        await verifyRecoveryRead(request, checked.context, row.id);
      } catch {
        return no('invalid-proof');
      }
      if (request.checkpoint || request.history) {
        if (
          request.after !== 0 ||
          request.limit !== 1 ||
          request.publisher !== checked.prepared.base.request.candidate.signer
        )
          return no('invalid-proof');
        const proofs = checked.prepared.proofs;
        const continuation = proofs?.continuations.find((p) => p.head === request.checkpoint);
        const target =
          proofs?.certification?.head === request.checkpoint
            ? { kind: 'original' as const, id: row.workspace_id! }
            : continuation?.kind === 'recovery-successor'
              ? { kind: 'recovery' as const, id: continuation.head }
              : continuation?.kind === 'membership-admission'
                ? {
                    kind: 'replacement' as const,
                    id: continuation.epoch.preparation.context.attemptId,
                  }
                : null;
        if (!target && !request.history) return no('state-changed');
        let raw: string | null = null;
        let history: ReturnType<typeof captureRecoveryHistory> = null;
        this.db.exec('BEGIN');
        try {
          if (!this.eligible(row)) return no('state-changed');
          if (request.history) history = captureRecoveryHistory(this.db, row.workspace_id!);
          else raw = recoveryCheckpoint(this.db, row.workspace_id!, target!.kind, target!.id);
        } finally {
          this.db.exec('ROLLBACK');
        }
        const before = read(this.db, row.workspace_id!);
        if (!before) return no('state-changed');
        const auth = await verifyCurrentWorkspaceAuthority(before, this.issuer);
        if (auth.a.head !== checked.prepared.head.head || auth.removal) return no('state-changed');
        const body: Omit<RecoveryReadPage, 'signature'> = {
          v: 1,
          kind: 'lost-device-recovery-page',
          requestHash: await digest(json(request)),
          through: 0,
          link: '00'.repeat(32),
          next: 0,
          entries: [],
          ...(request.history
            ? {
                history: await verifyRecoveryHistory(
                  history,
                  checked.prepared.base,
                  checked.prepared.proofs,
                ),
              }
            : { checkpoint: raw === null ? null : JSON.parse(raw) }),
        };
        const page = parseRecoveryReadPage(await this.issuer.page(body));
        const { signature: _, ...actual } = page;
        if (!same(actual, body)) throw Error('Recovery checkpoint issuer changed bytes');
        this.hook('after-verify', 'lost-recovery-checkpoint');
        this.db.exec('BEGIN');
        try {
          const current = this.row(request.retryKey);
          if (
            !current ||
            current.result !== row.result ||
            current.state !== 'prepared' ||
            !this.eligible(current) ||
            this.terminal(current)
          )
            return no('state-changed');
          this.issuer.check(auth.seal, before.promotion.request_digest, auth.a.acceptanceKey);
          return page;
        } finally {
          this.db.exec('ROLLBACK');
        }
      }
      for (let retry = 0; retry < 4; retry++) {
        const before = read(this.db, row.workspace_id!, request.publisher);
        if (!before) return no('state-changed');
        const auth = selectPublisher(
          await verifyCurrentWorkspaceAuthority(before, this.issuer),
          request.publisher,
        );
        if (
          auth.a.head !== checked.prepared.head.head ||
          auth.a.tip !== checked.prepared.head.epoch ||
          auth.removal
        )
          return no('state-changed');
        const ledger = await census(before, auth);
        if (request.after > ledger.through) return no('request-conflict');
        const body: Omit<RecoveryReadPage, 'signature'> = {
          v: 1,
          kind: 'lost-device-recovery-page',
          requestHash: await digest(json(request)),
          through: ledger.through,
          link: ledger.previous,
          next: request.after,
          entries: [],
        };
        for (const decision of before.rows) {
          if (decision.kind !== 'accepted' || decision.position <= request.after) continue;
          body.entries.push({
            envelope: hex(decodeSubmission(new Uint8Array(decision.submission)).envelope),
            proof: hex(new Uint8Array(decision.response)),
          });
          body.next++;
          if (json({ ...body, signature: '00'.repeat(64) }).length > RECOVERY_READ_PAGE_LIMIT) {
            body.entries.pop();
            body.next--;
            break;
          }
          if (body.entries.length === request.limit) break;
        }
        if (!body.entries.length && body.next < body.through) return no('unavailable');
        const page = parseRecoveryReadPage(await this.issuer.page(body));
        const { signature: _, ...actual } = page;
        if (!same(actual, body)) throw Error('Recovery page issuer changed bytes');
        this.hook('after-verify', 'lost-recovery-read');
        this.db.exec('BEGIN');
        try {
          const current = this.row(request.retryKey);
          if (!current || current.id !== row.id) return no('unknown-attempt');
          const terminal = this.terminal(current);
          if (terminal) return terminal;
          if (
            current.state !== 'prepared' ||
            current.result !== row.result ||
            !this.eligible(current)
          )
            return no('state-changed');
          if (
            snapshotBytes(before) !==
            snapshotBytes(snapshot(this.db, row.workspace_id!, request.publisher))
          )
            continue;
          this.issuer.check(auth.seal, before.promotion.request_digest, auth.a.acceptanceKey);
          return page;
        } finally {
          this.db.exec('ROLLBACK');
        }
      }
      return no('state-changed');
    } catch {
      if (this.db.isTransaction) this.db.exec('ROLLBACK');
      return no('unavailable');
    }
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
      if (
        this.db
          .prepare('SELECT 1 FROM recovery_successors WHERE retry_hash=?')
          .get(retryHash(request.retryKey))
      )
        return no('state-changed');
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
          this.sessions?.cancelRecovery(
            this.db,
            parseLostRecoveryChallenge(JSON.parse(row.challenge)).context,
          );
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
            ...(body.login
              ? {
                  login: {
                    purpose: 'recovery-and-login-v1' as const,
                    attemptId: fresh(),
                    retryHash: retryHash(retryKey),
                  },
                }
              : {}),
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
          if (context.login) {
            if (!this.sessions) throw Error('Recovery login unavailable');
            this.sessions.createRecovery(this.db, context, retryKey);
          }
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
          const result = this.view(row);
          const context = parseLostRecoveryChallenge(JSON.parse(row.challenge)).context;
          return result.ok &&
            result.stage === 'prepared' &&
            proofHash &&
            context.login &&
            this.sessions
            ? {
                ...result,
                login: this.issuance(
                  this.sessions.recoveryResult(this.db, context, request.retryKey, proofHash),
                ),
              }
            : result;
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
      const binding: SlotBinding = {
        v: 1,
        accountId: credential.account_id,
        principalId: auth.request.candidate.principalId,
        rpId: this.policy.rpId,
        epoch: 1,
        credId: credential.id,
        publicKey: credential.spki,
      };
      const prepared = parseLostRecoveryPrepared(
        await this.issuer.prepared({
          v: 1,
          kind: 'lost-device-recovery-prepared',
          challenge,
          accountId: credential.account_id,
          passkeyId: credential.id,
          binding: {
            v: 1,
            kind: 'promotion-slot-binding',
            requestDigest: auth.receipt.offer.epoch.requestDigest,
            epochHead: auth.receipt.offer.head,
            stored: { binding, bindingSignature: await this.issuer.bind(binding) },
          },
          base: { pin: this.issuer.pin, request: auth.request, receipt: auth.receipt },
          proofs:
            before.base.transfer?.artifact || before.base.recoveries?.length
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
      const reserved = challenge.context.login
        ? this.sessions?.reserveRecovery(challenge.context, request.retryKey, proofHash!)
        : undefined;
      if (
        challenge.context.login &&
        (!reserved || (!('commit' in reserved) && (!reserved.ok || reserved.stage !== 'issued')))
      )
        return no('unavailable');
      let issued = false;
      return this.transaction(
        op,
        () => {
          const row = this.row(request.retryKey);
          if (!row || row.id !== prior.id) return no('unknown-attempt');
          if (row.proof_hash && row.proof_hash !== proofHash) return no('proof-conflict');
          if (row.state !== 'challenge' || this.terminal(row)) {
            const result = this.view(row);
            return result.ok &&
              result.stage === 'prepared' &&
              challenge.context.login &&
              this.sessions
              ? {
                  ...result,
                  login: this.issuance(
                    this.sessions.recoveryResult(
                      this.db,
                      challenge.context,
                      request.retryKey,
                      proofHash!,
                    ),
                  ),
                }
              : result;
          }
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
          if (challenge.context.login && (!reserved || !('commit' in reserved)))
            throw Error('Recovery login reservation changed');
          const login =
            reserved && 'commit' in reserved
              ? reserved.commit(this.db, current.credential)
              : undefined;
          if (login && !login.ok) throw Error('Recovery login commit refused');
          issued = true;
          return { ok: true, stage: 'prepared', prepared, ...(login ? { login } : {}) };
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
