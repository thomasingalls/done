/**
 * The debt manifest's refusals, as negatives (`RC-9A`, consolidated at the
 * `S0-8` regeneration).
 *
 * `pnpm debts:check` validates the real manifest; these tests hold the
 * *mechanism* to the record's falsifiers with entries built to be refused —
 * a debt paid by history, a component KAT presented as provenance, a
 * population claimed from a Baseline citation, a waiver naming no authority,
 * an observation with no date. Each refusal must be a check, not a
 * convention: the record says a manifest is only as strong as its falsifier
 * column, and this file is where that column's enforcement is demonstrated
 * against forgeries the real manifest will never contain.
 */

import { describe, expect, it } from 'vitest';
import {
  type Debt,
  evaluateGate,
  projection,
  validateManifest,
  validatePayment,
  validateWaiver,
} from '../scripts/lib/debts.mjs';

const ROOT = new URL('..', import.meta.url).pathname;

const debt = (over: Partial<Debt> = {}): Debt => ({
  id: 'test-debt',
  finding: 'f-0000000-synthetic',
  property: 'a synthetic deferred property',
  owner: 'the test suite',
  gate: 'L-4',
  artifact: 'a receipted artifact',
  falsifier: 'a run that refuses the wrong payment',
  payment: { kind: 'attested-rebuild', requires: ['toolchain', 'blob_sha256'], refuses: ['kat'] },
  expiry: '2099-01-01',
  registered: '2026-08-29',
  status: 'open',
  inputs: [],
  ...over,
});

describe('the debt floor: fields are not optional', () => {
  it('refuses an entry missing a floor field', () => {
    const bare = debt();
    // @ts-expect-error deliberately removing a required field
    delete bare.falsifier;
    const failures = validateManifest([bare], ROOT);
    expect(failures.some((f) => f.includes('missing "falsifier"'))).toBe(true);
  });

  it('refuses an untyped payment — a debt paid by anything', () => {
    const failures = validateManifest([debt({ payment: { kind: '', requires: [] } })], ROOT);
    expect(failures.some((f) => f.includes('no typed payment'))).toBe(true);
  });

  it('refuses one finding registered as two debts — the FU-15 shape', () => {
    const failures = validateManifest([debt(), debt({ id: 'second', gate: 'L-1' })], ROOT);
    expect(failures.some((f) => f.includes('one debt, one gate'))).toBe(true);
  });

  it('refuses an expiry on or before registration', () => {
    const failures = validateManifest([debt({ expiry: '2026-08-29' })], ROOT);
    expect(failures.some((f) => f.includes('on or before its registration'))).toBe(true);
  });
});

describe('falsifier 3: arrival-unmet blocks, receipted payment passes', () => {
  it('blocks the gate while the debt is open, naming the required artifact', () => {
    const { blocking } = evaluateGate([debt()], 'L-4', ROOT);
    expect(blocking).toHaveLength(1);
    expect(blocking[0]!.why).toContain('unpaid');
    expect(blocking[0]!.why).toContain('a receipted artifact');
  });

  it('blocks on an expired registration even before payment is considered', () => {
    const { blocking } = evaluateGate([debt({ expiry: '2026-01-01' })], 'L-4', ROOT);
    expect(blocking[0]!.why).toContain('expired');
  });

  it('passes a validly paid debt and keeps other gates untouched', () => {
    const paid = debt({
      status: 'paid',
      payment_record: { kind: 'attested-rebuild', toolchain: 'rustc 1.x', blob_sha256: 'aa'.repeat(32), date: '2026-08-29' },
    });
    expect(evaluateGate([paid], 'L-4', ROOT).blocking).toHaveLength(0);
    expect(evaluateGate([paid], 'L-1', ROOT).blocking).toHaveLength(0);
  });
});

describe('falsifier 5: an entry leaves only by a receipt or a recorded waiver', () => {
  it('refuses paid with no payment record', () => {
    const failures = validateManifest([debt({ status: 'paid' })], ROOT);
    expect(failures.some((f) => f.includes('no payment record'))).toBe(true);
  });

  it('refuses an open entry that still carries a payment record', () => {
    const failures = validateManifest(
      [debt({ payment_record: { kind: 'attested-rebuild' } })],
      ROOT,
    );
    expect(failures.some((f) => f.includes('strike the status or the record'))).toBe(true);
  });
});

describe('falsifier 6: an observation without source, date and expiry is an assertion', () => {
  const observed = (record: Record<string, unknown>): Debt =>
    debt({
      payment: { kind: 'dated-external-observation', requires: ['source', 'date', 'expiry'] },
      status: 'paid',
      payment_record: { kind: 'dated-external-observation', ...record },
    });

  it('refuses an undated observation', () => {
    const failures = validatePayment(observed({ source: 'caniuse', expiry: '2099-01-01' }));
    expect(failures.some((f) => f.includes('no date'))).toBe(true);
  });

  it('refuses an unsourced observation', () => {
    const failures = validatePayment(observed({ date: '2026-08-29', expiry: '2099-01-01' }));
    expect(failures.some((f) => f.includes('no source'))).toBe(true);
  });

  it('refuses an expired observation exactly as a missing one', () => {
    const failures = validatePayment(
      observed({ source: 'caniuse', date: '2025-01-01', expiry: '2026-01-01' }),
    );
    expect(failures.some((f) => f.includes('expired'))).toBe(true);
  });
});

describe('falsifier 7: a waiver is a decision, not an ambiguity', () => {
  it('refuses a waiver naming no authority', () => {
    const failures = validateWaiver(
      debt({ status: 'waived', waiver: { scope: 'this test', expiry: '2099-01-01', recorded: '2026-08-29' } }),
    );
    expect(failures.some((f) => f.includes('no authority'))).toBe(true);
  });

  it('reports a valid waiver as waived — and never as paid', () => {
    const waived = debt({
      status: 'waived',
      waiver: { scope: 'this test', expiry: '2099-01-01', authority: 'the user, 2026-08-29', recorded: '2026-08-29' },
    });
    const { blocking, waived: reported } = evaluateGate([waived], 'L-4', ROOT);
    expect(blocking).toHaveLength(0);
    expect(reported).toHaveLength(1);
    // the projection of what blocks omits it, but nothing anywhere renders it paid
    expect(projection([waived]).get('L-4')).toBeUndefined();
    expect(waived.status).toBe('waived');
  });

  it('an expired waiver blocks again', () => {
    const { blocking } = evaluateGate(
      [debt({ status: 'waived', waiver: { scope: 's', expiry: '2026-01-01', authority: 'a', recorded: '2025-12-01' } })],
      'L-4',
      ROOT,
    );
    expect(blocking).toHaveLength(1);
  });
});

describe('falsifier 8: history and components cannot pay a debt', () => {
  it('refuses a component KAT presented as the provenance payment, by name', () => {
    const failures = validatePayment(
      debt({ status: 'paid', payment_record: { kind: 'kat', date: '2026-08-29' } }),
    );
    expect(failures.some((f) => f.includes('"kat"') && f.includes('refused'))).toBe(true);
  });

  it('refuses an audit citation presented as the delta review', () => {
    const failures = validatePayment(
      debt({
        payment: { kind: 'delta-review', requires: ['delta_base', 'delta_head', 'reviewer', 'scope'], refuses: ['audit-citation'] },
        status: 'paid',
        payment_record: { kind: 'audit-citation', reference: 'the 2019 audit' },
      }),
    );
    expect(failures.some((f) => f.includes('"audit-citation"') && f.includes('refused'))).toBe(true);
  });

  it('refuses a Baseline citation or a single device presented as the population', () => {
    const population = (kind: string) =>
      validatePayment(
        debt({
          payment: { kind: 'device-population', requires: ['population', 'samples'], refuses: ['baseline-citation', 'single-device'] },
          status: 'paid',
          payment_record: { kind },
        }),
      );
    expect(population('baseline-citation').some((f) => f.includes('refused'))).toBe(true);
    expect(population('single-device').some((f) => f.includes('refused'))).toBe(true);
  });

  it('refuses the right kind arriving without its required fields', () => {
    const failures = validatePayment(
      debt({ status: 'paid', payment_record: { kind: 'attested-rebuild', toolchain: 'rustc 1.x' } }),
    );
    expect(failures.some((f) => f.includes('missing "blob_sha256"'))).toBe(true);
  });
});

describe('falsifier 9: what blocks what is computed, never transcribed', () => {
  it('projects open and invalid entries by gate, and drops paid ones', () => {
    const open = debt();
    const paidElsewhere = debt({
      id: 'other',
      finding: 'f-1111111-synthetic',
      gate: 'L-1',
      status: 'paid',
      payment_record: { kind: 'attested-rebuild', toolchain: 't', blob_sha256: 'bb'.repeat(32), date: '2026-08-29' },
    });
    const byGate = projection([open, paidElsewhere]);
    expect(byGate.get('L-4')).toHaveLength(1);
    expect(byGate.get('L-1')).toBeUndefined();
  });
});
