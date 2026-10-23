/** Build-time rollback only; neither choice changes the stored Account format. */
export function accountLedgerMode(value: string | undefined): 'incremental' | 'reference' {
  if (value === undefined || value === '' || value === 'incremental') return 'incremental';
  if (value === 'reference') return 'reference';
  throw Error('VITE_ACCOUNT_LEDGER must be incremental or reference');
}
