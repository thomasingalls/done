/** Untrusted navigation hints only. The enrollment owner authenticates all retained progress. */
const prefix = 'done.pending-device.';
const workspacePattern = /^[a-f0-9]{32}$/;
const slotPattern = /^enrollment-[a-f0-9]{32}$/;
export interface RememberedDeviceConnection {
  workspaceId: string;
  slotId: string;
}
const slotKey = (workspaceId: string) => {
  if (!workspacePattern.test(workspaceId)) throw Error('Invalid workspace route');
  return prefix + workspaceId;
};
export function pendingDeviceSlot(workspaceId: string) {
  const slot = localStorage.getItem(slotKey(workspaceId));
  if (slot !== null && !slotPattern.test(slot)) throw Error('Saved enrollment route is invalid');
  return slot;
}
export function rememberPendingDevice(workspaceId: string, slotId: string) {
  if (!slotPattern.test(slotId)) throw Error('Saved enrollment route is invalid');
  localStorage.setItem(slotKey(workspaceId), slotId);
}
export function rememberedDeviceConnections(): RememberedDeviceConnection[] {
  const result: RememberedDeviceConnection[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(prefix)) continue;
    const workspaceId = key.slice(prefix.length);
    const slotId = localStorage.getItem(key);
    if (workspacePattern.test(workspaceId) && slotId && slotPattern.test(slotId))
      result.push({ workspaceId, slotId });
  }
  return result.sort((a, b) => a.workspaceId.localeCompare(b.workspaceId));
}
export function deviceConnectionUrl(workspaceId: string) {
  slotKey(workspaceId);
  return '/private/account-enrollment.html?workspace=' + workspaceId;
}
