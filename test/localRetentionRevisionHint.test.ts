// @vitest-environment node
/** Metadata projection only. Parser success is not cryptographic authentication or write permission. */
import { expect, it } from 'vitest';
import { createBaselineMetadata } from '../src/crdt/localBaselineMetadata';
import {
  BASELINE_CARRIER,
  REDUCED_BASELINE_CARRIER,
  baselineCounterPayload,
  type BaselineCounter,
} from '../src/crdt/localBaselineAnchor';
const scope = {
    slotId: 'slot',
    principalId: 'principal',
    workspaceId: 'workspace',
    storeId: '11'.repeat(16),
    rootId: '22'.repeat(16),
  },
  intent = '33'.repeat(16);
const ordinary = () => ({
  v: 2 as const,
  store_id: scope.storeId,
  intent,
  active_gen: 1,
  next_seq: 2,
  reserved: { '1': 1 },
  mac: new Uint8Array(32),
  spool: { events: 0, hash: '0'.repeat(64) },
});
const anchored = (revision = 7): BaselineCounter => ({
  ...ordinary(),
  v: 3,
  baseline: {
    format: BASELINE_CARRIER,
    history: 'complete',
    revision,
    commitment: '44'.repeat(32),
    generation: 1,
    firstSequence: 1,
    chunks: 1,
    bytes: 64,
  },
});
it('has revision zero only when no baseline pointer has been selected', () => {
  const m = createBaselineMetadata(scope);
  expect(m.revision()).toBe(0);
  m.parse(ordinary(), intent);
  expect(m.revision()).toBe(0);
});
it('projects the selected complete-history revision although the allocation view remains semantic v2', () => {
  const m = createBaselineMetadata(scope),
    raw = anchored(),
    allocation = m.parse(raw, intent);
  expect(allocation.v).toBe(2);
  expect('baseline' in allocation).toBe(false);
  expect(m.reduced()).toBe(false);
  expect(m.revision()).toBe(7);
  expect(m.stored(allocation)).toEqual(raw);
});
it('does not let mutation of input or returned metadata change the owned scheduling projection', () => {
  const m = createBaselineMetadata(scope),
    raw = anchored(),
    allocation = m.parse(raw, intent);
  raw.baseline.revision = 90;
  (m.stored(allocation) as BaselineCounter).baseline.revision = 91;
  expect(m.revision()).toBe(7);
});
it('retains downgrade and fork refusal rather than adopting a new revision from a failed parse', () => {
  const m = createBaselineMetadata(scope);
  m.parse(anchored(), intent);
  expect(() => m.parse(ordinary(), intent)).toThrow('downgraded');
  expect(() => m.parse(anchored(8), intent)).toThrow('changed');
  expect(m.revision()).toBe(7);
});
it('reacquires the selected revision after an owned replacement and preserves reduced-format fences', () => {
  const m = createBaselineMetadata(scope, true);
  m.parse(anchored(), intent);
  m.replaced();
  expect(m.revision()).toBe(0);
  const next: BaselineCounter = {
    ...anchored(8),
    v: 5,
    baseline: {
      ...anchored(8).baseline,
      format: REDUCED_BASELINE_CARRIER,
      history: 'baseline-plus-suffix',
      journalEra: { current: '55'.repeat(32), previous: '66'.repeat(32), revision: 8 },
    },
  };
  m.parse(next, intent);
  expect(m.revision()).toBe(8);
  expect(m.reduced()).toBe(true);
  expect(() => createBaselineMetadata(scope).parse(next, intent)).toThrow(
    'Reduced local baseline reader required',
  );
});
it('leaves the original complete authenticated MAC payload unchanged', () => {
  const m = createBaselineMetadata(scope),
    raw = anchored(),
    view = m.parse(raw, intent);
  expect(m.payload(view)).toEqual(baselineCounterPayload(scope, raw));
  expect(m.revision()).toBe(raw.baseline.revision);
});
