import assert from 'node:assert/strict';
import { sign } from 'node:crypto';
import { ready as prepared } from '../account-successor/service-fixtures.mjs';
import { setup } from '../account-ceremony/development-fixtures.mjs';
import { authorityFixture } from '../account-authority/fixtures.mjs';
import { fresh } from '../account-core/fixtures.mjs';
import { lp } from '../account-service-delivery/fixtures.mjs';
import { AuthorizationRefused } from '../../account-service/authorization.ts';

// Independent byte construction: a wrong field, domain or order must not produce a valid proof.
export const message = (c) =>
  lp(
    'done/scoped-network-grant/v1',
    '1',
    c.pin.serviceId,
    c.pin.origin,
    c.pin.rpId,
    c.pin.authRoot,
    c.accountId,
    c.sessionId,
    c.scope.kind,
    c.scope.workspaceId,
    c.scope.credentialId,
    c.scope.attemptId ?? '',
    c.head,
    c.actions.join(','),
    c.challengeId,
    String(c.expiresAt),
  );
export async function fixture(t, { ceremony = false, hook = () => {}, clock } = {}) {
  const authority = authorityFixture(t);
  let now = 1000;
  const x = await (ceremony ? setup : prepared)(t, {
    authority,
    sessions: { pin: authority.pin, operatorKey: authority.key },
    now: clock ?? (() => now),
    hook,
  });
  const login = async (account = x.account) => {
    const retryKey = fresh(),
      view = x.f.core.sessions.begin({ accountId: account.result.accountId, retryKey });
    const session = await x.f.core.sessions.finish({
      retryKey,
      attemptId: view.attemptId,
      response: account.key.assert(view),
    });
    assert.equal(session.stage, 'issued', JSON.stringify(session));
    const renew = () =>
      x.f.core.sessions.renew({ sessionId: session.sessionId, renewalToken: session.renewalToken });
    const access = renew();
    assert.equal(access.stage, 'access');
    return {
      session,
      access,
      renew,
      revoke: () =>
        x.f.core.sessions.revoke({
          sessionId: session.sessionId,
          revokeToken: session.revokeToken,
        }),
    };
  };
  const first = await login();
  const scope = { kind: 'workspace', workspaceId: x.workspace, credentialId: x.credential };
  const begin = (scopeValue = scope, access = first.access) =>
    authority.owner.beginGrant(x.f.core, access.accessToken, scopeValue);
  const finish = (view, key = x.s.privateKey, access = first.access) =>
    x.f.core.grants.finish(access.accessToken, {
      challengeId: view.challenge.challengeId,
      signature: sign(null, message(view.challenge), key).toString('hex'),
    });
  const grant = async (scopeValue = scope, key = x.s.privateKey, access = first.access) => {
    const b = await begin(scopeValue, access);
    assert.equal(b.stage, 'challenge', JSON.stringify(b));
    const r = await finish(b, key, access);
    assert.equal(r.stage, 'granted', JSON.stringify(r));
    return r;
  };
  const submit = (g, wire = x.make()) =>
    authority.owner.decideSubmission(
      x.f.core,
      { workspaceId: x.workspace, bytes: wire.bytes },
      x.f.core.grants.authorize(g.grantToken),
    );
  return {
    ...x,
    first,
    scope,
    login,
    begin,
    finish,
    grant,
    submit,
    setTime: (t) => {
      now = t;
    },
  };
}
export const denial = (reason) => (e) => e instanceof AuthorizationRefused && e.refusal === reason;
