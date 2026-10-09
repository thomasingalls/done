/** Untrusted chooser hints only; neither keys nor recovery authority live here. */
import { parseAuthorityPin, pinBytes, type AuthorityPin } from '../../account-protocol/authority';
import { hex } from '../../account-protocol/recovery';
import { random } from '../crdt/custodyCrypto';
const prefix = 'done.lost-recovery.';
export const newRecoveryHref = () => '/recover/enrollment-' + hex(random(16)) + '/start';
export const isRecoverySlot = (slot: unknown): slot is string =>
  typeof slot === 'string' && /^enrollment-[a-f0-9]{32}$/.test(slot);
export interface RecoveryRoute {
  slotId: string;
  accountId: string;
  workspaceId: string;
  pin: AuthorityPin;
}
export function rememberRecoveryRoute(route: RecoveryRoute) {
  if (
    !isRecoverySlot(route.slotId) ||
    !/^[a-f0-9]{32}$/.test(route.workspaceId) ||
    !/^[A-Za-z0-9_-]{43}$/.test(route.accountId)
  )
    throw Error('Invalid recovery route');
  localStorage.setItem(
    prefix + route.slotId,
    JSON.stringify({ ...route, pin: parseAuthorityPin(route.pin) }),
  );
}
export function rememberedRecoveryRoutes(pin: AuthorityPin): RecoveryRoute[] {
  const result: RecoveryRoute[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(prefix)) continue;
    try {
      const r = JSON.parse(localStorage.getItem(key)!);
      if (
        isRecoverySlot(r.slotId) &&
        key === prefix + r.slotId &&
        /^[a-f0-9]{32}$/.test(r.workspaceId) &&
        /^[A-Za-z0-9_-]{43}$/.test(r.accountId) &&
        hex(pinBytes(parseAuthorityPin(r.pin))) === hex(pinBytes(pin))
      )
        result.push(r);
    } catch {
      /* Malformed navigation hints confer no access. */
    }
  }
  return result.sort((a, b) => a.slotId.localeCompare(b.slotId));
}
