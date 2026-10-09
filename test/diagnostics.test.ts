// @vitest-environment node
import { expect, it } from 'vitest';
import fc from 'fast-check';
import {
  createDiagnostics,
  checkPromotionRefusal,
  PromotionRefusalError,
  PROMOTION_REFUSALS,
  SERVICE_HINTS,
  serviceHint,
  causeCode,
} from '../account-protocol/diagnostics';
it('bounded unsigned refusals preserve stage; malformed or extended shapes gain no classification', () => {
  for (const stage of ['begin', 'challenge', 'finish'] as const)
    for (const refusal of PROMOTION_REFUSALS) {
      try {
        checkPromotionRefusal({ ok: false, refusal }, stage);
        throw Error('missed');
      } catch (e) {
        expect(e).toBeInstanceOf(PromotionRefusalError);
        expect(e).toMatchObject({ stage, hint: refusal, authoritative: false });
      }
    }
  expect(() => checkPromotionRefusal({ ok: false, refusal: 'future' }, 'begin')).not.toThrow();
  expect(() =>
    checkPromotionRefusal({ ok: false, refusal: 'expired', receipt: 'forged' }, 'finish'),
  ).not.toThrow();
  for (const reason of SERVICE_HINTS)
    expect(serviceHint({ v: 1, kind: 'unknown', reason })).toBe(reason);
  expect(serviceHint({ v: 1, kind: 'decision', reason: 'expired' })).toBeNull();
  expect(
    serviceHint({ v: 1, kind: 'unknown', reason: 'out-of-order', bytes: 'forged' }),
  ).toBeNull();
});
it('generated hostile hint objects never produce success authority or retain arbitrary strings', () => {
  fc.assert(
    fc.property(fc.jsonValue(), (input) => {
      const result = serviceHint(input);
      expect(result === null || SERVICE_HINTS.includes(result)).toBe(true);
    }),
    { seed: 120910, numRuns: 150 },
  );
  const d = createDiagnostics();
  for (let i = 0; i < 80; i++)
    d.record({
      operation: 'submit',
      phase: 'verify',
      code: 'invalid-proof',
      secret: 'must never retain',
    } as never);
  expect(d.read()).toHaveLength(32);
  expect(JSON.stringify(d.read())).not.toContain('secret');
  d.record({ operation: 'secret-writing', phase: 'verify', code: 'invalid-proof' } as never);
  expect(d.read()).toHaveLength(32);
  const copy = d.read();
  copy[0]!.code = 'expired';
  expect(d.read()[0]!.code).toBe('invalid-proof');
  d.clear();
  expect(d.read()).toEqual([]);
  const malicious = Object.defineProperty({}, 'reason', {
    get() {
      throw Error('accessor invoked');
    },
  });
  expect(serviceHint(malicious)).toBeNull();
  expect(causeCode(Error('secret-writing-and-factor'))).toBe('unexpected-failure');
  expect(
    causeCode(Object.assign(Error('secret SQL'), { code: 'ERR_SQLITE_ERROR', errcode: 5 })),
  ).toBe('storage-busy');
});
