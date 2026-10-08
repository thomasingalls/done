/** Open only the retained native successor selected by the authenticated local commit pointer. */
import { createApprovalVault } from '../account/approvalVault';
import { parseNativeRemoval } from '../account/deviceRemovalVault';
import type { CustodyRecord, CustodyScope } from './custodyRecord';
import type { Bytes } from './custodyCrypto';
export async function openActiveRotation(
  scope: CustodyScope,
  root: Bytes,
  record: CustodyRecord,
  subtle: SubtleCrypto,
  expectedHead?: string,
) {
  if (!record.rotation) {
    if (record.active_rotation) throw Error('Active rotation has no retained apply record');
    return null;
  }
  if (!record.active_rotation)
    throw Error('Resume account generation activation before opening this workspace');
  const vault = await createApprovalVault({
    channel: 'rotation',
    slotId: scope.slotId,
    scope,
    root,
    subtle,
    credentials: record.credentials!,
    record: () => record,
    commit: async () => {
      throw Error('Read-only rotation opener');
    },
  });
  const state = parseNativeRemoval(await vault.load());
  if (
    !state.key ||
    !state.successor ||
    state.successor.head !== record.active_rotation ||
    (expectedHead !== undefined && expectedHead !== record.active_rotation) ||
    state.successor.epoch.generation !== 2
  )
    throw Error('Active rotation differs from installed custody');
  return {
    generation: 2,
    head: record.active_rotation,
    key: await vault.withInstalledKey(state.key, record.active_rotation, async (key) =>
      key.slice(),
    ),
  };
}
