/**
 * Read-only preparation for the fixed predecessor `done` carrier. This observation
 * is neither authenticated source authority nor an old-writer fence. Never use it
 * to select a destination, create custody or delete source material.
 */
import { fromBase64, toBase64 } from 'lib0/buffer';
import { contentTransaction } from './contentDatabase';
import { probeDatabase } from './startupStorage';
import type { SessionTask } from './writeSession';
import { hasPendingUpdates, Y } from './yjs';

const PREFIX = 'done.pending-update.done.';
const MODERN_KEY =
  /^done\.pending-update\.done\.[0-9a-f]{32}\.[0-9a-f]{32}\.[0-9a-f]{32}\.[0-9]{16}$/u;
const ANCILLARY = ['done.actor', 'done.device', 'done.sync', 'done.sync.last'];
// Refusal bounds for this preparatory reader, not the eventual import capacity.
const MAX_ROWS = 4096;
const MAX_BYTES = 16 * 1024 * 1024;

export class LegacySourceError extends Error {
  override readonly name = 'LegacySourceError';
  constructor(readonly reason: string) {
    super(reason); // Do not put plaintext, local device names or relay credentials in diagnostics.
  }
}
function refuse(reason: string): never {
  throw new LegacySourceError(reason);
}

export interface LegacyUpdate {
  readonly key: number;
  readonly bytes: Uint8Array<ArrayBuffer>;
}
export interface LegacyLocalEntry {
  readonly key: string;
  readonly value: string;
}
export interface LegacySourceObservation {
  readonly kind: 'legacy-source-observation';
  readonly databasePresent: boolean;
  readonly updates: readonly LegacyUpdate[];
  readonly journal: readonly (LegacyLocalEntry & { readonly bytes: Uint8Array<ArrayBuffer> })[];
  readonly ancillary: readonly LegacyLocalEntry[];
  /** Integration only, not application-schema, attribution or export verification. */
  readonly dependencies: 'complete' | 'missing';
  /** Unkeyed digest of this observation. Equality does NOT certify quiescence or authenticity. */
  readonly digest: string;
}

export const readLegacyLocal = (task: SessionTask): LegacyLocalEntry[] =>
  task.step(() => {
    const storage = globalThis.localStorage;
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key === null) refuse('source-changed');
      if (ANCILLARY.includes(key) || (key.startsWith(PREFIX) && !MODERN_KEY.test(key)))
        keys.push(key);
      if (keys.length > MAX_ROWS) refuse('source-limit');
    }
    if (new Set(keys).size !== keys.length) refuse('source-changed');
    let bytes = 0;
    return keys.sort().map((key) => {
      const value = storage.getItem(key);
      if (value === null) return refuse('source-changed');
      bytes += (key.length + value.length) * 2;
      if (bytes > MAX_BYTES) refuse('source-limit');
      return { key, value };
    });
  });

export const readLegacyUpdates = (task: SessionTask): Promise<LegacyUpdate[] | null> =>
  probeDatabase(task, 'done', async (db) => {
    if (db.version !== 1 || [...db.objectStoreNames].sort().join(',') !== 'custom,updates')
      refuse('unsupported-legacy-layout');
    return task.wait(() =>
      contentTransaction<LegacyUpdate[]>(
        db,
        task,
        ['updates', 'custom'],
        'readonly',
        (tx, result, guard) => {
          for (const name of ['updates', 'custom']) {
            const store = tx.objectStore(name);
            if (
              store.keyPath !== null ||
              store.autoIncrement !== (name === 'updates') ||
              store.indexNames.length
            )
              refuse('unsupported-legacy-layout');
          }
          const custom = tx.objectStore('custom').count();
          custom.onsuccess = () =>
            guard(() => {
              if (custom.result !== 0) refuse('unsupported-legacy-custom-data');
            });
          const rows: LegacyUpdate[] = [];
          let total = 0;
          result(rows);
          const request = tx.objectStore('updates').openCursor();
          request.onsuccess = () =>
            guard(() => {
              const cursor = request.result;
              if (!cursor) return;
              if (
                typeof cursor.key !== 'number' ||
                !Number.isSafeInteger(cursor.key) ||
                cursor.key < 1 ||
                !(cursor.value instanceof Uint8Array)
              )
                refuse('unsupported-legacy-record');
              const bytes = new Uint8Array(cursor.value as Uint8Array);
              total += bytes.length;
              if (rows.length >= MAX_ROWS || total > MAX_BYTES) refuse('source-limit');
              rows.push({ key: cursor.key as number, bytes });
              cursor.continue();
            });
        },
      ),
    );
  });

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Captures WAL before the native readonly disk transaction, then detects observed
 * localStorage changes. Old tabs can still write after the last read (or ABA between
 * reads). The caller's SessionTask only owns cancellation/draining, not those tabs.
 * Returned plaintext is private preparatory input; callers must not log or persist it.
 */
export const inspectLegacySource = async (task: SessionTask): Promise<LegacySourceObservation> => {
  const local = readLegacyLocal(task);
  const journal = task.step(() =>
    local
      .filter((e) => e.key.startsWith(PREFIX))
      .map((entry) => {
        // Both historical short ids and UUID session ids fit this framing. Unknown
        // namespace suffixes remain a refusal, never something cleanup may ignore.
        if (!/^[A-Za-z0-9_-]+\.(0|[1-9][0-9]*)$/u.test(entry.key.slice(PREFIX.length)))
          return refuse('unsupported-legacy-journal-key');
        if (!entry.value.startsWith('1:')) return refuse('unsupported-legacy-journal-version');
        let bytes: Uint8Array<ArrayBuffer>;
        try {
          bytes = new Uint8Array(fromBase64(entry.value.slice(2)));
          if (toBase64(bytes) !== entry.value.slice(2)) return refuse('unreadable-legacy-journal');
        } catch {
          return refuse('unreadable-legacy-journal');
        }
        return { ...entry, bytes };
      }),
  );
  const disk = await readLegacyUpdates(task);
  const dependencies = task.step(() => {
    const doc = new Y.Doc({ gc: false });
    try {
      // Keep original framing, including pending structs/deletions. No partial merge.
      for (const row of [...journal, ...(disk ?? [])]) {
        Y.decodeUpdate(row.bytes);
        Y.applyUpdate(doc, row.bytes);
      }
      return hasPendingUpdates(doc) ? 'missing' : 'complete';
    } catch {
      return refuse('unreadable-legacy-update');
    } finally {
      doc.destroy();
    }
  });
  if (JSON.stringify(local) !== JSON.stringify(readLegacyLocal(task))) refuse('source-changed');
  const digest = await task.wait(async () =>
    hex(
      new Uint8Array(
        await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(
            JSON.stringify([
              'done/legacy-source-observation/v1',
              disk !== null,
              (disk ?? []).map((r) => [r.key, hex(r.bytes)]),
              local.map((e) => [e.key, e.value]),
            ]),
          ),
        ),
      ),
    ),
  );
  return {
    kind: 'legacy-source-observation',
    databasePresent: disk !== null,
    updates: disk ?? [],
    journal,
    ancillary: local.filter((e) => !e.key.startsWith(PREFIX)),
    dependencies,
    digest,
  };
};
