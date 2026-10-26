import { expect, it } from 'vitest';
import { readBrowserBoolean } from '../src/ui/useBrowserBoolean';
import { GENTLE_CONTEXT_KEY } from '../src/ui/useGentleContext';
import { CARD_GOALS_CONTEXT_KEY } from '../src/ui/useCardGoalsContext';
it('presentation settings default on independently and read only their own Boolean', () => {
  const values = new Map([
    [GENTLE_CONTEXT_KEY, '0'],
    [CARD_GOALS_CONTEXT_KEY, '1'],
  ]);
  const read: string[] = [];
  const storage = {
    getItem: (key: string) => {
      read.push(key);
      return values.get(key) ?? null;
    },
  };
  expect(readBrowserBoolean(GENTLE_CONTEXT_KEY, storage)).toBe(false);
  expect(readBrowserBoolean(CARD_GOALS_CONTEXT_KEY, storage)).toBe(true);
  expect(read).toEqual([GENTLE_CONTEXT_KEY, CARD_GOALS_CONTEXT_KEY]);
});
it('only explicit zero disables either presentation setting', () => {
  for (const key of [GENTLE_CONTEXT_KEY, CARD_GOALS_CONTEXT_KEY])
    for (const value of [null, '', 'false', 'unexpected', '1'])
      expect(readBrowserBoolean(key, { getItem: () => value })).toBe(true);
});
it('unavailable browser preferences keep default display without touching workspace storage', () => {
  const storage = {
    getItem: () => {
      throw Error('blocked');
    },
  };
  expect(readBrowserBoolean(CARD_GOALS_CONTEXT_KEY, storage)).toBe(true);
});
