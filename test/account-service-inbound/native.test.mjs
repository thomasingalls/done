import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  native,
  selected,
  openReceive,
  closeReceive,
  request,
  receive,
  status,
  open,
  close,
  edit,
  prepare,
  submission,
  cold,
} from '../account-receive/fixtures.mjs';
import { decodeInboundPage } from '../../account-protocol/inboundTransport.ts';
import { envelope } from '../account-transport/oracle.mjs';

test(
  'owned browser request consumes original service v2 pages over HTTP and cold-replays them',
  { timeout: 60000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'service-inbound-http');
    await open(f.page, item);
    await edit(f.page, 0, 0, 'v2 HTTP retained writing ');
    const originals = [];
    for (let position = 1; position <= 2; position++) {
      await prepare(f.page);
      const w = await submission(f.page, position);
      originals.push(w);
      const r = await f.page.evaluate((token) => opened.submitPending(token), f.testOperatorToken);
      assert.equal(r.kind, 'accepted');
    }
    await close(f.page);
    const send = async (q, path = '/account/delivery/read-v2', headers = {}) => {
      const r = await fetch(f.server.origin + path, {
        method: 'POST',
        headers: {
          Origin: f.server.origin,
          'Content-Type': 'application/octet-stream',
          Authorization: 'Bearer ' + f.testOperatorToken,
          ...headers,
        },
        body: new Uint8Array(q),
      });
      return {
        status: r.status,
        cache: r.headers.get('cache-control'),
        type: r.headers.get('content-type'),
        bytes: new Uint8Array(await r.arrayBuffer()),
      };
    };
    const report = { refused: [], pages: [] };
    const response = (r) => ({ ...r, bytes: Buffer.from(r.bytes).toString('hex') });
    const refusal = (tag, result, expected) => {
      report.refused.push({ tag, ...response(result) });
      assert.equal(result.status, expected);
    };
    await openReceive(f.page, item);
    let q = await request(f.page);
    refusal('v1', await send(q, '/account/delivery/read'), 409);
    for (const headers of [
      { Origin: 'https://foreign.test' },
      { 'Content-Type': 'application/json' },
      { Authorization: 'Bearer ' + 'B'.repeat(43) },
    ])
      refusal(Object.keys(headers)[0], await send(q, undefined, headers), 403);
    refusal('size', await send(new Uint8Array(4097)), 413);
    const forged = JSON.parse(Buffer.from(q).toString());
    forged[14] = '00'.repeat(64);
    refusal('signature', await send(Buffer.from(JSON.stringify(forged))), 409);
    let saved;
    for (let position = 1; position <= 2; position++) {
      q = await request(f.page);
      const r = await send(q);
      assert.equal(r.status, 200);
      assert.equal(r.cache, 'no-store');
      assert.equal(r.type, 'application/octet-stream');
      const p = decodeInboundPage(r.bytes);
      assert.deepEqual(Buffer.from(p.entries[0].envelope), envelope(originals[position - 1]));
      assert.equal(p.through, 2);
      assert.equal(p.next, position);
      assert.equal(p.entries.length, 1);
      // Lost HTTP response adds no service state; exact replay returns the same signed bytes.
      const retry = await send(q),
        outcome = await receive(f.page, r.bytes);
      report.pages.push({
        position,
        request: Buffer.from(q).toString('hex'),
        response: response(r),
        retry: response(retry),
        outcome,
      });
      assert.deepEqual(retry.bytes, r.bytes);
      assert.equal(outcome.kind, 'received');
      saved = r.bytes;
    }
    report.duplicate = await receive(f.page, saved);
    assert.equal(report.duplicate.kind, 'duplicate');
    report.beforeCold = await status(f.page);
    assert.equal(report.beforeCold.receivedThrough, 2);
    await closeReceive(f.page);
    await cold(f);
    await openReceive(f.page, item);
    report.afterCold = await status(f.page);
    assert.equal(report.afterCold.receivedThrough, 2);
    q = await request(f.page);
    const end = await send(q);
    report.end = {
      request: Buffer.from(q).toString('hex'),
      response: response(end),
      outcome: await receive(f.page, end.bytes),
    };
    assert.equal(report.end.outcome.kind, 'empty');
    report.originals = originals.map((w) => Buffer.from(envelope(w)).toString('hex'));
    if (process.env.ACCOUNT_REPORT_DIR)
      writeFileSync(
        join(process.env.ACCOUNT_REPORT_DIR, 'native-http.json'),
        JSON.stringify(report, null, 2) + '\n',
      );
    await closeReceive(f.page);
  },
);
