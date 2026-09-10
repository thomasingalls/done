import { createPublicKey } from 'node:crypto';
import {
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import { decodeAttestationObject, decodeCredentialPublicKey } from '@simplewebauthn/server/helpers';
import { bytes, object } from './protocol.ts';

export interface Policy {
  rpId: string;
  origin: string;
}
export interface StoredCredential {
  id: string;
  account_id: string;
  public_key: Uint8Array;
  spki: string;
  state: 'staged' | 'confirmed';
  counter: number;
}

export function validatePolicy(policy: Policy): void {
  const url = new URL(policy.origin);
  if (
    url.origin !== policy.origin ||
    url.hostname !== policy.rpId ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost'))
  )
    throw Error('Account policy requires one exact HTTPS origin/RP (localhost allowed for tests)');
}

function common(
  value: unknown,
): asserts value is RegistrationResponseJSON & AuthenticationResponseJSON {
  if (
    !object(value) ||
    !object(value.response) ||
    value.type !== 'public-key' ||
    value.id !== value.rawId
  )
    throw Error('Malformed credential');
  bytes(value.id, 1, 1023);
  const raw = bytes(value.response.clientDataJSON, 1, 16384);
  const cd: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
  if (
    !object(cd) ||
    (cd.crossOrigin !== undefined && cd.crossOrigin !== false) ||
    'topOrigin' in cd
  )
    throw Error('Embedded ceremony');
  // Supplemental publicKey/authenticatorData browser fields never select the registration key.
}

/** Match alg, curve, key type and coordinate lengths together, then import the actual key. */
function spkiFor(cose: Uint8Array): string {
  const decoded = decodeCredentialPublicKey(new Uint8Array(cose));
  if (!(decoded instanceof Map)) throw Error('Invalid COSE key');
  const key: Map<number, unknown> = decoded;
  const x = key.get(-2);
  const y = key.get(-3);
  if (!(x instanceof Uint8Array) || x.length !== 32) throw Error('Invalid coordinate');
  let jwk;
  if (key.get(1) === 1 && key.get(3) === -8 && key.get(-1) === 6 && key.size === 4) {
    jwk = { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(x).toString('base64url') };
  } else if (
    key.get(1) === 2 &&
    key.get(3) === -7 &&
    key.get(-1) === 1 &&
    key.size === 5 &&
    y instanceof Uint8Array &&
    y.length === 32
  ) {
    jwk = {
      kty: 'EC',
      crv: 'P-256',
      x: Buffer.from(x).toString('base64url'),
      y: Buffer.from(y).toString('base64url'),
    };
  } else throw Error('Unsupported credential encoding');
  return createPublicKey({ key: jwk, format: 'jwk' })
    .export({ type: 'spki', format: 'der' })
    .toString('hex');
}

export async function registration(value: unknown, expectedChallenge: string, policy: Policy) {
  common(value);
  const attestation = bytes(value.response.attestationObject, 1, 65536);
  // No attestation trust roots or network metadata lookup in this bounded service.
  if (decodeAttestationObject(new Uint8Array(attestation)).get('fmt') !== 'none')
    throw Error('Unsupported attestation');
  const result = await verifyRegistrationResponse({
    response: value,
    expectedChallenge,
    expectedOrigin: policy.origin,
    expectedRPID: policy.rpId,
    expectedType: 'webauthn.create',
    requireUserPresence: true,
    requireUserVerification: true,
    supportedAlgorithmIDs: [-8, -7],
  });
  if (!result.verified || !result.registrationInfo) throw Error('Invalid registration');
  const credential = result.registrationInfo.credential;
  if (credential.id !== value.id) throw Error('Attested credential ID mismatch');
  return {
    id: credential.id,
    publicKey: credential.publicKey,
    spki: spkiFor(credential.publicKey),
    counter: credential.counter,
  };
}

export async function assertion(
  value: unknown,
  expectedChallenge: string,
  policy: Policy,
  credential: StoredCredential,
) {
  common(value);
  if (value.id !== credential.id || value.response.userHandle !== credential.account_id)
    throw Error('Credential/account mismatch');
  bytes(value.response.authenticatorData, 37, 16384);
  bytes(value.response.signature, 1, 1024);
  // Validate the retained encoding too, before choosing a verification algorithm.
  if (spkiFor(credential.public_key) !== credential.spki) throw Error('Retained key mismatch');
  const result = await verifyAuthenticationResponse({
    response: value,
    expectedChallenge,
    expectedOrigin: policy.origin,
    expectedRPID: policy.rpId,
    expectedType: 'webauthn.get',
    requireUserVerification: true,
    credential: {
      id: credential.id,
      publicKey: new Uint8Array(credential.public_key),
      // TRD 13.9: observe counters, do not use their monotonicity as the replay gate.
      counter: 0,
    },
  });
  if (!result.verified) throw Error('Invalid assertion');
  return result.authenticationInfo.newCounter;
}
