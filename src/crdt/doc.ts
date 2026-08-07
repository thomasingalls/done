/**
 * The document tree (TRD §4.2).
 *
 * ```
 * Y.Doc (root)
 * ├── meta      Y.Map    { schemaVersion, createdAt, setting.*, actor:* }
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

import { transact, type YDoc, type YMap, type YText } from './yjs';
import type { Origin } from './actors';
import { Temporal } from '../lib/temporal';
import { cardLocationsMap, cardsMap, daysMap, migrateCardsToRegistry } from './days';

export const SCHEMA_VERSION = 3;

export interface Settings {
  /** Hour at which the day rolls over, in the last-known timezone (PRD §8). */
  rolloverHour: number;
}

export const DEFAULT_SETTINGS: Settings = { rolloverHour: 0 };

const ROLLOVER_HOUR_KEY = 'setting.rolloverHour';

const validRolloverHour = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 24;

const legacyRolloverHour = (meta: YMap<unknown>): number | null => {
  const settings = meta.get('settings') as YMap<unknown> | undefined;
  const value = settings?.get('rolloverHour');
  return validRolloverHour(value) ? value : null;
};

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
    if (!meta.has('createdAt')) meta.set('createdAt', Temporal.Now.instant().toString());
    // Schema-v2 stored a nested settings map. Copy its value to a flat key so
    // fresh replicas never race by assigning two different Y.Maps to one key.
    const legacy = legacyRolloverHour(meta);
    if (!meta.has(ROLLOVER_HOUR_KEY) && legacy !== null) meta.set(ROLLOVER_HOUR_KEY, legacy);
  });

  return { doc, meta, master, days, cards, cardLocations };
};

export const readSchemaVersion = (meta: YMap<unknown>): number =>
  typeof meta.get('schemaVersion') === 'number' ? (meta.get('schemaVersion') as number) : 0;

export const readSettings = (meta: YMap<unknown>): Settings => {
  const direct = meta.get(ROLLOVER_HOUR_KEY);
  const rolloverHour = validRolloverHour(direct) ? direct : legacyRolloverHour(meta);
  return {
    rolloverHour: rolloverHour ?? DEFAULT_SETTINGS.rolloverHour,
  };
};

export const setRolloverHour = (
  doc: YDoc,
  meta: YMap<unknown>,
  origin: Origin,
  hour: number,
): boolean => {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return false;
  if (readSettings(meta).rolloverHour === hour) return false;
  transact(doc, origin, () => meta.set(ROLLOVER_HOUR_KEY, hour));
  return true;
};
