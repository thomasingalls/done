import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { fixture, registered, policy } from '../account-core/fixtures.mjs';

// Use the application's installed bundler so browser syntax/import resolution are unchanged.
const require = createRequire(import.meta.url),
  viteRequire = createRequire(require.resolve('vite'));
const { rolldown } = await import(viteRequire.resolve('rolldown'));
const input = '\0session-client-tests';
const bundle = await rolldown({
  input,
  plugins: [
    {
      name: 'session-test-entry',
      resolveId(id) {
        if (id === input) return id;
      },
      load(id) {
        if (id === input)
          return ['networkLogin', 'sessionVault', 'slotUnlock']
            .map(
              (name) =>
                `export * from ${JSON.stringify(fileURLToPath(new URL('../../src/account/' + name + '.ts', import.meta.url)))};`,
            )
            .join('\n');
      },
    },
  ],
});
let output;
try {
  output = await bundle.generate({ format: 'esm' });
} finally {
  await bundle.close();
}
const {
  NetworkLogin,
  retrySessionSignOut,
  openSessionVault,
  drainSessionOutbox,
  SESSION_DB,
  slotBindingMessage,
  slotUnlockChallenge,
  verifySlotUnlock,
  verifySessionSlotUnlock,
} = await import(
  'data:text/javascript;base64,' + Buffer.from(output.output[0].code).toString('base64')
);

function owner() {
  const abort = new AbortController();
  const task = {
    signal: abort.signal,
    step(fn) {
      abort.signal.throwIfAborted();
      return fn();
    },
    async wait(fn) {
      abort.signal.throwIfAborted();
      const r = await fn();
      abort.signal.throwIfAborted();
      return r;
    },
  };
  return {
    signal: abort.signal,
    run: (fn) => task.wait(() => fn(task)),
    task,
    close: () => abort.abort(),
  };
}
const defer = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
async function setup(t, alg = -8) {
  globalThis.indexedDB = new IDBFactory();
  globalThis.IDBKeyRange = IDBKeyRange;
  globalThis.location = { origin: policy.origin };
  const authority = generateKeyPairSync('ed25519');
  const pin = {
    v: 1,
    ...policy,
    serviceId: '12'.repeat(16),
    authRoot: authority.publicKey
      .export({ format: 'der', type: 'spki' })
      .subarray(-32)
      .toString('hex'),
  };
  const f = fixture(t, { sessions: { pin, operatorKey: randomBytes(32) } });
  const account = await registered(f, alg);
  f.seedActive(account.result.accountId);
  const binding = {
    v: 1,
    accountId: account.result.accountId,
    principalId: 'ab'.repeat(16),
    rpId: policy.rpId,
    epoch: 1,
    credId: account.key.id,
    publicKey: account.key.pair.publicKey.export({ format: 'der', type: 'spki' }).toString('hex'),
  };
  const proof = {
    stored: {
      binding,
      bindingSignature: sign(null, slotBindingMessage(binding), authority.privateKey).toString(
        'hex',
      ),
    },
  };
  const root = new Uint8Array(randomBytes(32));
  let prompts = 0;
  const localAssertion = (response) => ({
    credentialId: response.id,
    ...Object.fromEntries(
      ['clientDataJSON', 'authenticatorData', 'signature', 'userHandle'].map((k) => [
        k,
        new Uint8Array(Buffer.from(response.response[k], 'base64url')),
      ]),
    ),
  });
  const assertion = async ({ challenge }) => {
    ++prompts;
    return localAssertion(
      account.key.assert({ options: { challenge: Buffer.from(challenge).toString('base64url') } }),
    );
  };
  const post = (op, input) => f.core.sessions.run(op, input);
  const clients = [];
  t.after(() => {
    for (const c of clients) {
      c.live.close();
      c.login.close();
    }
  });
  return {
    f,
    authority,
    pin,
    account,
    binding,
    proof,
    root,
    assertion,
    localAssertion,
    post,
    get prompts() {
      return prompts;
    },
    async open({ slot = 'a', send = post, warm = true, activate = true } = {}) {
      const live = owner(),
        login = new NetworkLogin(pin, slot, send),
        c = { live, login };
      clients.push(c);
      if (warm) await login.prewarm(binding);
      await login.initialize(live.task, root, 'root', proof);
      await login.unlock(live.task, proof, assertion);
      if (activate) login.activate(live);
      return c;
    },
  };
}
async function records(store = 'slots') {
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open(SESSION_DB);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store),
        q = tx.objectStore(store).getAll();
      tx.oncomplete = () => resolve(q.result);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

for (const alg of [-8, -7])
  test(`one ${alg} assertion opens local writing and signs in; lock/reopen uses one local prompt`, async (t) => {
    const x = await setup(t, alg),
      a = await x.open();
    assert.equal(x.prompts, 1);
    assert(await a.login.access());
    assert.equal(a.login.getSnapshot(), 'remembered');
    const session = x.f.rows('network_sessions')[0];
    const stored = JSON.stringify(await records());
    assert(!stored.includes(session.id));
    assert(!stored.includes(x.binding.credId));
    assert(!stored.includes('renewalToken'));
    a.live.close();
    x.f.restart();
    const b = await x.open();
    assert.equal(x.prompts, 2);
    assert(await b.login.access());
    assert.equal(x.f.rows('network_sessions').length, 1);
    assert.equal(x.f.rows('network_sessions')[0].expires_at, session.expires_at);
  });

test('slow challenge falls back immediately to the offline verifier, with no surprise later prompt', async (t) => {
  const x = await setup(t),
    pending = defer();
  const login = new NetworkLogin(x.pin, 'a', () => pending.promise),
    live = owner();
  t.after(() => {
    live.close();
    login.close();
  });
  const warming = login.prewarm(x.binding);
  await login.initialize(live.task, x.root, 'root', x.proof);
  await login.unlock(live.task, x.proof, x.assertion);
  login.activate(live);
  assert.equal(x.prompts, 1);
  assert.equal(await login.access(), undefined);
  pending.resolve({ ok: false, refusal: 'storage-unavailable' });
  await warming;
  assert.equal(x.prompts, 1);
  assert.equal(x.f.rows('network_sessions').length, 0);
});

test('lost finish reply survives restart using the exact sealed proof; no second session or passkey', async (t) => {
  const x = await setup(t);
  let lost = true;
  const a = await x.open({
    send: async (op, body) => {
      const r = await x.post(op, body);
      if (op === 'finish' && lost) {
        lost = false;
        throw Error('Reply lost');
      }
      return r;
    },
  });
  assert.equal(await a.login.access(), undefined);
  assert.equal(x.f.rows('network_sessions').length, 1);
  a.live.close();
  x.f.restart();
  const b = await x.open({ warm: false });
  assert(await b.login.access());
  assert.equal(x.prompts, 2);
  assert.equal(x.f.rows('network_sessions').length, 1);
});

test('offline sign-out retires the local generation; reopening cannot resume it; outbox only revokes', async (t) => {
  const x = await setup(t),
    a = await x.open();
  const token = await a.login.access();
  assert(token);
  await a.login.signOut();
  assert.equal(a.login.getSnapshot(), 'sign-out-pending');
  a.live.close();
  const outbox = await records('outbox');
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].operation, 'revoke');
  assert(!JSON.stringify(outbox).includes('renewalToken'));
  const b = await x.open();
  assert.equal(await b.login.access(), undefined);
  assert.equal(b.login.getSnapshot(), 'reconnect');
  assert.equal(x.f.rows('network_sessions').length, 1);
  assert.equal(await retrySessionSignOut(x.pin, b.live.signal, x.post), 0);
  assert.equal(x.f.rows('network_sessions')[0].state, 'revoked');
  assert.equal(
    x.f.core.sessions.withAccess(token, x.binding.accountId, () => ({ ok: true })).refusal,
    'access-required',
  );
  await b.login.connect();
  assert(await b.login.access());
  assert.equal(x.f.rows('network_sessions').length, 2);
});

test('sign-out racing an unknown finish cancels only that attempt and ignores the late credentials', async (t) => {
  const x = await setup(t),
    arrived = defer(),
    release = defer();
  const a = await x.open({
    send: async (op, body) => {
      const r = await x.post(op, body);
      if (op === 'finish') {
        arrived.resolve();
        await release.promise;
      }
      return r;
    },
  });
  const renewing = a.login.access();
  await arrived.promise;
  await a.login.signOut();
  assert.equal((await records('outbox'))[0].operation, 'cancel');
  release.resolve();
  assert.equal(await renewing, undefined);
  assert.equal(a.login.getSnapshot(), 'sign-out-pending');
  await retrySessionSignOut(x.pin, a.live.signal, x.post);
  assert.equal(x.f.rows('network_sessions')[0].state, 'revoked');
});

test('late renewal after sign-out cannot reinstall access and other slots retain their own login', async (t) => {
  const x = await setup(t),
    a = await x.open();
  assert(await a.login.access());
  a.live.close();
  const arrived = defer(),
    release = defer();
  const b = await x.open({
    send: async (op, body) => {
      const r = await x.post(op, body);
      if (op === 'renew') {
        arrived.resolve();
        await release.promise;
      }
      return r;
    },
  });
  const pending = b.login.access();
  await arrived.promise;
  const other = await x.open({ slot: 'other-person' });
  assert(await other.login.access());
  await b.login.signOut();
  release.resolve();
  assert.equal(await pending, undefined);
  assert.equal(b.login.getSnapshot(), 'sign-out-pending');
  assert(await other.login.access());
});

test('local combined verification rejects substituted context, unsigned binding and ordinary challenges', async (t) => {
  const x = await setup(t),
    retryKey = randomBytes(32).toString('base64url'),
    nonce = randomBytes(32).toString('hex');
  const view = x.f.core.sessions.begin({
    accountId: x.binding.accountId,
    retryKey,
    unlock: { nonce, principalId: x.binding.principalId, credentialId: x.binding.credId },
  });
  const assertion = x.localAssertion(x.account.key.assert(view));
  const attempt = {
    binding: x.binding,
    bindingSignature: Buffer.from(x.proof.stored.bindingSignature, 'hex'),
    authorizationKey: Buffer.from(x.pin.authRoot, 'hex'),
    pin: x.pin,
    origin: policy.origin,
    nonce,
    assertion,
    context: view.unlock,
  };
  assert.equal((await verifySessionSlotUnlock(attempt)).opened, true);
  assert.equal((await verifySlotUnlock(attempt)).opened, false);
  for (const [field, value] of Object.entries({
    nonce: 'ee'.repeat(32),
    accountId: randomBytes(32).toString('base64url'),
    principalId: 'wrong',
    credentialId: 'wrong',
    serverNonce: randomBytes(32).toString('base64url'),
    retryHash: 'ee'.repeat(32),
    attemptId: randomBytes(32).toString('base64url'),
    expiresAt: view.expiresAt + 1,
  }))
    assert.equal(
      (await verifySessionSlotUnlock({ ...attempt, context: { ...view.unlock, [field]: value } }))
        .opened,
      false,
      field,
    );
  assert.equal(
    (await verifySessionSlotUnlock({ ...attempt, bindingSignature: randomBytes(64) })).opened,
    false,
  );
  const local = await slotUnlockChallenge({
    principalId: x.binding.principalId,
    credId: x.binding.credId,
    nonce,
  });
  const response = x.account.key.assert({
    options: { challenge: Buffer.from(local).toString('base64url') },
  });
  assert.equal(
    (await x.post('finish', { attemptId: view.attemptId, retryKey, response })).refusal,
    'invalid-proof',
  );
  x.f.restart();
  assert.equal(
    (
      await x.post('finish', {
        attemptId: view.attemptId,
        retryKey,
        response: x.account.key.assert(view),
      })
    ).stage,
    'issued',
  );
  assert.equal(
    x.f.core.sessions.begin({
      accountId: x.binding.accountId,
      retryKey,
      unlock: {
        nonce: 'aa'.repeat(32),
        principalId: x.binding.principalId,
        credentialId: x.binding.credId,
      },
    }).refusal,
    'request-conflict',
  );
});

test('carrier scope and stale-owner checks reject wrong root/account/pin and concurrent stale writes', async (t) => {
  const x = await setup(t),
    live = owner(),
    scope = { pin: x.pin, slotId: 'scope', rootId: 'root', accountId: x.binding.accountId };
  const a = await openSessionVault(live.task, x.root, scope),
    b = await openSessionVault(live.task, x.root, scope);
  t.after(() => {
    a.close();
    b.close();
    live.close();
  });
  await a.save(live.task, { credential: 'private-renewal' });
  await assert.rejects(b.save(live.task, 'stale'), /generation/);
  for (const change of [
    { rootId: 'other' },
    { accountId: 'other' },
    { pin: { ...x.pin, serviceId: 'aa'.repeat(16) } },
  ]) {
    const wrong = await openSessionVault(live.task, x.root, { ...scope, ...change });
    await assert.rejects(wrong.load(live.task));
    wrong.close();
  }
  const otherRoot = await openSessionVault(live.task, new Uint8Array(randomBytes(32)), scope);
  await assert.rejects(otherRoot.load(live.task));
  otherRoot.close();
  assert(!JSON.stringify(await records()).includes('private-renewal'));
});

test('failed encryption burns its reservation; cold reopen keeps the previous complete value', async (t) => {
  const x = await setup(t),
    live = owner(),
    scope = { pin: x.pin, slotId: 'burn', rootId: 'root', accountId: x.binding.accountId };
  let a = await openSessionVault(live.task, x.root, scope);
  await a.save(live.task, 'previous');
  await assert.rejects(a.save(live.task, 'x'.repeat(131057)), /too large/);
  assert.equal((await records())[0].counter, 2);
  a.close();
  a = await openSessionVault(live.task, x.root, scope);
  assert.equal(await a.load(live.task), 'previous');
  await a.save(live.task, 'next');
  assert.equal((await records())[0].seal.sequence, 3);
  a.close();
  live.close();
});

test('tampered carrier and refused storage cannot block a valid offline unlock or claim remembered login', async (t) => {
  const x = await setup(t),
    a = await x.open();
  assert(await a.login.access());
  a.live.close();
  const db = await new Promise((resolve) => {
    const q = indexedDB.open(SESSION_DB);
    q.onsuccess = () => resolve(q.result);
  });
  await new Promise((resolve) => {
    const tx = db.transaction('slots', 'readwrite'),
      s = tx.objectStore('slots'),
      q = s.get('a');
    q.onsuccess = () => {
      const r = q.result;
      r.seal.ct = '00'.repeat(r.seal.ct.length / 2);
      s.put(r, 'a');
    };
    tx.oncomplete = resolve;
  });
  db.close();
  const b = await x.open();
  assert.equal(x.prompts, 2);
  assert.equal(b.login.getSnapshot(), 'storage-error');
  assert.equal(await b.login.access(), undefined);
  await assert.rejects(b.login.signOut(), /Cannot save/);
});

test('outbox loss/failure never changes the signed-out carrier and forged destinations are not contacted', async (t) => {
  const x = await setup(t),
    a = await x.open();
  assert(await a.login.access());
  await a.login.signOut();
  let sent = 0;
  assert.equal(
    await drainSessionOutbox({ ...x.pin, serviceId: 'aa'.repeat(16) }, async () => {
      ++sent;
      return true;
    }),
    1,
  );
  assert.equal(sent, 0);
  assert.equal(
    await drainSessionOutbox(x.pin, async () => {
      throw Error('offline');
    }),
    1,
  );
  a.live.close();
  const b = await x.open();
  assert.equal(await b.login.access(), undefined);
});

test('two people on the same origin keep distinct sessions when one signs out', async (t) => {
  const x = await setup(t),
    a = await x.open();
  assert(await a.login.access());
  const other = await registered(x.f);
  x.f.seedActive(other.result.accountId);
  const binding = {
    ...x.binding,
    accountId: other.result.accountId,
    principalId: 'cd'.repeat(16),
    credId: other.key.id,
    publicKey: other.key.pair.publicKey.export({ format: 'der', type: 'spki' }).toString('hex'),
  };
  const proof = {
    stored: {
      binding,
      bindingSignature: sign(null, slotBindingMessage(binding), x.authority.privateKey).toString(
        'hex',
      ),
    },
  };
  const live = owner(),
    login = new NetworkLogin(x.pin, 'second-person', x.post);
  t.after(() => {
    live.close();
    login.close();
  });
  await login.prewarm(binding);
  await login.initialize(live.task, new Uint8Array(randomBytes(32)), 'different-root', proof);
  await login.unlock(live.task, proof, async ({ challenge }) =>
    x.localAssertion(
      other.key.assert({ options: { challenge: Buffer.from(challenge).toString('base64url') } }),
    ),
  );
  login.activate(live);
  const token = await login.access();
  assert(token);
  await a.login.signOut();
  await retrySessionSignOut(x.pin, live.signal, x.post);
  assert.equal(
    x.f.core.sessions.withAccess(token, other.result.accountId, () => ({ ok: true })).ok,
    true,
  );
  assert.equal(x.f.rows('network_sessions').filter((s) => s.state === 'active').length, 1);
});

test('sign-out cancels an outstanding reconnect passkey without installing its result', async (t) => {
  const x = await setup(t),
    a = await x.open({ warm: false });
  const prompted = defer();
  await a.login.unlock(a.live.task, x.proof, async ({ signal, ...request }) => {
    if (!signal) return x.assertion(request);
    prompted.resolve();
    return new Promise((_, reject) =>
      signal.addEventListener('abort', () => reject(Error('cancelled')), { once: true }),
    );
  });
  const connecting = a.login.connect();
  await prompted.promise;
  await a.login.signOut();
  await connecting;
  assert.equal(a.login.getSnapshot(), 'signed-out');
  assert.equal(await a.login.access(), undefined);
  assert.equal(x.f.rows('network_sessions').length, 0);
});

for (const remembered of [false, true])
  test(`cancelled ${remembered ? 'reconnect' : 'first connection'} still identifies a required passkey`, async (t) => {
    const x = await setup(t),
      a = await x.open({ warm: remembered });
    const token = await a.login.access();
    await a.login.unlock(a.live.task, x.proof, async (request) => {
      if (request.signal) throw Error('Passkey cancelled');
      return x.assertion(request);
    });
    if (remembered) {
      assert(token);
      a.login.rejectAccess(token, true);
    }
    await a.login.connect();
    assert.equal(a.login.getSnapshot(), remembered ? 'reconnect' : 'connect');
    assert.equal(await a.login.access(), undefined);
  });

test('a wrong-account issuance reply is never saved or acknowledged', async (t) => {
  const x = await setup(t);
  let acknowledgements = 0;
  const a = await x.open({
    send: async (op, body) => {
      if (op === 'acknowledge') ++acknowledgements;
      const r = await x.post(op, body);
      return op === 'finish' && r.ok
        ? { ...r, accountId: randomBytes(32).toString('base64url') }
        : r;
    },
  });
  assert.equal(await a.login.access(), undefined);
  assert.equal(x.prompts, 1);
  assert.equal(acknowledgements, 0);
  assert.equal(a.login.getSnapshot(), 'disconnected');
  await a.login.signOut();
  assert.equal((await records('outbox'))[0].operation, 'cancel');
});
