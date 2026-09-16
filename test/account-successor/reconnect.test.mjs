import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nativeOwner,
  selected,
  syncing,
  settled,
  online,
  edit,
  view,
  close,
  cold,
  marker,
  waitPredicate,
  adopt,
} from './owner-fixtures.mjs';
import { decodeNetworkEnvelope } from '../../account-protocol/envelope.ts';
import { decodeSubmission } from '../../account-protocol/submission.ts';
const path = (f) => f.server.origin + '/account/authority/discover';

test(
  'HTTP admission while the writer is offline is automatically discovered and installed on reconnect, then survives cold reopen',
  { timeout: 60000 },
  async (t) => {
    const f = await nativeOwner(t, undefined, true),
      item = await selected(f, 'reconnect-successor');
    let active = 0,
      maximum = 0;
    const requests = [],
      sent = [];
    await f.context.route(f.server.origin + '/account/**', async (route) => {
      active++;
      maximum = Math.max(maximum, active);
      try {
        if (route.request().url() === path(f))
          requests.push(JSON.parse(route.request().postData()));
        if (route.request().url().endsWith('/delivery/submit'))
          sent.push(route.request().postData());
        await route.fulfill({ response: await route.fetch() });
      } finally {
        active--;
      }
    });
    await syncing(f.page, item);
    await settled(f.page);
    await online(f.page, false);
    await edit(f.page, (await view(f.page)).length, 0, ' offline before discovery');
    const text = await view(f.page);
    const artifact = await f.successor(item);
    await online(f.page, true);
    await settled(f.page);
    await close(f.page);
    const saved = await marker(f.page, item);
    assert.equal(saved.successor.artifact.head, artifact.head);
    assert.equal(maximum, 1);
    assert(requests.length >= 2);
    assert(requests.every((q) => q.epoch === 1));
    assert.equal(new Set(requests.map((q) => q.nonce)).size, requests.length);
    await cold(f);
    const before = requests.length;
    await syncing(f.page, item);
    await settled(f.page);
    assert.equal(await view(f.page), text);
    await edit(f.page, text.length, 0, ' current after reopen');
    await settled(f.page);
    assert.equal(
      requests.length,
      before,
      'installed one-successor owner needs no further discovery',
    );
    const envelope = decodeNetworkEnvelope(
      decodeSubmission(new Uint8Array(Buffer.from(JSON.parse(sent.at(-1))[3], 'hex'))).envelope,
    );
    assert.equal(envelope.epoch, 2);
  },
);

for (const changed of ['signature', 'requestHash', 'oversize'])
  test(
    `invalid discovery ${changed} cannot install a head or stop local editing; an exact valid retry recovers`,
    { timeout: 60000 },
    async (t) => {
      const f = await nativeOwner(t, undefined, true),
        item = await selected(f, 'discovery-bad-' + changed);
      await syncing(f.page, item);
      await settled(f.page);
      await online(f.page, false);
      await f.successor(item);
      await f.context.route(path(f), async (route) => {
        const response = await route.fetch(),
          value = await response.json();
        if (changed === 'signature') value.signature = '00'.repeat(64);
        if (changed === 'requestHash') value.requestHash = '00'.repeat(32);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: changed === 'oversize' ? 'x'.repeat(32769) : JSON.stringify(value),
        });
      });
      await online(f.page, true);
      const result = await f.page.evaluate(() => opened.refreshAuthority());
      assert.equal(result.kind, 'unknown');
      await online(f.page, false);
      const text = await edit(f.page, (await view(f.page)).length, 0, ' discovery refused safely');
      await close(f.page);
      assert.equal((await marker(f.page, item)).successor, undefined);
      await f.context.unroute(path(f));
      await cold(f);
      await syncing(f.page, item);
      await settled(f.page);
      assert.equal(await view(f.page), text);
      await close(f.page);
      assert((await marker(f.page, item)).successor);
    },
  );

test(
  'closing during discovery cancels its held response and a new lifetime discovers normally',
  { timeout: 60000 },
  async (t) => {
    const f = await nativeOwner(t, undefined, true),
      item = await selected(f, 'discovery-close');
    await syncing(f.page, item);
    await settled(f.page);
    await online(f.page, false);
    await f.successor(item);
    let release, hit;
    const held = new Promise((r) => (release = r)),
      reached = new Promise((r) => (hit = r));
    await f.context.route(path(f), async (route) => {
      const response = await route.fetch();
      hit();
      await held;
      await route.fulfill({ response }).catch(() => {});
    });
    await online(f.page, true);
    await reached;
    await close(f.page);
    release();
    assert.equal((await marker(f.page, item)).successor, undefined);
    await f.context.unroute(path(f));
    await cold(f);
    await syncing(f.page, item);
    await settled(f.page);
    await close(f.page);
    assert((await marker(f.page, item)).successor);
  },
);

for (const omitted of [false, true])
  test(
    `${omitted ? 'omitted' : 'required'} discovery expiry guard at the native marker comparison ${omitted ? 'installs expired locator authority' : 'refuses without erasing the pending source'}`,
    { timeout: 60000 },
    async (t) => {
      const f = await nativeOwner(t, omitted ? 'discovery-expiry' : undefined, true),
        item = await selected(f, 'discovery-commit-expiry-' + omitted);
      await syncing(f.page, item);
      await settled(f.page);
      await online(f.page, false);
      await f.successor(item);
      await f.page.evaluate(() => {
        const get = IDBObjectStore.prototype.get;
        let reads = 0;
        IDBObjectStore.prototype.get = function (key) {
          const req = get.call(this, key);
          // Each discovery install has exactly one write transaction in the custody database. Advance
          // the wall clock before its final comparison request succeeds, leaving all signatures valid.
          if (
            this.transaction.db.name === 'done.custody' &&
            this.transaction.mode === 'readwrite'
          ) {
            req.addEventListener('success', () => {
              if (reads++) return;
              window.discoveryClockChanged = true;
              const now = Date.now();
              Date.now = () => now + 60000;
            });
          }
          return req;
        };
      });
      await online(f.page, true);
      await waitPredicate(f.page, () => window.discoveryClockChanged === true);
      await online(f.page, false);
      const text = await edit(f.page, (await view(f.page)).length, 0, ' expiry retained');
      await close(f.page);
      assert.equal(!!(await marker(f.page, item)).successor, omitted);
      await cold(f);
      await syncing(f.page, item);
      await settled(f.page);
      assert.equal(await view(f.page), text);
      await close(f.page);
      assert((await marker(f.page, item)).successor);
    },
  );

test(
  'a late signed empty discovery cannot roll back an already installed successor',
  { timeout: 60000 },
  async (t) => {
    const f = await nativeOwner(t, undefined, true),
      item = await selected(f, 'discovery-late-null');
    await syncing(f.page, item);
    await settled(f.page);
    let release, hit;
    const held = new Promise((r) => (release = r)),
      reached = new Promise((r) => (hit = r));
    await f.context.route(path(f), async (route) => {
      const response = await route.fetch();
      assert.equal((await response.json()).successor, null);
      hit();
      await held;
      await route.fulfill({ response });
    });
    await f.page.evaluate(() => {
      window.discoveryResult = opened.refreshAuthority();
    });
    await reached;
    const artifact = await f.successor(item);
    await adopt(f.page, artifact);
    release();
    assert.equal((await f.page.evaluate(() => window.discoveryResult)).kind, 'unchanged');
    await settled(f.page);
    await close(f.page);
    assert.equal((await marker(f.page, item)).successor.artifact.head, artifact.head);
  },
);
