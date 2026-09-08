/** Private Yjs preparation. Never lend the canonical document to a command or observer. */
import { Y, createDoc, applyUpdate, encodeState, type YDoc } from './yjs';
import type { Bytes } from './custodyCrypto';
import type { JournalRecovery } from './custody';

export type PrepareIntent = (
  draft: YDoc,
  intent: Bytes,
  maxUpdateBytes: number,
) => void | { readonly remaining: Bytes };
export const newWriterId = (): number => {
  const doc = createDoc(),
    id = doc.clientID;
  doc.destroy();
  return id;
};
export const cloneDocument = (source: YDoc): YDoc => {
  const doc = createDoc(),
    bytes = encodeState(source);
  try {
    applyUpdate(doc, bytes);
    return doc;
  } catch (error) {
    doc.destroy();
    throw error;
  } finally {
    bytes.fill(0);
  }
};
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
): { update: Bytes; remaining?: Bytes } => {
  const draft = cloneDocument(canonical),
    input = intent.slice(),
    updates: Bytes[] = [];
  draft.clientID = writer;
  const capture = (update: Uint8Array) => updates.push(new Uint8Array(update));
  draft.on('update', capture);
  let remaining: Bytes | undefined;
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
        !('remaining' in result) ||
        !(result.remaining instanceof Uint8Array) ||
        !result.remaining.length ||
        result.remaining.length >= intent.length
      )
        throw Error(
          'A slice must return a strictly smaller remaining byte intent. Preparation must be synchronous.',
        );
      remaining = result.remaining.slice();
    }
    const update = new Uint8Array(updates.length ? Y.mergeUpdates(updates) : [0, 0]);
    return { update, ...(remaining ? { remaining } : {}) };
  } catch (error) {
    remaining?.fill(0);
    throw error;
  } finally {
    input.fill(0);
    for (const update of updates) update.fill(0);
    draft.off('update', capture);
    draft.destroy();
  }
};
