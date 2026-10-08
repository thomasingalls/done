import {
  CONTENT_DELIVERY_LIMIT,
  parseCertificationSuccessor,
} from '../account-protocol/contentDelivery.ts';
/** Private first continuation transfer. Ordinary delivery stays fenced until general history is composed. */
import type { DatabaseSync } from 'node:sqlite';
import { closed } from '../account-protocol/preparation.ts';
import { same, verifySignature } from '../account-protocol/admission.ts';
import {
  membershipState,
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
import { parseWitness, witnessMessage, type DeliveryWitness } from './deliveryWitness.ts';
import { rethrowAuthorization } from './authorization.ts';
export interface MembershipTransferIssuer extends DeliveryIssuer {
  certify(epoch: MembershipCertificationEpoch): Promise<MembershipCertification>;
}
const refuse = (refusal: string) => ({ ok: false as const, refusal });
const boundaries = (raw: string, ids: readonly string[]) => {
  const entries = JSON.parse(raw) as unknown;
  if (!Array.isArray(entries) || entries.length !== ids.length)
    throw Error('Missing continuation boundaries');
  return entries.map((value, i) => {
    const b = closed(value, ['credentialId', 'witness']);
    if (b['credentialId'] !== ids[i]) throw Error('Continuation boundary identity changed');
    return {
      credentialId: ids[i]!,
      witness: b['witness'] === null ? null : parseWitness(b['witness']),
    };
  });
};

/** This private increment accepts only the frozen 3→4 prefix. Any later ledger event refuses.
 * General delivery integration must replace this boundary with each verified issuance interval. */
async function frozenLedgers(
  s: Snapshot,
  snapshots: Snapshot[],
  auth: Awaited<ReturnType<typeof verifyPendingMembership>>,
) {
  const p = membershipState(auth.membership),
    current = membershipState(auth.currentMembership);
  const ids = auth.anchor.certificationSuccessor!.epoch.roster.map((m) => m.id);
  const prior = boundaries(s.continuations![0]!.boundaries, ids);
  const certBoundaries = auth.certification
    ? boundaries(s.membershipTransfers![0]!.boundaries!, ids)
    : null;
  const check = async (
    w: DeliveryWitness | null,
    head: string,
    credential: string,
    count: number,
    commitment: string,
  ) => {
    if (!w) {
      if (count !== 0) throw Error('Missing continuation witness');
      return;
    }
    if (w.events !== count || w.hash !== commitment)
      throw Error('Continuation witness coverage changed');
    await verifySignature(
      p.acceptancePublicKey,
      w.signature,
      witnessMessage(
        {
          workspace: p.workspaceId,
          credential,
          lineage: p.lineageId,
          head,
          request: s.promotion.request_digest,
        },
        w,
      ),
    );
  };
  const ledgers = [];
  for (const b of prior) {
    const source = snapshots.find(
      (x) => (x.publisher ?? auth.anchor.credential) === b.credentialId,
    );
    if (!source) throw Error('Missing continuation publisher');
    const publisher = selectPublisher(auth.anchor, source.publisher);
    const historical = {
      ...source,
      continuations: [],
      membershipTransfers: [],
      promotion: {
        ...source.promotion,
        successor_head: auth.anchor.a.head,
        ...(!source.publisher
          ? { delivery_witness: b.witness ? JSON.stringify(b.witness) : null }
          : {}),
      },
      ...(source.publisher
        ? { publisherWitness: b.witness ? JSON.stringify(b.witness) : null }
        : {}),
    };
    const ledger = await census(historical, publisher);
    const expected = p.heads.find((h) => h.credentialId === b.credentialId)!;
    if (ledger.through !== expected.position || ledger.previous !== expected.link)
      throw Error('Continuation accepted prefix changed');
    const raw = source.publisher ? source.publisherWitness : source.promotion.delivery_witness;
    const witness = raw ? parseWitness(JSON.parse(raw)) : null;
    await check(witness, current.head, b.credentialId, ledger.count, ledger.commitment);
    if (certBoundaries) {
      const before = certBoundaries.find((x) => x.credentialId === b.credentialId)!;
      await check(before.witness, p.head, b.credentialId, ledger.count, ledger.commitment);
      const certified = current.heads.find((h) => h.credentialId === b.credentialId)!;
      if (certified.position !== ledger.through || certified.link !== ledger.previous)
        throw Error('Certification accepted prefix changed');
    }
    ledgers.push({ publisher, ledger, witness });
  }
  return ledgers;
}
export async function transferMembership(
  db: DatabaseSync,
  input: unknown,
  issuer: MembershipTransferIssuer,
  hook: DeliveryHook,
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
    const snapshots = s?.transfer?.artifact
      ? parseCertificationSuccessor(JSON.parse(s.transfer.artifact)).epoch.roster.map((m) =>
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
    return { s, snapshots, ceremony };
  };
  const bytes = (c: ReturnType<typeof capture>) =>
    JSON.stringify([snapshotBytes(c.s), c.snapshots.map(snapshotBytes), c.ceremony]);
  for (let retry = 0; retry < 4; retry++) {
    try {
      db.exec('BEGIN');
      const before = capture();
      db.exec('COMMIT');
      const s = before.s;
      if (!s) return refuse('unavailable');
      const auth = await verifyPendingMembership(s, issuer),
        p = membershipState(auth.membership);
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
        delivery = proposed;
      }
      if (before.snapshots.some((x) => !x)) throw Error('Missing publisher snapshot');
      const ledgers = await frozenLedgers(s, before.snapshots as Snapshot[], auth);
      if (request.action === 'install') {
        if (!delivery) return refuse('delivery-required');
        const installation = await verifyMembershipInstallation(request.payload, delivery);
        if (certification) {
          if (!same(certification.epoch.installation, installation))
            return refuse('installation-conflict');
        } else {
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
            heads: structuredClone(p.heads),
          } as MembershipCertificationEpoch);
          await verifyMembershipCertification(certification, auth.membership);
          if (
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
        const first = replacements.find((r) => r.credentialId === auth.anchor.credential)!;
        db.prepare(
          'UPDATE promotions SET successor_head=?,delivery_witness=? WHERE account_id=?',
        ).run(
          newCertification.head,
          first.witness ? JSON.stringify(first.witness) : null,
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
