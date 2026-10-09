// @vitest-environment node
import { it, expect } from 'vitest';
import { createHistoryDoc, createSelectionHistory } from '../src/crdt/yjs';
it('records native fork behavior for negative zero and unsupported object shapes', () => {
  const sparse = Array(2);
  sparse[1] = 'value';
  const extra = ['value'] as string[] & { extra?: string };
  extra.extra = 'lost';
  const hidden = {};
  Object.defineProperty(hidden, 'hidden', { value: 'lost' });
  for (const [name, value] of [
    ['negative-zero', -0],
    ['sparse', sparse],
    ['extra-array-property', extra],
    ['nonenumerable', hidden],
  ] as const) {
    const owner = createSelectionHistory(),
      history = owner.create(createHistoryDoc(), {});
    history.doc.getMap('meta').set('value', value);
    const fork = owner.fork(history, {}),
      copied = fork.doc.getMap('meta').get('value');
    try {
      if (name === 'negative-zero') expect(Object.is(copied, -0)).toBe(true);
      else
        expect(Object.getOwnPropertyNames(Object(copied))).not.toEqual(
          Object.getOwnPropertyNames(Object(value)),
        );
    } finally {
      history.destroy();
      history.doc.destroy();
      fork.destroy();
      fork.doc.destroy();
      owner.close();
    }
  }
});
