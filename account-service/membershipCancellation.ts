import { requireNoRemoval } from './removalStore.ts';
/** Withdraw a pending connection atomically with its publisher boundaries. No content-key change. */
import type { DatabaseSync } from 'node:sqlite';
import { same, verifySignature } from '../account-protocol/admission.ts';
import { parseCeremonyRequest, ceremonyRequestMessage } from '../account-protocol/ceremonyRelay.ts';
import { parseCeremonyCommit, ceremonyContextHash } from '../account-protocol/ceremonyExchange.ts';
import {
  membershipState,
  parseMembershipAdmission,
  parseMembershipCancellationRequest,
  parseMembershipCancellationEpoch,
  verifyMembershipCancellationRequest,
  verifyMembershipCancellation,
  type MembershipCancellation,
  type MembershipCancellationEpoch,
} from '../account-protocol/membership.ts';
import {
  snapshot,
  snapshotBytes,
  census,
  selectPublisher,
  type Snapshot,
  type DeliveryIssuer,
  type DeliveryHook,
} from './delivery.ts';
import { membershipEnabled } from './membershipStore.ts';
import { verifyPendingMembership } from './membershipAuthority.ts';
import { resolveMembershipDeliveryAuthority } from './membershipHistory.ts';
import { parseWitness } from './deliveryWitness.ts';
import { rethrowAuthorization } from './authorization.ts';

export interface MembershipCancellationIssuer extends DeliveryIssuer {
  cancel(epoch: MembershipCancellationEpoch): Promise<MembershipCancellation>;
}
const no = (refusal: string) => ({ ok: false as const, refusal });
export async function cancelMembership(
  db: DatabaseSync,
  input: unknown,
  issuer: MembershipCancellationIssuer,
  hook: DeliveryHook,
) {
  if (!membershipEnabled(db)) return no('unavailable');
  let request;
  try {
    request = parseMembershipCancellationRequest(input);
  } catch {
    return no('malformed');
  }
  const capture = () => {
    const s = snapshot(db, request.workspaceId),
      latest = s?.continuations?.at(-1),
      roster = latest ? parseMembershipAdmission(JSON.parse(latest.artifact)).epoch.roster : [];
    const snapshots = roster.map((m) => snapshot(db, request.workspaceId, m.id));
    const size = db
      .prepare(`SELECT length(CAST(existing_commit AS BLOB)) + length(CAST(COALESCE(decision,'') AS BLOB)) AS bytes
      FROM membership_ceremonies WHERE workspace_id=? AND preparation_id=?`)
      .get(request.workspaceId, request.preparationId);
    if (size && Number(size.bytes) > 32 * 1024) throw Error('Oversized retained comparison');
    const ceremony =
      db
        .prepare(`SELECT head, candidate_id, existing_commit, decision
      FROM membership_ceremonies WHERE workspace_id=? AND preparation_id=?`)
        .get(request.workspaceId, request.preparationId) ?? null;
    return { s, snapshots, ceremony };
  };
  const bytes = (s: ReturnType<typeof capture>) =>
    JSON.stringify([snapshotBytes(s.s), s.snapshots.map(snapshotBytes), s.ceremony]);
  for (let retry = 0; retry < 4; retry++) {
    try {
      db.exec('BEGIN');
      const before = capture();
      db.exec('COMMIT');
      if (!before.s) return no('unavailable');
      const s = before.s,
        auth = await verifyPendingMembership(s, issuer),
        p = membershipState(auth.membership);
      await verifyMembershipCancellationRequest(request, auth.membership);
      const saved = auth.cancellation;
      if (saved && !same(saved.epoch.cancellation, request)) return no('request-conflict');
      if (auth.delivery || auth.certification) return no('removal-required');
      if (
        before.ceremony &&
        (before.ceremony.head !== p.head || before.ceremony.candidate_id !== request.candidateId)
      )
        throw Error('Retained ceremony scope changed');
      if (before.ceremony?.decision) {
        const decision = parseCeremonyRequest(JSON.parse(String(before.ceremony.decision)));
        if ((decision.payload as { outcome?: string }).outcome !== 'mismatch')
          return no('removal-required');
        const commit = parseCeremonyCommit(JSON.parse(String(before.ceremony.existing_commit))),
          actor = p.certificate.members.find((m) => m.id === decision.credentialId);
        if (
          !actor ||
          decision.v !== 2 ||
          decision.action !== 'decide' ||
          decision.head !== p.head ||
          decision.workspaceId !== p.workspaceId ||
          decision.preparationId !== request.preparationId ||
          decision.credentialId !== commit.context.existing.id ||
          (decision.payload as { contextHash: string }).contextHash !==
            (await ceremonyContextHash(commit.context))
        )
          throw Error('Retained mismatch proof changed');
        await verifySignature(
          actor.sPub,
          decision.signature,
          await ceremonyRequestMessage(decision),
        );
      }
      const composed = await resolveMembershipDeliveryAuthority(s, issuer);
      if (before.snapshots.some((s) => !s)) throw Error('Missing publisher snapshot');
      const ledgers = [];
      for (const source of before.snapshots as Snapshot[]) {
        const id = source.publisher ?? composed.credential,
          raw = source.publisher ? source.publisherWitness : source.promotion.delivery_witness;
        if (!composed.members.some((m) => m.id === id)) {
          if (source.rows.length || raw) throw Error('Pending publisher has a ledger');
          continue;
        }
        const publisher = selectPublisher(composed, source.publisher),
          ledger = await census(source, publisher);
        ledgers.push({ publisher, ledger, witness: raw ? parseWitness(JSON.parse(raw)) : null });
      }
      const heads = ledgers
        .map(({ publisher, ledger }) => ({
          credentialId: publisher.credential,
          position: ledger.through,
          link: ledger.previous,
        }))
        .sort((a, b) => (a.credentialId < b.credentialId ? -1 : 1));
      const result =
        saved ??
        (await issuer.cancel(
          parseMembershipCancellationEpoch({
            v: 2,
            kind: 'membership-cancellation-epoch',
            workspaceId: p.workspaceId,
            lineageId: p.lineageId,
            epoch: p.epoch + 1,
            parent: p.head,
            generation: p.generation,
            acceptancePublicKey: p.acceptancePublicKey,
            certifiedSetDigest: p.certifiedSetDigest,
            cancellation: request,
            roster: p.roster
              .filter((m) => m.id !== request.candidateId)
              .map((m) => structuredClone(m)),
            heads,
          }),
        ));
      await verifyMembershipCancellation(result, auth.membership);
      if (!saved && (!same(result.epoch.cancellation, request) || !same(result.epoch.heads, heads)))
        throw Error('Issued cancellation changed');
      const replacements = saved
        ? []
        : ledgers.map(({ publisher, ledger }) => ({
            credentialId: publisher.credential,
            witness: ledger.count
              ? issuer.witness(
                  auth.anchor.seal,
                  s.promotion.request_digest,
                  p.acceptancePublicKey,
                  { ...publisher.scope, head: result.head },
                  { events: ledger.count, hash: ledger.commitment },
                )
              : null,
          }));
      hook('after-verify', 'membership-cancellation');
      db.exec('BEGIN IMMEDIATE');
      if (bytes(capture()) !== bytes(before)) {
        db.exec('ROLLBACK');
        continue;
      }
      issuer.check(auth.anchor.seal, s.promotion.request_digest, p.acceptancePublicKey);
      const complete = issuer.authorize?.(db, {
        kind: 'enrollment',
        workspaceId: request.workspaceId,
        credentialId: request.actorId,
        attemptId: request.preparationId,
        action: 'ceremony',
      });
      if (!saved) requireNoRemoval(db, request.workspaceId);
      if (!saved) {
        db.prepare('INSERT INTO membership_cancellations VALUES (?,?,?,?,?)').run(
          request.workspaceId,
          request.preparationId,
          p.head,
          JSON.stringify(result),
          JSON.stringify(
            ledgers.map(({ publisher, witness }) => ({
              credentialId: publisher.credential,
              witness,
            })),
          ),
        );
        const first = replacements.find((r) => r.credentialId === auth.anchor.credential)!;
        db.prepare(
          'UPDATE promotions SET successor_head=?,delivery_witness=? WHERE account_id=?',
        ).run(result.head, first.witness ? JSON.stringify(first.witness) : null, s.account.id);
        for (const r of replacements)
          if (r.credentialId !== auth.anchor.credential && r.witness)
            db.prepare(
              'INSERT INTO publisher_witnesses VALUES (?,?,?) ON CONFLICT(account_id,credential_id) DO UPDATE SET witness=excluded.witness',
            ).run(s.account.id, r.credentialId, JSON.stringify(r.witness));
      }
      hook('before-commit', 'membership-cancellation');
      issuer.check(auth.anchor.seal, s.promotion.request_digest, p.acceptancePublicKey);
      complete?.();
      db.exec('COMMIT');
      hook('after-commit', 'membership-cancellation');
      return { ok: true as const, cancellation: result };
    } catch (cause) {
      if (db.isTransaction) db.exec('ROLLBACK');
      rethrowAuthorization(cause);
      return no('unavailable');
    }
  }
  return no('state-changed');
}
