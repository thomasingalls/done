/** Explicit, read-only partial Local salvage. It never authorizes editing, repair, deletion or restore. */
import { readRecoveryCustody } from './custody';
import { readLocalClaim, verifyLocalClaim, claimScope } from './localGenesisRecord';
import { deriveStoreName } from './storeName';
import { probeDatabase } from './startupStorage';
import { contentTransaction } from './contentDatabase';
import { withExclusiveSlot, type SessionTask } from './writeSession';
import { parseStoredRecord } from './contentRecord';
import { journalPrefix } from './journalCodec';
import { Y, forkDoc, hasPendingUpdates, type YDoc } from './yjs';
import { SCHEMA_VERSION } from './doc';
import { stopStartup } from './startupState';
import { zip, type ZipEntry } from '../lib/zip';
import type { Bytes } from './custodyCrypto';

const MAX_ROWS = 4096,
  MAX_BYTES = 16 * 1024 * 1024;
export interface RecoveryReport {
  kind: 'partial-local-recovery';
  complete: false;
  authenticatedRecords: number;
  unreadableRecords: number;
  ignoredRecords: number;
  pendingDependencies: boolean;
  missingDatabase: boolean;
  recoveredFiles: number;
}
const census = (task: SessionTask, name: string) =>
  probeDatabase(task, name, async (db) => {
    const stores = [...db.objectStoreNames];
    if (
      db.version !== 1 ||
      stores.some((s) => !['content', 'heads', 'outbound', 'meta'].includes(s))
    )
      stopStartup('app-update-required', 'recovery-unsupported-layout');
    if (!stores.includes('content'))
      stopStartup('repair-required', 'recovery-content-store-missing');
    return contentTransaction<unknown[]>(db, task, ['content'], 'readonly', (tx, result, guard) => {
      const rows: unknown[] = [];
      let bytes = 0;
      result(rows);
      const request = tx.objectStore('content').openCursor();
      request.onsuccess = () =>
        guard(() => {
          const cursor = request.result;
          if (!cursor) return;
          if (rows.length >= MAX_ROWS) stopStartup('unavailable', 'recovery-row-budget');
          const value = cursor.value;
          if (value?.ct instanceof Uint8Array && (bytes += value.ct.length) > MAX_BYTES)
            stopStartup('unavailable', 'recovery-ciphertext-budget');
          rows.push(value);
          cursor.continue();
        });
    });
  });
const journalCensus = (task: SessionTask, prefix: string) =>
  task.step(() => {
    const entries = Object.keys(localStorage)
      .filter((k) => k.startsWith(prefix))
      .sort()
      .map((key) => {
        const value = localStorage.getItem(key);
        if (value === null) stopStartup('busy', 'recovery-journal-changed');
        return { key, value };
      });
    if (
      entries.length > MAX_ROWS ||
      entries.reduce((n, r) => n + r.value.length * 2, 0) > MAX_BYTES
    )
      stopStartup('unavailable', 'recovery-journal-budget');
    return entries;
  });
const recoveredEntries = (doc: YDoc): ZipEntry[] => {
  const schema = doc.getMap('meta').get('schemaVersion');
  if (schema !== undefined && schema !== SCHEMA_VERSION)
    stopStartup('app-update-required', 'recovery-unsupported-schema');
  const entries: ZipEntry[] = [];
  const master = doc.getText('master').toString();
  if (master) entries.push({ path: 'recovered/master.md', content: master });
  let index = 0;
  // Detached fragment names make no claim about current membership, order or attribution.
  for (const [, card] of [...doc.getMap('cards')].sort(([a], [b]) => a.localeCompare(b))) {
    if (!(card instanceof Y.Map)) continue;
    const text = card.get('text');
    if (text instanceof Y.Text && text.length)
      entries.push({
        path: `recovered/cards/${String(++index).padStart(6, '0')}.md`,
        content: text.toString(),
      });
  }
  index = 0;
  for (const [, day] of [...doc.getMap('days')].sort(([a], [b]) => a.localeCompare(b))) {
    if (!(day instanceof Y.Map)) continue;
    const archive = day.get('archive');
    if (archive instanceof Y.Text && archive.length)
      entries.push({
        path: `recovered/archives/${String(++index).padStart(6, '0')}.md`,
        content: archive.toString(),
      });
  }
  return entries;
};

export async function recoverLocalWriting(
  slotId: string,
  code: string,
  options: { signal?: AbortSignal } = {},
): Promise<{ report: RecoveryReport; archive: Bytes }> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) cancel();
  const deadline = setTimeout(cancel, 60000);
  try {
    return await withExclusiveSlot(
      slotId,
      async (task) => {
        const claim = await readLocalClaim(task, slotId);
        if (!claim || claim.stage !== 'ready')
          stopStartup('repair-required', 'recovery-needs-ready-local-claim');
        await verifyLocalClaim(task, claim, code);
        const scope = claimScope(claim),
          name = await task.wait(() => deriveStoreName(scope.principalId, scope.workspaceId));
        return readRecoveryCustody(
          task,
          { slotId, workspaceId: scope.workspaceId, resolvePrincipal: () => scope.principalId },
          code,
          async (reader) => {
            if (
              reader.storeId !== claim.initial.store_id ||
              reader.rootId !== claim.initial.root_id
            )
              stopStartup('repair-required', 'recovery-custody-identity-changed');
            const report: RecoveryReport = {
              kind: 'partial-local-recovery',
              complete: false,
              authenticatedRecords: 0,
              unreadableRecords: 0,
              ignoredRecords: 0,
              pendingDependencies: false,
              missingDatabase: false,
              recoveredFiles: 0,
            };
            let doc = new Y.Doc({ gc: false }),
              total = 0;
            const integrate = (bytes: Bytes) => {
              let candidate: YDoc | undefined;
              try {
                if ((total += bytes.length) > MAX_BYTES)
                  stopStartup('unavailable', 'recovery-byte-budget');
                Y.decodeUpdate(bytes);
                candidate = forkDoc(doc, false);
                Y.applyUpdate(candidate, bytes);
                doc.destroy();
                doc = candidate;
                candidate = undefined;
              } finally {
                candidate?.destroy();
                bytes.fill(0);
              }
            };
            try {
              const rows = await census(task, name);
              report.missingDatabase = rows === null;
              for (const raw of rows ?? []) {
                task.step(() => {});
                let record;
                try {
                  record = parseStoredRecord(raw);
                } catch {
                  report.unreadableRecords++;
                  continue;
                }
                if (!['state', 'update'].includes(record.kind)) {
                  report.ignoredRecords++;
                  continue;
                }
                let bytes: Bytes;
                try {
                  bytes = await reader.openRecord(record);
                  report.authenticatedRecords++;
                } catch {
                  task.step(() => {});
                  report.unreadableRecords++;
                  continue;
                }
                try {
                  integrate(bytes);
                } catch (e) {
                  task.step(() => {});
                  if (total > MAX_BYTES) throw e;
                  report.unreadableRecords++;
                }
              }
              const entries = journalCensus(task, journalPrefix(name));
              for (const [index, entry] of entries.entries()) {
                // Yield between bounded groups so cancellation can interrupt a large synchronous journal.
                if (index % 16 === 0)
                  await task.wait(() => new Promise<void>((r) => setTimeout(r, 0)));
                task.step(() => {});
                let bytes: Bytes;
                try {
                  bytes = reader.openJournal(entry.key, entry.value);
                  report.authenticatedRecords++;
                } catch {
                  task.step(() => {});
                  report.unreadableRecords++;
                  continue;
                }
                try {
                  integrate(bytes);
                } catch (e) {
                  task.step(() => {});
                  if (total > MAX_BYTES) throw e;
                  report.unreadableRecords++;
                }
              }
              if (
                JSON.stringify(entries) !== JSON.stringify(journalCensus(task, journalPrefix(name)))
              )
                stopStartup('busy', 'recovery-journal-changed');
              report.pendingDependencies = hasPendingUpdates(doc);
              const recovered = task.step(() => recoveredEntries(doc));
              report.recoveredFiles = recovered.length;
              const archive = task.step(() =>
                zip([
                  {
                    path: 'README.md',
                    content:
                      '# Partial recovered writing\n\nThis is not a verified complete workspace or backup. Writing may be missing, stale or duplicated. Missing keys or dependencies can hide acknowledged edits. Card order and attribution are not reconstructed. Keep the original browser data and your existing backups. No saved data was changed.\n\nThis archive contains plaintext writing. Keep it private.\n',
                  },
                  { path: 'recovery-report.json', content: JSON.stringify(report, null, 2) + '\n' },
                  ...recovered,
                ]),
              );
              return { report: Object.freeze(report), archive: new Uint8Array(archive) };
            } finally {
              doc.destroy();
            }
          },
        );
      },
      { signal: controller.signal },
    );
  } finally {
    clearTimeout(deadline);
    options.signal?.removeEventListener('abort', cancel);
  }
}
