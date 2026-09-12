/** Fresh offline passkey proof, held entirely inside the caller's current slot permit. */
import {
  mintUnlockNonce,
  slotUnlockChallenge,
  verifySlotUnlock,
  type SlotAssertion,
} from '../account/slotUnlock';
import { unhex } from '../../account-protocol/recovery';
import type { BindingProof } from '../../account-protocol/slot';
import type { AuthorityPin } from '../../account-protocol/authority';
import type { SessionTask } from './writeSession';
export interface LocalPasskeyRequest {
  rpId: string;
  credentialId: string;
  challenge: Uint8Array;
}
export type LocalPasskey = (request: LocalPasskeyRequest) => Promise<SlotAssertion>;
export async function requireAccountAccess(
  task: SessionTask,
  proof: BindingProof,
  pin: AuthorityPin,
  assert: LocalPasskey,
) {
  if (location.origin !== pin.origin) throw Error('Account origin differs from configured pin');
  const binding = proof.stored.binding,
    nonce = mintUnlockNonce();
  const challenge = await task.wait(() =>
    slotUnlockChallenge({ principalId: binding.principalId, credId: binding.credId, nonce }),
  );
  const assertion = await task.wait(async () =>
    structuredClone(
      await assert({
        rpId: binding.rpId,
        credentialId: binding.credId,
        challenge: challenge.slice(),
      }),
    ),
  );
  const result = await task.wait(() =>
    verifySlotUnlock({
      binding,
      bindingSignature: unhex(proof.stored.bindingSignature, 64),
      authorizationKey: unhex(pin.authRoot, 32),
      nonce,
      origin: pin.origin,
      assertion,
    }),
  );
  if (!result.opened) throw Error('Account passkey refused: ' + result.refusal);
}
