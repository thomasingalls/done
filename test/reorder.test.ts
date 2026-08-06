import { describe, expect, it } from 'vitest';
import { insertionIndexAt } from '../src/ui/useCardReorder';

const cards = [
  { top: 10, height: 40 },
  { top: 60, height: 80 },
  { top: 150, height: 30 },
];

describe('reorder insertion geometry', () => {
  it('inserts before the first midpoint', () => {
    expect(insertionIndexAt(15, cards)).toBe(0);
  });

  it('crosses cards according to their individual midpoints', () => {
    expect(insertionIndexAt(31, cards)).toBe(1);
    expect(insertionIndexAt(101, cards)).toBe(2);
  });

  it('inserts at the end after every midpoint', () => {
    expect(insertionIndexAt(200, cards)).toBe(3);
  });
});
