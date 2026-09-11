import test from 'node:test';
import assert from 'node:assert/strict';
import { reference } from './oracle.ts';
import { report } from './helpers.mjs';
// A second, finite interpretation: enumerate complete service histories, then ask which can satisfy
// each observation. No production reducer, constraint-domain implementation, or signatures involved.
const assignments = (n) =>
  n === 0 ? [[]] : assignments(n - 1).flatMap((xs) => ['open', 'r1', 'r2'].map((x) => [...xs, x]));
const worlds = [];
for (let prefix = 0; prefix <= 3; prefix++)
  for (const tail of assignments(3 - prefix))
    for (const final of [false, true])
      worlds.push({ prefix, final, slots: [...Array(prefix).fill('accepted'), ...tail] });
const alphabet = [{ kind: 'conflict', position: 1, final: false, id: '' }];
for (let position = 1; position <= 3; position++) {
  for (const final of [false, true]) alphabet.push({ kind: 'accepted', position, final, id: '' });
  for (const id of ['r1', 'r2']) alphabet.push({ kind: 'refused', position, final: false, id });
}
const satisfies = (world, e) =>
  e.kind === 'conflict'
    ? false
    : e.kind === 'refused'
      ? world.slots[e.position - 1] === e.id
      : world.prefix >= e.position && (!e.final || (world.final && world.prefix === e.position));
test('constraint consistency agrees with enumeration of 80 concrete service histories for all 2197 proof triples', () => {
  assert.equal(worlds.length, 80);
  let checked = 0,
    contradictions = 0;
  for (const a of alphabet)
    for (const b of alphabet)
      for (const c of alphabet) {
        const history = [a, b, c],
          possible = worlds.some((w) => history.every((e) => satisfies(w, e)));
        const result = reference(history);
        assert.equal(result.conflict, !possible, JSON.stringify(history));
        if (result.conflict) contradictions++;
        checked++;
      }
  assert.equal(checked, 2197);
  report('finite-worlds', { worlds: worlds.length, triples: checked, contradictions });
});
