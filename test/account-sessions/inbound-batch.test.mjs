import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { fixture } from './grant-fixtures.mjs';
import { query, pageProof } from '../account-service-inbound/oracle.mjs';
import { createScopedAccountHandler } from '../../account-service/scoped-http.ts';
import { ScopedRequestBudget, REQUEST_LIMITS } from '../../account-service/requestBudget.ts';
import { readInboundBatch } from '../../account-service/inboundBatch.ts';
import {
  encodeInboundBatch,
  decodeInboundBatch,
  encodeInboundBatchPages,
  decodeInboundBatchPages,
  INBOUND_BATCH_COUNT,
  INBOUND_BATCH_REQUEST_LIMIT,
  INBOUND_BATCH_PAGE_LIMIT,
} from '../../account-protocol/inboundBatch.ts';
import { READ_PAGE_LIMIT } from '../../account-protocol/deliveryTransport.ts';

async function http(t, x, budget) {
  const handler = createScopedAccountHandler(
    x.f.core,
    x.authority.owner,
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
  return (body, token, headers = {}) =>
    new Promise((resolve, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port: server.address().port,
          method: 'POST',
          path: '/account/delivery/read-v2-batch',
          headers: {
            Host: new URL(x.authority.pin.origin).host,
            Origin: x.authority.pin.origin,
            'Content-Type': 'application/octet-stream',
            Authorization: 'Bearer ' + token,
            ...headers,
          },
        },
        (res) => {
          const chunks = [];
          res.on('data', (v) => chunks.push(v));
          res.on('end', () =>
            resolve({
              status: res.statusCode,
              type: res.headers['content-type'],
              bytes: Buffer.concat(chunks),
            }),
          );
        },
      );
      req.on('error', reject);
      req.end(body);
    });
}

test('batch framing is exact, bounded, purpose separated and detached', () => {
  const values = [new Uint8Array([1, 2]), new Uint8Array([3])],
    encoded = encodeInboundBatch(values);
  const independent = Buffer.concat([
    Buffer.from('done/private-read-batch/v1\0'),
    Buffer.from([0, 0, 0, 2, 0, 0, 0, 2, 1, 2, 0, 0, 0, 1, 3]),
  ]);
  assert.deepEqual(Buffer.from(encoded), independent);
  assert.deepEqual(decodeInboundBatch(new Uint8Array(independent)), values);
  assert.deepEqual(decodeInboundBatch(encoded), values);
  const decoded = decodeInboundBatch(encoded);
  decoded[0].fill(0);
  assert.deepEqual(decodeInboundBatch(encoded), values);
  assert.throws(() => decodeInboundBatchPages(encoded));
  assert.throws(() => decodeInboundBatch(encodeInboundBatchPages(values)));
  for (const bad of [
    new Uint8Array(),
    encoded.slice(0, -1),
    new Uint8Array([...encoded, 0]),
    new Uint8Array(INBOUND_BATCH_REQUEST_LIMIT + 1),
  ])
    assert.throws(() => decodeInboundBatch(bad));
  for (const values of [
    [],
    [new Uint8Array()],
    Array.from({ length: 5 }, () => new Uint8Array([1])),
    [new Uint8Array(4097)],
  ])
    assert.throws(() => encodeInboundBatch(values));
  assert.throws(() =>
    encodeInboundBatchPages([new Uint8Array(READ_PAGE_LIMIT), new Uint8Array([1])]),
  );
  assert.throws(() => decodeInboundBatchPages(new Uint8Array(INBOUND_BATCH_PAGE_LIMIT + 1)));
  assert.equal(INBOUND_BATCH_COUNT, 4);
});

test('batch framing rejects every truncation and forged length/count before reading', async () => {
  const bytes = encodeInboundBatch([new Uint8Array([4, 5, 6])]);
  for (let at = 0; at < bytes.length; at++)
    assert.throws(() => decodeInboundBatch(bytes.slice(0, at)));
  const tag = new TextEncoder().encode('done/private-read-batch/v1\0').length;
  for (const [offset, value] of [
    [tag, 0],
    [tag, 5],
    [tag + 4, 0],
    [tag + 4, 0xffffffff],
  ]) {
    const changed = bytes.slice();
    new DataView(changed.buffer).setUint32(offset, value);
    assert.throws(() => decodeInboundBatch(changed));
  }
  let calls = 0;
  await assert.rejects(
    readInboundBatch(new Uint8Array([1]), async () => {
      calls++;
    }),
  );
  assert.equal(calls, 0);
});

test('batch reads stay sequential, retain exact inner bytes and erase temporary pages', async () => {
  const input = [1, 2, 3, 4].map((n) => new Uint8Array([n])),
    seen = [],
    pages = [];
  let running = 0;
  const answer = await readInboundBatch(encodeInboundBatch(input), async (bytes) => {
    assert.equal(running++, 0);
    await Promise.resolve();
    seen.push([...bytes]);
    running--;
    const page = new Uint8Array([bytes[0] + 10]);
    pages.push(page);
    return { kind: 'decision', bytes: page };
  });
  assert.equal(answer.kind, 'decision');
  assert.deepEqual(
    seen,
    input.map((v) => [...v]),
  );
  assert.deepEqual(
    decodeInboundBatchPages(answer.bytes).map((v) => [...v]),
    [[11], [12], [13], [14]],
  );
  assert(pages.every((v) => v.every((b) => b === 0)));
  assert.deepEqual([...input[0]], [1]);
});

test('a refused subread exposes no partial pages and a size-limited group returns only its exact prefix', async () => {
  let calls = 0;
  const first = new Uint8Array([5]);
  const refused = { kind: 'unknown', reason: 'state-changed' };
  const answer = await readInboundBatch(encodeInboundBatch([first, first, first]), async () =>
    ++calls === 1 ? { kind: 'decision', bytes: first.slice() } : refused,
  );
  assert.equal(answer, refused);
  assert.equal(calls, 2);
  calls = 0;
  const result = await readInboundBatch(encodeInboundBatch([first, first, first]), async () => {
    calls++;
    return { kind: 'decision', bytes: new Uint8Array(READ_PAGE_LIMIT / 2 + 1).fill(calls) };
  });
  const pages = decodeInboundBatchPages(result.bytes);
  assert.equal(pages.length, 1);
  assert.equal(pages[0][0], 1);
  assert.equal(calls, 2);
});

test('a slow completed read returns its exact prefix without starting more work', async () => {
  let elapsed = 0,
    calls = 0;
  const result = await readInboundBatch(
    encodeInboundBatch(Array.from({ length: 4 }, () => new Uint8Array([1]))),
    async () => {
      calls++;
      elapsed = 251;
      return { kind: 'decision', bytes: new Uint8Array([7]) };
    },
    () => elapsed,
  );
  assert.equal(calls, 1);
  assert.deepEqual(decodeInboundBatchPages(result.bytes), [new Uint8Array([7])]);
});

test('real scoped batch HTTP verifies each inner read and rejects absent/revoked grants and framing', async (t) => {
  const x = await fixture(t),
    call = await http(t, x),
    g = await x.grant(),
    requests = Array.from({ length: 4 }, () => query(x)),
    body = encodeInboundBatch(requests);
  const result = await call(body, g.grantToken);
  assert.equal(result.status, 200);
  assert.equal(result.type, 'application/octet-stream');
  const pages = decodeInboundBatchPages(new Uint8Array(result.bytes));
  assert.equal(pages.length, 4);
  for (let i = 0; i < pages.length; i++)
    pageProof({ kind: 'decision', bytes: pages[i] }, requests[i], x, []);
  assert.equal((await call(body, x.first.access.accessToken)).status, 401);
  assert.equal((await call(body, g.grantToken, { Origin: 'https://other.invalid' })).status, 403);
  assert.equal(
    (await call(new Uint8Array(INBOUND_BATCH_REQUEST_LIMIT + 1), g.grantToken)).status,
    413,
  );
  assert.equal((await call(new Uint8Array([1]), g.grantToken)).status, 400);
  const bad = encodeInboundBatch([query(x), query(x, 10)]),
    denied = await call(bad, g.grantToken);
  assert.equal(denied.status, 409);
  assert.equal(JSON.parse(denied.bytes).kind, 'unknown');
  x.first.revoke();
  assert.equal((await call(body, g.grantToken)).status, 401);
});

test('revoking the parent between real subreads prevents any partial batch response', async (t) => {
  let reads = 0,
    x;
  x = await fixture(t, {
    hook: (point, operation) => {
      if (point === 'after-verify' && operation === 'read-inbound' && ++reads === 2)
        x.first.revoke();
    },
  });
  const call = await http(t, x),
    grant = await x.grant();
  const result = await call(encodeInboundBatch([query(x), query(x), query(x)]), grant.grantToken);
  assert.equal(reads, 2);
  assert.equal(result.status, 401);
  assert.equal(JSON.parse(result.bytes).refusal, 'sign-in-required');
});

test('a second subread cannot borrow the first subread account or reader authorization', async (t) => {
  const x = await fixture(t),
    call = await http(t, x),
    grant = await x.grant();
  for (const changes of [{ workspace: 'ff'.repeat(16) }, { reader: 'ff'.repeat(16) }]) {
    const body = encodeInboundBatch([query(x), query(x, 0, 1, changes)]);
    const result = await call(body, grant.grantToken);
    assert(result.status >= 400);
    assert.equal(result.type, 'application/json');
  }
});

test('batch HTTP debits existing work limits and releases every reserved inflight unit', async (t) => {
  const x = await fixture(t),
    call = await http(t, x, new ScopedRequestBudget(() => 0)),
    g = await x.grant(),
    body = encodeInboundBatch([query(x)]);
  for (let i = 0; i < REQUEST_LIMITS.sessionBurst; i++)
    assert.equal((await call(body, g.grantToken)).status, 200);
  const denied = await call(body, g.grantToken);
  assert.equal(denied.status, 429);
  assert.equal(JSON.parse(denied.bytes).refusal, 'capacity');
  const other = await x.login(),
    otherGrant = await x.grant(x.scope, x.s.privateKey, other.access);
  assert.equal((await call(body, otherGrant.grantToken)).status, 200);
});
