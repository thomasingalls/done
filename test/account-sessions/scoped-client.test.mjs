import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { sign } from 'node:crypto';
import { fixture } from './grant-fixtures.mjs';
import { fresh } from '../account-core/fixtures.mjs';
import { query } from '../account-service-inbound/oracle.mjs';
import { encodeSubmit } from '../../account-protocol/deliveryTransport.ts';
import { createScopedAccountHandler } from '../../account-service/scoped-http.ts';
import { browser } from './browser-fixtures.mjs';
const { ScopedTransport, NetworkSignInRequired, privateDeliveryPost } = browser;
const denied = (refusal, status = 401) =>
  Response.json({ v: 1, kind: 'authorization-refused', refusal }, { status });
async function client(t, intercept) {
  const x = await fixture(t, { clock: () => Date.now() });
  globalThis.location = { origin: x.authority.pin.origin };
  const stop = new AbortController(),
    loginStop = new AbortController();
  let access = x.first.access,
    renewals = 0,
    signatures = 0,
    calls = [],
    status = 'remembered';
  const login = {
    networkSignal: loginStop.signal,
    getSnapshot: () => status,
    authorization: async () => {
      if (status === 'reconnect') return;
      if (!access) {
        access = x.first.renew();
        renewals++;
      }
      assert.equal(access.stage, 'access');
      return {
        token: access.accessToken,
        accountId: access.accountId,
        sessionId: access.sessionId,
      };
    },
    rejectAccess: (token, reconnect) => {
      if (access?.accessToken === token) {
        access = undefined;
        if (reconnect) status = 'reconnect';
      }
    },
  };
  let core = x.f.core,
    handler = createScopedAccountHandler(core, x.authority.owner, x.authority.pin);
  const server = createServer((req, res) => {
    if (core !== x.f.core) {
      core = x.f.core;
      handler = createScopedAccountHandler(core, x.authority.owner, x.authority.pin);
    }
    void handler(req, res);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    stop.abort();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const transport = async (url, init) => {
    const path = new URL(url).pathname;
    assert.equal(new URL(url).origin, x.authority.pin.origin);
    assert.equal(init.credentials, 'omit');
    assert.equal(init.cache, 'no-store');
    assert.equal(init.redirect, 'error');
    calls.push({ path, body: typeof init.body === 'string' ? init.body : Buffer.from(init.body) });
    const replacement = await intercept?.(path, init, x);
    if (replacement) return replacement;
    return new Promise((resolve, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port: server.address().port,
          path,
          method: 'POST',
          signal: init.signal,
          headers: {
            ...init.headers,
            Host: new URL(x.authority.pin.origin).host,
            Origin: x.authority.pin.origin,
          },
        },
        (res) => {
          const chunks = [];
          res.on('data', (v) => chunks.push(v));
          res.on('end', () =>
            resolve(
              new Response(Buffer.concat(chunks), { status: res.statusCode, headers: res.headers }),
            ),
          );
        },
      );
      req.on('error', reject);
      req.end(init.body);
    });
  };
  const owner = new ScopedTransport(x.authority.pin, stop.signal, transport);
  const binding = {
    login,
    scope: x.scope,
    sign: async (message) => {
      signatures++;
      return sign(null, message, x.s.privateKey).toString('hex');
    },
  };
  const scoped = owner.bind(binding);
  const read = () =>
    scoped.fetch('/account/delivery/read-v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: query(x),
    });
  return {
    ...x,
    owner,
    binding,
    scoped,
    read,
    stop,
    loginStop,
    login,
    transport,
    get calls() {
      return calls;
    },
    get renewals() {
      return renewals;
    },
    get signatures() {
      return signatures;
    },
  };
}
test('browser grant transport performs real protected binary delivery and deduplicates the fresh device proof', async (t) => {
  const x = await client(t);
  const [a, b] = await Promise.all([x.read(), x.read()]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(x.signatures, 1);
  const body = encodeSubmit(x.workspace, x.make(1).bytes);
  const answer = await privateDeliveryPost(
    x.authority.pin,
    x.scoped,
    'submit',
    body,
    1024 * 1024,
    x.stop.signal,
  );
  assert(answer instanceof Uint8Array);
  assert.equal(x.f.rows('delivery_decisions').length, 1);
  assert.equal(x.signatures, 1);
  assert.equal(x.renewals, 0);
  assert(!x.calls.some((c) => c.path.includes('/access')));
});
test('service restart renews access once, reacquires the lost grant and resends identical query bytes', async (t) => {
  const x = await client(t);
  assert.equal((await x.read()).status, 200);
  x.f.restart();
  assert.equal((await x.read()).status, 200);
  const reads = x.calls.filter((c) => c.path === '/account/delivery/read-v2');
  assert.deepEqual(reads[1].body, reads[2].body);
  assert.equal(x.renewals, 1);
  assert.equal(x.signatures, 2);
});
test('an explicit grant refusal retries the captured body once despite caller mutation', async (t) => {
  let first = true,
    release,
    reached;
  const arrived = new Promise((r) => {
      reached = r;
    }),
    wait = new Promise((r) => {
      release = r;
    });
  const x = await client(t, async (path) => {
    if (path === '/account/delivery/read-v2' && first) {
      first = false;
      reached();
      await wait;
      return denied('grant-required');
    }
  });
  const bytes = query(x),
    before = Buffer.from(bytes);
  const work = x.scoped.fetch('/account/delivery/read-v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: bytes,
  });
  await arrived;
  bytes.fill(0);
  release();
  assert.equal((await work).status, 200);
  for (const c of x.calls.filter((c) => c.path === '/account/delivery/read-v2'))
    assert.deepEqual(c.body, before);
  assert.equal(x.signatures, 2);
});
test('scope/authority refusal, ordinary HTTP denial and lost write response never cause an automatic semantic retry', async (t) => {
  for (const mode of ['insufficient-scope', 'authority-changed', 'ordinary', 'lost']) {
    const x = await client(t, (path) => {
      if (path !== '/account/delivery/submit') return;
      if (mode === 'lost') throw new TypeError('Response lost');
      return mode === 'ordinary'
        ? Response.json({ ok: false, refusal: 'invalid-proof' }, { status: 403 })
        : denied(mode, 409);
    });
    const body = encodeSubmit(x.workspace, x.make(1).bytes);
    const result = await privateDeliveryPost(
      x.authority.pin,
      x.scoped,
      'submit',
      body,
      1024,
      x.stop.signal,
    );
    assert.equal(result, null);
    assert.equal(x.calls.filter((c) => c.path.endsWith('/submit')).length, 1);
    assert.equal(x.signatures, 1);
  }
});
test('repeated grant denial is bounded; parent sign-out asks for explicit reconnect without renewal', async (t) => {
  const x = await client(t, (path) =>
    path.endsWith('/read-v2') ? denied('grant-required') : undefined,
  );
  await assert.rejects(x.read(), /grant-required/);
  assert.equal(x.calls.filter((c) => c.path.endsWith('/read-v2')).length, 2);
  const y = await client(t);
  await y.read();
  y.first.revoke();
  await assert.rejects(y.read(), (e) => e instanceof NetworkSignInRequired);
  assert.equal(y.renewals, 0);
  assert.equal(y.login.getSnapshot(), 'reconnect');
});
test('wrong grant identity is rejected before signing and enrollment scope cannot call workspace routes', async (t) => {
  const x = await client(t);
  for (const edit of [
    { accountId: fresh() },
    { sessionId: fresh() },
    { scope: { ...x.scope, credentialId: 'ab'.repeat(16) } },
    { pin: { ...x.authority.pin, serviceId: 'cd'.repeat(16) } },
    { actions: ['read'] },
  ]) {
    const transport = new ScopedTransport(x.authority.pin, x.stop.signal, async (url, init) => {
      const reply = await x.transport(url, init);
      if (new URL(url).pathname.endsWith('/begin')) {
        const value = await reply.json();
        Object.assign(value.challenge, edit);
        return Response.json(value);
      }
      return reply;
    });
    await assert.rejects(
      transport.bind(x.binding).fetch('/account/delivery/read-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: query(x),
      }),
      /Grant identity/,
    );
    transport.close();
  }
  assert.equal(x.signatures, 0);
  const enrollment = x.owner.bind({
    ...x.binding,
    scope: { ...x.scope, kind: 'enrollment', attemptId: fresh() },
  });
  await assert.rejects(
    enrollment.fetch('/account/delivery/read-v2', { method: 'POST', body: query(x) }),
    /Wrong grant route/,
  );
});
test('lock/sign-out fences a late grant reply and discards the cached grant', async (t) => {
  let release, reached;
  const arrived = new Promise((r) => {
      reached = r;
    }),
    wait = new Promise((r) => {
      release = r;
    });
  const x = await client(t, async (path) => {
    if (path.endsWith('/finish')) {
      reached();
      await wait;
    }
  });
  const pending = x.read();
  await arrived;
  x.loginStop.abort();
  release();
  await assert.rejects(pending);
  assert.equal(x.calls.filter((c) => c.path.endsWith('/read-v2')).length, 0);
  await assert.rejects(x.read());
});
test('oversized authorization response is cancelled before any signature or operation', async (t) => {
  const x = await client(t, (path) =>
    path.endsWith('/begin')
      ? new Response(' '.repeat(4097), { headers: { 'Content-Type': 'application/json' } })
      : undefined,
  );
  await assert.rejects(x.read(), /too large/);
  assert.equal(x.signatures, 0);
});

test('pending device admission uses its exact enrollment grant; an authority change returns control to the operation owner', async (t) => {
  const x = await client(t),
    p = await x.prepare();
  const access = x.owner.bind({
    login: x.login,
    scope: {
      kind: 'enrollment',
      workspaceId: x.workspace,
      credentialId: p.entry.input.candidate.credentialId,
      attemptId: p.input.attemptId,
    },
    sign: async (message) => sign(null, message, p.entry.key).toString('hex'),
  });
  const request = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(p.input),
  };
  const path = '/__account-setup/enrollment/admit';
  const first = await (await access.fetch(path, request)).json();
  assert.equal(first.kind, 'device-admission-successor');
  await assert.rejects(access.fetch(path, request), /authority-changed/);
  assert.deepEqual(await (await access.fetch(path, request)).json(), first);
  assert.equal(x.calls.filter((c) => c.path === path).length, 3);
  for (const c of x.calls.filter((c) => c.path === path)) assert.equal(c.body, request.body);
});

test('elapsed access and grant lifetimes renew without a new passkey or new semantic request', async (t) => {
  const now = Date.now;
  t.after(() => {
    Date.now = now;
  });
  const x = await client(t);
  assert.equal((await x.read()).status, 200);
  Date.now = () => now() + 6 * 60 * 1000;
  assert.equal((await x.read()).status, 200);
  assert.equal(x.renewals, 1);
  assert.equal(x.signatures, 2);
  assert.equal(x.calls.filter((c) => c.path.endsWith('/read-v2')).length, 2);
});

test('notification handshake uses the scoped header grant and keeps its body alive beyond the ordinary deadline', async (t) => {
  let streamSignal;
  const x = await client(t, (path, init) => {
    if (path !== '/account/notifications/v1/subscribe') return;
    streamSignal = init.signal;
    assert.equal(init.method, 'POST');
    assert.match(init.headers.Authorization, /^Bearer /);
    return new Response(new ReadableStream(), { headers: { 'Content-Type': 'text/event-stream' } });
  });
  await x.read();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const response = await x.scoped.openNotifications(x.stop.signal);
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(x.calls.at(-1).body), x.scope);
  t.mock.timers.tick(10001);
  assert.equal(streamSignal.aborted, false);
  x.loginStop.abort();
  assert.equal(streamSignal.aborted, true);
  await response.body.cancel();
  t.mock.timers.reset();
});

test('browser continuation routes retain workspace/enrollment separation and immutable retry bodies', async (t) => {
  const seen = [];
  const x = await client(t, (path, init) => {
    if (!path.startsWith('/account/membership/v2/')) return;
    seen.push({ path, body: init.body });
    return seen.length === 1 ? denied('grant-required') : Response.json({ ok: true });
  });
  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"nonce":"retained"}',
  };
  assert.equal((await x.scoped.fetch('/account/membership/v2/discover', init)).status, 200);
  assert.deepEqual(seen[0], seen[1]);
  assert.equal((await x.scoped.fetch('/account/membership/v2/checkpoint', init)).status, 200);
  const p = await x.prepare();
  const enrollment = x.owner.bind({
    ...x.binding,
    scope: {
      ...x.scope,
      kind: 'enrollment',
      credentialId: p.entry.input.candidate.credentialId,
      attemptId: p.input.attemptId,
    },
    sign: async (body) => sign(null, body, p.entry.key).toString('hex'),
  });
  for (const suffix of ['admit', 'ceremony', 'transfer']) {
    const path = '/account/membership/v2/' + suffix;
    await assert.rejects(x.scoped.fetch(path, init), /Wrong grant route/);
    assert.equal((await enrollment.fetch(path, init)).status, 200);
  }
  await assert.rejects(
    enrollment.fetch('/account/membership/v2/checkpoint', init),
    /Wrong grant route/,
  );
  await assert.rejects(
    enrollment.fetch('/account/membership/v2/discover', init),
    /Wrong grant route/,
  );
  await assert.rejects(
    enrollment.fetch('/__account-setup/membership/bootstrap', init),
    /Wrong grant route/,
  );
  x.stop.abort();
  await assert.rejects(enrollment.fetch('/account/membership/v2/ceremony', init));
});
