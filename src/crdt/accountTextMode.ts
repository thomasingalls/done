/** Reference remains a format-compatible rollback and differential oracle. */
export function accountTextMode(value: string | undefined): 'account-text' | 'account-snapshots' {
  if (value === undefined || value === '' || value === 'direct') return 'account-text';
  if (value === 'reference') return 'account-snapshots';
  throw Error('VITE_ACCOUNT_TEXT_ADMISSION must be direct or reference');
}
