/**
 * The Yjs seam (TRD §10.1).
 *
 * This is the ONLY module in the codebase permitted to import from `yjs`,
 * `y-indexeddb`, `y-protocols`, or `y-codemirror.next`. Yjs v13 and
 * `y-codemirror.next@0.3.5` are pinned; v14 and `@y/codemirror` are planned
 * debt. Keeping every import here means that migration touches one file.
 *
 * `test/seam.test.ts` enforces this mechanically.
 */

import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { Awareness } from 'y-protocols/awareness';
import { yCollab, ySyncFacet, yUndoManagerKeymap } from 'y-codemirror.next';

export { Y, IndexeddbPersistence, Awareness, yCollab, ySyncFacet, yUndoManagerKeymap };

export type YDoc = Y.Doc;
export type YText = Y.Text;
export type YMap<T> = Y.Map<T>;
export type YArray<T> = Y.Array<T>;
export type YUndoManager = Y.UndoManager;
export type YTransaction = Y.Transaction;

export const createDoc = (): YDoc => new Y.Doc();

export const newMap = <T>(): YMap<T> => new Y.Map<T>();
export const newText = (initial?: string): YText => new Y.Text(initial);
export const newArray = <T>(): YArray<T> => new Y.Array<T>();

export const encodeState = (doc: YDoc): Uint8Array => Y.encodeStateAsUpdate(doc);

export const applyUpdate = (doc: YDoc, update: Uint8Array, origin?: unknown): void =>
  Y.applyUpdate(doc, update, origin);

/**
 * Every mutation runs through here so that no write path can forget to name
 * its actor (TRD §4.8). `transact` already takes an origin argument; this
 * wrapper only removes the option of passing `null`.
 */
export const transact = <T>(doc: YDoc, origin: unknown, fn: () => T): T => doc.transact(fn, origin);

export type UndoScope = YText | YMap<unknown> | YArray<unknown>;

/**
 * One undo manager over several roots. Scoping by *type* would give each
 * surface its own history, which is not what PRD §11.3 asks for — undo is
 * scoped to the actor, not to where they happened to be typing.
 */
export const createUndoManager = (
  scope: UndoScope | UndoScope[],
  trackedOrigins: Set<unknown>,
): YUndoManager => new Y.UndoManager(scope, { trackedOrigins });
