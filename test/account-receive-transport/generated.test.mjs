import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import * as Y from 'yjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  decodeInboundBatch,
  encodeInboundBatchPages,
  INBOUND_BATCH_COUNT,
} from '../../account-protocol/inboundBatch.ts';
import {
  ready,
  envelope,
  open,
  close,
  cold,
  path,
  next,
  answer,
  view,
  status,
  captures,
  edit,
} from './fixtures.mjs';
test(
  'generated HTTP histories agree on durable receive prefix, authored text and local source count',
  { timeout: 300000 },
  async (t) => {
    const seed = 9112042,
      histories = [],
      coverage = {},
      transports = { single: 0, batch: 0 };
    const save = () => {
      if (process.env.ACCOUNT_REPORT_DIR)
        writeFileSync(
          join(process.env.ACCOUNT_REPORT_DIR, 'generated.json'),
          JSON.stringify(
            {
              seed,
              model: 'grouped-http-v2',
              runs: 16,
              status:
                histories.length === 16 && histories.every((h) => h.completed)
                  ? 'passed'
                  : 'running',
              histories,
              coverage,
              transports,
            },
            null,
            2,
          ) + '\n',
        );
    };
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom('receive', 'local', 'lost', 'corrupt', 'restart', 'compact'), {
          minLength: 3,
          maxLength: 6,
        }),
        async (generated) => {
          const actions = ['lost', ...generated, 'receive', 'restart'],
            entry = { actions, completed: false, observations: [], requests: [] };
          histories.push(entry);
          save();
          const { f, item, initial, snapshot } = await ready(
            t,
            'transport-generated-' + histories.length,
          );
          try {
            const doc = new Y.Doc({ gc: false });
            Y.applyUpdate(doc, new Uint8Array(snapshot));
            doc.clientID = 8112042;
            const updates = [],
              wires = [],
              links = ['00'.repeat(32)];
            doc.on('update', (b) => {
              updates.push([...b]);
            });
            const count = actions.filter((a) => a === 'receive').length;
            for (let n = 0; n < count; n++) doc.getText('master').insert(0, `R${n} `);
            doc.destroy();
            for (let n = 0; n < count; n++)
              wires.push(await envelope(f.page, item, n + 1, [updates[n]]));
            await open(f.page, item);
            entry.initial = initial;
            entry.before = await captures(f.page);
            entry.wires = wires.map((w) => Buffer.from(w).toString('hex'));
            const originalCount = entry.before.length;
            save();
            let mode = 'receive',
              position = 0,
              expected = initial,
              locals = 0;
            const respond = async (route, batch) => {
              const body = route.request().postDataBuffer(),
                requests = batch ? decodeInboundBatch(new Uint8Array(body)) : [body];
              assert(requests.length >= 1 && requests.length <= INBOUND_BATCH_COUNT);
              // Entry links depend on the originals, not HTTP arrival order. Only pages
              // bound to the actual original signed requests are ever served below.
              if (links.length === 1) {
                const template = JSON.parse(Buffer.from(requests[0]).toString());
                for (let n = 0; n < count; n++) {
                  template[10] = n;
                  links.push(
                    answer(
                      f,
                      item,
                      Buffer.from(JSON.stringify(template)),
                      wires[n],
                      links[n],
                      count,
                    ).link,
                  );
                }
              }
              const pages = requests.map((request, index) => {
                const q = Buffer.from(request),
                  after = JSON.parse(q.toString())[10];
                assert.equal(after, position + index, 'request follows actual durable progress');
                assert.equal(JSON.parse(q.toString())[11], 1);
                assert(after <= count);
                const page = answer(f, item, q, wires[after], links[after], count);
                return {
                  request: q.toString('hex'),
                  candidatePage: Buffer.from(page.bytes).toString('hex'),
                  link: page.link,
                };
              });
              const response = batch
                ? Buffer.from(
                    encodeInboundBatchPages(
                      pages.map((p) => new Uint8Array(Buffer.from(p.candidatePage, 'hex'))),
                    ),
                  )
                : Buffer.from(pages[0].candidatePage, 'hex');
              entry.requests.push({
                mode,
                batch,
                request: body.toString('hex'),
                pages,
                responseBody:
                  mode === 'lost'
                    ? null
                    : Buffer.from(mode === 'corrupt' ? 'bad page' : response).toString('hex'),
              });
              transports[batch ? 'batch' : 'single']++;
              save();
              if (mode === 'lost') {
                await route.abort();
                return;
              }
              await route.fulfill({
                status: 200,
                contentType: 'application/octet-stream',
                body: mode === 'corrupt' ? Buffer.from('bad page') : response,
              });
            };
            await f.context.route(path(f), (route) => respond(route, false));
            await f.context.route(path(f) + '-batch', (route) => respond(route, true));
            for (const action of actions) {
              coverage[action] = (coverage[action] ?? 0) + 1;
              mode = action;
              let outcome = null;
              if (['receive', 'lost', 'corrupt'].includes(action)) {
                const beforeRequests = entry.requests.length;
                const r = await next(f).catch((e) => ({ error: String(e) }));
                outcome = r;
                assert.equal(entry.requests.length, beforeRequests + 1);
                if (action === 'receive') {
                  const kinds = entry.requests
                    .at(-1)
                    .pages.map((p) =>
                      JSON.parse(Buffer.from(p.candidatePage, 'hex').toString())[5].length
                        ? 'received'
                        : 'empty',
                    );
                  const received = kinds.filter((kind) => kind === 'received').length;
                  if (received) {
                    assert.equal(r.kind, 'received');
                    assert.equal(r.recorded, true);
                    for (let n = 0; n < received; n++) expected = `R${position++} ` + expected;
                  } else {
                    assert.equal(r.kind, 'empty');
                    assert.equal(r.recorded, false);
                  }
                  if (entry.requests.at(-1).batch) assert.deepEqual(r.kinds, kinds);
                } else if (action === 'lost') assert.equal(r.kind, 'unknown');
                else assert.ok(r.error);
              } else if (action === 'local') {
                await edit(f.page, expected.length, 0, 'L');
                expected += 'L';
                locals++;
              } else if (action === 'compact') await f.page.evaluate(() => opened.compactContent());
              else {
                await f.page.evaluate(() => editor.whenDurable());
                await close(f.page);
                await cold(f);
                await open(f.page, item);
              }
              entry.observations.push({
                action,
                outcome,
                visible: await view(f.page),
                status: await status(f.page),
                captures: await captures(f.page),
              });
              save();
              assert.equal(await view(f.page), expected);
              assert.equal((await status(f.page)).receivedThrough, position);
              assert.equal((await captures(f.page)).length, originalCount + locals);
            }
            entry.final = {
              visible: await view(f.page),
              status: await status(f.page),
              captures: await captures(f.page),
            };
            assert.equal(position, count, 'all published originals arrived before final cold open');
            save();
            await close(f.page);
            entry.completed = true;
            save();
          } finally {
            await f.context.close();
          }
        },
      ),
      { seed, numRuns: 16, endOnFailure: true },
    );
    for (const action of ['receive', 'local', 'lost', 'corrupt', 'restart', 'compact'])
      assert.ok(coverage[action] > 0, action);
    assert(transports.single > 0 && transports.batch > 0);
    save();
  },
);
