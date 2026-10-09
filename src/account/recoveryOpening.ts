/** Fresh in-memory account-passkey opening, scoped to one new recovery slot. Never serializable. */
import {
  verifyLostRecoveryPrepared,
  type LostRecoveryPrepared,
} from '../../account-protocol/lostDeviceRecovery';
import type { AuthorityPin } from '../../account-protocol/authority';
import type { BindingProof } from '../../account-protocol/slot';
import type { RecoverySuccessor } from '../../account-protocol/recoveryTransition';
import { same } from '../../account-protocol/admission';
import { unhex } from '../../account-protocol/recovery';
import { random, hex } from '../crdt/custodyCrypto';
import { verifyRecoverySlotUnlock, type SlotAssertion } from './slotUnlock';
export interface RecoveryOpening {
  readonly kind: 'fresh-recovery-opening';
}
const openings = new WeakMap<
  RecoveryOpening,
  { slot: string; pin: AuthorityPin; prepared: LostRecoveryPrepared; signal: AbortSignal }
>();
export function createRecoveryOpening(slot: string, pinInput: AuthorityPin, signal: AbortSignal) {
  const pin = structuredClone(pinInput),
    nonce = hex(random(32));
  let used = false;
  return {
    nonce,
    async verify(
      input: unknown,
      begin: unknown,
      assertion: SlotAssertion,
    ): Promise<RecoveryOpening> {
      signal.throwIfAborted();
      if (used) throw Error('Recovery passkey attempt already checked');
      used = true;
      const captured = structuredClone(assertion),
        { prepared } = await verifyLostRecoveryPrepared(input, begin, pin),
        proof = prepared.binding;
      if (!proof || !prepared.challenge.context.login || location.origin !== pin.origin)
        throw Error('Fresh combined recovery binding required');
      const result = await verifyRecoverySlotUnlock({
        binding: proof.stored.binding,
        bindingSignature: unhex(proof.stored.bindingSignature, 64),
        authorizationKey: unhex(pin.authRoot, 32),
        pin,
        origin: location.origin,
        nonce,
        context: prepared.challenge.context,
        assertion: captured,
      });
      signal.throwIfAborted();
      if (!result.opened) throw Error('Recovery account passkey refused: ' + result.refusal);
      const opening = Object.freeze({ kind: 'fresh-recovery-opening' as const });
      openings.set(opening, { slot, pin, prepared, signal });
      return opening;
    },
  };
}
export function consumeRecoveryOpening(
  opening: RecoveryOpening,
  slot: string,
  pin: AuthorityPin,
  binding: BindingProof,
  successor: RecoverySuccessor,
) {
  const held = openings.get(opening);
  openings.delete(opening);
  if (
    !held ||
    held.signal.aborted ||
    held.slot !== slot ||
    !same(pin, held.pin) ||
    !same(binding, held.prepared.binding) ||
    !same(successor.epoch.intent.head, held.prepared.head) ||
    successor.epoch.intent.bootstrap.newCredentialId !==
      held.prepared.challenge.context.candidate.credentialId ||
    successor.epoch.intent.bootstrap.clientNonce !== held.prepared.challenge.context.clientNonce
  )
    throw Error('Recovery opening is not fresh for this slot');
}
