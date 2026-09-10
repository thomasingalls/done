/** Private Yjs preparation. Never lend the canonical document to a command or observer. */
import { Y, createDoc, applyUpdate, forkDoc, sameDocState, type YDoc } from './yjs';
import type { SourceUpdate } from './sourceCapture';
import type { Bytes } from './custodyCrypto';
import type { JournalRecovery } from './custody';

/** Returned source buffers transfer to the admission owner and are erased on completion/refusal. */
export type PrepareIntent = (
  draft: YDoc,
  intent: Bytes,
  maxUpdateBytes: number,
) => void | { readonly remaining?: Bytes; readonly sources?: readonly SourceUpdate[] };
export const newWriterId = (): number => {
  const doc = createDoc(),
    id = doc.clientID;
  doc.destroy();
  return id;
};
export const cloneDocument = (source: YDoc): YDoc => forkDoc(source);
export const replayRecovery = (doc: YDoc, recovery: JournalRecovery): void => {
  for (const record of recovery.records)
    if (record.kind === 'update' || record.kind === 'state') applyUpdate(doc, record.bytes);
  for (const entry of recovery.journal) applyUpdate(doc, entry.bytes);
};
export const writerClock = (doc: YDoc, writer: number): number =>
  Y.decodeStateVector(Y.encodeStateVector(doc)).get(writer) ?? 0;

export const prepareIntent = (
  canonical: YDoc,
  writer: number,
  intent: Bytes,
  maxUpdateBytes: number,
  prepare: PrepareIntent,
): { update: Bytes; remaining?: Bytes; sources?: SourceUpdate[]; carrierBytes?: Bytes } => {
  const draft = cloneDocument(canonical),
    input = intent.slice(),
    updates: Bytes[] = [];
  draft.clientID = writer;
  const capture = (update: Uint8Array) => updates.push(new Uint8Array(update));
  draft.on('update', capture);
  let remaining: Bytes | undefined;
  let sources: SourceUpdate[] | undefined;
  try {
    let result: ReturnType<PrepareIntent>;
    draft.transact(() => {
      result = prepare(draft, input, maxUpdateBytes);
    });
    if (result! && typeof result === 'object' && 'then' in result) {
      void Promise.resolve(result).catch(() => {});
      throw Error('Preparation must be synchronous.');
    }
    if (result! !== undefined) {
      if (
        !result ||
        typeof result !== 'object' ||
        (!('remaining' in result) && !('sources' in result)) ||
        ('remaining' in result &&
          (!(result.remaining instanceof Uint8Array) ||
            !result.remaining.length ||
            result.remaining.length >= intent.length))
      )
        throw Error(
          'A slice must return a strictly smaller remaining byte intent. Preparation must be synchronous.',
        );
      remaining = result.remaining?.slice();
      if (result.sources) {
        if (!Array.isArray(result.sources)) throw Error('Invalid source updates');
        sources = result.sources.map((s) => ({ ...s }));
        if (
          !sources.length ||
          sources.length > 64 ||
          sources.some((s) => !(s.bytes instanceof Uint8Array))
        )
          throw Error('Invalid source updates');
        const sourced = cloneDocument(canonical);
        try {
          for (const s of sources) applyUpdate(sourced, s.bytes);
          if (!sameDocState(sourced, draft))
            throw Error('Source updates do not cover the prepared change');
        } finally {
          sourced.destroy();
        }
      }
    }
    const update = new Uint8Array(updates.length ? Y.mergeUpdates(updates) : [0, 0]);
    return { update, ...(remaining ? { remaining } : {}), ...(sources ? { sources } : {}) };
  } catch (error) {
    remaining?.fill(0);
    for (const s of sources ?? []) if (s.bytes instanceof Uint8Array) s.bytes.fill(0);
    throw error;
  } finally {
    input.fill(0);
    for (const update of updates) update.fill(0);
    draft.off('update', capture);
    draft.destroy();
  }
};
