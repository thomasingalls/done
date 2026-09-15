// @vitest-environment node
import { it, expect } from 'vitest';
import fc from 'fast-check';
import { Y, createHistoryDoc, createSelectionHistory, forkDoc } from '../src/crdt/yjs';

it('private string-tape forks retain mixed field ordering and detached mutable content', () => {
  const source = createHistoryDoc(),
    owner = createSelectionHistory();
  source.getText('long-root-' + 'r'.repeat(70)).insert(0, '\uFEFF' + 'body'.repeat(300));
  source.getText('short').insert(0, 'small');
  const text = source.getText('master');
  text.insert(0, 'ordinary'.repeat(100));
  text.format(0, 8, { ['format-' + 'k'.repeat(60)]: { nested: ['value'] } });
  text.insertEmbed(3, { embed: 'E'.repeat(100) });
  source.getText('surrogate\uD800').insert(0, '\uDC00' + '😀\uD800x\uDC00'.repeat(40));
  source.getMap('meta').set('nested', { binary: new Uint8Array([1, 2, 3]), values: ['v'] });
  const history = owner.create(source, 'human'),
    expected = forkDoc(source, false),
    actual = owner.fork(history, 'human');
  try {
    expect(Y.encodeStateAsUpdate(actual.doc)).toEqual(Y.encodeStateAsUpdate(expected));
    expect(actual.doc.getText('master').toDelta()).toEqual(expected.getText('master').toDelta());
    const original = source.getMap('meta').get('nested') as {
      binary: Uint8Array;
      values: string[];
    };
    const copied = actual.doc.getMap('meta').get('nested') as typeof original;
    copied.binary.fill(9);
    copied.values.push('child');
    expect([...original.binary]).toEqual([1, 2, 3]);
    expect(original.values).toEqual(['v']);
    original.values.push('parent');
    expect(copied.values).toEqual(['v', 'child']);
  } finally {
    actual.destroy();
    actual.doc.destroy();
    expected.destroy();
    history.destroy();
    source.destroy();
    owner.close();
  }
});

it('generated private string-tape forks match the existing codec for BMP, surrogate and mixed fields', () => {
  fc.assert(
    fc.property(
      fc.array(fc.integer({ min: 0, max: 0xffff }), { minLength: 0, maxLength: 180 }),
      fc.integer({ min: 32, max: 500 }),
      (units, count) => {
        const source = createHistoryDoc(),
          owner = createSelectionHistory();
        const text = String.fromCharCode(...units);
        source.getText('master').insert(0, 'a'.repeat(count));
        source.getText('unicode').insert(0, text);
        source.getText('root-' + 'x'.repeat(count)).insert(0, 'middle');
        source.getText('tail').insert(0, text + 'z'.repeat(count));
        const history = owner.create(source, 'human'),
          expected = forkDoc(source, false),
          actual = owner.fork(history, 'human');
        try {
          expect(Y.encodeStateAsUpdate(actual.doc)).toEqual(Y.encodeStateAsUpdate(expected));
          for (const key of expected.share.keys())
            if (key !== 'days' && key !== 'cards' && key !== 'cardLocations')
              expect(actual.doc.getText(key).toString()).toBe(expected.getText(key).toString());
        } finally {
          actual.destroy();
          actual.doc.destroy();
          expected.destroy();
          history.destroy();
          source.destroy();
          owner.close();
        }
      },
    ),
    { seed: 150917, numRuns: 150 },
  );
});

it('private string tapes remain scoped when encoding triggers a nested owned fork', () => {
  const owner = createSelectionHistory(),
    source = createHistoryDoc(),
    nested = createHistoryDoc();
  source.getText('master').insert(0, 'outer'.repeat(200));
  nested.getText('master').insert(0, 'inner'.repeat(100));
  const history = owner.create(source, 'human'),
    other = owner.create(nested, 'human');
  let armed = false,
    forks = 0;
  source.getMap('meta').set('accessor', {
    get nested() {
      if (armed) {
        const copy = owner.fork(other, 'human');
        try {
          expect(copy.doc.getText('master').toString()).toBe('inner'.repeat(100));
          forks++;
        } finally {
          copy.destroy();
          copy.doc.destroy();
        }
      }
      return 'value';
    },
  });
  armed = true;
  const actual = owner.fork(history, 'human');
  try {
    expect(forks).toBeGreaterThan(0);
    expect(actual.doc.getText('master').toString()).toBe('outer'.repeat(200));
    expect(actual.doc.getMap('meta').get('accessor')).toEqual({ nested: 'value' });
  } finally {
    actual.destroy();
    actual.doc.destroy();
    history.destroy();
    other.destroy();
    source.destroy();
    nested.destroy();
    owner.close();
  }
});

it('private string tapes keep boxed runtime strings on the coercing baseline codec path', () => {
  const source = createHistoryDoc(),
    owner = createSelectionHistory();
  const boxed = Object('boxed'.repeat(40)) as string;
  source.getText('master').insert(0, boxed);
  const history = owner.create(source, 'human'),
    expected = forkDoc(source, false),
    actual = owner.fork(history, 'human');
  try {
    const original = source.getText('master')._start!.content as Y.ContentString;
    const copied = actual.doc.getText('master')._start!.content as Y.ContentString;
    expect(original.str).toBe(boxed);
    expect(typeof copied.str).toBe('string');
    expect(copied.str).not.toBe(boxed);
    expect(Y.encodeStateAsUpdate(actual.doc)).toEqual(Y.encodeStateAsUpdate(expected));
  } finally {
    actual.destroy();
    actual.doc.destroy();
    expected.destroy();
    history.destroy();
    source.destroy();
    owner.close();
  }
});

it('private string tapes preserve legacy JSON, subdoc GUIDs and parent keys interleaved with XML keys', () => {
  const source = createHistoryDoc(),
    owner = createSelectionHistory();
  const text = source.getText('master');
  text.insert(0, 'text'.repeat(60));
  text.format(0, 50, { ['format-' + 'f'.repeat(40) + '\uD800']: 'v' });
  const key = '\uFEFF' + 'parent-key'.repeat(8);
  source.getMap('meta').set(key, 'value');
  const legacy = source.getArray('legacy');
  legacy.push([null, null, null]);
  legacy._start!.content = new Y.ContentJSON([
    undefined,
    { long: 'j'.repeat(90) },
    'legacy'.repeat(30),
  ]);
  const guid = '\uFEFF' + 'guid-'.repeat(20);
  source.getMap('subdocs').set('one', new Y.Doc({ guid }));
  source.getXmlFragment('xml').insert(0, [
    new Y.XmlElement('\uFEFF' + 'element'.repeat(10)),
    // Pinned runtime accepts hooks here; the public insertion type omits them.
    // @ts-expect-error Deliberate codec fixture for the pinned Y.XmlHook carrier.
    new Y.XmlHook('hook'.repeat(20)),
    new Y.XmlElement('tail\uD800'),
  ]);
  const history = owner.create(source, 'human'),
    expected = forkDoc(source, false),
    actual = owner.fork(history, 'human');
  try {
    expect(Y.encodeStateAsUpdate(actual.doc)).toEqual(Y.encodeStateAsUpdate(expected));
    expect(actual.doc.getArray('legacy').toArray()).toEqual(expected.getArray('legacy').toArray());
    expect((actual.doc.getMap('subdocs').get('one') as Y.Doc).guid).toBe(guid);
    expect(actual.doc.getMap('meta').get(key)).toBe('value');
    expect(actual.doc.getXmlFragment('xml').toJSON()).toBe(expected.getXmlFragment('xml').toJSON());
  } finally {
    actual.destroy();
    actual.doc.destroy();
    expected.destroy();
    history.destroy();
    source.destroy();
    owner.close();
  }
});
