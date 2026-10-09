import { generateKeyPairSync, randomBytes, createHash, sign } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccountCore } from '../../account-service/core.ts';
import { DatabaseSync } from 'node:sqlite';

export const policy = { rpId: 'localhost', origin: 'http://localhost:4999' };
export const fresh = () => randomBytes(32).toString('base64url');
const hash = (value) => createHash('sha256').update(value).digest();
const b64 = (value) => Buffer.from(value).toString('base64url');
const uint = (major, value) => {
  if (value < 24) return Buffer.from([(major << 5) | value]);
  if (value < 256) return Buffer.from([(major << 5) | 24, value]);
  const out = Buffer.alloc(3);
  out[0] = (major << 5) | 25;
  out.writeUInt16BE(value, 1);
  return out;
};
// Independent fixture encoder: no production/library parser or challenge derivation reused.
export function cbor(value) {
  if (typeof value === 'number') return value >= 0 ? uint(0, value) : uint(1, -1 - value);
  if (typeof value === 'string')
    return Buffer.concat([uint(3, Buffer.byteLength(value)), Buffer.from(value)]);
  if (value instanceof Uint8Array) return Buffer.concat([uint(2, value.length), value]);
  if (value instanceof Map)
    return Buffer.concat([
      uint(5, value.size),
      ...[...value].flatMap(([key, item]) => [cbor(key), cbor(item)]),
    ]);
  throw Error('Unsupported fixture CBOR');
}
export function authenticator(alg = -8) {
  const pair = generateKeyPairSync(
    alg === -8 ? 'ed25519' : 'ec',
    alg === -8 ? {} : { namedCurve: 'prime256v1' },
  );
  const jwk = pair.publicKey.export({ format: 'jwk' });
  const cose = new Map(
    alg === -8
      ? [
          [1, 1],
          [3, -8],
          [-1, 6],
          [-2, Buffer.from(jwk.x, 'base64url')],
        ]
      : [
          [1, 2],
          [3, -7],
          [-1, 1],
          [-2, Buffer.from(jwk.x, 'base64url')],
          [-3, Buffer.from(jwk.y, 'base64url')],
        ],
  );
  const id = fresh();
  let accountId;
  const client = (view, type, edits) =>
    Buffer.from(
      JSON.stringify(
        {
          type,
          challenge: view.options.challenge,
          origin: policy.origin,
          crossOrigin: false,
          ...edits,
        },
        null,
        1,
      ),
    );
  const authData = (flags, count, rpId) => {
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(count);
    return Buffer.concat([hash(rpId), Buffer.from([flags]), counter]);
  };
  return {
    id,
    cose,
    pair,
    alg,
    get accountId() {
      return accountId;
    },
    register(view, edits = {}) {
      accountId = view.options.user.id;
      const identifier = Buffer.from(edits.attestedId ?? id, 'base64url');
      const length = Buffer.alloc(2);
      length.writeUInt16BE(identifier.length);
      const auth = Buffer.concat([
        authData(edits.flags ?? 0x45, edits.count ?? 0, edits.rpId ?? policy.rpId),
        Buffer.alloc(16),
        length,
        identifier,
        cbor(edits.cose ?? cose),
      ]);
      return {
        id,
        rawId: id,
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          clientDataJSON: b64(client(view, 'webauthn.create', edits.client)),
          attestationObject: b64(
            cbor(
              new Map([
                ['fmt', edits.fmt ?? 'none'],
                ['attStmt', new Map()],
                ['authData', auth],
              ]),
            ),
          ),
        },
      };
    },
    assert(view, edits = {}) {
      const cd = client(view, 'webauthn.get', edits.client);
      const auth = authData(edits.flags ?? 5, edits.count ?? 0, edits.rpId ?? policy.rpId);
      const signed = Buffer.concat([auth, hash(cd)]);
      return {
        id,
        rawId: id,
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          clientDataJSON: b64(cd),
          authenticatorData: b64(auth),
          signature: b64(
            sign(alg === -8 ? null : 'sha256', signed, edits.privateKey ?? pair.privateKey),
          ),
          userHandle: edits.userHandle ?? accountId,
        },
      };
    },
  };
}
export const finishRequest = (view, retryKey, response) => ({
  retryKey,
  ceremonyId: view.ceremonyId,
  operation: view.operation,
  response,
});
export function fixture(t, options = {}, Core = AccountCore) {
  const dir = mkdtempSync(join(tmpdir(), 'done-account-'));
  const path = join(dir, 'account.sqlite');
  let core = new Core(path, policy, options);
  t.after(() => {
    core.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    path,
    get core() {
      return core;
    },
    restart() {
      core.close();
      core = new Core(path, policy, options);
    },
    seedActive(id) {
      const db = new DatabaseSync(path);
      db.prepare("UPDATE accounts SET state='active' WHERE id=?").run(id);
      db.close();
    },
    rows(table) {
      const db = new DatabaseSync(path);
      const rows = db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
      db.close();
      return rows;
    },
  };
}
export async function registered(f, alg = -8) {
  const key = authenticator(alg),
    retryKey = fresh();
  const view = f.core.begin({ operation: 'register', retryKey });
  const confirmation = await f.core.finish(finishRequest(view, retryKey, key.register(view)));
  const result = await f.core.finish(
    finishRequest(confirmation, retryKey, key.assert(confirmation)),
  );
  if (!result.ok || result.stage !== 'credential-confirmed') throw Error(JSON.stringify(result));
  return { key, retryKey, view, confirmation, result };
}
