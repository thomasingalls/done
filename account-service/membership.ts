/** First continuation admission; private until the general delivery/history owner is composed. */
import type { DatabaseSync } from 'node:sqlite';
import { closed, accountIdentifier } from '../account-protocol/preparation.ts';
import { json, same, verifySignature } from '../account-protocol/admission.ts';
import { parseEnrollmentRetry, parseEnrollmentReceipt } from '../account-protocol/enrollment.ts';
import { parseCertificationSuccessor } from '../account-protocol/contentDelivery.ts';
import {
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
  verifyWorkspaceAuthority,
  selectPublisher,
  census,
  type DeliveryIssuer,
} from './delivery.ts';
import { enrollmentSnapshot, verifyEnrollmentRow, type EnrollmentRow } from './enrollment.ts';
import { membershipEnabled } from './membershipStore.ts';
import { parseWitness, witnessMessage, type DeliveryWitness } from './deliveryWitness.ts';
import { retryHash } from './protocol.ts';
import { rethrowAuthorization } from './authorization.ts';
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
      cert && row ? cert.epoch.roster.map((m) => snapshot(db, row.workspace_id, m.id)) : [];
    return {
      row,
      root,
      cert,
      snapshots,
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
      if (preparation.v !== 2 || !root || !cert) return no('unavailable');
      const records = root.continuations ?? [];
      if (records.length > 1) return no('unavailable');
      const original = {
        ...root,
        continuations: [],
        promotion: { ...root.promotion, successor_head: cert.head },
      };
      const auth = await verifyWorkspaceAuthority(original, issuer);
      const base = { pin: issuer.pin, request: auth.request, receipt: auth.receipt };
      let parent = await verifyMembershipAnchor(base, auth.successor, cert, {
        epoch: 3,
        head: cert.head,
      });
      let result: MembershipAdmission | undefined;
      for (const record of records) {
        const state = membershipState(parent),
          proof = parseMembershipAdmission(JSON.parse(record.artifact));
        if (
          record.workspace_id !== state.workspaceId ||
          record.epoch !== proof.epoch.epoch ||
          record.parent !== proof.epoch.parent ||
          record.head !== proof.head ||
          record.preparation_id !== proof.epoch.preparation.context.attemptId
        )
          throw Error('Retained membership identity changed');
        // Witnesses authenticate exact old ledger event counts, including refused positions.
        const boundaries = JSON.parse(record.boundaries) as unknown;
        if (!Array.isArray(boundaries) || boundaries.length !== state.roster.length)
          throw Error('Missing membership ledger boundary');
        for (const [i, value] of boundaries.entries()) {
          const b = closed(value, ['credentialId', 'witness']);
          if (b['credentialId'] !== state.roster[i]!.id)
            throw Error('Membership boundary identity changed');
          const witness = b['witness'] === null ? null : parseWitness(b['witness']);
          const head = proof.epoch.heads.find((h) => h.credentialId === b['credentialId']);
          if (!head || (!witness && head.position !== 0))
            throw Error('Membership boundary omitted');
          if (witness)
            await verifySignature(
              state.acceptancePublicKey,
              witness.signature,
              witnessMessage(
                {
                  workspace: state.workspaceId,
                  credential: state.roster[i]!.id,
                  lineage: state.lineageId,
                  head: state.head,
                  request: root.promotion.request_digest,
                },
                witness,
              ),
            );
          const source = snapshots.find(
            (s) => s && (s.publisher ?? auth.credential) === b['credentialId'],
          );
          if (!source) throw Error('Missing membership publisher');
          const historical = {
            ...source,
            continuations: [],
            promotion: {
              ...source.promotion,
              successor_head: state.head,
              ...(source.publisher
                ? {}
                : { delivery_witness: witness ? JSON.stringify(witness) : null }),
            },
            ...(source.publisher
              ? { publisherWitness: witness ? JSON.stringify(witness) : null }
              : {}),
          };
          const ledger = await census(historical, selectPublisher(auth, source.publisher));
          if (ledger.through !== head.position || ledger.previous !== head.link)
            throw Error('Membership accepted prefix changed');
        }
        parent = await verifyMembershipAdmission(proof, parent);
        if (record.preparation_id === row.id) {
          if (!same(proof.epoch.preparation, preparation)) return no('request-conflict');
          result = proof;
        }
      }
      const current = membershipState(parent);
      if (root.promotion.successor_head !== current.head)
        throw Error('Membership current pointer changed');
      const boundaries: { credentialId: string; witness: DeliveryWitness | null }[] = [];
      const replacements: { credentialId: string; witness: DeliveryWitness | null }[] = [];
      if (!result) {
        // Transport for later continuation heads is intentionally not exposed in this increment.
        if (row.authority_hash !== before.authorityToken) return no('stale');
        if (
          current.epoch !== 3 ||
          preparation.context.candidate.head !== current.head ||
          preparation.context.epoch !== current.epoch
        )
          return no('stale');
        if (now() >= preparation.expiresAt) return no('expired');
        const ledgers = [];
        for (const s of snapshots) {
          if (!s) throw Error('Missing publisher snapshot');
          const publisher = selectPublisher(auth, s.publisher);
          const ledger = await census(s, publisher);
          ledgers.push({ s, publisher, ledger });
          const raw = s.publisher ? s.publisherWitness : s.promotion.delivery_witness;
          boundaries.push({
            credentialId: publisher.credential,
            witness: raw ? parseWitness(JSON.parse(raw)) : null,
          });
        }
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
              epoch: 4,
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
        const first = replacements.find((r) => r.credentialId === auth.credential)!;
        db.prepare(
          'UPDATE promotions SET successor_head=?,delivery_witness=? WHERE account_id=?',
        ).run(result.head, first.witness ? JSON.stringify(first.witness) : null, root.account.id);
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
