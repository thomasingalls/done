import type {
  ActivationContext,
  ActivationChallenge,
  ActivationAuthorization,
} from '../account-protocol/activation.ts';
import type { SlotBinding } from '../account-protocol/slot.ts';
import type { AuthorityPin } from '../account-protocol/authority.ts';
import type {
  AdmissionRequest,
  AdmissionOffer,
  AdmissionCompletion,
  AdmissionReceipt,
} from '../account-protocol/admission.ts';
import type { AcceptanceSeal } from './acceptance.ts';
/** Internal authority owner supplied by the private adapter, never serialized from a request. */
export interface PromotionIssuer {
  pin: AuthorityPin;
  bind(binding: SlotBinding): Promise<string>;
  prepare(request: AdmissionRequest): Promise<{ offer: AdmissionOffer; seal: AcceptanceSeal }>;
  challenge(context: ActivationContext): Promise<ActivationChallenge>;
  complete(
    offer: AdmissionOffer,
    completion: AdmissionCompletion,
    activation: ActivationAuthorization,
  ): Promise<AdmissionReceipt>;
  check(seal: unknown, requestDigest: string, publicKey: string): void;
}
