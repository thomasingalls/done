/** Closed private handoff binding; row-12 bytes interoperate with the offline slot verifier. */
import { closed, accountIdentifier } from './preparation.ts';
import { lp, unhex } from './recovery.ts';
import { verifySignature, type AdmissionReceipt, type AdmissionRequest } from './admission.ts';
import type { AuthorityPin } from './authority.ts';
export interface SlotBinding {
  v: number;
  accountId: string;
  principalId: string;
  rpId: string;
  epoch: number;
  credId: string;
  publicKey: string;
}
export interface BindingProof {
  v: 1;
  kind: 'promotion-slot-binding';
  requestDigest: string;
  epochHead: string;
  stored: { binding: SlotBinding; bindingSignature: string };
}
const h = (v: unknown, n = 32) => {
  unhex(v, n);
  return v as string;
};
export function parseBindingProof(input: unknown): BindingProof {
  const p = closed(input, ['v', 'kind', 'requestDigest', 'epochHead', 'stored']);
  const s = closed(p['stored'], ['binding', 'bindingSignature']);
  const b = closed(s['binding'], [
    'v',
    'accountId',
    'principalId',
    'rpId',
    'epoch',
    'credId',
    'publicKey',
  ]);
  if (
    p['v'] !== 1 ||
    p['kind'] !== 'promotion-slot-binding' ||
    b['v'] !== 1 ||
    b['epoch'] !== 1 ||
    typeof b['rpId'] !== 'string' ||
    !b['rpId'].length ||
    b['rpId'].length > 253 ||
    typeof b['credId'] !== 'string' ||
    !/^[A-Za-z0-9_-]{1,1364}$/.test(b['credId']) ||
    typeof b['publicKey'] !== 'string' ||
    !/^(302a300506032b6570032100[0-9a-f]{64}|3059301306072a8648ce3d020106082a8648ce3d03010703420004[0-9a-f]{128})$/.test(
      b['publicKey'],
    )
  )
    throw Error('Invalid slot binding');
  return {
    v: 1,
    kind: 'promotion-slot-binding',
    requestDigest: h(p['requestDigest']),
    epochHead: h(p['epochHead']),
    stored: {
      binding: {
        v: 1,
        accountId: accountIdentifier(b['accountId']),
        principalId: h(b['principalId'], 16),
        rpId: b['rpId'],
        epoch: 1,
        credId: b['credId'],
        publicKey: b['publicKey'],
      },
      bindingSignature: h(s['bindingSignature'], 64),
    },
  };
}
export const bindingMessage = (b: SlotBinding) =>
  lp(
    'done/slotbind/v1',
    String(b.v),
    b.accountId,
    b.principalId,
    b.rpId,
    String(b.epoch),
    b.credId,
    b.publicKey,
  );
export async function verifyBindingProof(
  input: unknown,
  request: AdmissionRequest,
  receipt: AdmissionReceipt,
  pin: AuthorityPin,
): Promise<BindingProof> {
  const p = parseBindingProof(input),
    b = p.stored.binding;
  if (
    p.requestDigest !== receipt.offer.epoch.requestDigest ||
    p.epochHead !== receipt.offer.head ||
    b.accountId !== request.candidate.accountId ||
    b.principalId !== request.candidate.principalId ||
    b.rpId !== pin.rpId ||
    b.epoch !== receipt.offer.epoch.epoch
  )
    throw Error('Slot binding target changed');
  await verifySignature(pin.authRoot, p.stored.bindingSignature, bindingMessage(b));
  return p;
}
