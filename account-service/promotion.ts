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
  prepare(request: AdmissionRequest): Promise<{ offer: AdmissionOffer; seal: AcceptanceSeal }>;
  complete(offer: AdmissionOffer, completion: AdmissionCompletion): Promise<AdmissionReceipt>;
  check(seal: unknown, requestDigest: string, publicKey: string): void;
}
