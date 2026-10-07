import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { setup } from './enrollment-fixtures.mjs';
import { browser } from './browser-fixtures.mjs';
const {
  NetworkLogin,
  NetworkSignInRequired,
  openSessionVault,
  rememberEnrollmentLogin,
  completeEnrollmentLogin,
} = browser;
async function client(t, alter) {
  globalThis.indexedDB = new IDBFactory();
  globalThis.IDBKeyRange = IDBKeyRange;
  const x = await setup(t, { now: Date.now });
  globalThis.location = { origin: x.authority.pin.origin };
  const stop = new AbortController(),
    task = {
      signal: stop.signal,
      step: (fn) => {
        stop.signal.throwIfAborted();
        return fn();
      },
      wait: async (fn) => {
        stop.signal.throwIfAborted();
        const r = await fn();
        stop.signal.throwIfAborted();
        return r;
      },
    };
  const root = new Uint8Array(randomBytes(32)),
    scope = {
      pin: x.authority.pin,
      slotId: 'candidate',
      rootId: 'root',
      accountId: x.context.accountId,
    };
  const vault = await openSessionVault(task, root, scope),
    expected = { accountId: x.context.accountId, credentialId: x.context.passkeyId };
  let prompts = 0,
    posts = [],
    receipt;
  const login = new NetworkLogin(x.authority.pin, scope.slotId, async (op, body) => {
    posts.push(op);
    const result = await x.f.core.sessions.run(op, body);
    return alter ? alter(op, result) : result;
  });
  t.after(() => {
    stop.abort();
    login.close();
    vault.close();
    root.fill(0);
  });
  const owned = (
    fn,
    assert = async (options) => {
      prompts++;
      return x.account.key.assert({ options });
    },
  ) => login.withEnrollmentOwner(task, root, scope.rootId, expected, fn, assert);
  const finish = () =>
    completeEnrollmentLogin({
      pin: scope.pin,
      expected,
      context: x.context,
      loginRetryKey: x.entry.input.loginRetryKey,
      signal: stop.signal,
      finish: x.finish,
      remember: (r) => rememberEnrollmentLogin(vault, task, r, expected),
      persistReceipt: async (r) => {
        receipt = r;
      },
      acknowledge: (r) =>
        x.f.core.sessions.acknowledge({ sessionId: r.sessionId, renewalToken: r.renewalToken }),
    });
  const readHeld = async () => {
    const current = await openSessionVault(task, root, scope);
    try {
      return await current.load(task);
    } finally {
      current.close();
    }
  };
  return {
    ...x,
    readHeld,
    stop,
    task,
    root,
    scope,
    vault,
    expected,
    login,
    owned,
    finish,
    get prompts() {
      return prompts;
    },
    get posts() {
      return posts;
    },
    get receipt() {
      return receipt;
    },
  };
}
test('short ceremony permits reuse remembered access without retaining the vault or exhausting server capacity', async (t) => {
  const x = await client(t);
  await x.finish();
  for (let i = 0; i < 25; i++) {
    assert(await x.owned(() => x.login.authorization()));
    assert.equal(
      await x.login.authorization(),
      undefined,
      'No task outside the held ceremony permit',
    );
  }
  assert.equal(x.posts.filter((op) => op === 'renew').length, 1);
  assert.equal(x.prompts, 0);
  x.login.close();
  await assert.rejects(x.owned(() => x.login.authorization()));
});
test('unavailable combined issuance preserves its signed receipt, then explicit reconnect establishes a fresh login', async (t) => {
  const x = await client(t),
    original = await x.enroll('finish', x.proof);
  x.f.core.sessions.acknowledge({
    sessionId: original.login.sessionId,
    renewalToken: original.login.renewalToken,
  });
  await assert.rejects(x.finish(), (e) => e instanceof NetworkSignInRequired);
  assert.deepEqual(x.receipt, original.receipt);
  assert.equal(await x.readHeld(), null);
  await x.owned(async () => {
    assert.equal(await x.login.authorization(), undefined);
    assert.equal(x.prompts, 0);
    await x.login.connect();
    assert(await x.login.authorization());
  });
  assert.equal(x.prompts, 1);
  assert.equal(x.f.rows('network_sessions').length, 2);
  const saved = await x.readHeld();
  assert.notEqual(saved.sessionId, original.login.sessionId);
  assert.equal(saved.accountId, original.login.accountId);
  assert.deepEqual(x.receipt, original.receipt);
});
test('lost reconnect finish reply remains sealed and resumes without another assertion or login', async (t) => {
  let lose = true;
  const x = await client(t, (op, value) => {
    if (op === 'finish' && lose) {
      lose = false;
      throw Error('Lost reply');
    }
    return value;
  });
  await x.owned(() => x.login.connect());
  assert.equal((await x.readHeld()).kind, 'pending');
  assert.equal(x.prompts, 1);
  x.f.restart();
  await x.owned(async () => {
    await x.login.connect();
    assert(await x.login.authorization());
  });
  assert.equal(x.prompts, 1);
  assert.equal(x.f.rows('network_sessions').length, 1);
});
test('closing an enrollment reconnect prompt rejects its late proof before any session finish', async (t) => {
  const x = await client(t);
  let release, entered;
  const ready = new Promise((r) => {
      entered = r;
    }),
    wait = new Promise((r) => {
      release = r;
    });
  const work = x.owned(
    () => x.login.connect(),
    async (options, signal) => {
      entered();
      await wait;
      assert.equal(signal.aborted, true);
      return x.account.key.assert({ options });
    },
  );
  await ready;
  x.login.close();
  release();
  await work;
  assert(!x.posts.includes('finish'));
  assert.equal(await x.readHeld(), null);
});
