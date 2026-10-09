/** One-time, permit-owned conversion of the old local-only Account journal dialect. */
import type { SessionTask } from './writeSession';
import type { verifyAccountUnderPermit } from './accountStartup';
import { prepareAccountCustody } from './custody';
import { claimScope } from './localGenesisRecord';
import { signPromotion, withPromotionRoot, writePromotion } from './promotionRecord';
import { encodeSourceCapsule, captureCatalog, captureError } from './sourceCapture';
import { eraseJournalSnapshot } from './journalStore';
import { fields, hex, type Bytes } from './custodyCrypto';
import { assertAdmittedEnvelope } from '../../account-protocol/envelope';
import type { OpenedRecord } from './contentRecord';

type Verified = Awaited<ReturnType<typeof verifyAccountUnderPermit>>;

export async function activateAccountUpload(task: SessionTask, v: Verified, code: string) {
  if (v.marker.v !== 4 && v.marker.v !== 5 && !v.marker.captureBootstrap) return v;
  const scope = claimScope(v.claim),
    owner = prepareAccountCustody({ ...scope, resolvePrincipal: () => scope.principalId }, code);
  let records: OpenedRecord[] = [];
  const capsules = new Map<string, Bytes>();
  const hash = async (bytes: Bytes) =>
    hex(new Uint8Array(await task.wait(() => crypto.subtle.digest('SHA-256', bytes))));
  try {
    await owner.initialize(task);
    const journal = await owner.journal.readSnapshot(task);
    try {
      if (v.marker.captureBootstrap && journal.length)
        captureError('Frozen upload conversion has unexpected journal entries');
      const flushed = await owner.journal.flush(task, journal, (task, updates) =>
        owner.carrier.append(
          task,
          updates.map((bytes) => ({ kind: 'update', bytes })),
        ),
      );
      if (flushed.retained) throw Error('Journal cleanup must finish before enabling upload');
    } finally {
      eraseJournalSnapshot(journal);
    }
    records = await owner.carrier.load(task);
    if (
      records.some((r) => r.kind === 'heads') ||
      (!v.marker.captureBootstrap && records.some((r) => r.kind === 'outbound'))
    )
      captureError('Local-only Account has unclassified upload records');
    let marker = v.marker;
    // Fresh v4 writing is already in the admitted genesis. v5 may contain edited/compacted
    // records without source attribution. Upload their exact frames as a system migration;
    // embedded card authors remain unchanged. Never re-encode a pending Yjs union.
    if (marker.v === 5 || marker.captureBootstrap) {
      const census: [number, string, string][] = [];
      for (const r of records.filter((r) => r.kind === 'update' || r.kind === 'state')) {
        const digest = await hash(r.bytes);
        census.push([r.seq, r.kind, digest]);
        const id = (
          await hash(fields('done/upload-bootstrap/v1', marker.id, String(r.seq), digest))
        ).slice(0, 32);
        const source = { actor: 'system', kind: 'system' as const, bytes: r.bytes };
        // Check both carrier and network limits before installing the conversion fence.
        assertAdmittedEnvelope(
          {
            v: 2,
            workspace_id: v.route.workspace,
            credential_id: v.route.credential,
            epoch: 1,
            gen: 1,
            seq: 1,
          },
          { actor_id: source.actor, actor_kind: source.kind, updates: [r.bytes] },
        );
        capsules.set(id, encodeSourceCapsule({ ...v.route, v: 1, id, sources: [source] }));
      }
      const digest = await hash(fields('done/upload-bootstrap-census/v1', JSON.stringify(census)));
      if (marker.captureBootstrap && marker.captureBootstrap !== digest)
        captureError('Frozen upload source census changed');
      const retained = captureCatalog(records, v.route);
      for (const [id, bytes] of retained)
        if (!capsules.has(id) || hex(capsules.get(id)!) !== hex(bytes))
          captureError('Frozen upload capsule changed');
      if (!marker.captureBootstrap) {
        marker = await withPromotionRoot(task, v.claim, v.record, code, async (root, subtle) => {
          const next = await signPromotion(
            root,
            {
              ...marker,
              v: 6,
              stage: 'account-capturing',
              captureBootstrap: digest,
            },
            subtle,
          );
          await writePromotion(task, v.claim, v.record, v.record, marker, next);
          return next;
        });
      }
      for (const [id, bytes] of capsules)
        if (!retained.has(id)) await owner.carrier.append(task, [{ kind: 'outbound', bytes }]);
    }
    marker = await withPromotionRoot(task, v.claim, v.record, code, async (root, subtle) => {
      const { captureBootstrap: _bootstrap, ...rest } = marker;
      const next = await signPromotion(root, { ...rest, v: 6, stage: 'account-capturing' }, subtle);
      await writePromotion(task, v.claim, v.record, v.record, marker, next);
      return next;
    });
    return { ...v, marker };
  } finally {
    for (const r of records) r.bytes.fill(0);
    for (const bytes of capsules.values()) bytes.fill(0);
    owner.dispose();
  }
}
