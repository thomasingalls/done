// Phase 552: the composed send and receive lanes in the browser, against the in-process service.
// A request the service refuses is named beside the unchanged `network-unavailable` reason, a lost
// request still says no answer, and the lane goes on exactly as before once the service accepts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  native,
  selected,
  syncing,
  settled,
  syncStatus,
  close,
  path,
  waitPredicate,
} from './fixtures.mjs';

const sendPath = (f) => f.server.origin + '/account/delivery/submit';
/** Flip one hex digit near the end of the submitted wire, inside its signature. */
const altered = (postData) => {
  const body = JSON.parse(postData);
  const wire = body[3];
  const at = wire.length - 10;
  body[3] = wire.slice(0, at) + (wire[at] === '0' ? '1' : '0') + wire.slice(at + 1);
  return JSON.stringify(body);
};

test(
  'the composed sender names a refused submission and a lost one, then recovers (phase 552)',
  { timeout: 120000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'sync-refusal-send');
    let mode = 'altered';
    const answers = [];
    await f.context.route(sendPath(f), async (route) => {
      if (mode === 'lost') return route.abort();
      const postData = route.request().postData();
      const response = await route.fetch(mode === 'altered' ? { postData: altered(postData) } : {});
      if (mode === 'altered') answers.push([response.status(), await response.text()]);
      return route.fulfill({ response });
    });
    await syncing(f.page, item);
    // The real service refuses the altered submission.
    await waitPredicate(f.page, () => opened.sync.status.send.refusal === 'invalid-request', 60000);
    // The service's own hint, not a substituted body.
    assert.deepEqual(answers[0], [409, '{"v":1,"kind":"unknown","reason":"invalid-request"}']);
    let send = (await syncStatus(f.page)).send;
    assert.equal(send.reason, 'network-unavailable');
    assert.equal(send.phase, 'retrying');
    assert(send.failures >= 1);
    assert.equal(send.acceptedThrough, 0);
    mode = 'lost';
    await f.page.evaluate(() => opened.sync.retry('send'));
    await waitPredicate(f.page, () => opened.sync.status.send.refusal === 'unreachable', 60000);
    send = (await syncStatus(f.page)).send;
    assert.equal(send.reason, 'network-unavailable');
    mode = 'pass';
    await f.page.evaluate(() => opened.sync.retry('send'));
    await settled(f.page);
    send = (await syncStatus(f.page)).send;
    assert.equal(send.reason, null);
    assert.equal('refusal' in send, false);
    await close(f.page);
  },
);

test(
  'the composed receiver names a refused read and recovers (phase 552)',
  { timeout: 120000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'sync-refusal-receive');
    let refuse = true;
    await f.context.route(path(f), async (route) => {
      if (!refuse) return route.fulfill({ response: await route.fetch() });
      // An answer the service would give while it cannot save: the hint vocabulary, unsigned.
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ v: 1, kind: 'unknown', reason: 'storage-unavailable' }),
      });
    });
    await syncing(f.page, item);
    await waitPredicate(
      f.page,
      () => opened.sync.status.receive.refusal === 'storage-unavailable',
      60000,
    );
    const receive = (await syncStatus(f.page)).receive;
    assert.equal(receive.reason, 'network-unavailable');
    assert.equal(receive.phase, 'retrying');
    refuse = false;
    await f.page.evaluate(() => opened.sync.retry('receive'));
    await settled(f.page);
    assert.equal('refusal' in (await syncStatus(f.page)).receive, false);
    await close(f.page);
  },
);
