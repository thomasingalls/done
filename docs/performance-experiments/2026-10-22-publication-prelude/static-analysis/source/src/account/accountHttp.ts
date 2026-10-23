import { isPrivateAccess, privateServiceFetch, type PrivateAccess } from './privateAccess';
import type { AuthorityPin } from '../../account-protocol/authority';
import type { ScopedAccess } from './scopedTransport';
export type AccountAccess = PrivateAccess | ScopedAccess;
export const isAccountAccess = (value: unknown): value is AccountAccess =>
  isPrivateAccess(value) ||
  (!!value &&
    typeof value === 'object' &&
    'kind' in value &&
    value.kind === 'scoped-account' &&
    'fetch' in value &&
    typeof value.fetch === 'function');
export function accountServiceFetch(
  pin: AuthorityPin,
  access: AccountAccess,
  path: string,
  init: RequestInit,
) {
  if (typeof access === 'object') {
    if (JSON.stringify(access.pin) !== JSON.stringify(pin))
      throw Error('Account transport pin changed');
    return access.fetch(path, init);
  }
  return privateServiceFetch(pin, access, path, init);
}
