import type { DeliveryVerification } from './deliveryVerification.ts';
import { verifiedCensus } from './delivery.ts';
import { membershipProofChain } from './membershipLocator.ts';
import { parseMembershipChain } from '../account-protocol/membershipLocator.ts';
import { requireNoRemoval } from './removalStore.ts';
import { CONTENT_DELIVERY_LIMIT } from '../account-protocol/contentDelivery.ts';
/** Private continuation transfer with exact per-publisher issuance boundaries. */
import type { DatabaseSync } from 'node:sqlite';
import { same, verifySignature } from '../account-protocol/admission.ts';
import {
  membershipState,
  parseMembershipAdmission,
  verifyMembershipCertification,
  type MembershipCertification,
  type MembershipCertificationEpoch,
} from '../account-protocol/membership.ts';
import {
  parseMembershipTransfer,
  membershipTransferMessage,
  verifyMembershipDelivery,
  verifyMembershipInstallation,
} from '../account-protocol/membershipDelivery.ts';
import {
  snapshot,
  snapshotBytes,
  census,
  selectPublisher,
  type Snapshot,
  type DeliveryIssuer,
  type DeliveryHook,
} from './delivery.ts';
import { verifyPendingMembership } from './membershipAuthority.ts';
import { membershipEnabled } from './membershipStore.ts';
import { parseWitness } from './deliveryWitness.ts';
import { resolveMembershipDeliveryAuthority } from './membershipHistory.ts';
import { rethrowAuthorization } from './authorization.ts';
import {
  replacementCheckpointRow,
  retainedReplacementCheckpoint,
} from './replacementCheckpoint.ts';
import { verifyReplacementCheckpointAdmission } from '../account-protocol/replacementCheckpoint.ts';
export interface MembershipTransferIssuer extends DeliveryIssuer {
  certify(epoch: MembershipCertificationEpoch): Promise<MembershipCertification>;
}
const refuse = (refusal: string) => ({ ok: false as const, refusal });
export async function transferMembership(
  db: DatabaseSync,
  input: unknown,
  issuer: MembershipTransferIssuer,
  hook: DeliveryHook,
  reuse?: DeliveryVerification,
) {
  if (!membershipEnabled(db)) return refuse('unavailable');
  let request;
  try {
    request = parseMembershipTransfer(input);
  } catch {
    return refuse('malformed');
  }
  const capture = () => {
    const s = snapshot(db, request.workspaceId);
    // IDs are only selectors here; verification below resolves the exact certified set.
    if (s?.transfer?.artifact && Buffer.byteLength(s.transfer.artifact) > CONTENT_DELIVERY_LIMIT)
      throw Error('Oversized retained anchor');
    const latest = s?.continuations?.at(-1);
    const snapshots = latest
      ? parseMembershipAdmission(JSON.parse(latest.artifact)).epoch.roster.map((m) =>
          snapshot(db, request.workspaceId, m.id),
        )
      : [];
    const sizes = db
      .prepare(`SELECT length(CAST(existing_commit AS BLOB)) + length(CAST(COALESCE(new_commit,'') AS BLOB)) +
      length(CAST(COALESCE(existing_reveal,'') AS BLOB)) + length(CAST(COALESCE(new_reveal,'') AS BLOB)) +
      length(CAST(COALESCE(decision,'') AS BLOB)) + length(CAST(COALESCE(cancellation,'') AS BLOB)) AS bytes
      FROM membership_ceremonies WHERE workspace_id=? AND preparation_id=?`)
      .get(request.workspaceId, request.preparationId);
    if (sizes && Number(sizes.bytes) > 96 * 1024) throw Error('Oversized retained ceremony');
    const ceremony =
      db
        .prepare('SELECT * FROM membership_ceremonies WHERE workspace_id=? AND preparation_id=?')
        .get(request.workspaceId, request.preparationId) ?? null;
    const checkpoint = replacementCheckpointRow(db, request.workspaceId, request.preparationId);
    return { s, snapshots, ceremony, checkpoint };
  };
  const bytes = (c: ReturnType<typeof capture>) =>
    JSON.stringify([snapshotBytes(c.s), c.snapshots.map(snapshotBytes), c.ceremony, c.checkpoint]);
  for (let retry = 0; retry < 4; retry++) {
    try {
      db.exec('BEGIN');
      const before = capture();
      db.exec('COMMIT');
      const s = before.s;
      if (!s) return refuse('unavailable');
      const auth = await verifyPendingMembership(s, issuer),
        p = membershipState(auth.membership);
      if (auth.cancellation) return refuse('cancelled');
      if (
        request.parent !== p.head ||
        request.preparationId !== auth.proof.epoch.preparation.context.attemptId
      )
        return refuse('stale');
      const candidate = auth.proof.epoch.preparation.context.candidate;
      const member = p.certificate.members.find((m) => m.id === request.credentialId);
      const role = member
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
        member?.sPub ?? candidate.sPub,
        request.signature,
        await membershipTransferMessage(request),
      );
      let delivery = auth.delivery,
        certification = auth.certification;
      if (request.action === 'deliver') {
        const proposed = (await verifyMembershipDelivery(request.payload, auth.membership))
            .delivery,
          row = before.ceremony;
        if (proposed.existing.context.existing.id !== request.credentialId)
          return refuse('invalid-proof');
        if (
          !row ||
          row.cancellation ||
          row.head !== p.head ||
          row.candidate_id !== candidate.credentialId ||
          row.existing_commit !== JSON.stringify(proposed.existing) ||
          row.new_commit !== JSON.stringify(proposed.candidate) ||
          row.existing_reveal !== JSON.stringify(proposed.existingReveal) ||
          row.new_reveal !== JSON.stringify(proposed.newReveal) ||
          row.decision !== JSON.stringify(proposed.decision)
        )
          return refuse('approval-required');
        if (delivery && !same(delivery, proposed)) return refuse('delivery-conflict');
        if (!delivery && proposed.generation > 1 && proposed.v !== 3)
          return refuse('checkpoint-required');
        delivery = proposed;
      }
      const checkpoint =
        delivery?.v === 3
          ? await retainedReplacementCheckpoint(
              before.checkpoint,
              auth.membership,
              delivery.checkpointHash,
            )
          : null;
      if (checkpoint && checkpoint.manifest.producer !== delivery!.existing.context.existing.id)
        return refuse('invalid-proof');
      if (before.snapshots.some((x) => !x)) throw Error('Missing publisher snapshot');
      const composed = await resolveMembershipDeliveryAuthority(s, issuer);
      const ledgers: {
        publisher: ReturnType<typeof selectPublisher>;
        ledger: Awaited<ReturnType<typeof census>>;
        witness: ReturnType<typeof parseWitness> | null;
      }[] = [];
      for (const source of before.snapshots as Snapshot[]) {
        const id = source.publisher ?? composed.credential;
        const raw = source.publisher ? source.publisherWitness : source.promotion.delivery_witness;
        if (!composed.members.some((m) => m.id === id)) {
          if (source.rows.length || raw) throw Error('Pending publisher has a ledger');
          continue;
        }
        const publisher = selectPublisher(composed, source.publisher),
          ledger = await verifiedCensus(source, publisher, reuse);
        ledgers.push({ publisher, ledger, witness: raw ? parseWitness(JSON.parse(raw)) : null });
      }
      if (request.action === 'install') {
        if (!delivery) return refuse('delivery-required');
        const installation = await verifyMembershipInstallation(request.payload, delivery);
        if (installation.v === 3)
          await verifyReplacementCheckpointAdmission(
            installation.checkpoint,
            checkpoint,
            auth.membership,
          );
        if (certification) {
          if (!same(certification.epoch.installation, installation))
            return refuse('installation-conflict');
        } else {
          const heads = p.heads.map((h) => {
            const l = ledgers.find((l) => l.publisher.credential === h.credentialId);
            return l
              ? {
                  credentialId: h.credentialId,
                  position: l.ledger.through,
                  link: l.ledger.previous,
                }
              : structuredClone(h);
          });
          certification = await issuer.certify({
            v: 2,
            kind: 'membership-certification-epoch',
            workspaceId: p.workspaceId,
            lineageId: p.lineageId,
            epoch: p.epoch + 1,
            parent: p.head,
            generation: p.generation,
            acceptancePublicKey: p.acceptancePublicKey,
            delivery,
            installation,
            roster: p.roster.map((m) =>
              m.id === candidate.credentialId
                ? { ...m, state: 'certified', capabilities: ['read', 'write', 'admit', 'manage'] }
                : structuredClone(m),
            ),
            heads,
          } as MembershipCertificationEpoch);
          await verifyMembershipCertification(certification, auth.membership);
          const chain = membershipProofChain(s);
          parseMembershipChain({
            ...chain,
            continuations: [...chain.continuations, certification],
          });
          if (
            !same(certification.epoch.heads, heads) ||
            !same(certification.epoch.delivery, delivery) ||
            !same(certification.epoch.installation, installation)
          )
            throw Error('Issued certification changed');
        }
      }
      const newCertification = certification && !auth.certification ? certification : null;
      const replacements = newCertification
        ? ledgers.map(({ publisher, ledger }) => ({
            credentialId: publisher.credential,
            witness: ledger.count
              ? issuer.witness(
                  auth.anchor.seal,
                  s.promotion.request_digest,
                  p.acceptancePublicKey,
                  { ...publisher.scope, head: newCertification.head },
                  { events: ledger.count, hash: ledger.commitment },
                )
              : null,
          }))
        : [];
      hook('after-verify', 'membership-transfer');
      db.exec('BEGIN IMMEDIATE');
      if (bytes(capture()) !== bytes(before)) {
        db.exec('ROLLBACK');
        continue;
      }
      issuer.check(auth.anchor.seal, s.promotion.request_digest, p.acceptancePublicKey);
      requireNoRemoval(db, request.workspaceId);
      const complete = issuer.authorize?.(db, {
        kind: 'enrollment',
        workspaceId: request.workspaceId,
        credentialId: request.credentialId,
        attemptId: request.preparationId,
        action: 'transfer',
      });
      if (delivery && !auth.delivery)
        db.prepare('INSERT INTO membership_transfers VALUES (?,?,?,?,NULL,NULL)').run(
          request.workspaceId,
          request.preparationId,
          p.head,
          JSON.stringify(delivery),
        );
      if (newCertification) {
        db.prepare(
          'UPDATE membership_transfers SET artifact=?,boundaries=? WHERE workspace_id=? AND preparation_id=?',
        ).run(
          JSON.stringify(newCertification),
          JSON.stringify(
            ledgers.map(({ publisher, witness }) => ({
              credentialId: publisher.credential,
              witness,
            })),
          ),
          request.workspaceId,
          request.preparationId,
        );
        const first = replacements.find((r) => r.credentialId === auth.anchor.credential);
        if (first)
          db.prepare(
            'UPDATE promotions SET successor_head=?,delivery_witness=? WHERE account_id=?',
          ).run(
            newCertification.head,
            first.witness ? JSON.stringify(first.witness) : null,
            s.account.id,
          );
        else
          db.prepare('UPDATE promotions SET successor_head=? WHERE account_id=?').run(
            newCertification.head,
            s.account.id,
          );
        for (const r of replacements)
          if (r.credentialId !== auth.anchor.credential && r.witness)
            db.prepare(
              'INSERT INTO publisher_witnesses VALUES (?,?,?) ON CONFLICT(account_id,credential_id) DO UPDATE SET witness=excluded.witness',
            ).run(s.account.id, r.credentialId, JSON.stringify(r.witness));
      }
      hook('before-commit', 'membership-transfer');
      issuer.check(auth.anchor.seal, s.promotion.request_digest, p.acceptancePublicKey);
      complete?.();
      db.exec('COMMIT');
      hook('after-commit', 'membership-transfer');
      return { ok: true as const, delivery, certification };
    } catch (cause) {
      if (db.isTransaction) db.exec('ROLLBACK');
      rethrowAuthorization(cause);
      return refuse('unavailable');
    }
  }
  return refuse('state-changed');
}
