import type { SessionTask } from './writeSession';
import { verifyAccountUnderPermit, type AccountStartupOptions } from './accountStartup';
import { withPromotionRoot, signPromotion, writePromotion } from './promotionRecord';
import { prepareAccountCustody } from './custody';
import { claimScope } from './localGenesisRecord';
import { openEnvelope, openCredential, hex } from './custodyCrypto';
import { emptySpoolWitness } from './contentRecord';
import { eraseJournalSnapshot } from './journalStore';
import { replayRecovery } from './admissionDocument';
import { Y } from './yjs';
import { createContentCheckpoint } from './contentCheckpoint';
import { same } from '../../account-protocol/admission';
import type { CheckpointAuthority } from '../../account-protocol/contentCheckpoint';
/** The checkpoint and source-capture fence commit together; old readers cannot append afterwards. */
export async function prepareAccountCatchup(
  task: SessionTask,
  options: AccountStartupOptions,
  a: CheckpointAuthority,
) {
  const v = await verifyAccountUnderPermit(task, options, 9);
  if (
    !same(v.marker.admission!.request, a.base.request) ||
    !same(v.marker.admission!.receipt, a.base.receipt) ||
    !same(v.marker.pin, a.base.pin)
  )
    throw Error('Catch-up account changed');
  if (v.marker.catchup) return v.marker.catchup;
  if (v.marker.v !== 4 && v.marker.v !== 5)
    throw Error('Catch-up requires the retained local-only Account');
  if (a.certification.epoch.heads.some((h) => h.position !== 0))
    throw Error('Catch-up cannot replace accepted history');
  const scope = claimScope(v.claim),
    owner = prepareAccountCustody(
      { ...scope, resolvePrincipal: () => scope.principalId },
      options.code,
    );
  try {
    await owner.initialize(task);
    const old = await owner.journal.readSnapshot(task);
    try {
      const receipt = await owner.journal.flush(task, old, (task, updates) =>
        owner.carrier.append(
          task,
          updates.map((bytes) => ({ kind: 'update', bytes })),
        ),
      );
      if (receipt.retained) throw Error('Journal cleanup must finish before capture');
    } finally {
      eraseJournalSnapshot(old);
    }
    const records = await owner.carrier.load(task),
      doc = new Y.Doc({ gc: false });
    try {
      if (records.some((r) => r.kind === 'heads' || r.kind === 'outbound'))
        throw Error('Unclassified Account history');
      replayRecovery(doc, { records, journal: [] });
      return await withPromotionRoot(
        task,
        v.claim,
        v.record,
        options.code,
        async (root, subtle) => {
          const key = await openEnvelope(scope, root, v.record.envelope!, subtle),
            signing = await openCredential(scope, root, v.marker.credentials![1], subtle);
          try {
            const checkpoint = await task.wait(() =>
              createContentCheckpoint(doc, key, a, v.marker.handoff!.binding, async (bytes) =>
                hex(new Uint8Array(await subtle.sign('Ed25519', signing, bytes))),
              ),
            );
            const next = await signPromotion(
              root,
              {
                ...v.marker,
                v: 6,
                stage: 'account-capturing',
                catchup: checkpoint,
                successor: {
                  artifact: a.successor,
                  certification: a.certification,
                  before: emptySpoolWitness(),
                },
              },
              subtle,
            );
            await writePromotion(task, v.claim, v.record, v.record, v.marker, next);
            return checkpoint;
          } finally {
            key.fill(0);
          }
        },
      );
    } finally {
      doc.destroy();
      for (const r of records) r.bytes.fill(0);
    }
  } finally {
    owner.dispose();
  }
}
