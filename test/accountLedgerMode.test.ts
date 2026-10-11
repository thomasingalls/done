import { describe, expect, it } from 'vitest';
import { accountLedgerMode } from '../src/crdt/accountLedgerMode';

describe('Account ledger build policy', () => {
  it.each([undefined, '', 'incremental'])('uses incremental verification for %s', (value) => {
    expect(accountLedgerMode(value)).toBe('incremental');
  });
  it('retains an explicit reference override', () => {
    expect(accountLedgerMode('reference')).toBe('reference');
  });
  it.each(['refernece', 'false', ' reference '])('refuses an invalid override %s', (value) => {
    expect(() => accountLedgerMode(value)).toThrow('VITE_ACCOUNT_LEDGER');
  });
});
