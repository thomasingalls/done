/** Shared refusal copy only; a disposition never authorizes creation or replacement. */
import type { StartupDisposition, StartupKind } from '../crdt/startupState';
type DevicePreparationRefusal = Exclude<StartupKind, 'fresh'>;
const preparationMessages: Record<DevicePreparationRefusal, string> = {
  'unlock-required':
    'A saved device setup already exists. Return to accounts and resume it with its unlock code.',
  'creation-pending':
    'A saved device setup already exists. Return to accounts and resume it with its unlock code.',
  'migration-required':
    'Existing local data needs migration before you can connect this device. Keep your existing installation and verified export available.',
  'app-update-required':
    'Saved storage needs a compatible app. Reopen with a compatible app version, then try again. Your saved data has been kept.',
  clearing:
    'Workspace removal is unfinished. Return to accounts and resume removal before preparing this device.',
  cleared: 'This device setup was removed. Return to accounts to start a separate connection.',
  'repair-required':
    'Saved data needs attention before this device can be prepared. Keep your browser data and backups available for recovery.',
  'slot-closed': 'This workspace is closed. Return to accounts and choose another workspace.',
  'identity-required':
    'The saved workspace could not be identified. Keep your browser data and backups available for recovery.',
  'unlock-failed':
    'The saved workspace could not be unlocked. Return to accounts and try its established unlock code.',
  busy: 'Another tab is using this workspace. Finish its operation or close it, then try again.',
  unavailable:
    'Could not read this browser’s saved storage. Check storage access and try again. Your saved data has been kept.',
  unsupported:
    'This browser cannot provide the secure storage and coordination needed to connect a device.',
  cancelled: 'Device setup was cancelled. Try again when you are ready.',
};
export class DevicePreparationError extends Error {
  override readonly name = 'DevicePreparationError';
  readonly disposition: Readonly<StartupDisposition>;
  constructor(kind: DevicePreparationRefusal, reason: string) {
    super(preparationMessages[kind]);
    this.disposition = Object.freeze({ kind, reason });
  }
}
