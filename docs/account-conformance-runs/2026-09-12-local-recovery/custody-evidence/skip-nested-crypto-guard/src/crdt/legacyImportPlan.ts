/** Explicit lossy Markdown adapter. No raw source Yjs ids, keys or runtime are restored. */
import { replayLegacyExport } from './legacyExport';
import { Y, hasPendingUpdates, type YDoc } from './yjs';
import { parseCardList, parseDay, serializeDay } from './serialize';
import { SECTIONS, newCard, cardBody, unfiledCards, type Section } from './days';
import { exportEntries } from './export';
import { hex, utf8 } from './custodyCrypto';
import { MAX_JOURNAL_UPDATE } from './journalCodec';
import type { SessionTask } from './writeSession';

export class LegacyImportError extends Error {
  override readonly name = 'LegacyImportError';
  constructor(readonly reason: string) {
    super(reason);
  }
}
export function refuseImport(reason: string): never {
  throw new LegacyImportError(reason);
}
export const IMPORT_POLICY = 'markdown-system-v1';
const IMPORT_RECEIPT_PREFIX = 'import.pre-active.v1';
export const importReceiptKey = (cursor: number) => `${IMPORT_RECEIPT_PREFIX}:${cursor}`;
export interface LegacyImportInput {
  readonly recovery: Uint8Array<ArrayBuffer>;
  readonly recoveryDigest: string;
  readonly sourceOrigin: string;
  readonly sourceDigest: string;
  readonly policy: typeof IMPORT_POLICY;
}
export interface ImportBinding {
  policy: typeof IMPORT_POLICY;
  recoveryDigest: string;
  sourceOrigin: string;
  sourceDigest: string;
  planDigest: string;
}
export type ImportAction =
  | { kind: 'init' }
  | { kind: 'day'; date: string; empty: boolean }
  | { kind: 'card'; index: number; date: string | null; section: Section | null }
  | { kind: 'text'; index: number | null; text: string };
export interface ImportPlan {
  binding: ImportBinding;
  actions: ImportAction[];
  entries: { path: string; content: string }[];
  unfiled: string[];
}
const sha = async (value: string) =>
  hex(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(value))));
export const copyImportInput = (input: LegacyImportInput): LegacyImportInput => {
  if (
    !input ||
    Object.keys(input).sort().join(',') !==
      'policy,recovery,recoveryDigest,sourceDigest,sourceOrigin' ||
    input.policy !== IMPORT_POLICY ||
    !(input.recovery instanceof Uint8Array) ||
    input.recovery.length > 64 * 1024 * 1024 ||
    !/^[a-f0-9]{64}$/u.test(input.recoveryDigest) ||
    !/^[a-f0-9]{64}$/u.test(input.sourceDigest) ||
    typeof input.sourceOrigin !== 'string' ||
    input.sourceOrigin.length > 4096
  )
    return refuseImport('invalid-import-input');
  return {
    policy: IMPORT_POLICY,
    recovery: input.recovery.slice(),
    recoveryDigest: input.recoveryDigest,
    sourceOrigin: input.sourceOrigin,
    sourceDigest: input.sourceDigest,
  };
};
export const prepareImportPlan = async (
  task: SessionTask,
  input: LegacyImportInput,
): Promise<ImportPlan> => {
  const replay = await task.wait(() => replayLegacyExport(input.recovery, input.recoveryDigest));
  if (replay.origin !== input.sourceOrigin || replay.sourceDigest !== input.sourceDigest)
    refuseImport('import-source-binding-mismatch');
  const actions: ImportAction[] = [{ kind: 'init' }];
  const entries: ImportPlan['entries'] = [];
  let unfiled: string[] = [],
    index = 0;
  const addText = (text: string, card: number | null) => {
    for (let start = 0; start < text.length;) {
      let end = Math.min(start + 1024, text.length);
      if (end < text.length && /[\uD800-\uDBFF]/u.test(text[end - 1]!)) end--;
      actions.push({ kind: 'text', index: card, text: text.slice(start, end) });
      start = end;
      if (actions.length > 100000) refuseImport('import-action-limit');
    }
  };
  const addCard = (body: string, date: string | null, section: Section | null) => {
    const card = index++;
    actions.push({ kind: 'card', index: card, date, section });
    addText(body, card);
  };
  for (const entry of replay.entries) {
    if (entry.path === 'master.md') {
      entries.push(entry);
      addText(entry.content, null);
    } else if (entry.path.startsWith('days/')) {
      const date = entry.path.slice(5, -3),
        parsed = parseDay(entry.content);
      if (serializeDay(parsed) !== entry.content) refuseImport('noncanonical-import-day');
      entries.push(entry);
      actions.push({
        kind: 'day',
        date,
        empty: SECTIONS.every((section) => parsed[section].length === 0),
      });
      for (const section of SECTIONS)
        for (const body of parsed[section]) addCard(body, date, section);
    } else if (entry.path === 'unfiled.md') {
      const prefix =
        '# Unfiled\n\nCards retained because no normal collection can currently display them.\n\n## Cards\n\n';
      const at = entry.content.indexOf('\n\n## Provenance\n\n');
      if (!entry.content.startsWith(prefix) || at < prefix.length)
        refuseImport('unsupported-import-unfiled');
      unfiled = parseCardList(entry.content.slice(prefix.length, at));
      for (const body of unfiled) addCard(body, null, null);
    } else refuseImport('unsupported-import-entry');
  }
  if (actions.length > 100000) refuseImport('import-action-limit');
  const planDigest = await task.wait(() => sha(JSON.stringify([IMPORT_POLICY, actions])));
  return {
    binding: {
      policy: IMPORT_POLICY,
      recoveryDigest: input.recoveryDigest,
      sourceOrigin: input.sourceOrigin,
      sourceDigest: input.sourceDigest,
      planDigest,
    },
    actions,
    entries,
    unfiled,
  };
};
export const importCardId = (intent: string, index: number) =>
  `${intent}-${String(index).padStart(6, '0')}`;
export const applyImportAction = (
  doc: YDoc,
  action: ImportAction,
  intent: string,
  createdAt: string,
) => {
  const meta = doc.getMap('meta');
  if (action.kind === 'init') {
    meta.set('schemaVersion', 4);
    meta.set('createdAt', createdAt);
    meta.set('actor:system', { kind: 'system', name: 'done', color: '#8a8a8a' });
  } else if (action.kind === 'day') {
    const day = new Y.Map();
    // The predecessor exports empty archive files. Keep their file presence without inventing cards.
    if (action.empty)
      day.set('archive', new Y.Text(serializeDay({ next: [], scheduled: [], done: [] })));
    else for (const section of SECTIONS) day.set(section, new Y.Array<string>());
    doc.getMap('days').set(action.date, day);
  } else if (action.kind === 'card') {
    const id = importCardId(intent, action.index);
    doc.getMap('cards').set(id, newCard('', 'system', { id, origin: null, createdAt }));
    if (action.date && action.section) {
      const day = doc.getMap<Y.Map<Y.Array<string>>>('days').get(action.date)!;
      day.get(action.section)!.push([id]);
      doc.getMap('cardLocations').set(id, `${action.date}:${action.section}`);
    }
  } else {
    const text =
      action.index === null
        ? doc.getText('master')
        : (doc
            .getMap<Y.Map<unknown>>('cards')
            .get(importCardId(intent, action.index))!
            .get('text') as Y.Text);
    text.insert(text.length, action.text);
  }
};
export const importCursor = (doc: YDoc, intent: string, plan: ImportPlan, expected: number) => {
  const value = doc.getMap('meta').get(importReceiptKey(expected));
  if (
    hasPendingUpdates(doc) ||
    JSON.stringify(value) !== JSON.stringify([intent, plan.binding.planDigest, expected])
  )
    refuseImport('import-receipt-mismatch');
};
export const encodeImportSlice = (
  doc: YDoc,
  plan: ImportPlan,
  intent: string,
  createdAt: string,
  cursor: number,
) => {
  const before = Y.encodeStateVector(doc);
  doc.transact(
    () => {
      applyImportAction(doc, plan.actions[cursor]!, intent, createdAt);
      // This receipt and logical change must stay in the same encoded update/native commit.
      doc
        .getMap('meta')
        .set(importReceiptKey(cursor + 1), [intent, plan.binding.planDigest, cursor + 1]);
    },
    { actor: 'system', kind: 'system', device: intent },
  );
  const bytes = new Uint8Array(Y.encodeStateAsUpdate(doc, before));
  if (bytes.length > MAX_JOURNAL_UPDATE) refuseImport('import-update-limit');
  return bytes;
};
export const verifyImportedProjection = (
  doc: YDoc,
  plan: ImportPlan,
  intent: string,
  createdAt: string,
) => {
  importCursor(doc, intent, plan, plan.actions.length);
  const entries = exportEntries(doc, doc.getText('master').toString()).filter(
    (e) => e.path !== 'unfiled.md',
  );
  if (
    JSON.stringify(entries) !== JSON.stringify(plan.entries) ||
    JSON.stringify(unfiledCards(doc).map(({ card }) => cardBody(card))) !==
      JSON.stringify(plan.unfiled)
  )
    refuseImport('import-projection-mismatch');
  const cards = doc.getMap<Y.Map<unknown>>('cards');
  const expectedCards = plan.actions.filter((a) => a.kind === 'card');
  if (cards.size !== expectedCards.length) refuseImport('import-card-count-mismatch');
  for (let i = 0; i < cards.size; i++) {
    const id = importCardId(intent, i),
      card = cards.get(id);
    if (
      !card ||
      card.get('id') !== id ||
      card.get('author') !== 'system' ||
      card.get('origin') !== null ||
      card.get('createdAt') !== createdAt
    )
      refuseImport('import-attribution-mismatch');
  }
};
