import { AccountNotifications } from './notifications.ts';
import { createSessionAccountHandler } from './session-host.ts';
import { openPublicState, type PublicStateOptions } from './public-state.ts';
import { ownAccountRequests } from './service-lifetime.ts';
import { startBackupOwner } from './backup/owner.ts';
import type { BackupConfig } from './backup/config.ts';

export type PublicServiceOptions = PublicStateOptions & { pinFile: string; backup?: BackupConfig };

/** Public composition always uses remembered sessions, scoped grants and current membership. */
export function openPublicAccountService(options: PublicServiceOptions) {
  const state = openPublicState(options);
  try {
    const notifications = new AccountNotifications(state.core.grants, state.pin);
    const dispatch = createSessionAccountHandler(
      state.core,
      state.authority,
      state.pin,
      notifications,
    );
    const backup = options.backup
      ? startBackupOwner(options.directory, state.pin, options.backup)
      : undefined;
    const lifetime = ownAccountRequests(
      dispatch,
      async () => {
        try {
          await backup?.close();
        } finally {
          state.close();
        }
      },
      () => notifications.close(),
    );
    return Object.freeze({
      handle: lifetime.handle,
      close: lifetime.close,
      get closing() {
        return lifetime.closing;
      },
      backupHealth: () => backup?.health() ?? { enabled: false, healthy: false, stage: 'disabled' },
    });
  } catch (cause) {
    state.close();
    throw cause;
  }
}
