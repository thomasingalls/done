// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { candidates, cases, pending, mutants } from '../scripts/storage-conformance/catalog.mjs';
import {
  exitCode,
  mutationStatus,
  validateReport,
  type CaseResult,
} from '../scripts/storage-conformance/report.mjs';

const pass: CaseResult = {
  id: 'C08.other-writer',
  status: 'pass',
  assertions: [{ id: 'replay-union', passed: true, actual: 1, expected: 1 }],
};
const loss: CaseResult = {
  ...pass,
  status: 'fail',
  assertions: [{ id: 'replay-union', passed: false, actual: 0, expected: 1 }],
};
const error: CaseResult = { ...pass, status: 'error', error: { message: 'browser did not start' } };

describe('storage harness evidence boundaries', () => {
  it('accounts for every requirement in the normative matrix, including missing APIs', () => {
    const matrix = readFileSync(new URL('../docs/storage-conformance.md', import.meta.url), 'utf8');
    const required = [...matrix.matchAll(/^\| (C\d+) \/ /gm)].map((m) => m[1]);
    expect(new Set([...cases, ...pending].map((c) => c.requirement))).toEqual(new Set(required));
    expect(new Set([...cases, ...pending].map((c) => c.id)).size).toBe(
      cases.length + pending.length,
    );
  });

  it('refuses to silently omit a selected scenario', () => {
    expect(() => validateReport({ cases: [pass] }, [pass.id, 'C09.corrupt-open'])).toThrow(
      'incomplete',
    );
  });

  it('refuses duplicate results and invented statuses', () => {
    expect(() => validateReport({ cases: [pass, pass] }, [pass.id])).toThrow('duplicate');
    expect(() => validateReport({ cases: [{ ...pass, status: 'probably' }] }, [pass.id])).toThrow(
      'Unknown status',
    );
  });

  it('does not count no assertions or a failed assertion as a pass', () => {
    for (const assertions of [[], [{ id: 'bad', passed: false, actual: 0, expected: 1 }]]) {
      expect(() => validateReport({ cases: [{ ...pass, assertions }] }, [pass.id])).toThrow(
        'Pass without',
      );
    }
  });

  it('refuses a forged passing label over contradicting observations', () => {
    const forged = {
      ...pass,
      assertions: [{ id: 'lie', passed: true, actual: 'lost', expected: 'retained' }],
    };
    expect(() => validateReport({ cases: [forged] }, [pass.id])).toThrow('disagrees');
    expect(exitCode([])).toBe(2);
  });

  it('makes absent capability and its explanation observable and nonpassing', () => {
    const row = { id: 'C05.remaining', status: 'not-implemented', reason: 'No transition actor' };
    expect(validateReport({ cases: [row] }, [row.id])).toEqual({ cases: [row] });
    expect(exitCode([{ cases: [row] }])).toBe(1);
    expect(() => validateReport({ cases: [{ ...row, reason: '' }] }, [row.id])).toThrow('reason');
  });

  it('distinguishes assertion failures from harness errors in the command result', () => {
    expect(exitCode([{ cases: [pass] }])).toBe(0);
    expect(exitCode([{ cases: [loss] }])).toBe(1);
    expect(exitCode([{ cases: [error, loss] }])).toBe(2);
  });

  it('requires a passing baseline and the named losing oracle to detect a mutation', () => {
    expect(mutationStatus(pass, loss, 'replay-union')).toBe('detected');
    expect(mutationStatus(loss, loss, 'replay-union')).toBe('baseline-not-passing');
    expect(mutationStatus(pass, loss, 'unrelated')).toBe('survived');
    expect(mutationStatus(pass, error, 'replay-union')).toBe('error');
    expect(exitCode([{ cases: [pass] }], [{ status: 'survived' }])).toBe(1);
  });

  it('pins full revisions and binds every mutation to an existing candidate and case', () => {
    expect(new Set(candidates.map((c) => c.revision)).size).toBe(3);
    for (const c of candidates) expect(c.revision).toMatch(/^[a-f0-9]{40}$/);
    for (const mutation of mutants) {
      expect(candidates.some((c) => c.id === mutation.candidate)).toBe(true);
      expect(cases.some((c) => c.id === mutation.case)).toBe(true);
      expect(mutation.from).not.toBe(mutation.to);
    }
  });
});
