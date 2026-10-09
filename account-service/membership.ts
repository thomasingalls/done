import { retainedRecoveryCheckpoint } from './recoveryStore.ts';
import { parseRecoverySuccessor } from '../account-protocol/recoveryTransition.ts';
import {
  parseRecoveryCheckpoint,
  recoveryCheckpointDigest,
  RECOVERY_COMMIT_LIMIT,
} from '../account-protocol/recoveryCommit.ts';
import { requireNoRemoval } from './removalStore.ts';
/** Serial continuation admission against the full verified current membership and publisher history. */
import type { DatabaseSync } from 'node:sqlite';
import { closed, accountIdentifier } from '../account-protocol/preparation.ts';
import { json, same } from '../account-protocol/admission.ts';
import { parseEnrollmentRetry, parseEnrollmentReceipt } from '../account-protocol/enrollment.ts';
import { parseCertificationSuccessor } from '../account-protocol/contentDelivery.ts';
import {
  MEMBERSHIP_CREDENTIAL_LIMIT,
  membershipState,
  parseMembershipAdmission,
  parseMembershipAdmissionEpoch,
  verifyMembershipAnchor,
  verifyMembershipAdmission,
  type MembershipAdmission,
  type MembershipAdmissionEpoch,
} from '../account-protocol/membership.ts';
import {
  snapshot,
  snapshotBytes,
  verifyCurrentWorkspaceAuthority,
  selectPublisher,
  census,
  type Snapshot,
  type DeliveryIssuer,
} from './delivery.ts';
import { enrollmentSnapshot, verifyEnrollmentRow, type EnrollmentRow } from './enrollment.ts';
import { membershipEnabled } from './membershipStore.ts';
import { parseWitness, type DeliveryWitness } from './deliveryWitness.ts';
import { retryHash } from './protocol.ts';
import { rethrowAuthorization } from './authorization.ts';
import { historyMembership } from '../account-protocol/admissionHistory.ts';
import { membershipProofChain } from './membershipLocator.ts';
import { parseMembershipChain } from '../account-protocol/membershipLocator.ts';
import { membershipCheckpointRow, retainedCheckpoint } from './membershipCheckpoint.ts';
import { verifyContentCheckpoint } from '../account-protocol/contentCheckpoint.ts';
import {
  causeCode,
  reportDiagnostic,
  type DiagnosticSink,
} from '../account-protocol/diagnostics.ts';

export interface MembershipIssuer extends DeliveryIssuer {
  admission(epoch: MembershipAdmissionEpoch): Promise<MembershipAdmission>;
}
type Hook = (point: 'after-verify' | 'before-commit' | 'after-commit', operation: string) => void;
const no = (refusal: string) => ({ ok: false as const, refusal });
export async function admitMembership(
  db: DatabaseSync,
  input: unknown,
  issuer: MembershipIssuer,
  now: () => number,
  hook: Hook,
  diagnostics?: DiagnosticSink,
) {
  if (!membershipEnabled(db)) return no('unavailable');
  let request;
  try {
    if (json(input).length > 4096) return no('malformed');
    const r = closed(input, ['retryKey', 'attemptId', 'receiptId']);
    request = {
      ...parseEnrollmentRetry({ retryKey: r['retryKey'] }),
      attemptId: accountIdentifier(r['attemptId']),
      receiptId: accountIdentifier(r['receiptId']),
    };
  } catch {
    return no('malformed');
  }
  const capture = () => {
    const row = db
      .prepare('SELECT * FROM enrollment_preparations WHERE retry_hash=?')
      .get(retryHash(request.retryKey)) as unknown as EnrollmentRow | undefined;
    const root = row ? snapshot(db, row.workspace_id) : null;
    const cert = root?.transfer?.artifact
      ? parseCertificationSuccessor(JSON.parse(root.transfer.artifact))
      : null;
    const snapshots =
      root && row
        ? [
            ...new Set([
              JSON.parse(root.promotion.request).candidate.signer,
              ...(cert?.epoch.roster.map((m) => m.id) ?? []),
              ...(root.recoveries ?? []).map(
                (r) =>
                  parseRecoverySuccessor(JSON.parse(r.artifact)).epoch.intent.bootstrap
                    .newCredentialId,
              ),
              ...(root?.continuations ?? []).map(
                (r) =>
                  parseMembershipAdmission(JSON.parse(r.artifact)).epoch.preparation.context
                    .candidate.credentialId,
              ),
            ]),
          ]
            .sort()
            .map((id) => snapshot(db, row.workspace_id, id))
        : [];
    return {
      recoveryCheckpoint: root?.recoveries?.length
        ? retainedRecoveryCheckpoint(db, row!.workspace_id, root.recoveries.at(-1)!.head)
        : undefined,
      row,
      root,
      cert,
      snapshots,
      checkpoint: row ? membershipCheckpointRow(db, row.workspace_id) : null,
      authorityToken: row ? enrollmentSnapshot(db, row.workspace_id)?.token : undefined,
    };
  };
  const bytes = (s: ReturnType<typeof capture>) =>
    JSON.stringify([
      s.row,
      s.cert,
      snapshotBytes(s.root),
      s.snapshots.map(snapshotBytes),
      s.authorityToken,
      s.checkpoint,
      s.recoveryCheckpoint,
    ]);
  for (let retry = 0; retry < 4; retry++) {
    let phase: 'storage' | 'verify' | 'commit' = 'storage';
    try {
      db.exec('BEGIN');
      const before = capture();
      db.exec('COMMIT');
      const { row, root, cert, snapshots } = before;
      phase = 'verify';
      if (!row) return no('unknown-attempt');
      if (row.id !== request.attemptId) return no('request-conflict');
      await verifyEnrollmentRow(row, issuer);
      if (!row.receipt || row.stage !== 'prepared') return no('not-prepared');
      const preparation = parseEnrollmentReceipt(JSON.parse(row.receipt));
      if (preparation.receiptId !== request.receiptId) return no('request-conflict');
      if (preparation.v !== 2 || !root) return no('unavailable');
      const records = root.continuations ?? [];
      const auth = await verifyCurrentWorkspaceAuthority(root, issuer);
      const base = { pin: issuer.pin, request: auth.request, receipt: auth.receipt };
      // Recovery carries its own authenticated baseline; it cannot borrow the old epoch-three checkpoint.
      if (root.recoveries?.length) {
        const recovery = parseRecoverySuccessor(JSON.parse(root.recoveries.at(-1)!.artifact));
        if (
          !before.recoveryCheckpoint ||
          Buffer.byteLength(before.recoveryCheckpoint) > RECOVERY_COMMIT_LIMIT
        )
          return no('checkpoint-required');
        if (
          (await recoveryCheckpointDigest(
            parseRecoveryCheckpoint(JSON.parse(before.recoveryCheckpoint)),
          )) !== recovery.epoch.intent.checkpointDigest
        )
          throw Error('Recovery baseline changed');
      } else {
        if (!before.checkpoint) return no('checkpoint-required');
        if (!auth.successor || !cert) return no('unavailable');
        await verifyContentCheckpoint(retainedCheckpoint(before.checkpoint), {
          base,
          successor: auth.successor,
          certification: cert,
        });
      }
      const parent = auth.history
        ? historyMembership(auth.history)
        : cert
          ? await verifyMembershipAnchor(base, auth.successor, cert, { epoch: 3, head: cert.head })
          : null;
      if (!parent) return no('unavailable');
      const current = membershipState(parent);
      const retained = records.find((r) => r.preparation_id === row.id);
      let result = retained ? parseMembershipAdmission(JSON.parse(retained.artifact)) : undefined;
      if (result && !same(result.epoch.preparation, preparation)) return no('request-conflict');
      if (snapshots.some((s) => !s)) throw Error('Missing publisher snapshot');
      // Authenticate historical as well as current publishers. A removed publisher's final ledger
      // must not disappear just because the next admission no longer includes it in the roster.
      const ledgers = [];
      for (const source of snapshots as Snapshot[]) {
        const id = source.publisher ?? auth.credential;
        const known = (auth.historicalMembers ?? auth.members).some((m) => m.id === id);
        const raw = source.publisher ? source.publisherWitness : source.promotion.delivery_witness;
        if (!known) {
          if (source.rows.length || raw) throw Error('Uncertified publisher has a ledger');
          continue;
        }
        const publisher = selectPublisher(auth, source.publisher);
        const ledger = await census(source, publisher);
        if (current.roster.some((m) => m.id === id && m.state === 'certified'))
          ledgers.push({ publisher, ledger, raw });
      }
      const boundaries: { credentialId: string; witness: DeliveryWitness | null }[] = [];
      const replacements: { credentialId: string; witness: DeliveryWitness | null }[] = [];
      if (!result) {
        // Reserve room for this admission and its certification/cancellation before admitting.
        if (membershipProofChain(root).continuations.length + 2 > 2 * MEMBERSHIP_CREDENTIAL_LIMIT)
          return no('capacity');
        if (row.authority_hash !== before.authorityToken) return no('stale');
        if (current.roster.some((m) => m.state === 'pending')) return no('connection-in-progress');
        if (
          preparation.context.candidate.head !== current.head ||
          preparation.context.epoch !== current.epoch
        )
          return no('stale');
        if (now() >= preparation.expiresAt) return no('expired');
        for (const { publisher, raw } of ledgers)
          boundaries.push({
            credentialId: publisher.credential,
            witness: raw ? parseWitness(JSON.parse(raw)) : null,
          });
        const c = preparation.context.candidate;
        const roster = [
          ...current.roster,
          {
            id: c.credentialId,
            wPub: c.wPub,
            sPub: c.sPub,
            principalId: current.principalId,
            state: 'pending' as const,
            capabilities: [] as [],
          },
        ].sort((a, b) => (a.id < b.id ? -1 : 1));
        const heads = [
          ...ledgers.map(({ publisher, ledger }) => ({
            credentialId: publisher.credential,
            position: ledger.through,
            link: ledger.previous,
          })),
          { credentialId: c.credentialId, position: 0, link: '00'.repeat(32) },
        ].sort((a, b) => (a.credentialId < b.credentialId ? -1 : 1));
        result = parseMembershipAdmission(
          await issuer.admission(
            parseMembershipAdmissionEpoch({
              v: 2,
              kind: 'membership-admission-epoch',
              workspaceId: current.workspaceId,
              lineageId: current.lineageId,
              epoch: current.epoch + 1,
              parent: current.head,
              generation: current.generation,
              acceptancePublicKey: current.acceptancePublicKey,
              preparation,
              certifiedSetDigest: current.certifiedSetDigest,
              roster: structuredClone(roster),
              heads,
            }),
          ),
        );
        await verifyMembershipAdmission(result, parent);
        const chain = membershipProofChain(root);
        parseMembershipChain({ ...chain, continuations: [...chain.continuations, result] });
        for (const { publisher, ledger } of ledgers)
          replacements.push({
            credentialId: publisher.credential,
            witness: ledger.count
              ? issuer.witness(
                  auth.seal,
                  root.promotion.request_digest,
                  current.acceptancePublicKey,
                  { ...publisher.scope, head: result.head },
                  { events: ledger.count, hash: ledger.commitment },
                )
              : null,
          });
      }
      hook('after-verify', 'admit-membership');
      phase = 'commit';
      db.exec('BEGIN IMMEDIATE');
      if (bytes(capture()) !== bytes(before)) {
        db.exec('ROLLBACK');
        continue;
      }
      const newlyAdmitted = !records.some((r) => r.preparation_id === row.id);
      if (newlyAdmitted && now() >= preparation.expiresAt) {
        db.exec('ROLLBACK');
        return no('expired');
      }
      issuer.check(auth.seal, root.promotion.request_digest, current.acceptancePublicKey);
      const complete = issuer.authorize?.(db, {
        kind: 'enrollment',
        workspaceId: row.workspace_id,
        credentialId: row.credential_id,
        attemptId: row.id,
        action: 'admit',
      });
      if (newlyAdmitted) requireNoRemoval(db, row.workspace_id);
      if (newlyAdmitted) {
        db.prepare('INSERT INTO membership_admissions VALUES (?,?,?,?,?,?,?)').run(
          row.workspace_id,
          result.epoch.epoch,
          result.epoch.parent,
          result.head,
          row.id,
          JSON.stringify(result),
          JSON.stringify(boundaries),
        );
        const first = replacements.find((r) => r.credentialId === auth.credential);
        if (first)
          db.prepare(
            'UPDATE promotions SET successor_head=?,delivery_witness=? WHERE account_id=?',
          ).run(result.head, first.witness ? JSON.stringify(first.witness) : null, root.account.id);
        else
          db.prepare('UPDATE promotions SET successor_head=? WHERE account_id=?').run(
            result.head,
            root.account.id,
          );
        for (const r of replacements)
          if (r.credentialId !== auth.credential && r.witness)
            db.prepare(
              'INSERT INTO publisher_witnesses VALUES (?,?,?) ON CONFLICT(account_id,credential_id) DO UPDATE SET witness=excluded.witness',
            ).run(root.account.id, r.credentialId, JSON.stringify(r.witness));
      }
      hook('before-commit', 'admit-membership');
      if (newlyAdmitted && now() >= preparation.expiresAt)
        throw Error('Preparation expired before commit');
      issuer.check(auth.seal, root.promotion.request_digest, current.acceptancePublicKey);
      complete?.();
      db.exec('COMMIT');
      hook('after-commit', 'admit-membership');
      return result;
    } catch (cause) {
      if (db.isTransaction) db.exec('ROLLBACK');
      rethrowAuthorization(cause);
      reportDiagnostic(diagnostics, { operation: 'successor', phase, code: causeCode(cause) });
      return no(phase === 'verify' ? 'unavailable' : 'storage-unavailable');
    }
  }
  return no('state-changed');
}
