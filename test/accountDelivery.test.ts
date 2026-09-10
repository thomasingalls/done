// @vitest-environment node
import { it, expect } from 'vitest';
import fc from 'fast-check';
import { applyDecision, emptyDelivery, publicationState } from '../src/crdt/deliveryRecord';
import type { DecisionEvidence } from '../account-protocol/positionDecision';
type Event = {
  kind: 'accepted' | 'refused' | 'conflict';
  position: number;
  final: boolean;
  id: number;
};
const evidence = (e: Event): Exclude<DecisionEvidence, { kind: 'unknown' }> => {
  // This test starts after cryptographic verification; native cases use independently signed bytes.
  const subject = {
    workspace: 'w',
    credential: 'c',
    position: e.position,
    epoch: 1,
    digest: '00'.repeat(32),
  };
  const head = {
    workspace: 'w',
    credential: 'c',
    position: e.position,
    link: '00'.repeat(32),
    epoch: 1,
    final: e.final,
    signature: '00'.repeat(64),
  };
  if (e.kind === 'refused')
    return {
      kind: 'refused',
      refusalId: String(e.id),
      refusal: {
        ...subject,
        parent: '00'.repeat(32),
        reason: 'stale-epoch',
        signature: '00'.repeat(64),
      },
    };
  return { kind: e.kind, head, leaf: subject };
};
// Set-based oracle: test the accumulated proof propositions pairwise, independent of delivery transitions.
function oracle(events: Event[]) {
  const yes = events.filter((e) => e.kind === 'accepted');
  const no = events.filter((e) => e.kind === 'refused');
  const final = yes.filter((e) => e.final);
  const conflict =
    events.some((e) => e.kind === 'conflict') ||
    no.some((n) => yes.some((y) => n.position <= y.position)) ||
    no.some((a) => no.some((b) => a.position === b.position && a.id !== b.id)) ||
    final.some((f) => yes.some((y) => y.position > f.position)) ||
    final.some((a) => final.some((b) => a.position !== b.position));
  return {
    state: conflict ? 'conflict' : no.length ? 'closed' : final.length ? 'finalized' : 'ready',
    acceptedThrough: Math.max(0, ...yes.map((y) => y.position)),
    closed: [...new Set(no.map((n) => n.position))].sort((a, b) => a - b),
  };
}
const event = fc.record({
  kind: fc.constantFrom('accepted' as const, 'refused' as const, 'conflict' as const),
  position: fc.integer({ min: 1, max: 8 }),
  final: fc.boolean(),
  id: fc.integer({ min: 1, max: 3 }),
});
it('500 generated proof histories agree with independent prefix and closure propositions at every step', () => {
  fc.assert(
    fc.property(fc.array(event, { minLength: 1, maxLength: 40 }), (history) => {
      const state = emptyDelivery();
      for (let i = 0; i < history.length; i++) {
        applyDecision(state, evidence(history[i]!));
        const expected = oracle(history.slice(0, i + 1));
        expect(publicationState(state)).toBe(expected.state);
        expect(state.acceptedThrough).toBe(expected.acceptedThrough);
        expect([...state.refusals.keys()].sort((a, b) => a - b)).toEqual(expected.closed);
      }
      const reversed = emptyDelivery();
      for (const e of [...history].reverse()) applyDecision(reversed, evidence(e));
      expect(publicationState(reversed)).toBe(oracle(history).state);
    }),
    { seed: 9812026, numRuns: 500 },
  );
});
it.each([true, false])(
  'a later head contradicts an earlier closure in either delivery order (%s)',
  (reverse) => {
    const events: Event[] = [
      { kind: 'refused', position: 1, final: false, id: 1 },
      { kind: 'accepted', position: 2, final: false, id: 1 },
    ];
    const state = emptyDelivery();
    for (const e of reverse ? events.reverse() : events) applyDecision(state, evidence(e));
    expect(publicationState(state)).toBe('conflict');
  },
);
it('acceptance and closure duplicates are propositions, and conflict is irreversible', () => {
  const state = emptyDelivery();
  const no: Event = { kind: 'refused', position: 2, final: false, id: 1 };
  applyDecision(state, evidence(no));
  applyDecision(state, evidence(no));
  expect(publicationState(state)).toBe('closed');
  applyDecision(state, evidence({ ...no, id: 2 }));
  applyDecision(state, evidence({ ...no, kind: 'accepted', position: 1 }));
  expect(publicationState(state)).toBe('conflict');
});
