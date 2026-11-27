// Phase 551: history requests through the application's own transports and the real scoped HTTP
// route. A real network session and per-device workspace grants come from the in-process service;
// the page side is the real ScopedTransport and createHistoryTransport, so every refusal reaches
// the client exactly as a browser receives it. Tests that use this mock Date.now to the service
// clock (1000), because grant expiry is checked against the client's clock.
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createScopedAccountHandler } from '../../account-service/scoped-http.ts';
import { ScopedRequestBudget } from '../../account-service/requestBudget.ts';
import { client as c } from './client.mjs';

/** A request budget that refuses with `capacity` while `busy` is set. */
class Throttle extends ScopedRequestBudget {
  busy = false;
  acquire(key) {
    return this.busy ? undefined : super.acquire(key);
  }
}

/**
 * `x`: a service fixture with `f.core`, `authority`, `account` and `workspace`.
 * Returns `connect(membership, credentialId, signer)`, giving one device's history exchange.
 */
export async function historyHttp(t, x) {
  globalThis.location = { origin: x.authority.pin.origin };
  const retryKey = randomBytes(32).toString('base64url');
  const begun = x.f.core.sessions.begin({ retryKey, accountId: x.account.result.accountId });
  const issued = await x.f.core.sessions.finish({
    retryKey,
    attemptId: begun.attemptId,
    response: x.account.key.assert(begun),
  });
  assert.equal(issued.stage, 'issued', JSON.stringify(issued));
  const renew = () =>
    x.f.core.sessions.renew({ sessionId: issued.sessionId, renewalToken: issued.renewalToken });
  let access = renew(),
    status = 'remembered',
    problem,
    intercept = null;
  const budget = new Throttle();
  const handler = createScopedAccountHandler(
    x.f.core,
    x.authority.owner,
    x.authority.pin,
    undefined,
    budget,
  );
  const server = createServer((req, res) => void handler(req, res));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const stop = new AbortController(),
    loginStop = new AbortController();
  t.after(async () => {
    stop.abort();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const login = {
    networkSignal: loginStop.signal,
    getSnapshot: () => status,
    getProblem: () => problem,
    // As NetworkLogin: a renewal refused `sign-in-required` asks for a passkey.
    authorization: async () => {
      if (status !== 'remembered') return;
      if (!access?.ok) access = renew();
      if (!access.ok) {
        if (access.refusal === 'sign-in-required') status = 'reconnect';
        return;
      }
      return {
        token: access.accessToken,
        accountId: access.accountId,
        sessionId: access.sessionId,
      };
    },
    rejectAccess: (token, signIn) => {
      if (access?.accessToken !== token) return;
      access = undefined;
      if (signIn) status = 'reconnect';
    },
  };
  const send = async (url, init) => {
    const path = new URL(url).pathname;
    const replaced = await intercept?.(path, init);
    if (replaced) return replaced;
    return new Promise((resolve, reject) => {
      const req = httpRequest(
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
          res.on('error', reject);
        },
      );
      req.on('error', reject);
      req.end(init.body);
    });
  };
  const scoped = new c.ScopedTransport(x.authority.pin, stop.signal, send);
  return {
    /** The page's scoped access for one device, as the sync lanes use it (phase 552). */
    access(credentialId, signer) {
      return scoped.bind({
        login,
        scope: { kind: 'workspace', workspaceId: x.workspace, credentialId },
        sign: signer,
      });
    },
    connect(membership, credentialId, signer, signal = new AbortController().signal) {
      return c.createHistoryTransport(
        membership,
        scoped.bind({
          login,
          scope: { kind: 'workspace', workspaceId: x.workspace, credentialId },
          sign: signer,
        }),
        signal,
      );
    },
    /** Replace the next replies: `fn(path, init)` returns a Response, throws, or returns nothing. */
    intercept(fn) {
      intercept = fn;
    },
    /** End the network session on the service, as signing out elsewhere would. */
    revoke() {
      const r = x.f.core.sessions.revoke({
        sessionId: issued.sessionId,
        revokeToken: issued.revokeToken,
      });
      assert.equal(r.ok, true);
    },
    throttle(on) {
      budget.busy = on;
    },
    /** The login has no access and does not ask for a passkey, for this reason if any. */
    disconnect(reason) {
      status = 'disconnected';
      problem = reason;
    },
    get status() {
      return status;
    },
  };
}
