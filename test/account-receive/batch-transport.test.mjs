import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {
  decodeInboundBatch,
  encodeInboundBatchPages,
} from '../../account-protocol/inboundBatch.ts';
import {
  ready,
  envelope,
  open,
  close,
  cold,
  view,
  status,
  answer,
  path,
  next,
  start,
  local,
  census,
} from '../account-receive-transport/fixtures.mjs';

async function fixture(t, id, mode = 'normal', total = 5) {
  const x = await ready(t, id),
    { f, item, snapshot } = x;
  const doc = new Y.Doc({ gc: false }),
    updates = [];
  Y.applyUpdate(doc, new Uint8Array(snapshot));
  doc.clientID = 60871;
  doc.on('update', (b) => updates.push([...b]));
  for (let i = 0; i < total; i++)
    doc.getText('master').insert(doc.getText('master').length, ` BATCH${i};`);
  doc.destroy();
  const wires = [];
  for (let i = 0; i < total; i++) wires.push(await envelope(f.page, item, i + 1, [updates[i]]));
  await open(f.page, item);
  const links = ['00'.repeat(32)],
    batches = [],
    originals = [],
    singles = [];
  let release, entered;
  const hit = new Promise((r) => {
    entered = r;
  });
  const reply = (query) => {
    const template = JSON.parse(Buffer.from(query));
    if (links.length === 1)
      for (let i = 0; i < wires.length; i++) {
        template[10] = i;
        links.push(
          answer(f, item, Buffer.from(JSON.stringify(template)), wires[i], links[i], total).link,
        );
      }
    const after = JSON.parse(Buffer.from(query))[10];
    const page = answer(f, item, query, wires[after] ?? null, links[after], total).bytes;
    if (wires[after])
      originals.push({
        position: after + 1,
        request: Buffer.from(query).toString('hex'),
        page: page.toString('hex'),
      });
    return page;
  };
  await f.context.route(path(f), async (route) => {
    const bytes = route.request().postDataBuffer();
    singles.push(JSON.parse(bytes)[10]);
    await route
      .fulfill({ status: 200, contentType: 'application/octet-stream', body: reply(bytes) })
      .catch(() => {});
  });
  await f.context.route(path(f) + '-batch', async (route) => {
    const requests = decodeInboundBatch(new Uint8Array(route.request().postDataBuffer()));
    batches.push(requests.map((r) => JSON.parse(Buffer.from(r))[10]));
    if (mode === 'header-limit') {
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(4 * 1024 * 1024 + 1),
        },
        body: '',
      });
      return;
    }
    if (mode === 'unsupported') {
      await route.fulfill({ status: 404, body: '' });
      return;
    }
    if (mode === 'refused-oversized') {
      await route.fulfill({ status: 409, contentType: 'application/json', body: 'x'.repeat(513) });
      return;
    }
    if (mode === 'refused') {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ v: 1, kind: 'unknown', reason: 'state-changed' }),
      });
      return;
    }
    let pages = requests.map(reply);
    if (mode === 'short') pages = pages.slice(0, 1);
    if (mode === 'reverse') pages.reverse();
    if (mode === 'signature') {
      const p = JSON.parse(pages[1]);
      p[6] = '00'.repeat(64);
      pages[1] = Buffer.from(JSON.stringify(p));
    }
    if (mode === 'expiry')
      await f.page.evaluate(() => {
        window.savedNow = Date.now;
        Date.now = () => savedNow() + 31000;
      });
    if (mode === 'held') {
      entered();
      await new Promise((r) => {
        release = r;
      });
    }
    await route
      .fulfill({
        status: 200,
        contentType: 'application/octet-stream',
        body: Buffer.from(
          mode === 'framing'
            ? encodeInboundBatchPages(pages).slice(0, -1)
            : encodeInboundBatchPages(pages),
        ),
      })
      .catch(() => {});
    requests.forEach((r) => r.fill(0));
  });
  if (mode === 'stream-limit')
    await f.page.evaluate(() => {
      const original = globalThis.fetch;
      window.overflowProbes = 0;
      globalThis.fetch = async (...args) => {
        if (String(args[0]).endsWith('/account/delivery/read-v2-batch')) {
          window.overflowProbes++;
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array(4 * 1024 * 1024 + 1));
              },
              cancel() {
                window.overflowCancelled = true;
                return new Promise((resolve) => {
                  window.releaseOverflow = resolve;
                });
              },
            }),
            { headers: { 'Content-Type': 'application/octet-stream' } },
          );
        }
        return original(...args);
      };
    });
  assert.equal((await next(f)).status.receivedThrough, 1);
  return {
    ...x,
    total,
    batches,
    singles,
    originals,
    hit,
    release: () => release(),
    mode: (v) => {
      mode = v;
    },
  };
}
async function converge(x) {
  while ((await status(x.f.page)).receivedThrough < x.total)
    assert.equal((await next(x.f)).kind, 'received');
  const writing = await view(x.f.page);
  assert.match(writing, /BATCH0; BATCH1; BATCH2; BATCH3; BATCH4;/);
  await close(x.f.page);
  await cold(x.f);
  await open(x.f.page, x.item);
  assert.equal((await status(x.f.page)).receivedThrough, x.total);
  assert.equal(await view(x.f.page), writing);
  await close(x.f.page);
}

test(
  'batch HTTP preserves original receipts and cold replay without changing the stored format',
  { timeout: 60000 },
  async (t) => {
    const x = await fixture(t, 'batch-http-originals');
    const r = await next(x.f);
    assert.equal(x.batches.length, 1);
    assert.deepEqual(x.batches[0], [1, 2, 3]);
    assert.equal(r.status.receivedThrough, 4);
    await converge(x);
    const rows = await census(x.f.page, x.item);
    const events = rows
      .filter(
        (r) =>
          r.kind === 'heads' &&
          Buffer.from(r.bytes).toString().startsWith('["done/account-inbound/v1"'),
      )
      .map((r) => JSON.parse(Buffer.from(r.bytes)));
    assert.equal(events.length, 5);
    for (const e of events)
      assert(
        x.originals.some((p) => p.position === e[8] && p.request === e[11] && p.page === e[12]),
      );
  },
);
test(
  'a short batch advances only its returned prefix and refetches every missing prediction',
  { timeout: 60000 },
  async (t) => {
    const x = await fixture(t, 'batch-http-short', 'short');
    assert.equal((await next(x.f)).status.receivedThrough, 2);
    assert.deepEqual(x.batches[0], [1, 2, 3]);
    x.mode('normal');
    await converge(x);
    assert.equal(x.batches[1][0], 2);
  },
);
test(
  'an absent optional route uses individual reads for the rest of this owner',
  { timeout: 60000 },
  async (t) => {
    const x = await fixture(t, 'batch-http-old-server', 'unsupported');
    await converge(x);
    assert.equal(x.batches.length, 1);
    assert.deepEqual([...new Set(x.singles)].sort(), [0, 1, 2, 3, 4]);
  },
);
for (const mode of ['reverse', 'signature', 'framing'])
  test(
    `a ${mode} batch refuses every original before durable progress or display`,
    { timeout: 60000 },
    async (t) => {
      const x = await fixture(t, 'batch-http-' + mode, mode),
        before = await view(x.f.page);
      await start(x.f);
      const outcome = await x.f.page.evaluate(() => work);
      assert.ok(outcome.error || outcome.kind === 'rejected');
      assert.equal(x.batches.length, 1);
      assert.equal((await status(x.f.page)).receivedThrough, 1);
      assert.equal(await view(x.f.page), before);
      await close(x.f.page);
      await cold(x.f);
      await open(x.f.page, x.item);
      assert.equal((await status(x.f.page)).receivedThrough, 1);
      assert.equal(await view(x.f.page), before);
      await close(x.f.page);
    },
  );
test(
  'a state-change hint grants no progress and does not disable the next batch',
  { timeout: 60000 },
  async (t) => {
    const x = await fixture(t, 'batch-http-refused', 'refused'),
      before = await view(x.f.page);
    assert.equal((await next(x.f)).kind, 'unknown');
    assert.equal((await status(x.f.page)).receivedThrough, 1);
    assert.equal(await view(x.f.page), before);
    x.mode('normal');
    await converge(x);
    assert.equal(x.batches.length, 2);
    assert.deepEqual(x.batches[1], x.batches[0]);
  },
);
test(
  'request expiry after the batch reply preserves the prefix and permits a fresh signed retry',
  { timeout: 60000 },
  async (t) => {
    const x = await fixture(t, 'batch-http-expiry', 'expiry'),
      before = await view(x.f.page);
    assert.equal((await next(x.f)).kind, 'expired');
    assert.equal((await status(x.f.page)).receivedThrough, 1);
    assert.equal(await view(x.f.page), before);
    await x.f.page.evaluate(() => {
      Date.now = savedNow;
    });
    x.mode('normal');
    await converge(x);
  },
);
test(
  'a superseded outstanding request refuses the whole held batch without publishing it',
  { timeout: 60000 },
  async (t) => {
    const x = await fixture(t, 'batch-http-superseded', 'held'),
      before = await view(x.f.page);
    await start(x.f);
    await x.hit;
    await x.f.page.evaluate(() => opened.prepareRead());
    x.release();
    assert.deepEqual(await x.f.page.evaluate(() => work), { kind: 'unknown', recorded: false });
    assert.equal((await status(x.f.page)).receivedThrough, 1);
    assert.equal(await view(x.f.page), before);
    x.mode('normal');
    await converge(x);
  },
);
test(
  'local input remains available while a held batch drains on lock, without uncommitted remote display',
  { timeout: 60000 },
  async (t) => {
    const x = await fixture(t, 'batch-http-close', 'held');
    await start(x.f);
    await x.hit;
    await local(x.f.page, ' LOCAL-WHILE-BATCH ');
    assert.equal(await x.f.page.evaluate(() => local), true);
    assert.equal((await status(x.f.page)).receivedThrough, 1);
    await x.f.page.evaluate(() => {
      window.closing = editor.close();
    });
    x.release();
    await x.f.page.evaluate(() => closing);
    const outcome = await x.f.page.evaluate(() => work);
    assert.ok(outcome.error || outcome.kind === 'unknown');
    await cold(x.f);
    await open(x.f.page, x.item);
    assert.equal((await status(x.f.page)).receivedThrough, 1);
    assert.doesNotMatch(await view(x.f.page), /BATCH1/);
    assert.match(await view(x.f.page), /LOCAL-WHILE-BATCH/);
    await close(x.f.page);
  },
);

// Aggregation retains the original four-page scheduling ceiling.
test(
  'a complete four-page allowance stays coalesced without skipping any receipt',
  { timeout: 60000 },
  async (t) => {
    const x = await fixture(t, 'batch-http-turn', 'normal', 12);
    await converge(x);
    assert.deepEqual(x.singles, [0]);
    assert.deepEqual(x.batches, [
      [1, 2, 3],
      [4, 5, 6, 7],
      [8, 9, 10, 11],
    ]);
  },
);

test(
  'an aggregate header limit falls back without reducing individual page support',
  { timeout: 60000 },
  async (t) => {
    const x = await fixture(t, 'batch-http-header-limit', 'header-limit');
    await converge(x);
    assert.equal(x.batches.length, 1);
    assert.deepEqual([...new Set(x.singles)].sort(), [0, 1, 2, 3, 4]);
  },
);
test(
  'stream overflow drains before fallback and keeps original verification and cold replay',
  { timeout: 60000 },
  async (t) => {
    const x = await fixture(t, 'batch-http-stream-limit', 'stream-limit');
    await start(x.f);
    await x.f.page.waitForFunction(() => window.overflowCancelled === true);
    assert.deepEqual(x.singles, [0]);
    await x.f.page.evaluate(() => releaseOverflow());
    assert.equal((await x.f.page.evaluate(() => work)).kind, 'received');
    const probes = await x.f.page.evaluate(() => overflowProbes);
    await converge(x);
    assert.equal(probes, 1);
  },
);
test(
  'locking during aggregate stream cancellation starts no fallback and retains only the old prefix',
  { timeout: 60000 },
  async (t) => {
    const x = await fixture(t, 'batch-http-stream-close', 'stream-limit');
    await start(x.f);
    await x.f.page.waitForFunction(() => window.overflowCancelled === true);
    await x.f.page.evaluate(() => {
      window.closing = editor.close();
    });
    await x.f.page.evaluate(() => releaseOverflow());
    await x.f.page.evaluate(() => closing);
    const outcome = await x.f.page.evaluate(() => work);
    assert.ok(outcome.error || outcome.kind === 'unknown');
    assert.deepEqual(x.singles, [0]);
    await cold(x.f);
    await open(x.f.page, x.item);
    assert.equal((await status(x.f.page)).receivedThrough, 1);
    assert.doesNotMatch(await view(x.f.page), /BATCH1/);
    await close(x.f.page);
  },
);

test(
  'an oversized non-success hint cannot select aggregate fallback or advance a prefix',
  { timeout: 60000 },
  async (t) => {
    const x = await fixture(t, 'batch-http-large-refusal', 'refused-oversized'),
      before = await view(x.f.page);
    const outcome = await next(x.f);
    assert.equal(outcome.kind, 'rejected');
    assert.equal(outcome.reason, 'response-too-large');
    assert.deepEqual(x.singles, [0]);
    assert.equal((await status(x.f.page)).receivedThrough, 1);
    assert.equal(await view(x.f.page), before);
    await close(x.f.page);
  },
);

test(
  'a temporary individual failure after aggregate overflow remains retryable without progress',
  { timeout: 60000 },
  async (t) => {
    const x = await fixture(t, 'batch-http-overflow-temporary', 'header-limit'),
      before = await view(x.f.page);
    const unavailable = (route) => route.abort();
    await x.f.context.route(path(x.f), unavailable);
    assert.deepEqual(await next(x.f), { kind: 'unknown', recorded: false });
    assert.equal((await status(x.f.page)).receivedThrough, 1);
    assert.equal(await view(x.f.page), before);
    await x.f.context.unroute(path(x.f), unavailable);
    await converge(x);
    assert.equal(x.batches.length, 1);
  },
);

test(
  'an oversized individual fallback still rejects without progress after aggregate overflow',
  { timeout: 60000 },
  async (t) => {
    const x = await fixture(t, 'batch-http-overflow-individual', 'header-limit'),
      before = await view(x.f.page);
    const oversized = (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/octet-stream',
        body: Buffer.alloc(2 * (512 * 1024 + 4096) + 513),
      });
    await x.f.context.route(path(x.f), oversized);
    assert.deepEqual(await next(x.f), {
      kind: 'rejected',
      reason: 'response-too-large',
      recorded: false,
    });
    assert.equal((await status(x.f.page)).receivedThrough, 1);
    assert.equal(await view(x.f.page), before);
    await x.f.context.unroute(path(x.f), oversized);
    await converge(x);
    assert.equal(x.batches.length, 1);
  },
);
