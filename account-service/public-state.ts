/** Explicit initialization and cold opening; ordinary startup never creates account state. */
import { DatabaseSync } from 'node:sqlite';
import {
  closeSync,
  existsSync,
  fsyncSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, isAbsolute } from 'node:path';
import { parseAuthorityPin, type AuthorityPin } from '../account-protocol/authority.ts';
import { PrivateAuthority } from './authority.ts';
import { AccountCore } from './core.ts';
import { canonical } from './protocol.ts';
import { publicPolicy } from './public-config.ts';
import { validatePolicy, type Policy } from './webauthn.ts';

export const PUBLIC_ACCOUNT_SCHEMA = 26;
export interface PublicStateOptions {
  directory: string;
  policy: Policy;
  operatorKeyFile: string;
}
function owned(path: string, directory = false) {
  const stat = lstatSync(path);
  if (
    (directory ? !stat.isDirectory() : !stat.isFile()) ||
    (stat.mode & 0o077) !== 0 ||
    (process.getuid && stat.uid !== process.getuid())
  )
    throw Error('Public state must use owned private directories and regular files');
}
function sync(path: string) {
  const fd = openSync(path, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
function writeNew(path: string, value: unknown) {
  writeFileSync(path, JSON.stringify(value) + '\n', { flag: 'wx', mode: 0o600 });
  sync(path);
}
function readJson(path: string) {
  owned(path);
  if (lstatSync(path).size > 8192) throw Error('Oversized service metadata');
  return JSON.parse(readFileSync(path, 'utf8'));
}
function outsideState(path: string, directory: string) {
  const suffix = relative(realpathSync(directory), realpathSync(path));
  if (suffix === '' || (!isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith('../')))
    throw Error('Operator key and expected pin must be mounted outside retained state');
}
export function readOperatorKey(path: string, directory: string): Buffer {
  outsideState(path, directory);
  // Projected Kubernetes secrets use symlinks and may be root-owned/group-readable.
  const fd = openSync(path, 'r');
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size !== 32 || (stat.mode & 0o007) !== 0)
      throw Error('Operator key must be a 32-byte file inaccessible to other users');
    const key = readFileSync(fd);
    if (key.length !== 32) {
      key.fill(0);
      throw Error('Operator key changed while reading');
    }
    return key;
  } finally {
    closeSync(fd);
  }
}
export function readExpectedPin(path: string, directory: string): AuthorityPin {
  outsideState(path, directory);
  const fd = openSync(path, 'r');
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 8192) throw Error('Invalid expected pin file');
    return Object.freeze(parseAuthorityPin(JSON.parse(readFileSync(fd, 'utf8'))));
  } finally {
    closeSync(fd);
  }
}

/** A separate SQLite rollback-mode EXCLUSIVE transaction owns the directory for the process lifetime.
 * Never unlink/replace ownership.sqlite: the stable inode is part of the ownership contract.
 * Initialization, service and future offline maintenance must all acquire this same lock first.
 */
export function lockPublicState(directory: string, initialize = false): () => void {
  owned(directory, true);
  const path = join(directory, 'ownership.sqlite');
  if (initialize && !existsSync(path)) {
    if (readdirSync(directory).length) throw Error('Missing ownership file in nonempty state');
    try {
      closeSync(openSync(path, 'wx', 0o600));
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause;
    }
    sync(directory);
  }
  owned(path);
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA busy_timeout=0; PRAGMA journal_mode=DELETE; BEGIN EXCLUSIVE;');
  } catch (cause) {
    db.close();
    throw Error('Public state is in use or its ownership file is unreadable', { cause });
  }
  let released = false;
  return () => {
    if (released) return;
    db.close();
    released = true;
  };
}

function verifyStore(store: string, policy: Policy, key: Uint8Array, expected?: AuthorityPin) {
  owned(store, true);
  const manifest = readJson(join(store, 'manifest.json'));
  const pin = Object.freeze(parseAuthorityPin(readJson(join(store, 'pin.json'))));
  if (
    canonical(manifest) !==
      canonical({ v: 1, accountSchema: PUBLIC_ACCOUNT_SCHEMA, authoritySchema: 1, pin }) ||
    pin.origin !== policy.origin ||
    pin.rpId !== policy.rpId ||
    (expected && canonical(expected) !== canonical(pin))
  )
    throw Error('Public state manifest, schema, policy or expected pin mismatch');
  const authorityPath = join(store, 'authority.sqlite');
  const accountPath = join(store, 'account.sqlite');
  owned(authorityPath);
  owned(accountPath);
  // Opening read-only first prevents AccountCore's fresh-store constructor from repairing a missing DB.
  const check = new DatabaseSync(accountPath, { readOnly: true });
  try {
    if (
      check.prepare('PRAGMA user_version').get()!.user_version !== PUBLIC_ACCOUNT_SCHEMA ||
      check.prepare('SELECT value FROM policy WHERE id=1').get()?.value !== canonical(policy)
    )
      throw Error(
        'Unsupported public account schema/policy; explicit offline maintenance required',
      );
    if (
      check
        .prepare('PRAGMA quick_check')
        .all()
        .some((row) => row.quick_check !== 'ok')
    )
      throw Error('Public account database integrity check failed');
  } finally {
    check.close();
  }
  const authority = PrivateAuthority.open(authorityPath, pin, key);
  try {
    const core = new AccountCore(accountPath, policy, {
      sessions: { pin, operatorKey: key },
      membershipContinuation: true,
    });
    return { authority, core, pin };
  } catch (cause) {
    authority.close();
    throw cause;
  }
}

/** The caller retains ownership until all admitted async operations have settled. */
export function openPublicState(options: PublicStateOptions & { pinFile: string }) {
  publicPolicy(options.policy.origin);
  validatePolicy(options.policy);
  const release = lockPublicState(options.directory);
  let key: Buffer | undefined;
  try {
    key = readOperatorKey(options.operatorKeyFile, options.directory);
    const expected = readExpectedPin(options.pinFile, options.directory);
    const state = verifyStore(join(options.directory, 'store'), options.policy, key, expected);
    let closed = false;
    return {
      ...state,
      close: () => {
        if (closed) return;
        closed = true;
        try {
          state.authority.close();
        } finally {
          try {
            state.core.close();
          } finally {
            release();
          }
        }
      },
    };
  } catch (cause) {
    release();
    throw cause;
  } finally {
    key?.fill(0);
  }
}

/** Publishes a complete store by same-filesystem rename, never replaces an existing identity.
 * A complete staged store can be verified and published after interruption. An incomplete one refuses
 * and remains available for operator inspection; neither init nor serve silently discards/rekeys it.
 */
export function initializePublicState(
  options: PublicStateOptions,
  hook: (point: 'authority-created' | 'before-publish' | 'after-publish') => void = () => {},
): AuthorityPin {
  publicPolicy(options.policy.origin);
  validatePolicy(options.policy);
  if (!existsSync(options.directory)) {
    mkdirSync(options.directory, { mode: 0o700 });
    sync(dirname(options.directory));
  }
  const release = lockPublicState(options.directory, true);
  let key: Buffer | undefined;
  try {
    key = readOperatorKey(options.operatorKeyFile, options.directory);
    const store = join(options.directory, 'store');
    const staged = join(options.directory, 'initializing');
    const allowed = new Set([
      'ownership.sqlite',
      'ownership.sqlite-journal',
      'store',
      'initializing',
    ]);
    if (readdirSync(options.directory).some((name) => !allowed.has(name)))
      throw Error('Unclassified public state directory');
    if (existsSync(store) && existsSync(staged)) throw Error('Ambiguous initialization state');
    if (!existsSync(store) && !existsSync(staged)) {
      mkdirSync(staged, { mode: 0o700 });
      sync(options.directory);
      const pin = PrivateAuthority.initialize(
        join(staged, 'authority.sqlite'),
        options.policy,
        key,
      );
      hook('authority-created');
      const accountPath = join(staged, 'account.sqlite');
      closeSync(openSync(accountPath, 'wx', 0o600));
      const core = new AccountCore(accountPath, options.policy, {
        sessions: { pin, operatorKey: key },
        membershipContinuation: true,
      });
      core.close();
      sync(join(staged, 'authority.sqlite'));
      sync(accountPath);
      writeNew(join(staged, 'pin.json'), pin);
      writeNew(join(staged, 'manifest.json'), {
        v: 1,
        accountSchema: PUBLIC_ACCOUNT_SCHEMA,
        authoritySchema: 1,
        pin,
      });
      sync(staged);
    }
    const candidate = existsSync(store) ? store : staged;
    const verified = verifyStore(candidate, options.policy, key);
    try {
      verified.authority.close();
    } finally {
      verified.core.close();
    }
    if (candidate === staged) {
      sync(staged);
      hook('before-publish');
      renameSync(staged, store);
      sync(options.directory);
      hook('after-publish');
    }
    return verified.pin;
  } finally {
    key?.fill(0);
    release();
  }
}
