import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import { load, controls, report } from './helpers.mjs';
import { expected, observed } from './oracle.ts';
const base = '77b0bb6239f7b7a48c4a52c74d3e3f39e39994a3';
const source = execFileSync('git', ['show', base + ':test/accountDelivery.test.ts'], {
  encoding: 'utf8',
});
const oldOracle = Function(
  stripTypeScriptTypes(
    source.slice(source.indexOf('function oracle('), source.indexOf('const event =')),
  ) + ';return oracle;',
)();
const yes = (position, final = false) => ({ kind: 'accepted', position, final, id: '' });
const no = (position, id = 'r1') => ({ kind: 'refused', position, final: false, id });
const cases = {
  refusalId: [no(2), no(2, 'r2')],
  finalCutoff: [yes(1, true), yes(2, true)],
  prefix: [yes(2), yes(1)],
  closure: [no(2)],
  refusalAfterHead: [yes(2), no(1)],
  headAfterRefusal: [no(1), yes(2)],
  headAfterFinal: [yes(1, true), yes(2)],
  finalAfterHead: [yes(2), yes(1, true)],
  finalState: [yes(1, true)],
  conflict: [{ ...yes(1), kind: 'conflict' }],
  submissions: [yes(1)],
  responses: [yes(1)],
};
const real = await load();
for (const name of Object.keys(controls))
  test(name + ' source control fails the complete oracle at the affected prefix', async () => {
    const faulty = await load(name),
      history = cases[name],
      missedByOld = ['refusalId', 'finalCutoff', 'submissions', 'responses'].includes(name);
    const retained = { submissions: [[7, [1, 2, 0]]], responses: [[8, [[4, 0], [5]]]] };
    let mismatches = 0;
    for (const h of [real, faulty]) {
      const s = h.emptyDelivery();
      s.submissions.set(7, new Uint8Array([1, 2, 0]));
      s.responses.set(8, [new Uint8Array([4, 0]), new Uint8Array([5])]);
      for (let i = 0; i < history.length; i++) {
        h.applyDecision(s, h.evidence(history[i]));
        const obs = observed(s, h.publicationState(s)),
          exp = expected(history.slice(0, i + 1), retained);
        if (h === real) assert.deepEqual(obs, exp);
        else {
          if (missedByOld)
            assert.deepEqual(
              {
                state: obs.publication,
                acceptedThrough: obs.acceptedThrough,
                closed: obs.refusals.map(([n]) => n).sort((a, b) => a - b),
              },
              oldOracle(history.slice(0, i + 1)),
            );
          try {
            assert.deepEqual(obs, exp);
          } catch {
            mismatches++;
          }
        }
      }
    }
    assert.ok(mismatches > 0);
    report('control-' + name, {
      history,
      detectedPrefixes: mismatches,
      oldOracleComparison: missedByOld
        ? 'matches at every prefix'
        : 'not assessed for this control',
      oldOracleCommit: base,
      sourceChange: controls[name],
    });
  });
