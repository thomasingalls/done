import { AccountNotifications } from './notifications.ts';
import { createSessionAccountHandler } from './session-host.ts';
import { openPublicState, type PublicStateOptions } from './public-state.ts';
import { ownAccountRequests } from './service-lifetime.ts';

/** Public composition always uses remembered sessions, scoped grants and current membership. */
export function openPublicAccountService(options: PublicStateOptions & { pinFile: string }) {
  const state = openPublicState(options);
  try {
    const notifications = new AccountNotifications(state.core.grants, state.pin);
    const dispatch = createSessionAccountHandler(
      state.core,
      state.authority,
      state.pin,
      notifications,
    );
    return ownAccountRequests(dispatch, state.close, () => notifications.close());
  } catch (cause) {
    state.close();
    throw cause;
  }
}
