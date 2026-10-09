import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { setup } from './enrollment-fixtures.mjs';
import { fresh } from '../account-core/fixtures.mjs';
import { renewal } from './fixtures.mjs';
const require = createRequire(import.meta.url),
  vr = createRequire(require.resolve('vite'));
const { rolldown } = await import(vr.resolve('rolldown'));
const input = '\0combined-enrollment-client';
const bundle = await rolldown({
  input,
  plugins: [
    {
      name: 'entry',
      resolveId: (id) => (id === input ? id : undefined),
      load: (id) =>
        id === input
          ? ['enrollmentLogin', 'sessionVault', 'networkLogin']
              .map(
                (n) =>
                  `export * from ${JSON.stringify(fileURLToPath(new URL('../../src/account/' + n + '.ts', import.meta.url)))};`,
              )
              .join('\n')
          : undefined,
    },
  ],
});
let built;
try {
  built = await bundle.generate({ format: 'esm' });
} finally {
  await bundle.close();
}
const {
  checkEnrollmentLogin,
  rememberEnrollmentLogin,
  completeEnrollmentLogin,
  openSessionVault,
  NetworkLogin,
  SESSION_DB,
} = await import(
  'data:text/javascript;base64,' + Buffer.from(built.output[0].code).toString('base64')
);
async function client(t) {
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
        const value = await fn();
        stop.signal.throwIfAborted();
        return value;
      },
    };
  const root = new Uint8Array(randomBytes(32)),
    scope = {
      pin: x.authority.pin,
      slotId: 'joining',
      rootId: 'root',
      accountId: x.context.accountId,
    };
  const vault = await openSessionVault(task, root, scope);
  t.after(() => {
    vault.close();
    root.fill(0);
  });
  const expected = { accountId: x.context.accountId, credentialId: x.context.passkeyId };
  let receipt, finished;
  const events = [];
  const options = {
    pin: x.authority.pin,
    context: x.context,
    loginRetryKey: x.entry.input.loginRetryKey,
    expected,
    signal: stop.signal,
    finish: async () => {
      events.push('finish');
      finished = await x.finish();
      return finished;
    },
    remember: async (r) => {
      events.push('seal');
      return rememberEnrollmentLogin(vault, task, r, expected);
    },
    persistReceipt: async (r) => {
      events.push('receipt');
      receipt = structuredClone(r);
    },
    acknowledge: async (r) => {
      events.push('ack');
      return x.f.core.sessions.acknowledge(renewal(r));
    },
  };
  return {
    ...x,
    root,
    scope,
    stop,
    task,
    vault,
    expected,
    options,
    events,
    get receipt() {
      return receipt;
    },
    get finished() {
      return finished;
    },
  };
}
test('one combined proof seals login before receipt/ack; the bound editor resumes it without another online assertion', async (t) => {
  const x = await client(t);
  await completeEnrollmentLogin(x.options);
  assert.deepEqual(x.events, ['finish', 'seal', 'receipt', 'ack']);
  assert.equal(x.f.rows('network_sessions')[0].result_seal, null);
  const held = await x.vault.load(x.task);
  assert.deepEqual(held, x.finished.login);
  const db = await new Promise((resolve) => {
    const r = indexedDB.open(SESSION_DB);
    r.onsuccess = () => resolve(r.result);
  });
  const stored = await new Promise((resolve) => {
    const tx = db.transaction('slots'),
      r = tx.objectStore('slots').getAll();
    tx.oncomplete = () => resolve(JSON.stringify(r.result));
  });
  db.close();
  for (const secret of [held.renewalToken, held.revokeToken, held.sessionId])
    assert(!stored.includes(secret));
  x.vault.close();
  x.f.restart();
  const binding = await x.authority.owner.promotionBinding(x.f.core, {
    retryKey: x.account.retryKey,
    requestDigest: x.offer.epoch.requestDigest,
  });
  assert.equal(binding.kind, 'promotion-slot-binding');
  const login = new NetworkLogin(x.authority.pin, x.scope.slotId, (op, body) =>
    x.f.core.sessions.run(op, body),
  );
  t.after(() => login.close());
  await login.initialize(x.task, x.root, x.scope.rootId, binding);
  login.activate({ signal: x.stop.signal, run: (work) => work(x.task) });
  assert(await login.access());
  assert.equal(login.getSnapshot(), 'remembered');
  assert.equal(x.f.rows('network_sessions').length, 1);
});
test('failed receipt persistence keeps retry credentials; a saved carrier handles a retired server copy', async (t) => {
  const x = await client(t);
  await assert.rejects(
    completeEnrollmentLogin({
      ...x.options,
      persistReceipt: async () => {
        throw Error('disk full');
      },
    }),
    /disk full/,
  );
  const held = await x.vault.load(x.task);
  assert.equal(held.stage, 'issued');
  assert.notEqual(x.f.rows('network_sessions')[0].result_seal, null);
  x.f.core.sessions.acknowledge(renewal(held)); // Model a later cleanup/lost ack without erasing the local carrier.
  await completeEnrollmentLogin(x.options);
  assert.deepEqual(await x.vault.load(x.task), held);
  assert(x.receipt);
  assert.equal(x.f.rows('network_sessions').length, 1);
});
test('a failed login seal is never acknowledged and retry can still recover the original issuance', async (t) => {
  const x = await client(t);
  await assert.rejects(
    completeEnrollmentLogin({
      ...x.options,
      remember: async () => {
        throw Error('seal failed');
      },
    }),
    /seal failed/,
  );
  assert.equal(x.receipt, undefined);
  assert(!x.events.includes('ack'));
  const before = x.f.rows('network_sessions')[0].id;
  await completeEnrollmentLogin(x.options);
  assert.equal(x.finished.login.sessionId, before);
});
test('lost finish reply is retried with the same proof and cannot create a second session', async (t) => {
  const x = await client(t);
  await assert.rejects(
    completeEnrollmentLogin({
      ...x.options,
      finish: async () => {
        await x.finish();
        throw Error('reply lost');
      },
    }),
    /reply lost/,
  );
  x.f.restart();
  await completeEnrollmentLogin(x.options);
  assert.equal(x.f.rows('network_sessions').length, 1);
});
test('signed-out state and closure reject late enrollment results', async (t) => {
  const x = await client(t);
  await x.vault.save(x.task, 'signed-out');
  await assert.rejects(completeEnrollmentLogin(x.options), /signed out/);
  assert.equal(await x.vault.load(x.task), 'signed-out');
  assert(!x.events.includes('ack'));
  const y = await client(t);
  await assert.rejects(
    completeEnrollmentLogin({
      ...y.options,
      finish: async () => {
        const r = await y.finish();
        y.stop.abort();
        return r;
      },
    }),
  );
  assert.deepEqual(y.events, []);
  assert.equal(y.receipt, undefined);
});
test('the client rejects changed purpose, retry binding, identity or immutable challenge before retention', async (t) => {
  const x = await client(t);
  for (const c of [
    { ...x.context, login: undefined },
    { ...x.context, accountId: fresh() },
    { ...x.context, login: { ...x.context.login, retryHash: 'aa'.repeat(32) } },
  ])
    await assert.rejects(checkEnrollmentLogin(c, x.entry.input.loginRetryKey, x.expected));
  const reply = await x.finish();
  await assert.rejects(
    completeEnrollmentLogin({
      ...x.options,
      context: { ...x.context, nonce: 'ab'.repeat(32) },
      finish: async () => reply,
    }),
    /saved enrollment challenge changed/,
  );
  await assert.rejects(
    completeEnrollmentLogin({
      ...x.options,
      finish: async () => ({ ...reply, login: { ...reply.login, accountId: fresh() } }),
    }),
  );
  assert.equal(await x.vault.load(x.task), null);
  assert.equal(x.receipt, undefined);
});
test('an unresolved or different login is preserved; an unavailable server copy cannot create a carrier', async (t) => {
  const x = await client(t);
  await assert.rejects(
    rememberEnrollmentLogin(
      x.vault,
      x.task,
      { ok: false, refusal: 'retry-unavailable' },
      x.expected,
    ),
    /fresh online check/,
  );
  const unresolved = { kind: 'pending', retryKey: fresh(), attemptId: fresh(), response: {} };
  await x.vault.save(x.task, unresolved);
  await assert.rejects(completeEnrollmentLogin(x.options));
  assert.deepEqual(await x.vault.load(x.task), unresolved);
  const retryKey = fresh(),
    begun = x.f.core.sessions.begin({ retryKey, accountId: x.expected.accountId });
  const other = await x.f.core.sessions.finish({
    retryKey,
    attemptId: begun.attemptId,
    response: x.account.key.assert(begun),
  });
  assert.equal(other.stage, 'issued');
  await x.vault.save(x.task, other);
  await completeEnrollmentLogin(x.options);
  assert.deepEqual(await x.vault.load(x.task), other);
  assert.notEqual(x.finished.login.sessionId, other.sessionId);
});
