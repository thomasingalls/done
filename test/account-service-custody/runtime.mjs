import { readFileSync, mkdtempSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripTypeScriptTypes, syncBuiltinESMExports } from 'node:module';
import nodeCrypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { PrivateAuthority } from '../../account-service/authority.ts';
import { AcceptanceCustody } from '../../account-service/acceptance.ts';
import { b, privateKey } from './oracle.mjs';
export { PrivateAuthority, AcceptanceCustody };
export const bytes = (h) => new Uint8Array(b(h));
// Export only existing pure root seams from a disposable source copy; never change bodies here.
let source = readFileSync('account-service/authority.ts', 'utf8');
for (const [from, to] of [
  ['const sealKey =', 'export const sealKey ='],
  ['function unlock(', 'export function unlock('],
]) {
  if (source.split(from).length !== 2) throw Error('Root seam moved: ' + from);
  source = source.replace(from, to);
}
const url = new URL('../../account-service/authority.ts', import.meta.url);
source = source.replace(
  /from '(\.{1,2}\/[^']+)'/g,
  (_, p) => 'from ' + JSON.stringify(new URL(p, url).href),
);
export const rootSeams = await import(
  'data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64')
);
export function temporary(t) {
  const dir = mkdtempSync(join(tmpdir(), 'done-service-custody-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
export const sorted = (value) =>
  Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
export const row = (root) => ({ ...root, pin: JSON.stringify(sorted(root.pin)) });
export function install(path, root) {
  const db = new DatabaseSync(path);
  chmodSync(path, 0o600);
  try {
    db.exec(
      'CREATE TABLE authority (id INTEGER PRIMARY KEY CHECK(id=1), pin TEXT NOT NULL, salt TEXT NOT NULL, nonce TEXT NOT NULL, ct TEXT NOT NULL); PRAGMA user_version=1;',
    );
    const r = row(root);
    db.prepare('INSERT INTO authority VALUES (1,?,?,?,?)').run(r.pin, r.salt, r.nonce, r.ct);
  } finally {
    db.close();
  }
}
export function deterministic(t, seed, random, fn) {
  const key = privateKey(seed),
    values = [...random];
  const pair = t.mock.method(nodeCrypto, 'generateKeyPairSync', () => ({
    privateKey: key,
    publicKey: nodeCrypto.createPublicKey(key),
  }));
  const rng = t.mock.method(nodeCrypto, 'randomBytes', (n) => {
    const value = b(values.shift() ?? '');
    if (value.length !== n) throw Error('Unexpected random draw ' + n);
    return value;
  });
  syncBuiltinESMExports();
  try {
    const result = fn();
    if (values.length) throw Error('Unused random draw');
    return result;
  } finally {
    pair.mock.restore();
    rng.mock.restore();
    syncBuiltinESMExports();
  }
}
