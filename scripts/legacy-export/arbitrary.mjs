import * as fc from 'fast-check';
import { dayText } from './oracle.mjs';
const text = fc
  .array(fc.constantFrom('a', 'b', '#', '-', ' ', '\t', '\n', 'é', '🔒'), { maxLength: 24 })
  .map((chars) => chars.join(''));
const day = fc.record({
  next: fc.array(text, { minLength: 1, maxLength: 5 }),
  scheduled: fc.array(text, { maxLength: 3 }),
  done: fc.array(text, { maxLength: 3 }),
});
export const arbitrary = fc
  .record({
    master: text,
    suffix: text.map((s) => '!' + s),
    orphan: text,
    days: fc.array(day, { minLength: 10, maxLength: 10 }),
    archive: fc.boolean(),
    placement: fc.tuple(fc.boolean(), fc.boolean(), fc.boolean()),
    order: fc.array(fc.nat(100), { minLength: 3, maxLength: 3 }),
    duplicates: fc.array(fc.integer({ min: 0, max: 2 }), { maxLength: 4 }),
  })
  .map(({ archive, days, placement, order, duplicates, ...rest }) => {
    const input = {
      ...rest,
      days: days.map((d, i) => ({
        ...d,
        date: `2026-08-${String(i + 1).padStart(2, '0')}`,
        ...(archive && i === 0 ? { archive: dayText(d) } : {}),
      })),
    };
    const ids = [0, 1, 2].sort((a, b) => order[a] - order[b]);
    return {
      input,
      disk: [...ids, ...duplicates].filter((id) => placement[id]),
      wal: [...ids, ...duplicates].filter((id) => !placement[id]),
    };
  });
