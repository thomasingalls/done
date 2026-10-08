import { requireNoRemoval } from './removalStore.ts';
import { rethrowAuthorization } from './authorization.ts';
import { membershipEnabled } from './membershipStore.ts';
import { verifyPendingMembership } from './membershipAuthority.ts';
import { membershipState } from '../account-protocol/membership.ts';
/** One retained attempt per admitted credential. Client owners independently enforce their budget. */
import type { DatabaseSync } from 'node:sqlite';
import {
  parseCeremonyInvitation,
  ceremonyInvitationMessage,
  parseCeremonyRequest,
  ceremonyRequestMessage,
} from '../account-protocol/ceremonyRelay.ts';
import { same, verifySignature } from '../account-protocol/admission.ts';
import {
  ceremonyContextHash,
  parseCeremonyCommit,
  verifyCeremonyContext,
  verifyMembershipCeremonyContext,
  verifyCeremonyCommit,
  verifyCeremonyPair,
  verifyCeremonyReveal,
  deriveCeremonyExchange,
  type CeremonyCommit,
  type CeremonyReveal,
} from '../account-protocol/ceremonyExchange.ts';
import {
  snapshotWorkspaceAuthority,
  verifyWorkspaceAuthority,
  type DeliveryIssuer,
  type DeliveryHook,
} from './delivery.ts';
import { closed } from '../account-protocol/preparation.ts';
import { unhex } from '../account-protocol/recovery.ts';
export const CEREMONY_SCHEMA = `CREATE TABLE content_ceremonies (
 workspace_id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL, existing_commit TEXT NOT NULL,
 new_commit TEXT, existing_reveal TEXT, new_reveal TEXT, decision TEXT, cancellation TEXT,
 expired INTEGER NOT NULL DEFAULT 0 CHECK(expired IN (0,1)));`;
interface Row {
  workspace_id: string;
  candidate_id: string;
  existing_commit: string;
  new_commit: string | null;
  existing_reveal: string | null;
  new_reveal: string | null;
  decision: string | null;
  cancellation: string | null;
  expired: number;
}
const refuse = (refusal: string) => ({ ok: false as const, refusal });
const readJSON = <T>(s: string | null): T | null => (s === null ? null : JSON.parse(s));
const view = (r: Row | null) => ({
  ok: true as const,
  stage: !r
    ? 'waiting'
    : r.decision
      ? (JSON.parse(r.decision).payload.outcome as string)
      : r.cancellation
        ? 'cancelled'
        : r.expired
          ? 'expired'
          : 'exchanging',
  existing: readJSON<CeremonyCommit>(r?.existing_commit ?? null),
  candidate: readJSON<CeremonyCommit>(r?.new_commit ?? null),
  existingReveal: readJSON<CeremonyReveal>(r?.existing_reveal ?? null),
  newReveal: readJSON<CeremonyReveal>(r?.new_reveal ?? null),
  decision: readJSON(r?.decision ?? null),
  cancellation: readJSON(r?.cancellation ?? null),
});
export interface CeremonyIssuer extends DeliveryIssuer {
  bootstrap(value: unknown): Promise<string>;
}
export async function ceremonyBootstrap(db: DatabaseSync, input: unknown, issuer: CeremonyIssuer) {
  // An existing-device invitation grants this historical proof only, never live history or mutation.
  const r = closed(input, ['workspaceId', 'nonce', 'invitation']);
  unhex(r['workspaceId'], 16);
  unhex(r['nonce'], 32);
  const invitation = parseCeremonyInvitation(r['invitation']);
  const workspaceId = r['workspaceId'] as string,
    nonce = r['nonce'] as string;
  // Signing yields to other requests. Certification can commit in that interval; rebuild
  // this read from a fresh verified snapshot rather than turning normal progress into an error.
  for (let retry = 0; retry < 4; retry++) {
    db.exec('BEGIN');
    let snapshot;
    try {
      snapshot = snapshotWorkspaceAuthority(db, workspaceId);
      db.exec('COMMIT');
    } finally {
      if (db.isTransaction) db.exec('ROLLBACK');
    }
    if (!snapshot) return refuse('unavailable');
    const auth = await verifyWorkspaceAuthority(snapshot, issuer);
    const member = auth.request.certification.members[0];
    if (invitation.workspaceId !== workspaceId || invitation.credentialId !== member.id)
      return refuse('invalid-invitation');
    await verifySignature(
      member.sPub,
      invitation.signature,
      await ceremonyInvitationMessage(invitation),
    );
    const result = {
      ok: true,
      nonce,
      base: { pin: issuer.pin, request: auth.request, receipt: auth.receipt },
      successor: auth.successor,
      certification: auth.certificationSuccessor,
    };
    const signature = await issuer.bootstrap(result);
    db.exec('BEGIN');
    try {
      if (!same(snapshotWorkspaceAuthority(db, workspaceId), snapshot)) continue;
      issuer.check(auth.seal, snapshot.promotion.request_digest, auth.a.acceptanceKey);
      return { ...result, signature };
    } finally {
      db.exec('ROLLBACK');
    }
  }
  return refuse('state-changed');
}
export async function relayCeremony(
  db: DatabaseSync,
  input: unknown,
  issuer: DeliveryIssuer,
  now: () => number,
  hook: DeliveryHook,
  continuation = false,
) {
  let request;
  try {
    request = parseCeremonyRequest(input);
    if (request.v !== (continuation ? 2 : 1)) return refuse('malformed');
    if (continuation && !membershipEnabled(db)) return refuse('unavailable');
  } catch {
    return refuse('malformed');
  }
  const operation = continuation ? 'membership-ceremony' : 'content-ceremony';
  const table = continuation ? 'membership_ceremonies' : 'content_ceremonies';
  const where = continuation ? 'workspace_id=? AND preparation_id=?' : 'workspace_id=?';
  const parameters =
    request.v === 2 ? [request.workspaceId, request.preparationId] : [request.workspaceId];
  const capture = () => {
    const size = db
      .prepare(`SELECT length(CAST(COALESCE(existing_commit,'') AS BLOB)) + length(CAST(COALESCE(new_commit,'') AS BLOB)) +
      length(CAST(COALESCE(existing_reveal,'') AS BLOB)) + length(CAST(COALESCE(new_reveal,'') AS BLOB)) +
      length(CAST(COALESCE(decision,'') AS BLOB)) + length(CAST(COALESCE(cancellation,'') AS BLOB)) AS bytes FROM ${table} WHERE ${where}`)
      .get(...parameters);
    if (size && Number(size.bytes) > 96 * 1024) throw Error('Oversized retained ceremony');
    const row =
      (db.prepare(`SELECT * FROM ${table} WHERE ${where}`).get(...parameters) as unknown as
        | (Row & { preparation_id?: string; head?: string })
        | undefined) ?? null;
    if (
      row &&
      request.v === 2 &&
      (row.preparation_id !== request.preparationId || row.head !== request.head)
    )
      throw Error('Retained ceremony scope changed');
    return { authority: snapshotWorkspaceAuthority(db, request.workspaceId), row };
  };
  for (let retry = 0; retry < 4; retry++) {
    try {
      db.exec('BEGIN');
      const before = capture();
      db.exec('COMMIT');
      if (!before.authority) return refuse('unavailable');
      const pending = continuation ? await verifyPendingMembership(before.authority, issuer) : null;
      if (pending?.cancellation) return refuse('cancelled');
      const auth = pending?.anchor ?? (await verifyWorkspaceAuthority(before.authority, issuer));
      if (!auth.successor) return refuse('not-admitted');
      const preparation = pending?.proof.epoch.preparation ?? auth.successor.epoch.preparation;
      if (
        request.v === 2 &&
        (request.head !== pending!.proof.head ||
          request.preparationId !== preparation.context.attemptId)
      )
        return refuse('authority-changed');
      const row = before.row ? { ...before.row } : null;
      const incoming = request.action === 'commit' ? parseCeremonyCommit(request.payload) : null;
      const first = row ? parseCeremonyCommit(JSON.parse(row.existing_commit)) : incoming;
      const current = pending ? membershipState(pending.membership) : null;
      const existing = current
        ? current.certificate.members.find(
            (m) => m.id === (first?.context.existing.id ?? request.credentialId),
          )
        : auth.successor.epoch.certified.value.members[0];
      const c = preparation.context.candidate;
      const candidate = { id: c.credentialId, wPub: c.wPub, sPub: c.sPub };
      // Before the approver starts, the authenticated candidate can only read waiting state.
      if (
        !existing &&
        !(pending && !row && request.action === 'read' && request.credentialId === candidate.id)
      )
        return refuse('invalid-proof');
      const role =
        request.credentialId === existing?.id
          ? 'existing'
          : request.credentialId === candidate.id
            ? 'new'
            : null;
      if (!role) return refuse('invalid-proof');
      await verifySignature(
        role === 'existing' ? existing!.sPub : candidate.sPub,
        request.signature,
        await ceremonyRequestMessage(request),
      );
      if (!row && !(incoming && role === 'existing')) {
        if (request.action !== 'read') return refuse('not-started');
        // Even an empty progress response belongs to the authenticated participant. Recheck on
        // the same boundary as populated responses; no early success around the grant guard.
        hook('after-verify', operation);
        db.exec('BEGIN IMMEDIATE');
        if (!same(capture(), before)) {
          db.exec('ROLLBACK');
          continue;
        }
        const complete = issuer.authorize?.(db, {
          kind: 'enrollment',
          workspaceId: request.workspaceId,
          credentialId: request.credentialId,
          attemptId: preparation.context.attemptId,
          action: 'ceremony',
        });
        requireNoRemoval(db, request.workspaceId);
        hook('before-commit', operation);
        issuer.check(auth.seal, before.authority.promotion.request_digest, auth.a.acceptanceKey);
        complete?.();
        db.exec('COMMIT');
        return view(null);
      }
      if (!first || !existing) return refuse('not-started');
      if (first.role !== 'existing' || (row && row.candidate_id !== candidate.id))
        return refuse('unavailable');
      const context = first.context;
      const authority = pending
        ? verifyMembershipCeremonyContext(
            context,
            pending.membership,
            { role, ...(role === 'existing' ? existing : candidate) },
            context.createdAt,
          )
        : await verifyCeremonyContext(
            context,
            { pin: issuer.pin, request: auth.request, receipt: auth.receipt },
            auth.successor,
            { epoch: 2, head: auth.successor.head },
            { role, ...(role === 'existing' ? existing : candidate) },
            context.createdAt,
          );
      await verifyCeremonyCommit(authority, first, 'existing', context.createdAt);
      const next: Row = row ?? {
        workspace_id: request.workspaceId,
        candidate_id: candidate.id,
        existing_commit: JSON.stringify(first),
        new_commit: null,
        existing_reveal: null,
        new_reveal: null,
        decision: null,
        cancellation: null,
        expired: 0,
      };
      const pair = next.new_commit
        ? await verifyCeremonyPair(authority, first, JSON.parse(next.new_commit), context.createdAt)
        : null;
      for (const [who, raw] of [
        ['existing', next.existing_reveal],
        ['new', next.new_reveal],
      ] as const)
        if (raw) {
          if (!pair) return refuse('unavailable');
          await verifyCeremonyReveal(pair, JSON.parse(raw), who, context.createdAt);
        }
      const contextHash = await ceremonyContextHash(context);
      const opening =
        pair && next.existing_reveal && next.new_reveal
          ? await deriveCeremonyExchange(
              pair,
              JSON.parse(next.existing_reveal),
              JSON.parse(next.new_reveal),
              context.createdAt,
            )
          : null;
      for (const [action, raw] of [
        ['decide', next.decision],
        ['cancel', next.cancellation],
      ] as const) {
        if (!raw) continue;
        const saved = parseCeremonyRequest(JSON.parse(raw)),
          p = saved.payload as { contextHash: string; transcriptHash?: string };
        if (
          saved.action !== action ||
          saved.workspaceId !== request.workspaceId ||
          saved.v !== request.v ||
          (saved.v === 2 &&
            request.v === 2 &&
            (saved.head !== request.head || saved.preparationId !== request.preparationId)) ||
          p.contextHash !== contextHash ||
          (action === 'decide' &&
            (!opening ||
              p.transcriptHash !== opening.transcriptHash ||
              saved.credentialId !== existing.id))
        )
          return refuse('unavailable');
        const key =
          saved.credentialId === existing.id
            ? existing.sPub
            : saved.credentialId === candidate.id
              ? candidate.sPub
              : '';
        await verifySignature(key, saved.signature, await ceremonyRequestMessage(saved));
      }
      if (next.decision && next.cancellation) return refuse('unavailable');
      const setOnce = (
        field:
          | 'existing_commit'
          | 'new_commit'
          | 'existing_reveal'
          | 'new_reveal'
          | 'decision'
          | 'cancellation',
        value: unknown,
      ) => {
        const wire = JSON.stringify(value);
        if (next[field] && next[field] !== wire) throw Error('Conflicting ceremony message');
        if (next[field] === wire) return;
        if (next.decision || next.cancellation || next.expired) throw Error('Terminal ceremony');
        next[field] = wire;
      };
      const live = () =>
        Number.isSafeInteger(now()) && now() >= context.createdAt && now() < context.expiresAt;
      if (!row && !live()) return refuse('expired');
      if (!live() && !next.decision && !next.cancellation) next.expired = 1;
      if (request.action === 'commit') {
        await verifyCeremonyCommit(authority, incoming!, role, context.createdAt);
        setOnce(role === 'existing' ? 'existing_commit' : 'new_commit', incoming);
      } else if (request.action === 'reveal') {
        if (!pair) return refuse('commitments-required');
        const reveal = await verifyCeremonyReveal(pair, request.payload, role, context.createdAt);
        setOnce(role === 'existing' ? 'existing_reveal' : 'new_reveal', reveal);
      } else if (request.action === 'decide' || request.action === 'cancel') {
        const p = request.payload as { contextHash: string; transcriptHash?: string };
        if (p.contextHash !== contextHash) return refuse('context-changed');
        if (
          request.action === 'decide' &&
          (role !== 'existing' || !opening || p.transcriptHash !== opening.transcriptHash)
        )
          return refuse('invalid-decision');
        setOnce(request.action === 'decide' ? 'decision' : 'cancellation', request);
      }
      hook('after-verify', operation);
      db.exec('BEGIN IMMEDIATE');
      if (!same(capture(), before)) {
        db.exec('ROLLBACK');
        continue;
      }
      issuer.check(auth.seal, before.authority.promotion.request_digest, auth.a.acceptanceKey);
      const completeAuthorization = issuer.authorize?.(db, {
        kind: 'enrollment',
        workspaceId: request.workspaceId,
        credentialId: request.credentialId,
        attemptId: preparation.context.attemptId,
        action: 'ceremony',
      });
      requireNoRemoval(db, request.workspaceId);
      hook('before-commit', operation);
      if (!live() && request.action !== 'read' && !same(next, before.row)) {
        db.exec('ROLLBACK');
        return refuse('expired');
      }
      if (!live() && !next.decision && !next.cancellation) next.expired = 1;
      issuer.check(auth.seal, before.authority.promotion.request_digest, auth.a.acceptanceKey);
      const values = [
        next.workspace_id,
        next.candidate_id,
        next.existing_commit,
        next.new_commit,
        next.existing_reveal,
        next.new_reveal,
        next.decision,
        next.cancellation,
        next.expired,
      ];
      if (request.v === 2)
        db.prepare(`INSERT INTO membership_ceremonies VALUES (?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(workspace_id,preparation_id) DO UPDATE SET
          new_commit=excluded.new_commit, existing_reveal=excluded.existing_reveal,
          new_reveal=excluded.new_reveal, decision=excluded.decision,
          cancellation=excluded.cancellation, expired=excluded.expired`).run(
          request.workspaceId,
          request.preparationId,
          request.head,
          ...values.slice(1),
        );
      else
        db.prepare('INSERT OR REPLACE INTO content_ceremonies VALUES (?,?,?,?,?,?,?,?,?)').run(
          ...values,
        );
      completeAuthorization?.();
      db.exec('COMMIT');
      hook('after-commit', operation);
      return view(next);
    } catch (cause) {
      if (db.isTransaction) db.exec('ROLLBACK');
      rethrowAuthorization(cause);
      return refuse('unavailable');
    }
  }
  return refuse('state-changed');
}
