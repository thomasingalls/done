/** Exact store-and-forward delivery followed by one atomic certification successor. */
import type { DatabaseSync } from 'node:sqlite';
import { same, verifySignature } from '../account-protocol/admission.ts';
import {
  parseContentTransferRequest,
  contentTransferMessage,
  verifyContentDelivery,
  verifyContentInstallation,
  verifyCertificationSuccessor,
  type ContentDelivery,
  type CertificationEpoch,
  type CertificationSuccessor,
} from '../account-protocol/contentDelivery.ts';
import {
  snapshot,
  snapshotBytes,
  verifyWorkspaceAuthority,
  census,
  type DeliveryIssuer,
  type DeliveryHook,
} from './delivery.ts';
export const CONTENT_TRANSFER_SCHEMA = `CREATE TABLE content_transfers (
 workspace_id TEXT PRIMARY KEY, delivery TEXT NOT NULL, artifact TEXT, boundary_witness TEXT);`;
export interface ContentTransferRow {
  workspace_id: string;
  delivery: string;
  artifact: string | null;
  boundary_witness: string | null;
}
export interface ContentTransferIssuer extends DeliveryIssuer {
  certify(epoch: CertificationEpoch): Promise<CertificationSuccessor>;
}
const refuse = (refusal: string) => ({ ok: false as const, refusal });
export async function transferContent(
  db: DatabaseSync,
  input: unknown,
  issuer: ContentTransferIssuer,
  hook: DeliveryHook,
) {
  let request;
  try {
    request = parseContentTransferRequest(input);
  } catch {
    return refuse('malformed');
  }
  const capture = () => ({
    authority: snapshot(db, request.workspaceId),
    ceremony:
      db
        .prepare('SELECT * FROM content_ceremonies WHERE workspace_id=?')
        .get(request.workspaceId) ?? null,
  });
  for (let retry = 0; retry < 4; retry++) {
    try {
      db.exec('BEGIN');
      const before = capture();
      db.exec('COMMIT');
      if (!before.authority) return refuse('unavailable');
      const s = before.authority,
        auth = await verifyWorkspaceAuthority(s, issuer),
        admission = auth.successor;
      if (!admission || request.parent !== admission.head) return refuse('stale');
      const base = { pin: issuer.pin, request: auth.request, receipt: auth.receipt };
      const existing = admission.epoch.certified.value.members[0],
        candidate = admission.epoch.preparation.context.candidate;
      const role =
        request.credentialId === existing.id
          ? 'existing'
          : request.credentialId === candidate.credentialId
            ? 'new'
            : null;
      if (
        !role ||
        (request.action === 'deliver' && role !== 'existing') ||
        (request.action === 'install' && role !== 'new')
      )
        return refuse('invalid-proof');
      await verifySignature(
        role === 'existing' ? existing.sPub : candidate.sPub,
        request.signature,
        await contentTransferMessage(request),
      );
      let delivery = s.transfer ? (JSON.parse(s.transfer.delivery) as ContentDelivery) : null;
      let certification = auth.certificationSuccessor;
      let boundary = s.transfer?.boundary_witness ?? null;
      let witness = s.promotion.delivery_witness;
      if (request.action === 'deliver') {
        const proposed = (await verifyContentDelivery(request.payload, base, admission)).delivery;
        const row = before.ceremony;
        if (
          !row ||
          row['cancellation'] ||
          row['existing_commit'] !== JSON.stringify(proposed.existing) ||
          row['new_commit'] !== JSON.stringify(proposed.candidate) ||
          row['existing_reveal'] !== JSON.stringify(proposed.existingReveal) ||
          row['new_reveal'] !== JSON.stringify(proposed.newReveal) ||
          row['decision'] !== JSON.stringify(proposed.decision)
        )
          return refuse('approval-required');
        if (delivery && !same(delivery, proposed)) return refuse('delivery-conflict');
        delivery = proposed;
      } else if (request.action === 'install') {
        if (!delivery) return refuse('delivery-required');
        const installation = await verifyContentInstallation(request.payload, delivery);
        if (certification) {
          if (!same(installation, certification.epoch.installation))
            return refuse('installation-conflict');
        } else {
          const ledger = await census(s, auth);
          const heads = admission.epoch.heads.map((h) =>
            h.credentialId === existing.id
              ? { ...h, position: ledger.through, link: ledger.previous }
              : h,
          ) as CertificationEpoch['heads'];
          certification = await issuer.certify({
            v: 1,
            kind: 'device-certification-epoch',
            epoch: 3,
            parent: admission.head,
            delivery,
            installation,
            roster: admission.epoch.roster.map((m) => ({
              ...m,
              state: 'certified',
              capabilities: ['read', 'write', 'admit', 'manage'],
            })) as CertificationEpoch['roster'],
            heads,
          });
          await verifyCertificationSuccessor(certification, base, admission, delivery);
          boundary = s.promotion.delivery_witness;
          witness = ledger.count
            ? JSON.stringify(
                issuer.witness(
                  auth.seal,
                  s.promotion.request_digest,
                  auth.a.acceptanceKey,
                  { ...auth.scope, head: certification.head },
                  { events: ledger.count, hash: ledger.commitment },
                ),
              )
            : null;
        }
      }
      hook('after-verify', 'content-transfer');
      db.exec('BEGIN IMMEDIATE');
      const current = capture();
      if (
        snapshotBytes(current.authority) !== snapshotBytes(s) ||
        !same(current.ceremony, before.ceremony)
      ) {
        db.exec('ROLLBACK');
        continue;
      }
      issuer.check(auth.seal, s.promotion.request_digest, auth.a.acceptanceKey);
      if (delivery && !s.transfer)
        db.prepare('INSERT INTO content_transfers VALUES (?,?,NULL,NULL)').run(
          request.workspaceId,
          JSON.stringify(delivery),
        );
      if (certification && !auth.certificationSuccessor) {
        db.prepare(
          'UPDATE content_transfers SET artifact=?,boundary_witness=? WHERE workspace_id=?',
        ).run(JSON.stringify(certification), boundary, request.workspaceId);
        db.prepare(
          'UPDATE promotions SET successor_head=?,delivery_witness=? WHERE account_id=?',
        ).run(certification.head, witness, s.account.id);
      }
      hook('before-commit', 'content-transfer');
      issuer.check(auth.seal, s.promotion.request_digest, auth.a.acceptanceKey);
      db.exec('COMMIT');
      hook('after-commit', 'content-transfer');
      return { ok: true as const, delivery, certification };
    } catch {
      if (db.isTransaction) db.exec('ROLLBACK');
      return refuse('unavailable');
    }
  }
  return refuse('state-changed');
}
