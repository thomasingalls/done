/**
 * TRD §9 and §11: round-trip.
 *
 * "Round-tripping export → import → export must be byte-identical", and "for
 * arbitrary day contents, `compact → parse` reproduces the original collections
 * exactly". Both are properties of this one serializer, which is why there is
 * only one of it.
 *
 * The interesting cases are all about blank lines. A card can contain them, the
 * separator between cards is one, and a card can end with one — so the parser
 * has to know which blank line is whose. That is the entire reason cards are
 * written as list items rather than as blank-line-delimited blocks.
 */

import { describe, expect, it } from 'vitest';
import {
  emptyCollections,
  parseCollections,
  parseDay,
  serializeCollections,
  serializeDay,
  type DayContent,
} from '../src/crdt/serialize';
import { prng } from './random';

const day = (over: Partial<DayContent> = {}): DayContent => ({
  next: [],
  scheduled: [],
  done: [],
  ...over,
});

describe('the canonical day format', () => {
  it('reads the way TRD §9 describes', () => {
    const text = serializeDay(
      day({
        next: ['Draft the migration plan\nstart from the schema'],
        done: ['Called the dentist'],
      }),
    );

    expect(text).toBe(
      [
        '## Next',
        '',
        '- Draft the migration plan',
        '  start from the schema',
        '',
        '## Scheduled',
        '',
        '',
        '## Done',
        '',
        '- Called the dentist',
        '',
      ].join('\n'),
    );
  });
});

describe('round-trip', () => {
  const roundTrips = (content: DayContent): void => {
    const once = serializeDay(content);
    expect(parseDay(once)).toEqual(content);
    // export → import → export, byte for byte.
    expect(serializeDay(parseDay(once))).toBe(once);
  };

  it('survives an empty day', () => {
    roundTrips(day());
  });

  it('survives cards that contain blank lines', () => {
    roundTrips(day({ done: ['a title\n\nand a second paragraph', 'another card'] }));
  });

  it('survives a card that ends in a blank line', () => {
    roundTrips(day({ next: ['trailing blank\n', 'next one'] }));
  });

  it('survives a card that begins with one', () => {
    roundTrips(day({ next: ['\nstarts blank'] }));
  });

  it('survives an entirely empty card', () => {
    roundTrips(day({ scheduled: [''] }));
  });

  it('survives a card whose lines look like card boundaries', () => {
    roundTrips(day({ done: ['- a list item\n- another\n\n- after a gap'] }));
  });

  it('survives whitespace a formatter would eat', () => {
    roundTrips(
      day({ done: ['  indented\n   \nend'], scheduled: ['trailing   \n\tleading tab\n'] }),
    );
  });

  it('survives markdown a rich-text model would rewrite', () => {
    roundTrips(day({ next: ['# heading in a card', 'a \\* b _c_ ~d~ [e](f)'] }));
  });

  it('survives arbitrary generated content', () => {
    const random = prng(20260805);
    const pieces = ['a', '', '  x', '- item', '## Not a heading here', '\t', 'end', '**b**'];
    const pick = (): string => pieces[Math.floor(random() * pieces.length)] as string;
    const body = (): string =>
      Array.from({ length: 1 + Math.floor(random() * 4) }, pick).join('\n');

    for (let attempt = 0; attempt < 200; attempt++) {
      roundTrips(
        day({
          next: Array.from({ length: Math.floor(random() * 3) }, body),
          scheduled: Array.from({ length: Math.floor(random() * 3) }, body),
          done: Array.from({ length: Math.floor(random() * 4) }, body),
        }),
      );
    }
  });
});

describe('the archive form, which is the same bytes', () => {
  it('round-trips what compaction stored', () => {
    const collections = {
      next: ['one\n\ntwo'],
      scheduled: [],
      done: ['done\n', ''],
    };
    expect(parseCollections(serializeCollections(collections))).toEqual(collections);
  });

  it('is empty for an empty day', () => {
    expect(parseCollections(serializeCollections(emptyCollections()))).toEqual(emptyCollections());
  });

  it('is the day file, not a different format', () => {
    const content = { next: ['x'], scheduled: [], done: ['y'] };
    expect(serializeCollections(content)).toBe(serializeDay(content));
    expect(serializeCollections(content).startsWith('## Next')).toBe(true);
  });
});

describe('headings are matched in order', () => {
  it('is not fooled by a card whose text contains a later heading', () => {
    // Every line of a card is indented, so this cannot reach column 0 in
    // practice — the ordering rule is what makes that a belt as well as a brace.
    const content = parseDay(
      [
        '## Next',
        '',
        '- real',
        '  ## Done',
        '',
        '## Scheduled',
        '',
        '',
        '## Done',
        '',
        '- later',
        '',
      ].join('\n'),
    );
    expect(content.next).toEqual(['real\n## Done']);
    expect(content.done).toEqual(['later']);
  });
});
