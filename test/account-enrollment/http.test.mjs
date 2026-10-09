import test from 'node:test';
import assert from 'node:assert/strict';
import { ready, fresh } from './fixtures.mjs';
import { PrivateAuthority } from '../../account-service/authority.ts';
import { createPrivateAccountServer } from '../../account-service/private-server.ts';
import { parseEnrollmentResult } from '../../account-protocol/enrollment.ts';

test(
  'private HTTP preparation preserves exact results and enforces the adapter gates and body limit',
  { timeout: 15000 },
  async (t) => {
    const x = await ready(t),
      token = fresh();
    const server = await createPrivateAccountServer({
      path: x.f.path,
      port: 4999,
      token,
      authority: () => PrivateAuthority.open(x.authority.path, x.authority.pin, x.authority.key),
    });
    t.after(() => server.close());
    const send = async (op, input, headers = {}) => {
      const r = await fetch(server.origin + '/account/enrollment/' + op, {
        method: 'POST',
        headers: {
          Origin: server.origin,
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(input),
      });
      assert.equal(r.headers.get('cache-control'), 'no-store');
      return { status: r.status, body: await r.json() };
    };
    const e = x.candidate();
    for (const h of [
      { Origin: 'https://other.invalid' },
      { Authorization: 'Bearer ' + fresh() },
      { 'Content-Type': 'text/plain' },
    ])
      assert.equal((await send('begin', e.input, h)).status, 403);
    assert.equal((await send('begin', { ...e.input, extra: 'x'.repeat(131072) })).status, 413);
    assert.equal(x.f.rows('enrollment_preparations').length, 0);
    const c = await send('begin', e.input);
    assert.equal(c.status, 200);
    assert.equal(parseEnrollmentResult(c.body).stage, 'challenge');
    assert.equal(
      (await send('finish', { ...x.prove(e, c.body), response: { token } })).status,
      409,
    );
    const p = x.prove(e, c.body),
      r = await send('finish', p);
    assert.equal(r.body.stage, 'prepared');
    assert.deepEqual((await send('finish', p)).body, r.body);
    assert.equal((await send('cancel', { retryKey: e.input.retryKey })).body.stage, 'cancelled');
    const cold = await send('resume', { retryKey: e.input.retryKey });
    assert.equal(cold.body.stage, 'cancelled');
    assert.deepEqual(cold.body.receipt, r.body.receipt);
  },
);
