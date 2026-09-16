/** Public display identifiers. Names and shortened references never select an account. */
export const isAccountId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value);

export interface RememberedAccount {
  slotId: string;
  id?: string;
  name?: string;
  connected: boolean;
  fresh: boolean;
}
