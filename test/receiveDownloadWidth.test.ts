// @vitest-environment node
import { expect, it } from 'vitest';
import * as selection from '../src/crdt/receiveSelection';
const width = (positions: number, backlog: number, limit = 4): number => {
  const selected = (selection as typeof selection & { receiveDownloadWidth?: typeof width })
    .receiveDownloadWidth;
  // Exact pre-repair composed-peer width expression, which ignores remaining native allowance.
  return selected ? selected(positions, backlog, limit) : Math.min(limit, Math.max(1, backlog));
};
it('an initial partial publisher turn downloads only its remainder, then four-position requests fit an eight-position turn', () => {
  expect(width(3, 100)).toBe(3);
  expect(width(2, 100)).toBe(2);
  expect(width(1, 100)).toBe(1);
  const full = width(4, 100);
  expect(full).toBe(4);
  const s = selection.createReceiveSelection(),
    publishers = ['aa'.repeat(16), 'bb'.repeat(16)];
  expect(s.next(publishers)).toBe(publishers[0]);
  s.completed(publishers, publishers[0]!, true, false, 5);
  const first = width(s.capacity(publishers[0]!), 100);
  expect(first).toBe(3);
  s.completed(publishers, publishers[0]!, true, false, first);
  expect(s.next(publishers)).toBe(publishers[1]);
  s.completed(publishers, publishers[1]!, false);
  expect(s.next(publishers)).toBe(publishers[0]);
  expect(width(s.capacity(publishers[0]!), 100)).toBe(4);
  // The download does not extend a native turn; only eight verified positions may rotate through the other publisher.
  for (let turn = 0; turn < 2; turn++) {
    s.completed(publishers, publishers[0]!, true, false, 8);
    expect(s.next(publishers)).toBe(publishers[1]);
    s.completed(publishers, publishers[1]!, false);
    expect(s.next(publishers)).toBe(publishers[0]);
  }
});
it('download width respects observed backlog and the protocol width without granting excess native credit', () => {
  expect(width(8, 6)).toBe(4);
  expect(width(4, 0)).toBe(1);
  expect(width(4, 100, 4)).toBe(4);
  expect(width(3, 100, 1)).toBe(1);
  for (const args of [
    [0, 10, 8],
    [9, 10, 8],
    [4, -1, 8],
    [4, NaN, 8],
    [4, 1.5, 8],
    [4, 10, 9],
  ])
    expect(() => width(args[0]!, args[1]!, args[2]!)).toThrow();
});
