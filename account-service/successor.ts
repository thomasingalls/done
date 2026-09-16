/** Private atomic preparation consumption. The HTTP/application entry point remains disabled. */
import type { DatabaseSync } from 'node:sqlite';
import { closed, accountIdentifier } from '../account-protocol/preparation.ts';
import { parseEnrollmentRetry } from '../account-protocol/enrollment.ts';
import {
  parseSuccessor,
  verifySuccessor,
  type AdmissionSuccessor,
  type AdmissionSuccessorEpoch,
} from '../account-protocol/successor.ts';
import { parseWitness } from './deliveryWitness.ts';
import {
  snapshot,
  snapshotBytes,
  verifyWorkspaceAuthority,
  census,
  type DeliveryIssuer,
} from './delivery.ts';
import {
  enrollmentSnapshot,
  verifyEnrollmentRow,
  type EnrollmentRow,
  type EnrollmentIssuer,
} from './enrollment.ts';
import { retryHash } from './protocol.ts';
import type { DeliveryVerification } from './deliveryVerification.ts';
import {
  causeCode,
  reportDiagnostic,
  type DiagnosticSink,
} from '../account-protocol/diagnostics.ts';

export interface SuccessorIssuer extends DeliveryIssuer, EnrollmentIssuer {
  successor(epoch: AdmissionSuccessorEpoch): Promise<AdmissionSuccessor>;
}
export type SuccessorRefusal =
  | 'malformed'
  | 'unknown-attempt'
  | 'request-conflict'
  | 'not-prepared'
  | 'cancelled'
  | 'expired'
  | 'stale'
  | 'unavailable'
  | 'state-changed'
  | 'storage-unavailable';
export type SuccessorResult = AdmissionSuccessor | { ok: false; refusal: SuccessorRefusal };
const refused = (refusal: SuccessorRefusal): SuccessorResult => ({ ok: false, refusal });
type Hook = (point: 'after-verify' | 'before-commit' | 'after-commit', operation: string) => void;
export async function admitPrepared(
  db: DatabaseSync,
  input: unknown,
  issuer: SuccessorIssuer,
  now: () => number,
  hook: Hook,
  reuse?: DeliveryVerification,
  diagnostics?: DiagnosticSink,
): Promise<SuccessorResult> {
  let request: { retryKey: string; attemptId: string; receiptId: string };
  try {
    if (Buffer.byteLength(JSON.stringify(input)) > 4096) return refused('malformed');
    const r = closed(input, ['retryKey', 'attemptId', 'receiptId']);
    request = {
      ...parseEnrollmentRetry({ retryKey: r['retryKey'] }),
      attemptId: accountIdentifier(r['attemptId']),
      receiptId: accountIdentifier(r['receiptId']),
    };
  } catch {
    return refused('malformed');
  }
  const capture = () => {
    const row = db
      .prepare('SELECT * FROM enrollment_preparations WHERE retry_hash=?')
      .get(retryHash(request.retryKey)) as unknown as EnrollmentRow | undefined;
    return {
      row,
      authority: row ? enrollmentSnapshot(db, row.workspace_id) : null,
      delivery: row ? snapshot(db, row.workspace_id) : null,
    };
  };
  for (let retry = 0; retry < 4; retry++) {
    let phase: 'storage' | 'verify' | 'commit' = 'storage';
    try {
      db.exec('BEGIN');
      const before = capture();
      db.exec('COMMIT');
      const { row, authority, delivery } = before;
      if (!row) return refused('unknown-attempt');
      if (row.id !== request.attemptId) return refused('request-conflict');
      phase = 'verify';
      await verifyEnrollmentRow(row, issuer);
      if (!row.receipt) return refused('not-prepared');
      const preparation = JSON.parse(row.receipt);
      if (preparation.receiptId !== request.receiptId) return refused('request-conflict');
      if (!authority || !delivery) return refused('unavailable');
      const auth = await verifyWorkspaceAuthority(delivery, issuer);
      const ledger = await census(delivery, auth, reuse);
      let result = auth.successor;
      if (result) {
        if (delivery.successor!.preparation_id !== row.id) return refused('stale');
        if (row.stage !== 'prepared' || JSON.stringify(result.epoch.preparation) !== row.receipt)
          return refused('unavailable');
      } else {
        if (row.stage !== 'prepared')
          return refused(
            row.stage === 'challenge'
              ? 'not-prepared'
              : row.stage === 'cancelled' || row.stage === 'expired' || row.stage === 'stale'
                ? row.stage
                : 'unavailable',
          );
        if (row.authority_hash !== authority.token) return refused('stale');
        if (now() >= preparation.expiresAt) return refused('expired');
        const first = auth.receipt.offer.epoch,
          candidate = preparation.context.candidate;
        const members = [
          {
            ...first.certification.members[0],
            principalId: first.principalId,
            state: 'certified' as const,
            capabilities: ['read', 'write', 'admit', 'manage'] as [
              'read',
              'write',
              'admit',
              'manage',
            ],
          },
          {
            id: candidate.credentialId,
            wPub: candidate.wPub,
            sPub: candidate.sPub,
            principalId: first.principalId,
            state: 'pending' as const,
            capabilities: [] as [],
          },
        ].sort((a, b) => (a.id < b.id ? -1 : 1));
        const heads = [
          { credentialId: auth.credential, position: ledger.through, link: ledger.previous },
          { credentialId: candidate.credentialId, position: 0, link: '00'.repeat(32) },
        ].sort((a, b) => (a.credentialId < b.credentialId ? -1 : 1));
        result = parseSuccessor(
          await issuer.successor({
            v: 1,
            kind: 'device-admission-epoch',
            pin: issuer.pin,
            requestDigest: first.requestDigest,
            accountId: first.accountId,
            principalId: first.principalId,
            workspaceId: first.workspaceId,
            lineageId: first.lineageId,
            epoch: 2,
            parent: auth.a.head,
            generation: 1,
            acceptancePublicKey: first.acceptancePublicKey,
            preparation,
            certified: {
              parentEpoch: 0,
              nextEpoch: 1,
              digest: preparation.context.certifiedSetDigest,
              value: first.certification,
            },
            roster: members as AdmissionSuccessorEpoch['roster'],
            heads: heads as AdmissionSuccessorEpoch['heads'],
          }),
        );
        await verifySuccessor(
          result,
          { pin: issuer.pin, request: auth.request, receipt: auth.receipt },
          { epoch: 1, head: auth.a.head },
        );
      }
      hook('after-verify', 'admit-prepared');
      phase = 'commit';
      db.exec('BEGIN IMMEDIATE');
      const current = capture();
      if (
        JSON.stringify(current.row) !== JSON.stringify(row) ||
        current.authority?.token !== authority.token ||
        snapshotBytes(current.delivery) !== snapshotBytes(delivery)
      ) {
        db.exec('ROLLBACK');
        continue;
      }
      if (!auth.successor && now() >= preparation.expiresAt) {
        db.exec('ROLLBACK');
        return refused('expired');
      }
      issuer.check(auth.seal, delivery.promotion.request_digest, auth.a.acceptanceKey);
      if (!auth.successor) {
        const oldWitness = delivery.promotion.delivery_witness;
        if (oldWitness) parseWitness(JSON.parse(oldWitness));
        const witness = ledger.count
          ? issuer.witness(
              auth.seal,
              delivery.promotion.request_digest,
              auth.a.acceptanceKey,
              { ...auth.scope, head: result.head },
              { events: ledger.count, hash: ledger.commitment },
            )
          : null;
        db.prepare('INSERT INTO workspace_successors VALUES (?,?,?,?)').run(
          row.workspace_id,
          row.id,
          JSON.stringify(result),
          oldWitness,
        );
        db.prepare(
          'UPDATE promotions SET successor_head=?,delivery_witness=? WHERE account_id=?',
        ).run(result.head, witness ? JSON.stringify(witness) : null, delivery.account.id);
      }
      hook('before-commit', 'admit-prepared');
      if (!auth.successor && now() >= preparation.expiresAt) {
        db.exec('ROLLBACK');
        return refused('expired');
      }
      issuer.check(auth.seal, delivery.promotion.request_digest, auth.a.acceptanceKey);
      db.exec('COMMIT');
      hook('after-commit', 'admit-prepared');
      return result;
    } catch (cause) {
      if (db.isTransaction) db.exec('ROLLBACK');
      reuse?.clear();
      reportDiagnostic(diagnostics, { operation: 'successor', phase, code: causeCode(cause) });
      return refused(phase === 'verify' ? 'unavailable' : 'storage-unavailable');
    }
  }
  return refused('state-changed');
}
