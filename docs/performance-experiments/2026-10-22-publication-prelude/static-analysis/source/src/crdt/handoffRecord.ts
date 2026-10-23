/** Authenticated destination description inside the promotion carrier. No index mutation here. */
import { closed } from '../../account-protocol/preparation';
import { parseBindingProof, type BindingProof } from '../../account-protocol/slot';
import { same } from '../../account-protocol/admission';
import { parseSlot } from './startupClassification';
import { identity } from './custodyRecord';
import type { Slot } from './slotIndex';
export interface HandoffState {
  binding: BindingProof;
  destination: Slot;
}
export function parseHandoff(input: unknown): HandoffState {
  const h = closed(input, ['binding', 'destination']);
  const raw = h['destination'] as { id?: unknown } | null;
  const destination = parseSlot(h['destination'], identity(raw?.id));
  if (
    !destination?.account ||
    destination.local ||
    destination.status !== 'active' ||
    destination.stores.length !== 1
  )
    throw Error('Invalid Account handoff route');
  const binding = parseBindingProof(h['binding']);
  if (!same(destination.unlockBinding, binding.stored))
    throw Error('Handoff binding differs from route');
  return { binding, destination };
}
