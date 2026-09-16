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
  };
  const signature = await issuer.bootstrap(result);
  db.exec('BEGIN');
  try {
    if (!same(snapshotWorkspaceAuthority(db, workspaceId), snapshot))
      return refuse('state-changed');
    issuer.check(auth.seal, snapshot.promotion.request_digest, auth.a.acceptanceKey);
    return { ...result, signature };
  } finally {
    db.exec('ROLLBACK');
  }
}
export async function relayCeremony(
  db: DatabaseSync,
  input: unknown,
  issuer: DeliveryIssuer,
  now: () => number,
  hook: DeliveryHook,
) {
  let request;
  try {
    request = parseCeremonyRequest(input);
  } catch {
    return refuse('malformed');
  }
  const capture = () => ({
    authority: snapshotWorkspaceAuthority(db, request.workspaceId),
    row:
      (db
        .prepare('SELECT * FROM content_ceremonies WHERE workspace_id=?')
        .get(request.workspaceId) as unknown as Row | undefined) ?? null,
  });
  for (let retry = 0; retry < 4; retry++) {
    try {
      db.exec('BEGIN');
      const before = capture();
      db.exec('COMMIT');
      if (!before.authority) return refuse('unavailable');
      const auth = await verifyWorkspaceAuthority(before.authority, issuer);
      if (!auth.successor) return refuse('not-admitted');
      const e = auth.successor.epoch,
        existing = e.certified.value.members[0],
        c = e.preparation.context.candidate;
      const candidate = { id: c.credentialId, wPub: c.wPub, sPub: c.sPub };
      const role =
        request.credentialId === existing.id
          ? 'existing'
          : request.credentialId === candidate.id
            ? 'new'
            : null;
      if (!role) return refuse('invalid-proof');
      await verifySignature(
        role === 'existing' ? existing.sPub : candidate.sPub,
        request.signature,
        await ceremonyRequestMessage(request),
      );
      const row = before.row ? { ...before.row } : null;
      const incoming = request.action === 'commit' ? parseCeremonyCommit(request.payload) : null;
      if (!row && !(incoming && role === 'existing'))
        return request.action === 'read' ? view(null) : refuse('not-started');
      const first = row ? parseCeremonyCommit(JSON.parse(row.existing_commit)) : incoming!;
      if (first.role !== 'existing' || (row && row.candidate_id !== candidate.id))
        return refuse('unavailable');
      const context = first.context;
      const authority = await verifyCeremonyContext(
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
      hook('after-verify', 'content-ceremony');
      db.exec('BEGIN IMMEDIATE');
      if (!same(capture(), before)) {
        db.exec('ROLLBACK');
        continue;
      }
      issuer.check(auth.seal, before.authority.promotion.request_digest, auth.a.acceptanceKey);
      hook('before-commit', 'content-ceremony');
      if (!live() && request.action !== 'read' && !same(next, before.row)) {
        db.exec('ROLLBACK');
        return refuse('expired');
      }
      if (!live() && !next.decision && !next.cancellation) next.expired = 1;
      issuer.check(auth.seal, before.authority.promotion.request_digest, auth.a.acceptanceKey);
      db.prepare('INSERT OR REPLACE INTO content_ceremonies VALUES (?,?,?,?,?,?,?,?,?)').run(
        next.workspace_id,
        next.candidate_id,
        next.existing_commit,
        next.new_commit,
        next.existing_reveal,
        next.new_reveal,
        next.decision,
        next.cancellation,
        next.expired,
      );
      db.exec('COMMIT');
      hook('after-commit', 'content-ceremony');
      return view(next);
    } catch {
      if (db.isTransaction) db.exec('ROLLBACK');
      return refuse('unavailable');
    }
  }
  return refuse('state-changed');
}
