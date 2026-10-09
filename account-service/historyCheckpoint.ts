import {
  isPrunedCheckpoint,
  verifyPrunedCheckpoint,
  preparePrunedCheckpoint,
} from './prunedCheckpoint.ts';
import { preparePrunedDecision, isPrunedDecision, verifyPrunedDecision } from './prunedDecision.ts';
import { historySources } from './historySources.ts';
/** Durable proposal/admission and explicit covered-ciphertext pruning; decision ledgers remain complete. */
import type { DatabaseSync } from 'node:sqlite';
import { same } from '../account-protocol/admission.ts';
import {
  EMPTY_HISTORY_CHECKPOINT,
  HISTORY_CHECKPOINT_LIMIT,
  HISTORY_ADMISSION_LIMIT,
  HISTORY_HEAD_LIMIT,
  historyCheckpointHash,
  verifyHistoryCheckpoint,
  verifyHistoryCheckpointParent,
  verifyHistoryCheckpointAdmission,
  type HistoryCheckpoint,
  type HistoryCheckpointAdmission,
} from '../account-protocol/historyCheckpoint.ts';
import {
  parseHistoryExchange,
  verifyHistoryExchange,
  historyExchangeHash,
  checkHistoryExchangeLifetime,
  parseHistoryCatalog,
  verifyHistoryCatalog,
  type HistoryCatalog,
  type HistoryCheckpointPage,
} from '../account-protocol/historyExchange.ts';
import { membershipState } from '../account-protocol/membership.ts';
import {
  verifyEarlyHistory,
  verifyCertificationHistory,
  extendMembershipHistory,
  historyMembership,
  type AdmissionHistory,
} from '../account-protocol/admissionHistory.ts';
import { decodePositionResponse } from '../account-protocol/positionDecision.ts';
import {
  snapshot,
  snapshotBytes,
  selectPublisher,
  census,
  verifyCurrentWorkspaceAuthority,
  type DeliveryIssuer,
  type DeliveryHook,
  type Snapshot,
  type DeliveryAuthority,
} from './delivery.ts';
import { membershipProofChain } from './membershipLocator.ts';
import { membershipEnabled } from './membershipStore.ts';
import { rethrowAuthorization } from './authorization.ts';

export const HISTORY_CHECKPOINT_SCHEMA = `
 CREATE TABLE history_checkpoint_records (
  workspace_id TEXT NOT NULL, hash TEXT NOT NULL, sequence INTEGER NOT NULL CHECK(sequence>0),
  checkpoint TEXT NOT NULL, admission TEXT,
  PRIMARY KEY(workspace_id,hash), UNIQUE(workspace_id,sequence));
 CREATE UNIQUE INDEX history_checkpoint_pending ON history_checkpoint_records(workspace_id) WHERE admission IS NULL;
 CREATE TABLE history_checkpoint_catalog (workspace_id TEXT PRIMARY KEY, value TEXT NOT NULL);
 CREATE TABLE history_checkpoint_discards (
  workspace_id TEXT NOT NULL, hash TEXT NOT NULL, credential_id TEXT NOT NULL, request TEXT NOT NULL,
  PRIMARY KEY(workspace_id,hash,credential_id));`;
export interface HistoryCheckpointIssuer extends DeliveryIssuer {
  pruneSign(bytes: Uint8Array): Promise<string>;
  catalog(value: HistoryCatalog): Promise<HistoryCatalog>;
  historyPage(value: HistoryCheckpointPage): Promise<HistoryCheckpointPage>;
}
interface RecordRow {
  workspace_id: string;
  hash: string;
  sequence: number;
  checkpoint: string;
  admission: string | null;
}
const no = (refusal: string) => ({ ok: false as const, refusal });
const zero = EMPTY_HISTORY_CHECKPOINT;
/** Resolve historical eligibility from the same verified chain, never a producer-supplied key. */
async function memberships(s: Snapshot, auth: DeliveryAuthority, pin: DeliveryIssuer['pin']) {
  const base = { pin, request: auth.request, receipt: auth.receipt },
    result = new Map<number, AdmissionHistory>();
  result.set(1, await verifyEarlyHistory(base));
  if (auth.successor) result.set(2, await verifyEarlyHistory(base, auth.successor));
  if (auth.certificationSuccessor) {
    const c = auth.certificationSuccessor;
    result.set(
      3,
      await verifyCertificationHistory(c, auth.successor, base, { epoch: 3, head: c.head }),
    );
  }
  if (s.recoveries?.length || s.rotations?.length || s.continuations?.length) {
    let latest = result.get(auth.certificationSuccessor ? 3 : auth.successor ? 2 : 1)!;
    for (const proof of membershipProofChain(s).continuations) {
      latest = await extendMembershipHistory(proof, latest);
      result.set(latest.current.tip, latest);
    }
  }
  const current = result.get(auth.a.tip);
  if (!current || current.current.head !== auth.a.head)
    throw Error('History checkpoint membership changed');
  return result;
}
function record(db: DatabaseSync, workspace: string, hash: string): RecordRow | null {
  if (hash === zero) return null;
  const n = db
    .prepare(
      'SELECT length(CAST(checkpoint AS BLOB))+coalesce(length(CAST(admission AS BLOB)),0) AS n FROM history_checkpoint_records WHERE workspace_id=? AND hash=?',
    )
    .get(workspace, hash);
  if (n && Number(n.n) > HISTORY_CHECKPOINT_LIMIT + HISTORY_ADMISSION_LIMIT)
    throw Error('Retained history checkpoint too large');
  return (
    (db
      .prepare('SELECT * FROM history_checkpoint_records WHERE workspace_id=? AND hash=?')
      .get(workspace, hash) as unknown as RecordRow) ?? null
  );
}
export async function exchangeHistoryCheckpoint(
  db: DatabaseSync,
  input: unknown,
  issuer: HistoryCheckpointIssuer,
  now: () => number,
  hook: DeliveryHook,
) {
  if (!membershipEnabled(db)) return no('unavailable');
  let r;
  try {
    r = parseHistoryExchange(input);
  } catch {
    return no('malformed');
  }
  const requestedHash =
    r.action === 'publish'
      ? await historyCheckpointHash(r.payload)
      : r.action === 'admit'
        ? (r.payload as HistoryCheckpointAdmission).checkpointHash
        : r.action === 'discard'
          ? (r.payload as string)
          : null;
  const capture = () => {
    const original = snapshot(db, r.workspaceId);
    if (!original) return null;
    const publishers = db
      .prepare(
        'SELECT credential_id FROM publisher_witnesses WHERE account_id=? UNION SELECT credential_id FROM publisher_decisions WHERE account_id=? LIMIT ?',
      )
      .all(original.account.id, original.account.id, HISTORY_HEAD_LIMIT + 1);
    if (publishers.length > HISTORY_HEAD_LIMIT) throw Error('Too many history publishers');
    const streams = publishers.map((v) => snapshot(db, r.workspaceId, String(v.credential_id))!);
    const raw = db
      .prepare('SELECT value FROM history_checkpoint_catalog WHERE workspace_id=?')
      .get(r.workspaceId)?.value;
    const catalog = raw ? parseHistoryCatalog(JSON.parse(String(raw))) : null;
    if (
      !catalog &&
      db
        .prepare('SELECT 1 FROM history_checkpoint_records WHERE workspace_id=? LIMIT 1')
        .get(r.workspaceId)
    )
      throw Error('Missing history catalog');
    const hashes = [
      ...new Set(
        [
          catalog?.latest,
          catalog?.previous,
          catalog?.pending,
          requestedHash,
          ...(r.action === 'prune' && catalog
            ? db
                .prepare(
                  'SELECT hash FROM history_checkpoint_records WHERE workspace_id=? AND sequence<? AND admission IS NOT NULL',
                )
                .all(r.workspaceId, catalog.sequence - 1)
                .map((row) => String(row.hash))
            : []),
        ].filter((v): v is string => Boolean(v) && v !== zero),
      ),
    ];
    return {
      original,
      streams,
      handoffs: historySources(
        db,
        r.workspaceId,
        original,
        r.action === 'source' ? (r.payload as string) : undefined,
      ),
      catalog,
      discard: requestedHash
        ? (db
            .prepare(
              'SELECT * FROM history_checkpoint_discards WHERE workspace_id=? AND hash=? AND credential_id=?',
            )
            .get(r.workspaceId, requestedHash, r.credentialId) ?? null)
        : null,
      records: hashes.map((hash) => ({ hash, row: record(db, r.workspaceId, hash) })),
    };
  };
  const captureBytes = (c: ReturnType<typeof capture>) =>
    c
      ? JSON.stringify({
          ...c,
          original: snapshotBytes(c.original),
          streams: c.streams.map(snapshotBytes),
        })
      : 'null';
  for (let retry = 0; retry < 4; retry++) {
    try {
      db.exec('BEGIN');
      const before = capture();
      db.exec('ROLLBACK');
      if (!before) return no('unavailable');
      const auth = await verifyCurrentWorkspaceAuthority(before.original, issuer),
        authorities = await memberships(before.original, auth, issuer.pin);
      const membership = historyMembership(authorities.get(auth.a.tip)!),
        p = membershipState(membership);
      await verifyHistoryExchange(r, membership, now());
      if (before.discard) {
        const old = parseHistoryExchange(JSON.parse(String(before.discard.request))),
          at = authorities.get(old.epoch);
        if (
          !at ||
          old.action !== 'discard' ||
          old.payload !== requestedHash ||
          old.workspaceId !== r.workspaceId ||
          old.credentialId !== r.credentialId ||
          before.discard.workspace_id !== old.workspaceId ||
          before.discard.hash !== old.payload ||
          before.discard.credential_id !== old.credentialId
        )
          throw Error('Invalid retained checkpoint cancellation');
        // The signed intent remains evidence after its network lifetime has elapsed.
        await verifyHistoryExchange(old, historyMembership(at), old.expiresAt - 1);
      }
      const rawCatalog = before.catalog;
      const catalog = rawCatalog
        ? await verifyHistoryCatalog(rawCatalog, issuer.pin, p.workspaceId, p.lineageId)
        : {
            v: 1 as const,
            kind: 'history-checkpoint-catalog' as const,
            workspaceId: p.workspaceId,
            lineageId: p.lineageId,
            sequence: 0,
            latest: zero,
            previous: zero,
            pending: zero,
            signature: '00'.repeat(64),
          };
      const rows = new Map(before.records.map((v) => [v.hash, v.row]));
      const retired = new Map<string, Awaited<ReturnType<typeof verifyPrunedCheckpoint>>>();
      const verified = new Map<
        string,
        { checkpoint: HistoryCheckpoint; admission: HistoryCheckpointAdmission | null }
      >();
      const get = async (hash: string, required = true) => {
        if (hash === zero) return null;
        if (verified.has(hash)) return verified.get(hash)!;
        const row = rows.get(hash);
        if (!row) {
          if (required) throw Error('Missing retained history checkpoint');
          return null;
        }
        const raw = JSON.parse(row.checkpoint);
        if (isPrunedCheckpoint(raw)) {
          const receipt = await verifyPrunedCheckpoint(raw, issuer.pin, {
            workspace: p.workspaceId,
            lineage: p.lineageId,
            hash,
            sequence: row.sequence,
            admission: row.admission ? JSON.parse(row.admission) : null,
          });
          if (
            row.workspace_id !== p.workspaceId ||
            row.hash !== hash ||
            receipt.sequence >= catalog.sequence - 1
          )
            throw Error('Required checkpoint was pruned');
          retired.set(hash, receipt);
          if (r.action === 'publish' && requestedHash === hash) {
            const cp = r.payload as HistoryCheckpoint,
              at = authorities.get(cp.manifest.epoch);
            if (
              !at ||
              cp.manifest.sequence !== receipt.sequence ||
              cp.manifest.parent !== receipt.parent ||
              (await historyCheckpointHash(cp)) !== hash
            )
              throw Error('Retried checkpoint changed');
            await verifyHistoryCheckpointAdmission(receipt.admission, cp, historyMembership(at));
            const value = { checkpoint: cp, admission: receipt.admission };
            verified.set(hash, value);
            return value;
          }
          if (required) throw Error('Required checkpoint ciphertext was pruned');
          return null;
        }
        const history = authorities.get(raw.manifest?.epoch);
        if (!history) throw Error('Unknown checkpoint epoch');
        const at = historyMembership(history),
          checkpoint = await verifyHistoryCheckpoint(raw, at);
        if (
          row.workspace_id !== p.workspaceId ||
          row.hash !== hash ||
          row.sequence !== checkpoint.manifest.sequence ||
          hash !== (await historyCheckpointHash(checkpoint))
        )
          throw Error('Retained checkpoint identity changed');
        const admission = row.admission
          ? await verifyHistoryCheckpointAdmission(JSON.parse(row.admission), checkpoint, at)
          : null;
        const value = { checkpoint, admission };
        verified.set(hash, value);
        return value;
      };
      const latest = await get(catalog.latest),
        previous = await get(catalog.previous),
        pending = await get(catalog.pending);
      if (
        (latest &&
          (!latest.admission || latest.checkpoint.manifest.sequence !== catalog.sequence)) ||
        (previous && !previous.admission) ||
        (pending && pending.admission)
      )
        throw Error('History catalog admission changed');
      if (latest && catalog.sequence <= 2)
        await verifyHistoryCheckpointParent(latest.checkpoint, previous?.checkpoint ?? null);
      else if (latest && previous)
        await verifyHistoryCheckpointParent(latest.checkpoint, previous.checkpoint);
      if (pending)
        await verifyHistoryCheckpointParent(pending.checkpoint, latest?.checkpoint ?? null);
      const eligible = [
        ...p.heads,
        ...p.finalized.map((h) => ({
          credentialId: h.credential,
          position: h.position,
          link: h.link,
        })),
      ].sort((a, b) => (a.credentialId < b.credentialId ? -1 : 1));
      if (
        eligible.length > HISTORY_HEAD_LIMIT ||
        before.streams.some((s) => !eligible.some((h) => h.credentialId === s.publisher))
      )
        throw Error('Unknown retained publisher');
      const ledgers = new Map<string, Awaited<ReturnType<typeof census>>>();
      const currentHeads = [];
      for (const head of eligible) {
        if (p.roster.some((m) => m.id === head.credentialId && m.state === 'pending')) {
          if (before.streams.some((s) => s.publisher === head.credentialId))
            throw Error('Pending publisher has delivery state');
          currentHeads.push({ ...head });
          continue;
        }
        const s =
          head.credentialId === auth.request.candidate.signer
            ? before.original
            : (before.streams.find((s) => s.publisher === head.credentialId) ?? {
                ...before.original,
                publisher: head.credentialId,
                publisherWitness: null,
                rows: [],
              });
        const ledger = await census(s, selectPublisher(auth, head.credentialId));
        ledgers.set(head.credentialId, ledger);
        currentHeads.push({
          credentialId: head.credentialId,
          position: ledger.through,
          link: ledger.previous,
        });
      }
      const verifyCuts = (c: HistoryCheckpoint) => {
        for (const h of c.heads) {
          const ledger = ledgers.get(h.credentialId);
          if (h.position === 0) continue;
          const accepted = ledger?.accepted.get(h.position),
            proof = accepted ? decodePositionResponse(accepted) : null;
          if (!proof || proof.kind !== 'accepted' || proof.head.link !== h.link)
            throw Error('Checkpoint cut is not an accepted prefix');
        }
      };
      // Admitted snapshots never conceal decision-ledger damage, including after ciphertext pruning.
      for (const item of verified.values()) verifyCuts(item.checkpoint);
      if (r.action === 'source' && !before.handoffs.source) return no('source-unavailable');
      let selected =
        r.action === 'read' && r.payload !== 'catalog'
          ? await get(catalog[r.payload as 'latest' | 'previous' | 'pending'])
          : null;
      let write: {
        checkpoint: HistoryCheckpoint;
        admission: HistoryCheckpointAdmission | null;
        hash: string;
      } | null = null;
      let completedAdmission: HistoryCheckpointAdmission | null = null;
      let remove: string | null = null,
        changed = !rawCatalog;
      const next = { ...catalog };
      if (r.action === 'publish') {
        const old = await get(requestedHash!, false);
        if (old) selected = old;
        else {
          if (before.discard) return no('checkpoint-cancelled');
          if (pending) return no('checkpoint-busy');
          const checkpoint = await verifyHistoryCheckpoint(r.payload, membership);
          if (checkpoint.manifest.producer !== r.credentialId) return no('invalid-proof');
          await verifyHistoryCheckpointParent(checkpoint, latest?.checkpoint ?? null);
          verifyCuts(checkpoint);
          if (!same(checkpoint.sources, before.handoffs.sources)) return no('sources-changed');
          write = { checkpoint, admission: null, hash: requestedHash! };
          selected = write;
          next.pending = requestedHash!;
          changed = true;
        }
      } else if (r.action === 'admit') {
        const old = await get(requestedHash!, false);
        if (!old) {
          const receipt = retired.get(requestedHash!);
          if (!receipt) return no('checkpoint-required');
          if (!same(receipt.admission, r.payload)) return no('admission-conflict');
          completedAdmission = receipt.admission;
        } else if (old.admission) {
          if (!same(old.admission, r.payload)) return no('admission-conflict');
          selected = old;
        } else {
          if (next.pending !== requestedHash) return no('checkpoint-conflict');
          const admission = await verifyHistoryCheckpointAdmission(
            r.payload,
            old.checkpoint,
            membership,
          );
          if (admission.admittingCredential !== r.credentialId) return no('invalid-proof');
          verifyCuts(old.checkpoint);
          if (!same(old.checkpoint.sources, before.handoffs.sources)) return no('sources-changed');
          await verifyHistoryCheckpointParent(old.checkpoint, latest?.checkpoint ?? null);
          write = { checkpoint: old.checkpoint, admission, hash: requestedHash! };
          selected = write;
          next.previous = next.latest;
          next.latest = requestedHash!;
          next.pending = zero;
          next.sequence = old.checkpoint.manifest.sequence;
          changed = true;
        }
      } else if (r.action === 'discard') {
        if (pending) {
          if (r.payload !== next.pending) return no('checkpoint-conflict');
          if (
            pending.checkpoint.manifest.epochHead === p.head &&
            pending.checkpoint.manifest.producer !== r.credentialId
          )
            return no('invalid-proof');
          remove = next.pending;
          next.pending = zero;
          changed = true;
        }
      }
      const retiredSnapshots: { hash: string; receipt: string }[] = [];
      const pruned: { publisher: string | undefined; ordinal: number; bytes: Uint8Array }[] = [];
      if (r.action === 'prune') {
        if (
          !latest?.admission ||
          !previous?.admission ||
          !same(r.payload, { latest: catalog.latest, previous: catalog.previous })
        )
          return no('retention-boundary-changed');
        for (const item of before.records) {
          if (
            !item.row ||
            item.row.sequence >= previous.checkpoint.manifest.sequence ||
            !item.row.admission
          )
            continue;
          const old = await get(item.hash, false);
          if (!old) continue; // Already compacted receipts were authenticated by get.
          if (!old.admission) throw Error('Unadmitted history cannot be pruned');
          verifyCuts(old.checkpoint);
          const receipt = await preparePrunedCheckpoint(
            old.checkpoint,
            old.admission,
            issuer.pruneSign,
          );
          await verifyPrunedCheckpoint(JSON.parse(receipt), issuer.pin, {
            workspace: p.workspaceId,
            lineage: p.lineageId,
            hash: item.hash,
            sequence: old.checkpoint.manifest.sequence,
            admission: old.admission,
          });
          retiredSnapshots.push({ hash: item.hash, receipt });
        }
        for (const stream of [before.original, ...before.streams]) {
          const publisher = stream.publisher ?? auth.credential;
          const floor = previous.checkpoint.heads.find((h) => h.credentialId === publisher);
          const newest = latest.checkpoint.heads.find((h) => h.credentialId === publisher);
          if (
            !floor ||
            !newest ||
            newest.position < floor.position ||
            (newest.position === floor.position && newest.link !== floor.link)
          )
            continue;
          for (const row of stream.rows) {
            if (
              row.kind !== 'accepted' ||
              row.position > floor.position ||
              isPrunedDecision(row.submission)
            )
              continue;
            const bytes = await preparePrunedDecision(
              row,
              selectPublisher(auth, publisher),
              { latest: catalog.latest, previous: catalog.previous },
              issuer.pruneSign,
            );
            await verifyPrunedDecision(
              bytes,
              new Uint8Array(row.response),
              selectPublisher(auth, publisher),
              row.ordinal,
              auth.a.tip,
            );
            pruned.push({ publisher: stream.publisher, ordinal: row.ordinal, bytes });
          }
        }
      }
      const signedCatalog = changed ? await issuer.catalog(next) : catalog;
      await verifyHistoryCatalog(signedCatalog, issuer.pin, p.workspaceId, p.lineageId);
      const page = await issuer.historyPage({
        v: 1,
        kind: 'history-checkpoint-page',
        requestHash: await historyExchangeHash(r),
        catalog: signedCatalog,
        checkpoint: selected?.checkpoint ?? null,
        admission: selected?.admission ?? completedAdmission,
        heads: currentHeads,
        sources: before.handoffs.sources,
        source: before.handoffs.source,
        signature: '00'.repeat(64),
      });
      hook('after-verify', 'history-checkpoint');
      db.exec('BEGIN IMMEDIATE');
      if (captureBytes(capture()) !== captureBytes(before)) {
        db.exec('ROLLBACK');
        continue;
      }
      issuer.check(auth.seal, before.original.promotion.request_digest, auth.a.acceptanceKey);
      const complete = issuer.authorize?.(db, {
        kind: 'workspace',
        workspaceId: r.workspaceId,
        credentialId: r.credentialId,
        action: 'checkpoint',
      });
      for (const item of retiredSnapshots)
        db.prepare(
          'UPDATE history_checkpoint_records SET checkpoint=? WHERE workspace_id=? AND hash=?',
        ).run(item.receipt, p.workspaceId, item.hash);
      for (const item of pruned) {
        if (item.publisher)
          db.prepare(
            "UPDATE publisher_decisions SET submission=? WHERE account_id=? AND credential_id=? AND ordinal=? AND kind='accepted'",
          ).run(item.bytes, before.original.account.id, item.publisher, item.ordinal);
        else
          db.prepare(
            "UPDATE delivery_decisions SET submission=? WHERE account_id=? AND ordinal=? AND kind='accepted'",
          ).run(item.bytes, before.original.account.id, item.ordinal);
      }
      if (write) {
        if (rows.get(write.hash))
          db.prepare(
            'UPDATE history_checkpoint_records SET admission=? WHERE workspace_id=? AND hash=?',
          ).run(JSON.stringify(write.admission), p.workspaceId, write.hash);
        else
          db.prepare('INSERT INTO history_checkpoint_records VALUES (?,?,?,?,?)').run(
            p.workspaceId,
            write.hash,
            write.checkpoint.manifest.sequence,
            JSON.stringify(write.checkpoint),
            write.admission ? JSON.stringify(write.admission) : null,
          );
      }
      if (remove)
        db.prepare(
          'DELETE FROM history_checkpoint_records WHERE workspace_id=? AND hash=? AND admission IS NULL',
        ).run(p.workspaceId, remove);
      if (r.action === 'discard' && !before.discard)
        db.prepare('INSERT INTO history_checkpoint_discards VALUES (?,?,?,?)').run(
          r.workspaceId,
          r.payload as string,
          r.credentialId,
          JSON.stringify(r),
        );
      if (changed)
        db.prepare(
          'INSERT INTO history_checkpoint_catalog VALUES (?,?) ON CONFLICT(workspace_id) DO UPDATE SET value=excluded.value',
        ).run(p.workspaceId, JSON.stringify(signedCatalog));
      hook('before-commit', 'history-checkpoint');
      checkHistoryExchangeLifetime(r.expiresAt, now());
      complete?.();
      db.exec('COMMIT');
      hook('after-commit', 'history-checkpoint');
      return { ok: true as const, page };
    } catch (cause) {
      if (db.isTransaction) db.exec('ROLLBACK');
      rethrowAuthorization(cause);
      return no('unavailable');
    }
  }
  return no('state-changed');
}
