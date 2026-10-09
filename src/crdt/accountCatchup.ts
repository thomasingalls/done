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
import { heldInboundContext, inspectInbound } from './inboundLedger';
import { verifySpoolWitness } from './spoolRecord';
import { capturedRecovery } from './sourceCapture';
import { heldCaptureRoute, verifyInstalledSuccessor } from './accountSuccessor';

/** The permit keeps edits stopped while the authenticated capture ledger changes epoch. */
async function prepareUploadedCatchup(
  task: SessionTask,
  options: AccountStartupOptions,
  a: CheckpointAuthority,
  v: Awaited<ReturnType<typeof verifyAccountUnderPermit>>,
) {
  if (v.marker.catchup || v.marker.membership || v.route.generation !== 1 || v.route.epoch > 2)
    throw Error('Initial checkpoint requires the original device before certification');
  if (v.marker.successor && !same(v.marker.successor.artifact, a.successor))
    throw Error('Checkpoint cannot replace an installed admission');
  const scope = claimScope(v.claim);
  return withPromotionRoot(task, v.claim, v.record, options.code, async (root, subtle) => {
    const key = await openEnvelope(scope, root, v.record.envelope!, subtle);
    try {
      const signing = await openCredential(scope, root, v.marker.credentials![1], subtle),
        base = await heldInboundContext(v.marker, key, subtle, v.route),
        owner = prepareAccountCustody(
          { ...scope, resolvePrincipal: () => scope.principalId },
          options.code,
          (records, _task, counter) =>
            verifySpoolWitness(
              inspectInbound(records, v.route, base).delivery.spool,
              counter,
              subtle,
            ),
          true,
        );
      try {
        await owner.initialize(task);
        const records = await owner.carrier.load(task),
          doc = new Y.Doc({ gc: false });
        let journal: Awaited<ReturnType<typeof owner.journal.readSnapshot>> = [];
        let recovery: ReturnType<typeof capturedRecovery> | undefined;
        try {
          journal = await owner.journal.readSnapshot(task);
          const census = inspectInbound(records, v.route, base);
          recovery = capturedRecovery(
            { records: [...census.delivery.spool.sourceRecords], journal },
            v.route,
          );
          replayRecovery(doc, { records, journal: recovery.journal });
          const before = await owner.carrier.spoolWitness(task);
          const successor = {
            artifact: a.successor,
            certification: a.certification,
            before: v.marker.successor?.before ?? before,
            ...(v.marker.successor ? { certifiedBefore: before } : {}),
          };
          const route = await heldCaptureRoute({ ...v.marker, successor });
          // In particular, accepted heads cannot certify content missing from the local spool.
          await verifyInstalledSuccessor(census.delivery.spool, route, successor, subtle);
          const checkpoint = await createContentCheckpoint(
            doc,
            key,
            a,
            v.marker.handoff!.binding,
            async (bytes) => hex(new Uint8Array(await subtle.sign('Ed25519', signing, bytes))),
          );
          const next = await signPromotion(
            root,
            { ...v.marker, successor, catchup: checkpoint },
            subtle,
          );
          await writePromotion(task, v.claim, v.record, v.record, v.marker, next);
          return checkpoint;
        } finally {
          doc.destroy();
          for (const r of records) r.bytes.fill(0);
          for (const r of recovery?.journal ?? []) r.bytes.fill(0);
          eraseJournalSnapshot(journal);
        }
      } finally {
        owner.dispose();
      }
    } finally {
      key.fill(0);
    }
  });
}
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
  if (v.marker.v === 9) return prepareUploadedCatchup(task, options, a, v);
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
