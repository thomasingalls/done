/**
 * The document tree (TRD §4.2).
 *
 * Phase 1 realises the part of the tree the editor needs: `meta` and the
 * `master` document. `days` is deliberately absent rather than stubbed —
 * Yjs creates root types lazily, so Phase 2 can add it without a migration,
 * and an empty `days` map now would only be a claim that isn't true yet.
 */

import { newMap, transact, type YDoc, type YMap, type YText } from './yjs';
import type { Origin } from './actors';

export const SCHEMA_VERSION = 1;

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
}

/**
 * Opens the tree, initialising `meta` on first run. Idempotent: safe to call
 * against a document that IndexedDB has already populated.
 */
export const openTree = (doc: YDoc, origin: Origin): DocumentTree => {
  const meta = doc.getMap('meta');
  const master = doc.getText('master');

  transact(doc, origin, () => {
    if (!meta.has('schemaVersion')) meta.set('schemaVersion', SCHEMA_VERSION);
    if (!meta.has('createdAt')) meta.set('createdAt', new Date().toISOString());
    if (!meta.has('settings')) {
      const settings = newMap<unknown>();
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) settings.set(key, value);
      meta.set('settings', settings);
    }
  });

  return { doc, meta, master };
};

export const readSchemaVersion = (meta: YMap<unknown>): number =>
  typeof meta.get('schemaVersion') === 'number' ? (meta.get('schemaVersion') as number) : 0;
