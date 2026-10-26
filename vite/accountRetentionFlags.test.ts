// @vitest-environment node
import { expect, it } from 'vitest';
import { accountRetentionFlags } from './accountRetentionFlags';
const keys = [
  'VITE_ACCOUNT_BASELINE_READ',
  'VITE_ACCOUNT_BASELINE_INSTALL',
  'VITE_ACCOUNT_RETENTION',
  'VITE_ACCOUNT_RETENTION_AUTO',
];
const decode = (flags: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(flags).map(([key, value]) => [
      key.replace('import.meta.env.', ''),
      JSON.parse(value),
    ]),
  );
it('keeps ordinary builds compatible and read-only', () => {
  expect(decode(accountRetentionFlags({}))).toEqual({
    VITE_ACCOUNT_BASELINE_READ: '1',
    VITE_ACCOUNT_BASELINE_INSTALL: '0',
    VITE_ACCOUNT_RETENTION: '0',
    VITE_ACCOUNT_RETENTION_AUTO: '0',
  });
});
it('one explicit release opt-in enables all required capabilities together', () => {
  expect(decode(accountRetentionFlags({ VITE_ACCOUNT_RETENTION_AUTO: '1' }))).toEqual({
    VITE_ACCOUNT_BASELINE_READ: '1',
    VITE_ACCOUNT_BASELINE_INSTALL: '1',
    VITE_ACCOUNT_RETENTION: '1',
    VITE_ACCOUNT_RETENTION_AUTO: '1',
  });
});
it('rejects each contradictory explicit automatic combination before building', () => {
  for (let mask = 0; mask < 16; mask++) {
    const environment = Object.fromEntries(
      keys.map((key, bit) => [key, mask & (1 << bit) ? '1' : '0']),
    );
    if (mask & 8 && mask !== 15)
      expect(() => accountRetentionFlags(environment)).toThrow('requires compatible reading');
    else expect(decode(accountRetentionFlags(environment))).toEqual(environment);
  }
});
it('preserves independent manual private fixtures when automatic scheduling is off', () => {
  expect(
    decode(
      accountRetentionFlags({ VITE_ACCOUNT_BASELINE_INSTALL: '1', VITE_ACCOUNT_RETENTION: '1' }),
    ),
  ).toEqual({
    VITE_ACCOUNT_BASELINE_READ: '1',
    VITE_ACCOUNT_BASELINE_INSTALL: '1',
    VITE_ACCOUNT_RETENTION: '1',
    VITE_ACCOUNT_RETENTION_AUTO: '0',
  });
});
it('validates binary flags and retains empty-as-default build behavior', () => {
  for (const key of keys)
    for (const value of ['true', 'yes', '2', '-1', ' 1'])
      expect(() => accountRetentionFlags({ [key]: value })).toThrow('must be 0 or 1');
  expect(accountRetentionFlags(Object.fromEntries(keys.map((k) => [k, ''])))).toEqual(
    accountRetentionFlags({}),
  );
});
it('does not mutate, infer from unrelated flags, or retain the supplied environment', () => {
  const environment = Object.freeze({ VITE_ACCOUNT_RETENTION_AUTO: '0', UNRELATED: '1' });
  const first = accountRetentionFlags(environment);
  first['import.meta.env.VITE_ACCOUNT_RETENTION_AUTO'] = '"1"';
  expect(decode(accountRetentionFlags(environment))['VITE_ACCOUNT_RETENTION_AUTO']).toBe('0');
  expect(environment).toEqual({ VITE_ACCOUNT_RETENTION_AUTO: '0', UNRELATED: '1' });
});
