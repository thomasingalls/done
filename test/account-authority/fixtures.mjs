import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { PrivateAuthority } from '../../account-service/authority.ts';
export const policy = { origin: 'http://localhost:4999', rpId: 'localhost' };
export const nonce = () => randomBytes(32).toString('hex');
export function authorityFixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'done-authority-')),
    path = join(dir, 'authority.sqlite'),
    key = randomBytes(32);
  const pin = PrivateAuthority.initialize(path, policy, key);
  let owner = PrivateAuthority.open(path, pin, key);
  t.after(() => {
    owner.close();
    key.fill(0);
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    dir,
    path,
    key,
    pin,
    get owner() {
      return owner;
    },
    restart() {
      owner.close();
      owner = PrivateAuthority.open(path, pin, key);
    },
  };
}
