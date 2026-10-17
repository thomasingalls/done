import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { fixture } from './grant-fixtures.mjs';
import { query, pageProof } from '../account-service-inbound/oracle.mjs';
import { createScopedAccountHandler } from '../../account-service/scoped-http.ts';
import { ScopedRequestBudget, REQUEST_LIMITS as L } from '../../account-service/requestBudget.ts';
import {
  encodeInboundBatch,
  decodeInboundBatchPages,
} from '../../account-protocol/inboundBatch.ts';

async function harness(t, { before = async () => {} } = {}) {
  const x = await fixture(t),
    budget = new ScopedRequestBudget(() => 0),
    grant = await x.grant();
  let started = 0;
  const handler = createScopedAccountHandler(
    x.f.core,
    {
      readInbound: async (...args) => {
        await before(++started);
        return x.authority.owner.readInbound(...args);
      },
    },
    x.authority.pin,
    undefined,
    budget,
  );
  const server = createServer((req, res) => void handler(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const call = async (count = 1, bytes, token = grant.grantToken) => {
    const requests = Array.from({ length: count }, () => query(x));
    const response = await new Promise((resolve, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port: server.address().port,
          path: '/account/delivery/read-v2-batch',
          method: 'POST',
          headers: {
            Host: new URL(x.authority.pin.origin).host,
            Origin: x.authority.pin.origin,
            'Content-Type': 'application/octet-stream',
            Authorization: 'Bearer ' + token,
          },
        },
        (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
          res.on('error', reject);
        },
      );
      req.on('error', reject);
      req.setTimeout(10000, () => req.destroy(Error('Test HTTP deadline')));
      req.end(bytes ?? encodeInboundBatch(requests));
    });
    const body = new Uint8Array(response.body);
    if (response.status === 200) {
      const pages = decodeInboundBatchPages(body);
      for (let i = 0; i < pages.length; i++)
        pageProof({ kind: 'decision', bytes: pages[i] }, requests[i], x, []);
      return { status: response.status, pages: pages.length };
    }
    return { status: response.status, refusal: JSON.parse(Buffer.from(body).toString()).refusal };
  };
  return { x, budget, grant, call, started: () => started };
}

test('one-page HTTP batches consume one work unit and retain the exact session ceiling', async (t) => {
  const h = await harness(t);
  for (let i = 0; i < L.sessionBurst; i++)
    assert.deepEqual(await h.call(), { status: 200, pages: 1 }, `request ${i}`);
  assert.deepEqual(await h.call(), { status: 429, refusal: 'capacity' });
  assert.equal(h.started(), L.sessionBurst);
});

test('full batches still debit every requested native read', async (t) => {
  const h = await harness(t);
  for (let i = 0; i < L.sessionBurst / 4; i++)
    assert.deepEqual(await h.call(4), { status: 200, pages: 4 });
  assert.deepEqual(await h.call(), { status: 429, refusal: 'capacity' });
  assert.equal(h.started(), L.sessionBurst);
});

test('a held sequential batch leaves a same-session slot for interactive work', async (t) => {
  let release;
  const held = new Promise((resolve) => (release = resolve)),
    h = await harness(t, { before: (n) => (n === 1 ? held : Promise.resolve()) });
  let first;
  try {
    first = h.call(4);
    const limit = Date.now() + 5000;
    while (!h.started() && Date.now() < limit) await delay(1);
    assert.equal(h.started(), 1, 'held native read starts');
    assert.deepEqual(await h.call(), { status: 200, pages: 1 });
    release();
    assert.equal((await first).status, 200);
  } finally {
    release();
    if (first) await Promise.allSettled([first]);
  }
});

test('a completed-work cut refunds only never-started tail reads', async (t) => {
  const h = await harness(t, { before: (n) => (n === 1 ? delay(270) : Promise.resolve()) });
  assert.deepEqual(await h.call(4), { status: 200, pages: 1 });
  for (let i = 0; i < L.sessionBurst - 1; i++) assert.equal((await h.call()).status, 200);
  assert.deepEqual(await h.call(), { status: 429, refusal: 'capacity' });
  assert.equal(h.started(), L.sessionBurst);
});

test('insufficient actual batch work refuses before native execution and avoids partial top-up loss', async (t) => {
  const h = await harness(t),
    key = h.x.f.core.grants.requestBudgetKey(h.grant.grantToken);
  for (let i = 0; i < L.sessionBurst - 3; i++) h.budget.acquire(key)();
  assert.deepEqual(await h.call(4), { status: 429, refusal: 'capacity' });
  assert.equal(h.started(), 0);
  assert.equal((await h.call()).status, 200);
  assert.equal((await h.call()).status, 200);
  assert.deepEqual(await h.call(), { status: 429, refusal: 'capacity' });
});

test('malformed framing spends admission only and invalid credentials execute no reads', async (t) => {
  const h = await harness(t);
  for (let i = 0; i < 3; i++) assert.equal((await h.call(1, new Uint8Array([1]))).status, 400);
  assert.equal((await h.call(1, undefined, 'a'.repeat(43))).status, 401);
  assert.equal(h.started(), 0);
  for (let i = 0; i < L.sessionBurst - 3; i++) assert.equal((await h.call()).status, 200);
  assert.deepEqual(await h.call(), { status: 429, refusal: 'capacity' });
});
