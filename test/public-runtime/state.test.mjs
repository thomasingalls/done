import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  statSync,
  renameSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import {
  publicPolicy,
  publicStorageConfig,
  publicListenConfig,
} from '../../account-service/public-config.ts';
import {
  initializePublicState,
  openPublicState,
  lockPublicState,
} from '../../account-service/public-state.ts';
import { openPublicAccountService } from '../../account-service/public-runtime.ts';
import { ownAccountRequests } from '../../account-service/service-lifetime.ts';

const policy = publicPolicy('https://done.example.com');
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'done-public-'));
  const options = {
    directory: join(root, 'state'),
    policy,
    operatorKeyFile: join(root, 'operator.key'),
    pinFile: join(root, 'expected-pin.json'),
  };
  writeFileSync(options.operatorKeyFile, randomBytes(32), { mode: 0o600 });
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const init = () => {
    const pin = initializePublicState(options);
    writeFileSync(options.pinFile, JSON.stringify(pin));
    return pin;
  };
  return { root, options, init };
}
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

test('public config requires explicit HTTPS identity and separate ports without preview defaults', () => {
  assert.deepEqual(policy, { origin: 'https://done.example.com', rpId: 'done.example.com' });
  for (const origin of [
    'http://localhost:8080',
    'https://done.example.com/',
    'https://done.example.com?q=1',
    'https://u:p@done.example.com',
  ])
    assert.throws(() => publicPolicy(origin));
  assert.throws(() => publicStorageConfig({}), /Missing DONE_PUBLIC_ORIGIN/);
  assert.throws(
    () => publicStorageConfig({ DONE_PUBLIC_ORIGIN: policy.origin, DONE_STATE_DIR: 'relative' }),
    /absolute/,
  );
  assert.throws(
    () => publicListenConfig({ DONE_PUBLIC_ORIGIN: policy.origin, DONE_API_PORT: '8080' }),
    /differ/,
  );
  assert.throws(
    () =>
      publicListenConfig({ DONE_PUBLIC_ORIGIN: policy.origin, DONE_APP_ADDRESS: 'example.com' }),
    /IP address/,
  );
});

test('ordinary startup does not create missing state; explicit initialization retains a stable identity', async (t) => {
  const { options, init } = fixture(t);
  assert.throws(() => openPublicAccountService(options));
  assert.equal(existsSync(options.directory), false);
  const pin = init();
  const store = join(options.directory, 'store');
  assert.equal(statSync(join(store, 'authority.sqlite')).mode & 0o777, 0o600);
  const before = hash(join(store, 'authority.sqlite'));
  assert.deepEqual(initializePublicState(options), pin);
  for (let i = 0; i < 2; i++) {
    const service = openPublicAccountService(options);
    assert.throws(() => openPublicAccountService(options), /in use/);
    assert.throws(() => initializePublicState(options), /in use/);
    await service.close();
  }
  assert.equal(hash(join(store, 'authority.sqlite')), before);
  assert.equal(existsSync(join(options.directory, 'operator.key')), false);
});

test('pin, origin and wrapping-key mismatches refuse without replacing the identity', (t) => {
  const { options, init } = fixture(t);
  const pin = init();
  const path = join(options.directory, 'store', 'authority.sqlite');
  const before = hash(path);
  writeFileSync(options.pinFile, JSON.stringify({ ...pin, serviceId: 'ab'.repeat(16) }));
  assert.throws(() => openPublicState(options), /mismatch/);
  writeFileSync(options.pinFile, JSON.stringify(pin));
  assert.throws(
    () => openPublicState({ ...options, policy: publicPolicy('https://other.example.com') }),
    /mismatch/,
  );
  writeFileSync(options.operatorKeyFile, randomBytes(32));
  assert.throws(() => openPublicState(options));
  assert.throws(() => initializePublicState(options));
  assert.equal(hash(path), before);
});

test('missing, empty and older account databases never become fresh stores at startup or init retry', (t) => {
  const { options, init } = fixture(t);
  init();
  const path = join(options.directory, 'store', 'account.sqlite');
  renameSync(path, path + '.retained');
  assert.throws(() => openPublicState(options));
  assert.throws(() => initializePublicState(options));
  assert.equal(existsSync(path), false);
  writeFileSync(path, '', { mode: 0o600 });
  assert.throws(() => openPublicState(options), /schema/);
  assert.equal(statSync(path).size, 0);
  rmSync(path);
  renameSync(path + '.retained', path);
  const db = new DatabaseSync(path);
  db.exec('PRAGMA user_version=25');
  db.close();
  assert.throws(() => openPublicState(options), /schema/);
  assert.throws(() => initializePublicState(options), /schema/);
  const check = new DatabaseSync(path, { readOnly: true });
  assert.equal(check.prepare('PRAGMA user_version').get().user_version, 25);
  check.close();
});

test('incomplete initialization refuses retry and never replaces its already-created authority', (t) => {
  const { options } = fixture(t);
  assert.throws(
    () =>
      initializePublicState(options, () => {
        throw Error('interrupted');
      }),
    /interrupted/,
  );
  const path = join(options.directory, 'initializing', 'authority.sqlite');
  const before = hash(path);
  assert.throws(() => initializePublicState(options));
  assert.throws(() => openPublicState(options));
  assert.equal(hash(path), before);
  assert.equal(existsSync(join(options.directory, 'store')), false);
});

test('complete staging and lost initialization replies recover the same identity', (t) => {
  const { options } = fixture(t);
  assert.throws(
    () =>
      initializePublicState(options, (point) => {
        if (point === 'before-publish') throw Error('interrupted');
      }),
    /interrupted/,
  );
  const before = JSON.parse(readFileSync(join(options.directory, 'initializing', 'pin.json')));
  assert.throws(
    () =>
      initializePublicState(options, (point) => {
        if (point === 'after-publish') throw Error('lost reply');
      }),
    /lost reply/,
  );
  assert.deepEqual(initializePublicState(options), before);
});

test('a separate API process excludes another owner and SIGKILL releases ownership without deleting a lock file', async (t) => {
  const { options, init } = fixture(t);
  init();
  const module = pathToFileURL(resolve('account-service/public-server.ts')).href;
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import {startPublicAccountServer} from ${JSON.stringify(module)};
     const service=await startPublicAccountServer({...JSON.parse(process.env.FIXTURE_CONFIG),port:0});
     console.log('ready');`,
    ],
    {
      env: { ...process.env, FIXTURE_CONFIG: JSON.stringify(options) },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const exited = once(child, 'exit');
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await exited;
  });
  let stderr = '';
  child.stderr.on('data', (s) => {
    stderr += s;
  });
  await Promise.race([
    once(child.stdout, 'data'),
    exited.then(() => {
      throw Error('Owner exited before readiness: ' + stderr);
    }),
  ]);
  assert.throws(() => openPublicState(options), /in use/);
  child.kill('SIGKILL');
  await exited;
  const reopened = openPublicState(options);
  reopened.close();
  assert.equal(existsSync(join(options.directory, 'ownership.sqlite')), true);
});

test('shutdown keeps ownership through accepted work, including notification-close failure', async (t) => {
  const { options, init } = fixture(t);
  init();
  for (const failStop of [false, true]) {
    const releaseOwner = lockPublicState(options.directory);
    let release,
      disposed = false;
    const pending = new Promise((accept) => {
      release = accept;
    });
    const lifetime = ownAccountRequests(
      async () => {
        await pending;
      },
      () => {
        disposed = true;
        releaseOwner();
      },
      () => {
        if (failStop) throw Error('notification close failure');
      },
    );
    const response = {
      headersSent: false,
      writeHead(status) {
        this.status = status;
        return this;
      },
      end() {},
    };
    const work = lifetime.handle({}, response, () => {});
    const close = lifetime.close();
    const result = close.catch((error) => error);
    assert.equal(close, lifetime.close());
    assert.throws(() => lockPublicState(options.directory), /in use/);
    await lifetime.handle({}, response, () => {});
    assert.equal(response.status, 503);
    assert.equal(disposed, false);
    release();
    await work;
    const outcome = await result;
    assert.equal(outcome instanceof Error, failStop);
    assert.equal(disposed, true);
    lockPublicState(options.directory)();
  }
});
