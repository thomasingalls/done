import { expect, it } from 'vitest';
import { createReceiveSelection } from '../src/crdt/receiveSelection';

it('stays with useful pages but bounds peer starvation; empty self reads do not recur each page', () => {
  const s = createReceiveSelection(),
    publishers = ['self', 'peer', 'third'];
  const seen: string[] = [];
  for (let i = 0; i < 11; i++) {
    const id = s.next(publishers);
    seen.push(id);
    s.completed(publishers, id, id !== 'self');
  }
  expect(seen).toEqual([
    'self',
    'peer',
    'peer',
    'peer',
    'peer',
    'third',
    'third',
    'third',
    'third',
    'self',
    'peer',
  ]);
});
it('does not install a removed publisher from a late completion', () => {
  const s = createReceiveSelection();
  s.next(['old']);
  s.completed(['new'], 'old', true);
  expect(s.next(['new'])).toBe('new');
});
