// @vitest-environment node
import { it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import fc from 'fast-check';
import { applyDecision, emptyDelivery, publicationState } from '../src/crdt/deliveryRecord';
import { evidence } from './account-delivery-oracle/events';
import { reference, expected, observed, type ProofEvent } from './account-delivery-oracle/oracle';
const event = fc.record({
  kind: fc.constantFrom('accepted' as const, 'refused' as const, 'conflict' as const),
  position: fc.integer({ min: 1, max: 8 }),
  final: fc.boolean(),
  id: fc.constantFrom('r1', 'r2', 'r3'),
});
const yes = (position: number, final = false): ProofEvent => ({
  kind: 'accepted',
  position,
  final,
  id: '',
});
const no = (position: number, id = 'r1'): ProofEvent => ({
  kind: 'refused',
  position,
  final: false,
  id,
});
function check(history: ProofEvent[]) {
  const state = emptyDelivery();
  state.submissions.set(7, new Uint8Array([9, 0, 1]));
  state.responses.set(2, [new Uint8Array([0, 2]), new Uint8Array([3, 0])]);
  const submissions = state.submissions,
    responses = state.responses,
    submission = state.submissions.get(7),
    response = state.responses.get(2);
  const retained = {
    submissions: [[7, [9, 0, 1]]],
    responses: [
      [
        2,
        [
          [0, 2],
          [3, 0],
        ],
      ],
    ],
  };
  const input = structuredClone(history);
  expect(observed(state, publicationState(state))).toEqual(expected([], retained));
  for (let i = 0; i < history.length; i++) {
    const proof = evidence(history[i]!),
      before = structuredClone(proof);
    applyDecision(state, proof);
    expect(proof).toEqual(before);
    expect(observed(state, publicationState(state))).toEqual(
      expected(history.slice(0, i + 1), retained),
    );
    expect(state.submissions).toBe(submissions);
    expect(state.responses).toBe(responses);
    expect(state.submissions.get(7)).toBe(submission);
    expect(state.responses.get(2)).toBe(response);
  }
  expect(history).toEqual(input);
  return observed(state, publicationState(state));
}
it('empty delivery has no retained evidence or publication restriction', () => {
  const state = emptyDelivery();
  expect(observed(state, publicationState(state))).toEqual(expected([]));
});
it('500 generated histories compare full state at every forward, reverse and shuffled prefix', () => {
  let prefixes = 0;
  const result = fc.check(
    fc.property(
      fc.array(fc.tuple(event, fc.integer()), { minLength: 1, maxLength: 40 }),
      (rows) => {
        const forward = rows.map(([e]) => e),
          reverse = [...forward].reverse(),
          shuffled = [...rows].sort((a, b) => a[1] - b[1]).map(([e]) => e);
        for (const history of [forward, reverse, shuffled]) {
          check(history);
          prefixes += history.length;
        }
      },
    ),
    { seed: 1121060, numRuns: 500 },
  );
  if (process.env['ACCOUNT_REPORT_DIR']) {
    mkdirSync(process.env['ACCOUNT_REPORT_DIR'], { recursive: true });
    writeFileSync(
      join(process.env['ACCOUNT_REPORT_DIR'], 'unit-histories.json'),
      JSON.stringify(
        {
          ...result,
          errorInstance: result.errorInstance ? String(result.errorInstance) : null,
          prefixes,
        },
        null,
        2,
      ) + '\n',
    );
  }
  expect(result.failed, String(result.errorInstance)).toBe(false);
});
it.each([
  [no(1), yes(2)],
  [yes(2), no(1)],
  [yes(1, true), yes(2)],
  [yes(2), yes(1, true)],
  [yes(1, true), yes(2, true)],
  [no(2, 'r1'), no(2, 'r2')],
] as ProofEvent[][])(
  'contradictory claims have no consistent outcome assignment: %j',
  (...events: ProofEvent[]) => {
    expect(check(events).conflict).toBe(true);
    expect(reference(events).publication).toBe('conflict');
  },
);
it('first refusal ID and first final cutoff are retained even when another arrival order chooses differently', () => {
  const a = check([no(2, 'r1'), no(2, 'r2')]),
    b = check([no(2, 'r2'), no(2, 'r1')]);
  expect(a.refusals).toEqual([[2, 'r1']]);
  expect(b.refusals).toEqual([[2, 'r2']]);
  const c = check([yes(1, true), yes(2, true)]),
    d = check([yes(2, true), yes(1, true)]);
  expect(c.finalThrough).toBe(1);
  expect(d.finalThrough).toBe(2);
  expect([a, b, c, d].every((s) => s.conflict)).toBe(true);
});
it('noncontradictory closure above a final prefix takes precedence; observations and duplicates remain exact', () => {
  for (const events of [
    [yes(2, true), no(3)],
    [no(3), yes(2, true)],
  ]) {
    expect(check(events)).toMatchObject({
      acceptedThrough: 2,
      finalThrough: 2,
      refusals: [[3, 'r1']],
      conflict: false,
      publication: 'closed',
    });
    expect(check(events.flatMap((e) => [e, e]))).toEqual(check(events));
  }
});
it('conflict is irreversible while low-level folding may continue collecting observations', () => {
  expect(check([{ ...yes(4), kind: 'conflict' }, yes(2, true), no(3)])).toMatchObject({
    acceptedThrough: 2,
    finalThrough: 2,
    refusals: [[3, 'r1']],
    conflict: true,
    publication: 'conflict',
  });
});
it('constraint checks depend on observed positions, including large safe integers', () => {
  expect(check([yes(Number.MAX_SAFE_INTEGER), no(Number.MAX_SAFE_INTEGER - 1)]).conflict).toBe(
    true,
  );
});
