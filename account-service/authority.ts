import { closed, pendingMessage, type PendingProof } from '../account-protocol/preparation.ts';
import type { AccountCore } from './core.ts';
/** Explicit private service root owner. No general signing oracle, account activation or key export. */
import { DatabaseSync } from 'node:sqlite';
import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  sign,
  type KeyObject,
} from 'node:crypto';
import { openSync, closeSync, lstatSync } from 'node:fs';
import {
  parseAuthorityPin,
  pinBytes,
  authorityMessage,
  type AuthorityPin,
  type AuthorityProof,
} from '../account-protocol/authority.ts';
import { unhex, lp } from '../account-protocol/recovery.ts';
import { canonical } from './protocol.ts';

type Hook = (point: 'before-commit' | 'after-commit') => void;
const seedPrefix = Buffer.from('302e020100300506032b657004220420', 'hex');
const sealKey = (operatorKey: Uint8Array, pin: AuthorityPin, salt: string): Buffer => {
  if (!(operatorKey instanceof Uint8Array) || operatorKey.length !== 32)
    throw Error('Authority requires a 32-byte operator wrapping key');
  return Buffer.from(
    hkdfSync(
      'sha256',
      operatorKey,
      unhex(salt, 16),
      lp('done/service-authority-seal/v1', pin.serviceId, pin.origin, pin.rpId, pin.authRoot),
      32,
    ),
  );
};
function openFile(path: string, create: boolean): void {
  if (create) {
    // Exclusive creation means a failed/partial setup is never silently rekeyed.
    const fd = openSync(path, 'wx', 0o600);
    closeSync(fd);
  }
  const info = lstatSync(path);
  if (
    !info.isFile() ||
    (info.mode & 0o077) !== 0 ||
    (process.getuid && info.uid !== process.getuid())
  )
    throw Error('Authority database must be an owned private regular file');
}
function openDatabase(path: string, readOnly: boolean) {
  const db = new DatabaseSync(path, { readOnly });
  try {
    db.exec('PRAGMA busy_timeout=5000;');
    if (!readOnly) db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
interface SealedRoot {
  pin: string;
  salt: string;
  nonce: string;
  ct: string;
}
function unlock(row: SealedRoot, expected: AuthorityPin, operatorKey: Uint8Array): KeyObject {
  const pin = parseAuthorityPin(JSON.parse(row.pin));
  if (canonical(pin) !== canonical(expected)) throw Error('Authority pin changed');
  const key = sealKey(operatorKey, pin, row.salt);
  let raw: Buffer | undefined, encoded: Buffer | undefined;
  try {
    const ct = Buffer.from(unhex(row.ct, 48));
    const cipher = createDecipheriv('aes-256-gcm', key, unhex(row.nonce, 12));
    cipher.setAAD(pinBytes(pin));
    cipher.setAuthTag(ct.subarray(-16));
    raw = Buffer.concat([cipher.update(ct.subarray(0, -16)), cipher.final()]);
    if (raw.length !== 32) throw Error('Invalid authority scalar');
    encoded = Buffer.concat([seedPrefix, raw]);
    const signing = createPrivateKey({ key: encoded, format: 'der', type: 'pkcs8' });
    if (
      createPublicKey(signing)
        .export({ format: 'der', type: 'spki' })
        .subarray(-32)
        .toString('hex') !== pin.authRoot
    )
      throw Error('Authority private/public mismatch');
    return signing;
  } finally {
    key.fill(0);
    raw?.fill(0);
    encoded?.fill(0);
  }
}
export class PrivateAuthority {
  #pin: AuthorityPin;
  #key: KeyObject | null;
  private constructor(pin: AuthorityPin, key: KeyObject) {
    this.#pin = pin;
    this.#key = key;
  }
  /** The operator owns the parent directory, external wrapping key and independent public pin distribution. */
  static initialize(
    path: string,
    policy: { origin: string; rpId: string },
    operatorKey: Uint8Array,
    hook: Hook = () => {},
  ): AuthorityPin {
    // Validate before creating a filesystem artifact.
    const probe = parseAuthorityPin({
      v: 1,
      ...policy,
      serviceId: '00'.repeat(16),
      authRoot: '00'.repeat(32),
    });
    if (!(operatorKey instanceof Uint8Array) || operatorKey.length !== 32)
      throw Error('Authority requires a 32-byte operator wrapping key');
    openFile(path, true);
    const db = openDatabase(path, false);
    let encoded: Buffer | undefined, key: Buffer | undefined;
    try {
      db.exec('BEGIN IMMEDIATE');
      const pair = generateKeyPairSync('ed25519');
      const pin: AuthorityPin = {
        ...probe,
        serviceId: randomBytes(16).toString('hex'),
        authRoot: pair.publicKey
          .export({ format: 'der', type: 'spki' })
          .subarray(-32)
          .toString('hex'),
      };
      encoded = pair.privateKey.export({ format: 'der', type: 'pkcs8' });
      const salt = randomBytes(16).toString('hex'),
        nonce = randomBytes(12).toString('hex');
      key = sealKey(operatorKey, pin, salt);
      const cipher = createCipheriv('aes-256-gcm', key, Buffer.from(nonce, 'hex'));
      cipher.setAAD(pinBytes(pin));
      const ct = Buffer.concat([
        cipher.update(encoded.subarray(-32)),
        cipher.final(),
        cipher.getAuthTag(),
      ]).toString('hex');
      db.exec(
        'CREATE TABLE authority (id INTEGER PRIMARY KEY CHECK(id=1), pin TEXT NOT NULL, salt TEXT NOT NULL, nonce TEXT NOT NULL, ct TEXT NOT NULL); PRAGMA user_version=1;',
      );
      db.prepare('INSERT INTO authority VALUES (1,?,?,?,?)').run(canonical(pin), salt, nonce, ct);
      hook('before-commit');
      db.exec('COMMIT');
      hook('after-commit');
      return Object.freeze(pin);
    } catch (error) {
      if (db.isTransaction) db.exec('ROLLBACK');
      throw error;
    } finally {
      encoded?.fill(0);
      key?.fill(0);
      db.close();
    }
  }
  /** Read-only cold opening. Neither a missing root nor an unreadable root generates a replacement. */
  static open(path: string, expectedPin: AuthorityPin, operatorKey: Uint8Array): PrivateAuthority {
    const pin = parseAuthorityPin(expectedPin);
    openFile(path, false);
    const db = openDatabase(path, true);
    try {
      if (db.prepare('PRAGMA user_version').get()!.user_version !== 1)
        throw Error('Unsupported authority database');
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      if (tables.length !== 1 || tables[0]!.name !== 'authority')
        throw Error('Unclassified authority database');
      const rows = db.prepare('SELECT * FROM authority').all();
      if (rows.length !== 1 || rows[0]!.id !== 1)
        throw Error('Authority root missing or ambiguous');
      return new PrivateAuthority(pin, unlock(rows[0] as unknown as SealedRoot, pin, operatorKey));
    } finally {
      db.close();
    }
  }
  /** Cold-read the public pin for the trusted operator after a lost initialization response.
   * It is NOT a client trust-discovery endpoint. The wrapping factor authenticates its seal.
   */
  static recoverPin(path: string, operatorKey: Uint8Array): AuthorityPin {
    openFile(path, false);
    const db = openDatabase(path, true);
    let pin: AuthorityPin;
    try {
      pin = parseAuthorityPin(
        JSON.parse(db.prepare('SELECT pin FROM authority WHERE id=1').get()!.pin as string),
      );
    } finally {
      db.close();
    }
    const owner = PrivateAuthority.open(path, pin, operatorKey);
    owner.close();
    return Object.freeze(pin);
  }
  get pin(): Readonly<AuthorityPin> {
    return Object.freeze({ ...this.#pin });
  }
  prove(input: unknown): AuthorityProof {
    if (!this.#key) throw Error('Authority closed');
    const value = input as { nonce?: unknown } | undefined;
    if (
      !value ||
      typeof value !== 'object' ||
      Object.keys(value).join() !== 'nonce' ||
      typeof value.nonce !== 'string'
    )
      throw Error('Malformed authority request');
    const nonce = value.nonce;
    return {
      v: 1,
      pin: { ...this.#pin },
      nonce,
      signature: sign(null, authorityMessage(this.#pin, nonce), this.#key).toString('hex'),
    };
  }
  /** Resolve through the live service core; callers cannot supply the signed state. */
  pending(
    core: AccountCore,
    input: unknown,
    abandon = false,
  ): PendingProof | { ok: false; refusal: string } {
    if (!this.#key) throw Error('Authority closed');
    const r = closed(input, ['retryKey', 'accountId', 'nonce']);
    unhex(r['nonce'], 32);
    const result = core.pendingPreparation(
      { retryKey: r['retryKey'], accountId: r['accountId'] },
      abandon,
    );
    if (!result.ok) return result;
    if (result.state.draft && result.state.draft.authRoot !== this.#pin.authRoot)
      throw Error('Recovery root differs from service root');
    const nonce = r['nonce'] as string;
    return {
      v: 1,
      pin: { ...this.#pin },
      nonce,
      state: result.state,
      signature: sign(null, pendingMessage(this.#pin, nonce, result.state), this.#key).toString(
        'hex',
      ),
    };
  }
  close(): void {
    this.#key = null;
  }
}
