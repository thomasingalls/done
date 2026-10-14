/** One verified live setup approval can finish handoff and open that exact destination once. */
import type { BindingProof } from '../../account-protocol/slot';
import { pinBytes, type AuthorityPin } from '../../account-protocol/authority';
import { requireAccountAccess, type LocalPasskey } from '../crdt/accountAccess';
import { hex, type Bytes } from '../crdt/custodyCrypto';
import type { SessionTask } from '../crdt/writeSession';
import { NetworkLogin } from './networkLogin';
export interface PromotionOpening {
  readonly kind: 'fresh-promotion-opening';
}
const openings = new WeakMap<
  PromotionOpening,
  { slotId: string; pin: string; binding: string; signal: AbortSignal }
>();
export async function authorizePromotionOpening(
  task: SessionTask,
  input: {
    slotId: string;
    pin: AuthorityPin;
    proof: BindingProof;
    signal: AbortSignal;
    root: Bytes;
    rootId: string;
    login?: NetworkLogin;
    assert: LocalPasskey;
  },
): Promise<PromotionOpening> {
  input = { ...input, pin: structuredClone(input.pin), proof: structuredClone(input.proof) };
  input.signal.throwIfAborted();
  if (input.login) {
    if (!(input.login instanceof NetworkLogin))
      throw Error('A live network-login owner is required');
    await input.login.initialize(task, input.root, input.rootId, input.proof);
    await input.login.prewarm(input.proof.stored.binding);
    await input.login.unlock(task, input.proof, input.assert);
  } else await requireAccountAccess(task, input.proof, input.pin, input.assert);
  input.signal.throwIfAborted();
  const opening: PromotionOpening = Object.freeze({ kind: 'fresh-promotion-opening' });
  openings.set(opening, {
    slotId: input.slotId,
    pin: hex(pinBytes(input.pin)),
    binding: JSON.stringify(input.proof),
    signal: input.signal,
  });
  return opening;
}
export function consumePromotionOpening(
  opening: PromotionOpening,
  slotId: string,
  pin: AuthorityPin,
  proof: BindingProof,
) {
  const held = openings.get(opening);
  openings.delete(opening);
  if (
    !held ||
    held.signal.aborted ||
    held.slotId !== slotId ||
    held.pin !== hex(pinBytes(pin)) ||
    held.binding !== JSON.stringify(proof)
  )
    throw Error('Fresh setup approval is unavailable or belongs to another destination');
}
