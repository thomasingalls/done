// @vitest-environment node
import { expect, it } from 'vitest';
import fc from 'fast-check';
import {
  createArchiveProjection,
  ARCHIVE_CACHE_ENTRIES,
  ARCHIVE_CACHE_CHARACTERS,
} from '../src/crdt/archiveProjection';
import { serializeCollections, parseCollections } from '../src/crdt/serialize';
it('generated replacement, caller mutation, retention and clearing never return stale archive contents', () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({ date: fc.nat(8), text: fc.string({ maxLength: 100 }), clear: fc.boolean() }),
        { minLength: 1, maxLength: 30 },
      ),
      (steps) => {
        const c = createArchiveProjection(),
          expected = new Map<string, string>();
        for (const step of steps) {
          if (step.clear) c.clear();
          const date = String(step.date),
            source = serializeCollections({ next: [step.text], scheduled: [], done: [] });
          expected.set(date, source);
          const first = c.read(date, source);
          first.next.push('caller mutation');
          first.next[0] = 'changed';
          for (const [key, value] of expected)
            expect(c.read(key, value)).toEqual(parseCollections(value));
          c.retain(new Set([date]));
        }
        c.clear();
      },
    ),
    { seed: 120918, numRuns: 100 },
  );
});
it('entry and character overflow remain transparent to returned content', () => {
  const c = createArchiveProjection();
  for (let i = 0; i < ARCHIVE_CACHE_ENTRIES + 1; i++)
    expect(c.read(String(i), '## Next\n\n- ' + i + '\n\n## Scheduled\n\n## Done').next).toEqual([
      String(i),
    ]);
  const source = serializeCollections({
    next: ['x'.repeat(ARCHIVE_CACHE_CHARACTERS)],
    scheduled: [],
    done: [],
  });
  expect(c.read('large', source)).toEqual(parseCollections(source));
  expect(c.read('0', '## Next\n\n- replaced').next).toEqual(['replaced']);
  c.clear();
});
