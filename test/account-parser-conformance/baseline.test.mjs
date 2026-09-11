import test from 'node:test';
import assert from 'node:assert/strict';
import {
  load,
  loadBaseline,
  baselineRef,
  promotions,
  carriers,
  decode,
  json,
  report,
  fc,
} from './helpers.mjs';
const real = await load(),
  old = await loadBaseline();

for (const [family, seed] of [
  ['promotion', 112101],
  ['spool', 112104],
])
  test(family + ' original generated failure shrinks against the frozen signed baseline', () => {
    const run = (h, n) => {
      const d = carriers.find((d) => d.family === 'spool' && d.input.type === 'position');
      const input = structuredClone(family === 'promotion' ? promotions[1] : d.values);
      let v = family === 'promotion' ? input.stage : input[9][2];
      for (let i = 0; i < n; i++) v = [v];
      if (family === 'promotion') {
        input.stage = v;
        return h.parsePromotion(input);
      }
      input[9][2] = v;
      return decode(h, d, json(input));
    };
    const result = fc.check(
      fc.property(fc.integer({ min: 1, max: 5 }), (n) => assert.throws(() => run(old, n))),
      { seed, numRuns: 250 },
    );
    assert.equal(result.failed, true);
    assert.deepEqual(result.counterexample, [1]);
    assert.ok(result.numShrinks > 0);
    assert.throws(() => run(real, result.counterexample[0]));
    report('baseline-' + family, {
      baselineRef,
      ...result,
      errorInstance: String(result.errorInstance),
    });
  });

test('frozen baseline accepts sparse credentials/genesis and coerced index metadata; current parser refuses', () => {
  const cases = [];
  for (const field of [
    'credentials',
    'actors',
    'wraps',
    'promotionId',
    'requestDigest',
    'epochHead',
  ]) {
    const v = structuredClone(promotions[12]);
    if (field === 'credentials') delete v.credentials[1];
    else if (field === 'actors') delete v.genesis.actors[1];
    else if (field === 'wraps') delete v.genesis.wraps[1];
    else v.handoff.destination.account[field] = [v.handoff.destination.account[field]];
    assert.ok(old.parsePromotion(v));
    assert.throws(() => real.parsePromotion(v));
    cases.push(field);
  }
  report('baseline-shapes', { baselineRef, cases, old: 'accepted', current: 'refused' });
});
