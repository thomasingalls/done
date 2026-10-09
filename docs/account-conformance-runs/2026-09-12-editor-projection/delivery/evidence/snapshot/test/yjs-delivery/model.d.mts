import type { Y, YDoc } from '../../src/crdt/yjs';
export interface Edit {
  lane: number;
  actor?: number;
  at: number;
  remove: number;
  text: string;
}
export interface History {
  edits: Edit[];
  keys: number[];
  split: number;
  early: number;
  hops: number;
  duplicate: boolean;
}
export interface Source {
  names?: string[];
  updates: number[][];
  expected: string[];
  tokens?: string[];
  objects?: [string, { text: string; values: number[] }][];
}
export const names: string[];
export function equal(actual: unknown, expected: unknown, label: string): void;
export function orderBy(length: number, keys: number[]): number[];
export function state(
  yjs: typeof Y,
  doc: YDoc,
): { text: string[]; pendingStructs: boolean; pendingDs: boolean };
export function check(yjs: typeof Y, doc: YDoc, source: Source, label?: string): void;
export function concurrentSource(yjs: typeof Y, history: History): Source;
export function exercise(
  yjs: typeof Y,
  source: Source,
  history: History,
  arm: string,
): { pendingDonor: boolean; pendingDeletionDonor: boolean };
export function scalarEdits(edits: Edit[]): Edit[];

export function parkedIsBlocked(yjs: typeof Y, doc: YDoc): void;
