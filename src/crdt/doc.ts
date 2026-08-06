/**
 * The document tree (TRD §4.2).
 *
 * ```
 * Y.Doc (root)
 * ├── meta      Y.Map    { schemaVersion, createdAt, settings, actors }
 * ├── master       Y.Text                       ← document, never freezes
 * ├── days         Y.Map<ISODate, Y.Map>        ← ordered card-id collections
 * ├── cards        Y.Map<CardId, Card>          ← canonical card content
 * └── cardLocations Y.Map<CardId, string>       ← canonical membership
 * ```
 *
 * Phase 1 left `days` out rather than stubbing it, on the grounds that Yjs
 * creates root types lazily and an empty map would have been a claim that was
 * not yet true. Phase 2 makes it true, and no migration was needed — which is
 * the property that was being protected.
 */

import { newMap, transact, type YDoc, type YMap, type YText } from './yjs';
import type { Origin } from './actors';
import { cardLocationsMap, cardsMap, daysMap, migrateCardsToRegistry } from './days';

export const SCHEMA_VERSION = 2;

export interface Settings {
  /** Hour at which the day rolls over, in the last-known timezone (PRD §8). */
  rolloverHour: number;
}

export const DEFAULT_SETTINGS: Settings = { rolloverHour: 0 };

export interface DocumentTree {
  doc: YDoc;
  meta: YMap<unknown>;
  /** The master list. A document, not a collection. Never freezes (PRD §6). */
  master: YText;
  /** Days, created lazily on first write. An untouched day occupies nothing. */
  days: YMap<unknown>;
  /** Canonical cards; day collections contain only their stable ids. */
  cards: YMap<YMap<unknown>>;
  /** Canonical card membership, separate so a Card itself never carries a date. */
  cardLocations: YMap<string>;
}

/**
 * Opens the tree, initialising `meta` on first run. Idempotent: safe to call
 * against a document that IndexedDB has already populated.
 */
export const openTree = (doc: YDoc, origin: Origin): DocumentTree => {
  const meta = doc.getMap('meta');
  const master = doc.getText('master');
  const days = daysMap(doc);
  const cards = cardsMap(doc);
  const cardLocations = cardLocationsMap(doc);

  const storedVersion = readSchemaVersion(meta);
  if (storedVersion < 2) migrateCardsToRegistry(doc, origin);

  transact(doc, origin, () => {
    if (storedVersion < SCHEMA_VERSION) meta.set('schemaVersion', SCHEMA_VERSION);
    if (!meta.has('createdAt')) meta.set('createdAt', new Date().toISOString());
    if (!meta.has('settings')) {
      const settings = newMap<unknown>();
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) settings.set(key, value);
      meta.set('settings', settings);
    }
  });

  return { doc, meta, master, days, cards, cardLocations };
};

export const readSchemaVersion = (meta: YMap<unknown>): number =>
  typeof meta.get('schemaVersion') === 'number' ? (meta.get('schemaVersion') as number) : 0;

export const readSettings = (meta: YMap<unknown>): Settings => {
  const stored = meta.get('settings') as YMap<unknown> | undefined;
  const rolloverHour = stored?.get('rolloverHour');
  return {
    rolloverHour:
      typeof rolloverHour === 'number' && rolloverHour >= 0 && rolloverHour < 24
        ? rolloverHour
        : DEFAULT_SETTINGS.rolloverHour,
  };
};

export const setRolloverHour = (
  doc: YDoc,
  meta: YMap<unknown>,
  origin: Origin,
  hour: number,
): boolean => {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return false;
  const settings = meta.get('settings') as YMap<unknown> | undefined;
  if (!settings || settings.get('rolloverHour') === hour) return false;
  transact(doc, origin, () => settings.set('rolloverHour', hour));
  return true;
};
