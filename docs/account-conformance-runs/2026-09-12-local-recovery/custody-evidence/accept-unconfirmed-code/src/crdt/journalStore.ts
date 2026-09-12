import { hex, random, type Bytes } from './custodyCrypto';
import {
  createJournalCodec,
  JournalError,
  journalPrefix,
  MAX_JOURNAL_UPDATE,
  JOURNAL_WATERMARK,
} from './journalCodec';
import type { ContentIdentity } from './contentRecord';
import type { ContentReceipt } from './contentStore';
import type { SessionTask } from './writeSession';

export type JournalAdmission =
  | { readonly status: 'journalled'; readonly key: string; readonly generation: number }
  | { readonly status: 'refused'; readonly reason: 'oversize' | 'quota' | 'unavailable' };
export interface JournalUpdate {
  readonly key: string;
  readonly generation: number;
  readonly bytes: Bytes;
}
export interface ObservedEntry extends JournalUpdate {
  readonly value: string;
}
export interface JournalFlushReceipt {
  readonly contentReceipts: readonly ContentReceipt[];
  readonly removed: number;
  readonly retained: number;
}
const unavailable = (cause: unknown) =>
  new JournalError('unavailable', 'Synchronous journal storage is unavailable.', { cause });
const storage = (): Storage => {
  try {
    return globalThis.localStorage;
  } catch (cause) {
    throw unavailable(cause);
  }
};
const size = (key: string, value: string | null): number =>
  value === null ? 0 : key.length + value.length;
export const eraseJournalSnapshot = (entries: readonly JournalUpdate[]) => {
  for (const e of entries) e.bytes.fill(0);
};
export const JOURNAL_SNAPSHOT_ATTEMPTS = 3;
export const isJournalChanged = (cause: unknown): cause is JournalError =>
  cause instanceof JournalError && cause.code === 'journal-changed';

/** Yield outside every transaction, retaining the task/permit and waking promptly on close. */
const retrySnapshotAfter = (task: SessionTask, delay: number): Promise<void> =>
  task.wait(
    () =>
      new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer);
          task.signal.removeEventListener('abort', abort);
          reject(task.signal.reason);
        };
        const timer = setTimeout(() => {
          task.signal.removeEventListener('abort', abort);
          resolve();
        }, delay);
        task.signal.addEventListener('abort', abort, { once: true });
        if (task.signal.aborted) abort();
      }),
  );

/** Internal owner. Flush authority is supplied only by the actual content owner. */
export const createJournalOwner = (
  scope: ContentIdentity,
  dbName: string,
  generation: number,
  key: Bytes,
) => {
  const prefix = journalPrefix(dbName),
    writer = hex(random(16));
  const codec = createJournalCodec(scope.workspaceId, generation, key);
  let ordinal = 0,
    observedCharacters = 0,
    disposed = false;
  let damaged: JournalError | undefined;
  const alive = () => {
    if (disposed) throw new JournalError('unavailable', 'This journal owner is disposed.');
    if (damaged) throw damaged;
  };
  const changed = () =>
    new JournalError(
      'journal-changed',
      'The journal changed during its read; retry before admitting work.',
    );
  const onStorage = (event: StorageEvent) => {
    if (disposed) return;
    try {
      if (event.storageArea !== storage()) return;
    } catch {
      return;
    }
    // Events can lag other processes. The watermark is advisory; setItem's
    // synchronous success/refusal remains the append authority.
    if (event.key === null) {
      observedCharacters = 0;
      return;
    }
    observedCharacters = Math.max(
      0,
      observedCharacters + size(event.key, event.newValue) - size(event.key, event.oldValue),
    );
    if (
      event.key.startsWith(prefix) &&
      event.newValue !== null &&
      event.oldValue !== null &&
      event.newValue !== event.oldValue
    )
      damaged = new JournalError('repair-required', 'An immutable journal entry was replaced.');
  };
  globalThis.addEventListener?.('storage', onStorage);
  const snapshot = (): ObservedEntry[] => {
    alive();
    const opened: ObservedEntry[] = [];
    try {
      const s = storage(),
        keys = Object.keys(s),
        scoped = keys.filter((k) => k.startsWith(prefix)).sort();
      let characters = 0;
      // Own-key enumeration captures names before value reads. Missing/changed
      // captured entries refuse; newly appended suffixes are a later snapshot.
      for (const k of keys) {
        const value = s.getItem(k);
        if (value !== null) characters += size(k, value);
      }
      for (const k of scoped) {
        const value = s.getItem(k);
        if (value === null) throw changed();
        opened.push({ key: k, value, ...codec.open(k, value) });
      }
      const after = Object.keys(s)
        .filter((k) => k.startsWith(prefix))
        .sort();
      if (scoped.length !== after.length || scoped.some((k, i) => k !== after[i])) throw changed();
      for (const e of opened) {
        const current = s.getItem(e.key);
        if (current === null) throw changed();
        if (current !== e.value)
          throw new JournalError('repair-required', 'An immutable journal entry was replaced.');
      }
      observedCharacters = characters;
      return opened;
    } catch (cause) {
      eraseJournalSnapshot(opened);
      if (cause instanceof JournalError) {
        if (cause.code === 'repair-required') damaged = cause;
        throw cause;
      }
      throw unavailable(cause);
    }
  };
  return {
    snapshot,
    /** Read-only attempts only. The optional first failure is the synchronous invocation capture. */
    async readSnapshot(task: SessionTask, firstFailure?: JournalError): Promise<ObservedEntry[]> {
      if (firstFailure && !isJournalChanged(firstFailure)) throw firstFailure;
      let changed = firstFailure;
      for (let attempt = firstFailure ? 1 : 0; attempt < JOURNAL_SNAPSHOT_ATTEMPTS; attempt++) {
        if (changed) await retrySnapshotAfter(task, attempt === 1 ? 0 : 8);
        try {
          return task.step(snapshot);
        } catch (cause) {
          if (!isJournalChanged(cause)) throw cause;
          changed = cause;
        }
      }
      task.step(() => {});
      throw new JournalError(
        'journal-busy',
        'The journal kept changing during three read attempts.',
        {
          cause: changed,
        },
      );
    },
    get observedCharacters() {
      return observedCharacters;
    },
    append(update: Bytes): JournalAdmission {
      alive();
      if (!(update instanceof Uint8Array))
        throw new JournalError('invalid-input', 'A local update must be bytes.');
      if (update.byteLength > MAX_JOURNAL_UPDATE) return { status: 'refused', reason: 'oversize' };
      const next = ++ordinal;
      if (!Number.isSafeInteger(next)) return { status: 'refused', reason: 'unavailable' };
      const storageKey = `${prefix}${scope.storeId}.${writer}.${String(next).padStart(16, '0')}`;
      const estimatedCharacters = storageKey.length + 2 + 4 * Math.ceil((44 + update.length) / 3);
      if (observedCharacters + estimatedCharacters > JOURNAL_WATERMARK)
        return { status: 'refused', reason: 'quota' };
      try {
        const s = storage();
        if (s.getItem(storageKey) !== null)
          throw new JournalError(
            'repair-required',
            'Journal identity collision; existing entry retained.',
          );
        const value = codec.seal(storageKey, random(24), update);
        s.setItem(storageKey, value);
        observedCharacters += size(storageKey, value);
        return Object.freeze({ status: 'journalled', key: storageKey, generation });
      } catch (cause) {
        if (cause instanceof JournalError && cause.code === 'repair-required') {
          damaged = cause;
          throw cause;
        }
        return {
          status: 'refused',
          reason:
            cause instanceof DOMException && cause.name === 'QuotaExceededError'
              ? 'quota'
              : 'unavailable',
        };
      }
    },
    async flush(
      task: SessionTask,
      entries: ObservedEntry[],
      commit: (task: SessionTask, updates: Bytes[]) => Promise<ContentReceipt>,
    ): Promise<JournalFlushReceipt> {
      const contentReceipts: ContentReceipt[] = [],
        removed = { count: 0 },
        retained = { count: 0 };
      for (let offset = 0; offset < entries.length; offset += 256) {
        const batch = entries.slice(offset, offset + 256);
        contentReceipts.push(
          await commit(
            task,
            batch.map((e) => e.bytes),
          ),
        );
        task.step(() => {
          for (const entry of batch) {
            try {
              const s = storage(),
                current = s.getItem(entry.key);
              if (current === null) continue;
              if (current !== entry.value) {
                retained.count++;
                damaged = new JournalError(
                  'repair-required',
                  'A journal entry changed before cleanup.',
                );
                continue;
              }
              s.removeItem(entry.key);
              observedCharacters = Math.max(0, observedCharacters - size(entry.key, entry.value));
              removed.count++;
            } catch {
              retained.count++;
            }
          }
        });
      }
      return Object.freeze({
        contentReceipts: Object.freeze(contentReceipts),
        removed: removed.count,
        retained: retained.count,
      });
    },
    dispose() {
      disposed = true;
      globalThis.removeEventListener?.('storage', onStorage);
      codec.dispose();
    },
  };
};
