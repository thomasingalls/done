/** Bootstrap bytes only. A reply never establishes its own trust anchor. */
import { hex, lp, unhex, digest } from './recovery.ts';
export interface AuthorityPin {
  v: 1;
  serviceId: string;
  origin: string;
  rpId: string;
  authRoot: string;
}
export interface AuthorityProof {
  v: 1;
  pin: AuthorityPin;
  nonce: string;
  signature: string;
}
export function parseAuthorityPin(input: unknown): AuthorityPin {
  const value = input as AuthorityPin | undefined;
  if (
    !value ||
    typeof value !== 'object' ||
    Object.keys(value).sort().join() !== 'authRoot,origin,rpId,serviceId,v' ||
    value.v !== 1
  )
    throw Error('Malformed authority pin');
  unhex(value.serviceId, 16);
  unhex(value.authRoot, 32);
  if (
    typeof value.origin !== 'string' ||
    typeof value.rpId !== 'string' ||
    value.origin.length > 2048
  )
    throw Error('Malformed authority policy');
  const url = new URL(value.origin);
  if (
    url.origin !== value.origin ||
    url.hostname !== value.rpId ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost'))
  )
    throw Error('Authority requires one exact HTTPS origin/RP (localhost allowed for tests)');
  lp(value.origin, value.rpId);
  return {
    v: 1,
    serviceId: value.serviceId,
    origin: value.origin,
    rpId: value.rpId,
    authRoot: value.authRoot,
  };
}
export const pinBytes = (pin: AuthorityPin): Uint8Array<ArrayBuffer> =>
  lp('done/service-authority-pin/v1', '1', pin.serviceId, pin.origin, pin.rpId, pin.authRoot);
export const authorityFingerprint = (pin: AuthorityPin): Promise<string> =>
  digest(pinBytes(parseAuthorityPin(pin)));
export const authorityMessage = (pin: AuthorityPin, nonce: string): Uint8Array<ArrayBuffer> => {
  unhex(nonce, 32);
  return lp(
    'done/service-authority-bootstrap/v1',
    '1',
    pin.serviceId,
    pin.origin,
    pin.rpId,
    pin.authRoot,
    nonce,
  );
};
export async function verifyPinnedAuthority(
  expected: AuthorityPin,
  nonce: string,
  input: unknown,
): Promise<Readonly<AuthorityPin>> {
  const pin = parseAuthorityPin(expected);
  const value = input as AuthorityProof | undefined;
  if (
    !value ||
    typeof value !== 'object' ||
    Object.keys(value).sort().join() !== 'nonce,pin,signature,v' ||
    value.v !== 1 ||
    value.nonce !== nonce
  )
    throw Error('Authority response mismatch');
  const supplied = parseAuthorityPin(value.pin);
  if (hex(pinBytes(pin)) !== hex(pinBytes(supplied))) throw Error('Authority pin changed');
  const signature = unhex(value.signature, 64),
    message = authorityMessage(pin, nonce);
  const key = await crypto.subtle.importKey('raw', unhex(pin.authRoot, 32), 'Ed25519', false, [
    'verify',
  ]);
  if (!(await crypto.subtle.verify('Ed25519', key, signature, message)))
    throw Error('Invalid authority proof');
  return Object.freeze(pin);
}
