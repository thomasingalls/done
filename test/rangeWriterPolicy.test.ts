// @vitest-environment node
import { expect, it } from 'vitest';
import fc from 'fast-check';
import { receivePageWidths, receiveRangeWriterEnabled } from '../src/crdt/receiveSelection';

it('indexed receipt writing requires the exact explicit build opt-in', () => {
  expect(receiveRangeWriterEnabled('1')).toBe(true);
  for (const value of [undefined, null, '', '0', 0, 1, false, true, 'true', '01', ' 1', '1 '])
    expect(receiveRangeWriterEnabled(value)).toBe(false);
});

it('default-off keeps grouped reads single-entry across backlog and partial-turn boundaries', () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 4 }), fc.nat(), (positions, backlog) => {
      const widths = receivePageWidths(receiveRangeWriterEnabled(undefined), positions, backlog);
      expect(widths).toEqual(Array(positions).fill(1));
      expect(widths.reduce((total, width) => total + width, 0)).toBe(positions);
    }),
    { seed: 3062026, numRuns: 100 },
  );
});

it('explicit opt-in keeps partial-turn alignment, short-page and eight-entry download policy', () => {
  const on = receiveRangeWriterEnabled('1');
  expect(receivePageWidths(on, 1, 100)).toEqual([1]);
  expect(receivePageWidths(on, 3, 100)).toEqual([3]);
  expect(receivePageWidths(on, 4, 100)).toEqual([8]);
  expect(receivePageWidths(on, 4, 2)).toEqual([2]);
  expect(receivePageWidths(on, 4, 0)).toEqual([1]);
});

it('both policies retain the native position-allowance validation', () => {
  for (const enabled of [false, true])
    for (const positions of [0, 5, -1, 1.5, NaN])
      expect(() => receivePageWidths(enabled, positions, 10)).toThrow();
});
