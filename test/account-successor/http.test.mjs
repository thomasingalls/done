import { request as nodeRequest } from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ready, state, discoveryQuery, discoveryProof } from './discovery-fixtures.mjs';
import { query } from './service-fixtures.mjs';
import { fresh } from '../account-enrollment/fixtures.mjs';
import { PrivateAuthority } from '../../account-service/authority.ts';
import { createPrivateAccountServer } from '../../account-service/private-server.ts';
import { encodeSubmit } from '../../account-protocol/deliveryTransport.ts';

test(
  'private HTTP prepares, consumes and discovers with exact retries; the pending credential gets no content capability',
  { timeout: 20000 },
  async (t) => {
    const x = await ready(t),
      token = fresh(),
      server = await createPrivateAccountServer({
        path: x.f.path,
        port: 4999,
        token,
        authority: () => PrivateAuthority.open(x.authority.path, x.authority.pin, x.authority.key),
      });
    t.after(() => server.close());
    const send = async (path, input, overrides = {}, raw) => {
      const result = await fetch(server.origin + path, {
        method: 'POST',
        headers: {
          Origin: server.origin,
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
          ...overrides,
        },
        body: raw ?? JSON.stringify(input),
      });
      assert.equal(result.headers.get('cache-control'), 'no-store');
      return { status: result.status, body: await result.json() };
    };
    const entry = x.candidate(),
      request = discoveryQuery(x),
      before = state(x);
    for (const path of ['/account/enrollment/admit', '/account/authority/discover']) {
      for (const headers of [
        { Origin: 'https://wrong.invalid' },
        { Authorization: 'Bearer ' + fresh() },
        { 'Content-Type': 'text/plain' },
      ])
        assert.equal((await send(path, request, headers)).status, 403);
      const badHost = await new Promise((resolve, reject) => {
        const r = nodeRequest(
          server.origin + path,
          {
            method: 'POST',
            headers: {
              Host: 'wrong.invalid',
              Origin: server.origin,
              Authorization: 'Bearer ' + token,
              'Content-Type': 'application/json',
            },
          },
          (response) => {
            response.resume();
            response.on('end', () => resolve(response.statusCode));
          },
        );
        r.on('error', reject);
        r.end('{}');
      });
      assert.equal(badHost, 403);
      assert.equal((await send(path, { pad: 'x'.repeat(4096) })).status, 413);
      assert.equal((await send(path, null, {}, Buffer.from([255]))).status, 400);
      assert.equal((await send(path, [])).status, 400);
    }
    assert.equal(state(x), before);
    discoveryProof(x, (await send('/account/authority/discover', request)).body, request, null);
    const challenge = await send('/account/enrollment/begin', entry.input);
    assert.equal(challenge.body.stage, 'challenge');
    const proof = x.prove(entry, challenge.body),
      prepared = await send('/account/enrollment/finish', proof);
    assert.equal(prepared.body.stage, 'prepared');
    const input = {
        retryKey: entry.input.retryKey,
        attemptId: prepared.body.receipt.context.attemptId,
        receiptId: prepared.body.receipt.receiptId,
      },
      retained = state(x);
    for (const invalid of [
      { ...input, retryKey: fresh() },
      { ...input, attemptId: fresh() },
      { ...input, receiptId: fresh() },
      { ...input, receipt: prepared.body.receipt },
      { receipt: prepared.body.receipt },
      { token },
    ])
      assert.equal((await send('/account/enrollment/admit', invalid)).status, 409);
    assert.equal(state(x), retained);
    const admitted = await send('/account/enrollment/admit', input);
    assert.equal(admitted.status, 200);
    assert.equal(admitted.body.kind, 'device-admission-successor');
    assert.deepEqual((await send('/account/enrollment/admit', input)).body, admitted.body);
    assert.equal(
      (await send('/account/enrollment/resume', { retryKey: input.retryKey })).body.stage,
      'admitted',
    );
    for (const r of [request, discoveryQuery(x, { epoch: 2, head: admitted.body.head })]) {
      const response = await send('/account/authority/discover', r);
      assert.equal(response.status, 200);
      discoveryProof(x, response.body, r, admitted.body);
    }
    const candidate = entry.input.candidate;
    assert.equal(
      (
        await send(
          '/account/authority/discover',
          discoveryQuery(
            x,
            { epoch: 2, head: admitted.body.head, credentialId: candidate.credentialId },
            entry.key,
          ),
        )
      ).status,
      409,
    );
    const read = query(
      x,
      0,
      1,
      { epoch: 2, head: admitted.body.head, reader: candidate.credentialId },
      entry.key,
    );
    assert.equal(
      (
        await send(
          '/account/delivery/read-v2',
          null,
          { 'Content-Type': 'application/octet-stream' },
          read,
        )
      ).status,
      409,
    );
    const write = x.make(1, 'pending device', {
      epoch: 2,
      credential: candidate.credentialId,
      signer: entry.key,
    });
    assert.equal(
      (
        await send(
          '/account/delivery/submit',
          null,
          { 'Content-Type': 'application/octet-stream' },
          encodeSubmit(x.workspace, write.bytes),
        )
      ).status,
      409,
    );
    assert.equal((await send('/account/enrollment/key', { retryKey: input.retryKey })).status, 404);
    assert.equal(x.f.rows('delivery_decisions').length, 0);
  },
);

test(
  'unprovisioned private server leaves admission and discovery unavailable',
  { timeout: 10000 },
  async (t) => {
    const x = await ready(t),
      token = fresh(),
      server = await createPrivateAccountServer({ path: x.f.path, port: 4999, token });
    t.after(() => server.close());
    for (const path of ['/account/enrollment/admit', '/account/authority/discover']) {
      const response = await fetch(server.origin + path, {
        method: 'POST',
        headers: {
          Origin: server.origin,
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      assert.equal(response.status, 404);
    }
  },
);
