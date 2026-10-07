import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  timingSafeEqual,
} from 'node:crypto';
import type { AuthorityPin } from '../account-protocol/authority.ts';
import { canonical } from './protocol.ts';

export interface SessionConfiguration {
  pin: AuthorityPin;
  operatorKey: Uint8Array;
}

/** The account transaction owner reserves counters durably BEFORE calling seal. */
export class SessionCustody {
  #key: Buffer;
  #checkKey: Buffer;
  #closed = false;
  readonly context: string;
  constructor(config: SessionConfiguration, salt: string) {
    if (config.operatorKey.length !== 32 || !/^[a-f0-9]{64}$/.test(salt))
      throw Error('Invalid session custody configuration');
    this.context = canonical({ domain: 'done/account-session-issuance/v1', pin: config.pin });
    this.#key = Buffer.from(
      hkdfSync('sha256', config.operatorKey, Buffer.from(salt, 'hex'), this.context, 32),
    );
    this.#checkKey = Buffer.from(
      hkdfSync(
        'sha256',
        config.operatorKey,
        Buffer.from(salt, 'hex'),
        canonical({ domain: 'done/account-session-key-check/v1', pin: config.pin }),
        32,
      ),
    );
  }
  tag(): string {
    if (this.#closed) throw Error('Session custody closed');
    return createHmac('sha256', this.#checkKey)
      .update('done/session-custody-key-check/v1')
      .digest('hex');
  }
  check(tag: string): void {
    if (
      !/^[a-f0-9]{64}$/.test(tag) ||
      !timingSafeEqual(Buffer.from(tag, 'hex'), Buffer.from(this.tag(), 'hex'))
    )
      throw Error('Session custody key changed');
  }
  #nonce(counter: number): Buffer {
    if (!Number.isSafeInteger(counter) || counter < 1 || counter > 0xffffffff)
      throw Error('Session issuance nonce exhausted');
    const nonce = Buffer.alloc(12);
    nonce.writeBigUInt64BE(BigInt(counter), 4);
    return nonce;
  }
  seal(value: string, binding: string, counter: number): string {
    if (this.#closed) throw Error('Session custody closed');
    const cipher = createCipheriv('aes-256-gcm', this.#key, this.#nonce(counter));
    cipher.setAAD(Buffer.from(canonical([this.context, binding, counter])));
    const plaintext = Buffer.from(value);
    try {
      const ciphertext = Buffer.concat([
        cipher.update(plaintext),
        cipher.final(),
        cipher.getAuthTag(),
      ]);
      return JSON.stringify({ counter, bytes: ciphertext.toString('base64url') });
    } finally {
      plaintext.fill(0);
    }
  }
  open(seal: string, binding: string): string {
    if (this.#closed) throw Error('Session custody closed');
    const record = JSON.parse(seal);
    if (typeof record.bytes !== 'string' || record.bytes.length > 8192)
      throw Error('Invalid session seal');
    const bytes = Buffer.from(record.bytes, 'base64url');
    if (bytes.length < 16 || bytes.toString('base64url') !== record.bytes)
      throw Error('Invalid session seal');
    const decipher = createDecipheriv('aes-256-gcm', this.#key, this.#nonce(record.counter));
    decipher.setAAD(Buffer.from(canonical([this.context, binding, record.counter])));
    decipher.setAuthTag(bytes.subarray(-16));
    const plaintext = Buffer.concat([decipher.update(bytes.subarray(0, -16)), decipher.final()]);
    try {
      return plaintext.toString('utf8');
    } finally {
      plaintext.fill(0);
    }
  }
  close(): void {
    this.#closed = true;
    this.#key.fill(0);
    this.#checkKey.fill(0);
  }
}
