/** Ephemeral presentation only. Native encrypted custody is the sole restart authority. */
export type AccountTransition =
  | 'changed'
  | 'removed'
  | 'removal-pending'
  | 'removal-committed'
  | 'removal-incomplete';
const messages: Record<AccountTransition, string> = {
  changed:
    'Account membership changed. Unlock this account again to finish updating its local keys.',
  removed:
    'This device was removed from the account. Unlock it again to open its detached local copy.',
  'removal-incomplete':
    'Device removal did not finish. Your writing is kept. Unlock this account while online to check and resume any saved progress.',
  'removal-pending':
    'Device removal is saved but not confirmed. Unlock this account while online to retry the same operation.',
  'removal-committed':
    'The device was removed. Unlock this account again to finish updating its local keys. Existing copies on the removed device cannot be erased.',
};
let notice: Readonly<{ accountId: string; message: string }> | null = null;
const listeners = new Set<() => void>();
export const getAccountTransitionNotice = () => notice;
export function subscribeAccountTransitionNotice(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function rememberAccountTransition(accountId: string, kind: AccountTransition) {
  notice = Object.freeze({ accountId, message: messages[kind] });
  for (const listener of listeners) listener();
  return messages[kind];
}
export function dismissAccountTransitionNotice() {
  notice = null;
  for (const listener of listeners) listener();
}
export class RemovalPending extends Error {
  constructor() {
    super(messages['removal-pending']);
  }
}

export function clearAccountTransition(accountId: string) {
  if (notice?.accountId === accountId) dismissAccountTransitionNotice();
}
