// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import {
  countJournalEntries,
  countLegacyJournalEntries,
  journalCount,
  legacyJournalCount,
} from '../src/crdt/startupStorage';
import type { SessionTask } from '../src/crdt/writeSession';
afterEach(() => vi.unstubAllGlobals());
const task = { step: <T>(operation: () => T) => operation() } as SessionTask;
it('pure Window key census and original task wrapper preserve scoped counts without exposing values', () => {
  vi.stubGlobal('localStorage', {
    'done.pending-update.done.legacy': 'sealed',
    unrelated: 'private',
    getItem(k: string) {
      return Object.hasOwn(this, k) ? 'present' : null;
    },
  });
  expect(countJournalEntries('done.pending-update.')).toBe(1);
  expect(journalCount(task, 'done.pending-update.')).toBe(1);
});
it('legacy census excludes only complete modern key grammar in both entry paths', () => {
  const modern =
    'done.pending-update.done.' +
    '12'.repeat(16) +
    '.' +
    '34'.repeat(16) +
    '.' +
    '56'.repeat(16) +
    '.0000000000000001';
  const values = {
    [modern]: 'modern',
    [modern + 'unknown']: 'legacy',
    'done.pending-update.done.old': 'legacy',
  };
  vi.stubGlobal('localStorage', {
    ...values,
    getItem(k: string) {
      return values[k as keyof typeof values] ?? null;
    },
  });
  expect(countLegacyJournalEntries()).toBe(2);
  expect(legacyJournalCount(task)).toBe(2);
});
it('a missing retained key refuses rather than reporting a fresh empty journal', () => {
  vi.stubGlobal('localStorage', {
    'done.pending-update.done.old': 'retained',
    getItem: () => null,
  });
  expect(() => countLegacyJournalEntries()).toThrow('changed');
  expect(() => legacyJournalCount(task)).toThrow('changed');
});
