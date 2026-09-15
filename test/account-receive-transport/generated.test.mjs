import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import * as Y from 'yjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
      coverage = {};
    const save = () => {
      if (process.env.ACCOUNT_REPORT_DIR)
        writeFileSync(
          join(process.env.ACCOUNT_REPORT_DIR, 'generated.json'),
          JSON.stringify(
            {
              seed,
              runs: 16,
              status:
                histories.length === 16 && histories.every((h) => h.completed)
                  ? 'passed'
                  : 'running',
              histories,
              coverage,
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
            await f.context.route(path(f), async (route) => {
              const q = Buffer.from(route.request().postData()),
                after = JSON.parse(q.toString())[10];
              assert.equal(after, position, 'request follows actual durable progress');
              const page = answer(f, item, q, wires[after], links[after], count);
              if (wires[after]) links[after + 1] = page.link;
              entry.requests.push({
                mode,
                request: q.toString('hex'),
                candidatePage: Buffer.from(page.bytes).toString('hex'),
                responseBody:
                  mode === 'lost'
                    ? null
                    : Buffer.from(mode === 'corrupt' ? 'bad page' : page.bytes).toString('hex'),
                link: page.link,
              });
              save();
              if (mode === 'lost') {
                await route.abort();
                return;
              }
              await route.fulfill({
                status: 200,
                contentType: 'application/octet-stream',
                body: mode === 'corrupt' ? Buffer.from('bad page') : page.bytes,
              });
            });
            for (const action of actions) {
              coverage[action] = (coverage[action] ?? 0) + 1;
              mode = action;
              let outcome = null;
              if (['receive', 'lost', 'corrupt'].includes(action)) {
                const r = await next(f).catch((e) => ({ error: String(e) }));
                outcome = r;
                if (action === 'receive') {
                  assert.equal(r.kind, 'received');
                  expected = `R${position} ` + expected;
                  position++;
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
    save();
  },
);
