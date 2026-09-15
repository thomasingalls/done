/** Owner-private projected values. Every public read is detached from this cache. */
import { Y, type YDoc, type YUndoManager } from './yjs';
import { listActors, type WorkspaceActorIdentity } from './actors';
import { readSettings } from './doc';
import {
  cardAt,
  cardBody,
  cardAuthor,
  cardOrigin,
  cardLocation,
  listDays,
  cardsIn,
  archiveOf,
  dayAt,
  collectionOf,
  type Section,
} from './days';
import type { createArchiveProjection } from './archiveProjection';
import type { WorkspaceSnapshot } from './admittedWorkspace';

type ArchiveProjection = ReturnType<typeof createArchiveProjection>;
const card = (doc: YDoc, id: string): WorkspaceSnapshot['cards'][number] => {
  const c = cardAt(doc, id)!;
  return {
    id,
    text: cardBody(c),
    author: cardAuthor(c),
    origin: cardOrigin(c),
    location: cardLocation(doc, id),
  };
};
const header = (doc: YDoc, identity: WorkspaceActorIdentity) => ({
  actors: structuredClone(listActors(doc)),
  settings: readSettings(doc.getMap('meta')),
  deviceName:
    typeof doc.getMap('meta').get(`device-label:${identity.device.id}`) === 'string'
      ? (doc.getMap('meta').get(`device-label:${identity.device.id}`) as string)
      : identity.device.name,
});
const archived = (doc: YDoc, date: string, projection: ArchiveProjection) => {
  const day = dayAt(doc, date),
    source = archiveOf(day);
  if (!source) return undefined;
  const parsed = projection.read(date, source.toString());
  for (const section of ['next', 'scheduled', 'done'] as const)
    if (collectionOf(day, section)) parsed[section] = [];
  return parsed;
};
/** Established full reader, shared by the reference and incremental paths. */
export const readWorkspaceSnapshot = (
  history: YUndoManager,
  identity: WorkspaceActorIdentity,
  projection: ArchiveProjection,
): WorkspaceSnapshot => {
  const doc = history.doc;
  projection.retain(new Set(listDays(doc).filter((date) => archiveOf(dayAt(doc, date)))));
  return {
    master: doc.getText('master').toString(),
    cards: [...doc.getMap('cards').keys()].sort().map((id) => card(doc, id)),
    days: listDays(doc).map((date) => ({
      date,
      next: cardsIn(doc, date, 'next').map((c) => c.get('id') as string),
      scheduled: cardsIn(doc, date, 'scheduled').map((c) => c.get('id') as string),
      done: cardsIn(doc, date, 'done').map((c) => c.get('id') as string),
      ...(archiveOf(dayAt(doc, date)) ? { archived: archived(doc, date, projection)! } : {}),
    })),
    ...header(doc, identity),
    undo: history.undoStack.length,
    redo: history.redoStack.length,
  };
};
export interface PublicationChanges {
  readonly basis: number;
  master: boolean;
  readonly cards: Set<string>;
  full: boolean;
}
/** Classification uses actual changed types, not transaction origin or command labels. */
export const recordPublicationChanges = (
  doc: YDoc,
  changes: PublicationChanges,
  transaction: Y.Transaction,
) => {
  if (changes.full) return;
  const cards = doc.getMap('cards');
  for (const changed of transaction.changed.keys()) {
    const target: unknown = changed;
    if (changed instanceof Y.Text && target === doc.share.get('master')) {
      changes.master = true;
      continue;
    }
    const parent = changed.parent;
    const id = parent instanceof Y.Map ? parent.get('id') : undefined;
    if (
      changed instanceof Y.Text &&
      parent instanceof Y.Map &&
      parent.parent === cards &&
      typeof id === 'string' &&
      cards.get(id) === parent &&
      parent.get('text') === changed
    ) {
      changes.cards.add(id);
      continue;
    }
    changes.full = true;
    break;
  }
};
// A pair may span independently encoded Yjs fragments. Refresh all surrogate-bearing fields,
// even valid displayed pairs, rather than guessing whether a fork preserves their visible text.
const sensitive = (value: unknown): boolean => {
  if (typeof value === 'string') return /[\uD800-\uDFFF]/.test(value);
  if (Array.isArray(value)) return value.some(sensitive);
  if (value && typeof value === 'object')
    return Object.entries(value).some(([key, entry]) => sensitive(key) || sensitive(entry));
  return false;
};
const cacheSnapshot = (value: WorkspaceSnapshot, revision: number) => {
  const cards = [...value.cards],
    days = [...value.days];
  const cardIndices = new Map(cards.map((c, i) => [c.id, i]));
  const dayIndices = new Map(days.map((d, i) => [d.date, i]));
  return {
    revision,
    value: { ...value, cards, days } as WorkspaceSnapshot,
    cards,
    days,
    cardIndices,
    dayIndices,
    // Normalized keys can change membership/order/collisions, requiring the full reader.
    stableShape:
      cards.every((c) => !sensitive(c.id)) &&
      days.every((d) => !sensitive([d.date, d.next, d.scheduled, d.done])),
    masterSensitive: sensitive(value.master),
    sensitiveCards: new Set(cards.filter(sensitive).map((c) => c.id)),
    sensitiveArchives: new Set(days.filter((d) => sensitive(d.archived)).map((d) => d.date)),
  };
};
export const createWorkspacePublication = (
  identity: WorkspaceActorIdentity,
  projection: ArchiveProjection,
) => {
  let cached: ReturnType<typeof cacheSnapshot> | undefined;
  return {
    clear() {
      cached = undefined;
    },
    advance(history: YUndoManager, revision: number, changes?: PublicationChanges) {
      if (
        !cached ||
        !cached.stableShape ||
        !changes ||
        changes.full ||
        changes.basis !== cached.revision
      ) {
        cached = undefined;
        return;
      }
      const doc = history.doc;
      const ids = new Set([...changes.cards]);
      const replacements: [number, WorkspaceSnapshot['cards'][number]][] = [];
      const nextSensitive = new Set<string>();
      for (const id of ids) {
        const index = cached.cardIndices.get(id);
        if (index === undefined || !cardAt(doc, id)) {
          cached = undefined;
          return;
        }
        const value = card(doc, id);
        replacements.push([index, value]);
        if (sensitive(value)) nextSensitive.add(id);
      }
      const archives: [number, Readonly<Record<Section, readonly string[]>>][] = [];
      const nextArchives = new Set<string>();
      for (const date of [] as string[]) {
        const index = cached.dayIndices.get(date),
          value = archived(doc, date, projection);
        if (index === undefined || !value) {
          cached = undefined;
          return;
        }
        archives.push([index, value]);
        if (sensitive(value)) nextArchives.add(date);
      }
      const master =
        changes.master
          ? doc.getText('master').toString()
          : cached.value.master;
      // Metadata can normalize during the fork too. Read the small header from the new basis.
      const metadata = header(doc, identity);
      // Commit private projected values only after every source read succeeds.
      for (const [index, value] of replacements) cached.cards[index] = value;
      for (const [index, value] of archives)
        cached.days[index] = { ...cached.days[index]!, archived: value };
      cached.sensitiveCards = nextSensitive;
      cached.sensitiveArchives = nextArchives;
      cached.masterSensitive = sensitive(master);
      cached.revision = revision;
      cached.value = {
        ...cached.value,
        ...metadata,
        master,
        undo: history.undoStack.length,
        redo: history.redoStack.length,
      };
    },
    read(history: YUndoManager, revision: number): WorkspaceSnapshot {
      if (!cached || cached.revision !== revision)
        cached = cacheSnapshot(readWorkspaceSnapshot(history, identity, projection), revision);
      // Runtime history can be cleared without a content revision (the growth diagnostic).
      // These two live counters are constant-time; cached content still requires a revision.
      if (
        cached.value.undo !== history.undoStack.length ||
        cached.value.redo !== history.redoStack.length
      )
        cached.value = {
          ...cached.value,
          undo: history.undoStack.length,
          redo: history.redoStack.length,
        };
      return structuredClone(cached.value);
    },
  };
};
