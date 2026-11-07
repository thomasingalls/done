import { DevicePreparationError } from '../account/devicePreparationError';
/** Public routing hints stay Window; native inspection/genesis/confirmation and cleanup stay Worker. */
import { pendingDeviceSlot, rememberPendingDevice } from '../account/deviceConnectionRoutes';
import { openLocalStartupWorker } from '../crdt/localStartupClient';
export async function inspectWorkerStartup(slotId: string, signal: AbortSignal) {
  const owner = await openLocalStartupWorker(slotId, signal);
  try {
    return await owner.inspect();
  } finally {
    await owner.close();
  }
}
export async function preparePendingDeviceInWorker(workspaceId: string, signal: AbortSignal) {
  if (!/^[a-f0-9]{32}$/.test(workspaceId)) throw Error('Invalid workspace route');
  const slot =
    pendingDeviceSlot(workspaceId) ??
    'enrollment-' +
      Array.from(crypto.getRandomValues(new Uint8Array(16)), (v) =>
        v.toString(16).padStart(2, '0'),
      ).join('');
  if (!/^enrollment-[a-f0-9]{32}$/.test(slot)) throw Error('Saved enrollment route is invalid');
  const owner = await openLocalStartupWorker(slot, signal);
  let closing: Promise<void> | undefined;
  const close = () => (closing ??= owner.close());
  try {
    signal.throwIfAborted();
    const state = await owner.inspect();
    signal.throwIfAborted();
    if (state.kind !== 'fresh') throw new DevicePreparationError(state.kind, state.reason);
    rememberPendingDevice(workspaceId, slot);
    const enrollment = await owner.beginGenesis(false);
    signal.throwIfAborted();
    return { slot, enrollment, close };
  } catch (cause) {
    await close();
    throw cause;
  }
}
