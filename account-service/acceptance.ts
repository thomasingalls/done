/** Private acceptance-seed custody. This component certifies a key but issues no content accepts. */
import {
  createSecretKey,
  generateKeyPairSync,
  createPrivateKey,
  createPublicKey,
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  type KeyObject,
} from 'node:crypto';
import { lp, unhex } from '../account-protocol/recovery.ts';
import { pinBytes, type AuthorityPin } from '../account-protocol/authority.ts';
import { closed } from '../account-protocol/preparation.ts';
export interface AcceptanceSeal {
  v: 1;
  publicKey: string;
  salt: string;
  nonce: string;
  ct: string;
}
export class AcceptanceCustody {
  #key: KeyObject | null;
  #pin: AuthorityPin;
  constructor(operatorKey: Uint8Array, pin: AuthorityPin) {
    const raw = Buffer.from(
      hkdfSync(
        'sha256',
        operatorKey,
        new Uint8Array(),
        lp('done/acceptance-custody/v1', pin.serviceId, pin.authRoot),
        32,
      ),
    );
    try {
      this.#key = createSecretKey(raw);
    } finally {
      raw.fill(0);
    }
    this.#pin = { ...pin };
  }
  #derive(salt: string): Buffer {
    if (!this.#key) throw Error('Acceptance custody closed');
    return Buffer.from(
      hkdfSync('sha256', this.#key, unhex(salt, 16), lp('done/acceptance-seal/v1'), 32),
    );
  }
  #aad(id: string, pub: string) {
    return Buffer.concat([pinBytes(this.#pin), lp('done/acceptance-seal/v1', id, pub)]);
  }
  create(id: string): AcceptanceSeal {
    unhex(id, 32);
    const pair = generateKeyPairSync('ed25519'),
      raw = pair.privateKey.export({ format: 'der', type: 'pkcs8' });
    const publicKey = pair.publicKey
        .export({ format: 'der', type: 'spki' })
        .subarray(-32)
        .toString('hex'),
      salt = randomBytes(16).toString('hex'),
      nonce = randomBytes(12).toString('hex');
    const key = this.#derive(salt);
    try {
      const cipher = createCipheriv('aes-256-gcm', key, Buffer.from(nonce, 'hex'));
      cipher.setAAD(this.#aad(id, publicKey));
      return {
        v: 1,
        publicKey,
        salt,
        nonce,
        ct: Buffer.concat([
          cipher.update(raw.subarray(-32)),
          cipher.final(),
          cipher.getAuthTag(),
        ]).toString('hex'),
      };
    } finally {
      key.fill(0);
      raw.fill(0);
    }
  }
  check(input: unknown, id: string, pub: string): void {
    const s = closed(input, ['v', 'publicKey', 'salt', 'nonce', 'ct']);
    if (s['v'] !== 1 || s['publicKey'] !== pub) throw Error('Acceptance seal changed');
    unhex(pub, 32);
    unhex(id, 32);
    const ct = unhex(s['ct'], 48),
      key = this.#derive(s['salt'] as string);
    let raw: Buffer | undefined, encoded: Buffer | undefined;
    try {
      const cipher = createDecipheriv('aes-256-gcm', key, unhex(s['nonce'], 12));
      cipher.setAAD(this.#aad(id, pub));
      cipher.setAuthTag(ct.subarray(-16));
      raw = Buffer.concat([cipher.update(ct.subarray(0, -16)), cipher.final()]);
      encoded = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), raw]);
      const privateKey = createPrivateKey({ key: encoded, format: 'der', type: 'pkcs8' });
      if (
        createPublicKey(privateKey)
          .export({ format: 'der', type: 'spki' })
          .subarray(-32)
          .toString('hex') !== pub
      )
        throw Error('Acceptance key mismatch');
    } finally {
      key.fill(0);
      raw?.fill(0);
      encoded?.fill(0);
    }
  }
  close() {
    this.#key = null;
  }
}
