/** Open only the retained native successor selected by the authenticated local commit pointer. */
import { createApprovalVault } from '../account/approvalVault';
import type { parseMembershipChain } from '../../account-protocol/membershipLocator';
import { parseNativeRemoval } from '../account/deviceRemovalVault';
import { isRecoveryDetachment, priorRecoveryRotation } from '../account/recoveryDetachment';
import type { CustodyRecord, CustodyScope } from './custodyRecord';
import type { Bytes } from './custodyCrypto';
export async function openInitialAccount(
  scope: CustodyScope,
  root: Bytes,
  record: CustodyRecord,
  subtle: SubtleCrypto,
) {
  const initial = record.initial_account;
  if (!initial) return null;
  const vault = await createApprovalVault({
    slotId: scope.slotId,
    scope,
    root,
    subtle,
    credentials: record.credentials!,
    record: () => record,
    commit: async () => {
      throw Error('Read-only initial account opener');
    },
  });
  return vault.withInstalledKey(initial.key, initial.deliveryHash, async (key) => ({
    generation: initial.generation,
    key: key.slice(),
  }));
}
export async function openActiveRotation(
  scope: CustodyScope,
  root: Bytes,
  record: CustodyRecord,
  subtle: SubtleCrypto,
  expectedProofs?: ReturnType<typeof parseMembershipChain>,
) {
  if (!record.rotation) {
    if (record.active_rotation) throw Error('Active rotation has no retained apply record');
    return null;
  }
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
  const saved = await vault.load();
  const detached = isRecoveryDetachment(saved);
  if (detached && !record.active_rotation) return null;
  const state = detached ? priorRecoveryRotation(saved) : parseNativeRemoval(saved);
  if (!state) throw Error('Detached account lost its selected old generation');
  if (
    !record.active_rotation &&
    state.successor &&
    state.target === state.recipient &&
    !state.key &&
    state.successor.epoch.rotation.payload.excluded.length === 1 &&
    state.successor.epoch.rotation.payload.excluded[0] === state.target
  )
    return null;
  const openers = [...(state.previous ?? [])];
  if (state.successor && state.key)
    openers.push({
      generation: state.successor.epoch.generation,
      head: state.successor.head,
      key: state.key,
    });
  const selected = openers.find((item) => item.head === record.active_rotation);
  if (
    !selected ||
    openers.some(
      (item) => item.generation > selected.generation && item.head !== state.successor?.head,
    )
  )
    throw Error('Active rotation differs from installed custody');
  if (
    expectedProofs &&
    !expectedProofs.continuations.some(
      (proof) =>
        proof.kind === 'membership-rotation' &&
        proof.head === selected.head &&
        proof.epoch.generation === selected.generation,
    )
  )
    throw Error('Active rotation is outside installed membership');
  const previous = new Map<number, Bytes>();
  let key: Bytes | undefined;
  try {
    for (const item of openers) {
      if (item.generation > selected.generation) continue;
      const opened = await vault.withInstalledKey(item.key, item.head, async (key) => key.slice());
      if (item.head === selected.head) key = opened;
      else previous.set(item.generation, opened);
    }
    return { generation: selected.generation, head: selected.head, key: key!, previous };
  } catch (cause) {
    key?.fill(0);
    for (const value of previous.values()) value.fill(0);
    throw cause;
  }
}
export function eraseRotationKeys(active: Awaited<ReturnType<typeof openActiveRotation>>) {
  active?.key.fill(0);
  for (const value of active?.previous.values() ?? []) value.fill(0);
}
