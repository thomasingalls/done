/** RFC 9180 base mode, fixed suite X25519 / HKDF-SHA256 / AES-256-GCM (32/1/2).
 * One fresh sender context, one 32-byte generation key, sequence zero, empty AAD.
 * Base mode supplies confidentiality, not sender authority; the promotion candidate supplies that.
 */
import { concat, utf8, hex, type Bytes } from '../crdt/custodyCrypto.ts';
import { unhex } from '../../account-protocol/recovery.ts';

export interface GenerationWrap {
  enc: string;
  ct: string;
}
const kemSuite = concat(utf8('KEM'), new Uint8Array([0, 32]));
const suite = concat(utf8('HPKE'), new Uint8Array([0, 32, 0, 1, 0, 2]));

async function schedule(
  dh: Bytes,
  enc: Bytes,
  recipient: Bytes,
  info: Bytes,
  subtle: SubtleCrypto,
) {
  const owned: Bytes[] = [];
  const keep = (b: Bytes) => {
    owned.push(b);
    return b;
  };
  const extract = async (domain: Bytes, salt: Bytes, label: string, ikm: Bytes) => {
    const key = await subtle.importKey(
      'raw',
      salt.length ? salt : new Uint8Array(32),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const input = concat(utf8('HPKE-v1'), domain, utf8(label), ikm);
    try {
      return keep(new Uint8Array(await subtle.sign('HMAC', key, input)));
    } finally {
      input.fill(0);
    }
  };
  // All lengths in this fixed suite fit one SHA-256 block.
  const expand = async (
    domain: Bytes,
    prk: Bytes,
    label: string,
    context: Bytes,
    length: number,
  ) => {
    const key = await subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
    ]);
    const input = concat(
      new Uint8Array([0, length]),
      utf8('HPKE-v1'),
      domain,
      utf8(label),
      context,
      new Uint8Array([1]),
    );
    try {
      return keep(new Uint8Array(await subtle.sign('HMAC', key, input))).subarray(0, length);
    } finally {
      input.fill(0);
    }
  };
  try {
    if (dh.length !== 32 || !dh.some((v) => v !== 0)) throw Error('Invalid HPKE shared secret');
    const empty = new Uint8Array();
    const eae = await extract(kemSuite, empty, 'eae_prk', dh);
    const shared = await expand(kemSuite, eae, 'shared_secret', concat(enc, recipient), 32);
    const psk = await extract(suite, empty, 'psk_id_hash', empty);
    const ih = await extract(suite, empty, 'info_hash', info);
    const context = concat(new Uint8Array([0]), psk, ih);
    const secret = await extract(suite, shared, 'secret', empty);
    const raw = await expand(suite, secret, 'key', context, 32);
    const nonce = (await expand(suite, secret, 'base_nonce', context, 12)).slice();
    return {
      key: await subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']),
      nonce,
    };
  } finally {
    for (const b of owned) b.fill(0);
  }
}

export async function sealGeneration(
  recipient: Bytes,
  info: Bytes,
  generationKey: Bytes,
  subtle = crypto.subtle,
): Promise<GenerationWrap> {
  if (recipient.length !== 32 || generationKey.length !== 32)
    throw Error('Invalid generation wrap');
  const pub = await subtle.importKey('raw', recipient, 'X25519', false, []);
  const sender = await subtle.generateKey('X25519', false, ['deriveBits']);
  const enc = new Uint8Array(await subtle.exportKey('raw', sender.publicKey));
  const dh = new Uint8Array(
    await subtle.deriveBits({ name: 'X25519', public: pub }, sender.privateKey, 256),
  );
  try {
    const { key, nonce } = await schedule(dh, enc, recipient, info, subtle);
    return {
      enc: hex(enc),
      ct: hex(
        new Uint8Array(
          await subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, key, generationKey),
        ),
      ),
    };
  } finally {
    dh.fill(0);
  }
}

/** The recipient public key is supplied from authenticated custody, never inferred from a wrap. */
export async function openGeneration(
  wrap: GenerationWrap,
  privateKey: CryptoKey,
  recipient: Bytes,
  info: Bytes,
  subtle = crypto.subtle,
): Promise<Bytes> {
  const enc = unhex(wrap.enc, 32),
    ct = unhex(wrap.ct, 48);
  const pub = await subtle.importKey('raw', enc, 'X25519', false, []);
  const dh = new Uint8Array(
    await subtle.deriveBits({ name: 'X25519', public: pub }, privateKey, 256),
  );
  try {
    const { key, nonce } = await schedule(dh, enc, recipient, info, subtle);
    return new Uint8Array(
      await subtle.decrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, key, ct),
    );
  } finally {
    dh.fill(0);
  }
}
