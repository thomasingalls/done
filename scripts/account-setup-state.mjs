/** Offline maintenance for the loopback-only account preview, not a deployment migrator. */
import { lockDevelopmentState as lockPreviewState } from '../account-service/development-state.ts';
export { lockPreviewState };
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { AccountCore } from '../account-service/core.ts';
import { PrivateAuthority } from '../account-service/authority.ts';

export function previewConfig(env = process.env) {
  const port = Number(env.ACCOUNT_SETUP_PORT ?? 53210);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw Error('Invalid development port');
  const origin = env.ACCOUNT_SETUP_ORIGIN ?? `http://localhost:${port}`;
  const url = new URL(origin);
  if (
    url.origin !== origin ||
    (origin !== `http://localhost:${port}` &&
      (url.protocol !== 'https:' || !url.hostname.endsWith('.ts.net')))
  )
    throw Error('Preview origin must be loopback or an explicit Tailscale HTTPS origin');
  return {
    port,
    directory: resolve(env.ACCOUNT_SETUP_STATE ?? '.dev/account-setup'),
    policy: { rpId: url.hostname, origin },
  };
}

export function accountSchema(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return db.prepare('PRAGMA user_version').get().user_version;
  } finally {
    db.close();
  }
}

// Ask this checkout's core which schema it creates. No duplicated migration SQL or target constant.
function targetSchema(policy) {
  const scratch = mkdtempSync(join(tmpdir(), 'done-account-schema-'));
  try {
    const path = join(scratch, 'account.sqlite');
    new AccountCore(path, policy).close();
    return accountSchema(path);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export async function upgradePreviewState({ directory, port, policy }) {
  // Never initialize replacement state when the operator meant to upgrade an existing service.
  for (const file of ['account.sqlite', 'authority.sqlite', 'pin.json', 'operator.key'])
    if (!existsSync(join(directory, file))) throw Error(`Missing preview state: ${file}`);
  const release = lockPreviewState(directory);
  const guard = createServer((socket) => socket.destroy());
  try {
    // Also catches the pre-lock version of the preview runner, which used this same pinned port.
    await new Promise((accept, reject) => {
      guard.once('error', reject);
      guard.listen(port, '127.0.0.1', accept);
    }).catch((error) => {
      if (error.code === 'EADDRINUSE')
        throw Error(`Stop the preview on port ${port} before upgrading its state.`);
      throw error;
    });
    const pinBytes = readFileSync(join(directory, 'pin.json'));
    const pin = JSON.parse(pinBytes);
    if (pin.origin !== policy.origin || pin.rpId !== policy.rpId)
      throw Error('Reuse the original port for this development service');
    const key = readFileSync(join(directory, 'operator.key'));
    try {
      PrivateAuthority.open(join(directory, 'authority.sqlite'), pin, key).close();
      const path = join(directory, 'account.sqlite');
      const from = accountSchema(path);
      const to = targetSchema(policy);
      if (from === to) {
        new AccountCore(path, policy).close();
        return { from, to, backup: null };
      }
      if (from < 1 || from >= to || from > to)
        throw Error(`Unsupported preview upgrade from schema ${from} to ${to}`);

      const backups = join(directory, 'backups');
      mkdirSync(backups, { recursive: true, mode: 0o700 });
      const snapshot = mkdtempSync(join(backups, `schema-${from}-`));
      // VACUUM INTO takes a consistent SQLite snapshot, including committed WAL pages.
      // Use the synchronous snapshot operation while the offline lock is held.
      for (const file of ['account.sqlite', 'authority.sqlite']) {
        const db = new DatabaseSync(join(directory, file), { readOnly: true });
        const destination = join(snapshot, file);
        try {
          writeFileSync(destination, '', { flag: 'wx', mode: 0o600 });
          db.prepare('VACUUM INTO ?').run(destination);
          const fd = openSync(destination, 'r');
          try {
            fsyncSync(fd);
          } finally {
            closeSync(fd);
          }
        } finally {
          db.close();
        }
      }
      writeFileSync(join(snapshot, 'pin.json'), pinBytes, { flag: 'wx', mode: 0o600, flush: true });
      writeFileSync(join(snapshot, 'operator.key'), key, { flag: 'wx', mode: 0o600, flush: true });
      writeFileSync(
        join(snapshot, 'manifest.json'),
        JSON.stringify({ from, to, origin: policy.origin, createdAt: new Date().toISOString() }),
        { flag: 'wx', mode: 0o600, flush: true },
      );
      try {
        new AccountCore(path, policy, { [`upgradeFromV${from}`]: true }).close();
        if (accountSchema(path) !== to) throw Error('Account schema did not reach its target');
      } catch (cause) {
        throw Error(`Preview upgrade failed. Pre-upgrade state is saved at ${snapshot}`, { cause });
      }
      return { from, to, backup: snapshot };
    } finally {
      key.fill(0);
    }
  } finally {
    if (guard.listening) await new Promise((accept) => guard.close(accept));
    release();
  }
}
