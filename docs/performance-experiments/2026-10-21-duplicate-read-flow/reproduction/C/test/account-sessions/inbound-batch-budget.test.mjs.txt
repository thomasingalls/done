import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { fixture } from './grant-fixtures.mjs';
import { query, pageProof } from '../account-service-inbound/oracle.mjs';
import { createScopedAccountHandler } from '../../account-service/scoped-http.ts';
import { ScopedRequestBudget, REQUEST_LIMITS as L } from '../../account-service/requestBudget.ts';
import { createBatchReadAdmission } from '../../account-service/batchReadAdmission.ts';
import {
  encodeInboundBatch,
  decodeInboundBatch,
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
  return { x, budget, grant, call, port: server.address().port, started: () => started };
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

async function exactBatch(h, bytes) {
  const result = await new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: h.port,
        path: '/account/delivery/read-v2-batch',
        method: 'POST',
        headers: {
          Host: new URL(h.x.authority.pin.origin).host,
          Origin: h.x.authority.pin.origin,
          'Content-Type': 'application/octet-stream',
          Authorization: 'Bearer ' + h.grant.grantToken,
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
    req.end(bytes);
  });
  if (result.status !== 200)
    return { status: result.status, refusal: JSON.parse(result.body.toString()).refusal };
  const requests = decodeInboundBatch(bytes),
    pages = decodeInboundBatchPages(new Uint8Array(result.body));
  try {
    for (let i = 0; i < pages.length; i++)
      pageProof({ kind: 'decision', bytes: pages[i] }, requests[i], h.x, []);
    return { status: result.status, pages: pages.length };
  } finally {
    for (const request of requests) request.fill(0);
    for (const page of pages) page.fill(0);
  }
}

test('concurrent identical HTTP batches spend admission only, preserve distinct work and retry after release', async (t) => {
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const h = await harness(t, { before: (n) => (n === 1 ? held : Promise.resolve()) });
  const bytes = encodeInboundBatch(Array.from({ length: 4 }, () => query(h.x)));
  let first;
  try {
    first = exactBatch(h, bytes);
    const until = Date.now() + 5000;
    while (!h.started() && Date.now() < until) await delay(1);
    assert.equal(h.started(), 1);
    for (let i = 0; i < 3; i++)
      assert.deepEqual(await exactBatch(h, bytes.slice()), { status: 429, refusal: 'capacity' });
    assert.equal(h.started(), 1, 'duplicates start no native read');
    assert.deepEqual(await h.call(), { status: 200, pages: 1 });
    release();
    assert.deepEqual(await first, { status: 200, pages: 4 });
    assert.deepEqual(await exactBatch(h, bytes), { status: 200, pages: 4 });
    // Original4 + three refused admissions + one distinct read + retried4 =12 units.
    for (let i = 0; i < L.sessionBurst - 12; i++) assert.equal((await h.call()).status, 200);
    assert.deepEqual(await h.call(), { status: 429, refusal: 'capacity' });
    assert.equal(h.started(), L.sessionBurst - 3);
  } finally {
    release();
    if (first) await Promise.allSettled([first]);
    bytes.fill(0);
  }
});

test('a native batch failure retires only its live exclusion and leaves exact retry fully checked', async (t) => {
  const h = await harness(t, {
    before: (n) =>
      n === 1 ? Promise.reject(Error('Deliberate native failure')) : Promise.resolve(),
  });
  const bytes = encodeInboundBatch(Array.from({ length: 4 }, () => query(h.x)));
  try {
    assert.equal((await exactBatch(h, bytes)).status, 400);
    assert.deepEqual(await exactBatch(h, bytes), { status: 200, pages: 4 });
    assert.equal(h.started(), 5);
    for (let i = 0; i < L.sessionBurst - 5; i++) assert.equal((await h.call()).status, 200);
    assert.deepEqual(await h.call(), { status: 429, refusal: 'capacity' });
  } finally {
    bytes.fill(0);
  }
});

test('batch exclusion distinguishes exact bodies and server-held scopes', () => {
  const admission = createBatchReadAdmission(),
    body = Buffer.from([1, 2, 3]);
  const first = admission.acquire('session-a', body);
  assert.ok(first);
  assert.equal(admission.acquire('session-a', Buffer.from(body)), undefined);
  const otherScope = admission.acquire('session-b', Buffer.from(body));
  const changedBody = admission.acquire('session-a', Buffer.from([1, 2, 4]));
  const shorterBody = admission.acquire('session-a', Buffer.from([1, 2]));
  assert.ok(otherScope);
  assert.ok(changedBody);
  assert.ok(shorterBody);
  first();
  assert.equal(admission.acquire('session-a', Buffer.from([1, 2, 4])), undefined);
  assert.equal(admission.acquire('session-a', Buffer.from([1, 2])), undefined);
  otherScope();
  changedBody();
  shorterBody();
});

test('a stale batch release cannot remove a later byte-identical owner', () => {
  const admission = createBatchReadAdmission(),
    body = Buffer.from([4, 5, 6]);
  const first = admission.acquire('session', body);
  assert.ok(first);
  first();
  const later = admission.acquire('session', Buffer.from(body));
  assert.ok(later);
  first();
  assert.equal(admission.acquire('session', Buffer.from(body)), undefined);
  later();
  const final = admission.acquire('session', body);
  assert.ok(final);
  final();
});

test('the batch scheduling collection stays bounded by the original active-request ceiling', () => {
  const admission = createBatchReadAdmission();
  const leases = Array.from({ length: L.active }, (_, i) =>
    admission.acquire('session-' + i, Buffer.from([i])),
  );
  assert.ok(leases.every(Boolean));
  assert.equal(admission.acquire('extra-session', Buffer.from([0])), undefined);
  leases[0]();
  leases[0]();
  const extra = admission.acquire('extra-session', Buffer.from([0]));
  assert.ok(extra);
  assert.equal(admission.acquire('another-session', Buffer.from([0])), undefined);
  for (const release of leases) release();
  extra();
});
