import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  remote,
  polling,
  close,
  cold,
  path,
  answer,
  driverStatus,
  retry,
  online,
  waitPredicate,
  view,
  edit,
  captures,
} from './fixtures.mjs';
test(
  'generated native polling histories preserve authored text, durable progress and restart cursor',
  { timeout: 240000 },
  async (t) => {
    const seed = 9112052,
      histories = [],
      coverage = {};
    const save = () => {
      if (process.env.ACCOUNT_REPORT_DIR)
        writeFileSync(
          join(process.env.ACCOUNT_REPORT_DIR, 'generated-native.json'),
          JSON.stringify(
            {
              seed,
              runs: 10,
              status:
                histories.length === 10 && histories.every((h) => h.completed)
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
        fc.array(fc.constantFrom('publish', 'local', 'lost', 'offline', 'halt', 'restart'), {
          minLength: 3,
          maxLength: 5,
        }),
        async (generated) => {
          const actions = [...generated, 'publish', 'restart'],
            entry = { actions, completed: false, observations: [], requests: [] };
          histories.push(entry);
          save();
          const { f, item, initial, wires } = await remote(
            t,
            'poll-generated-' + histories.length,
            actions.filter((x) => x === 'publish').length,
          );
          try {
            entry.initial = initial;
            entry.wires = wires.map((w) => Buffer.from(w).toString('hex'));
            let available = 0,
              mode = 'good',
              locals = 0;
            const links = ['00'.repeat(32)],
              queries = [];
            await f.context.route(path(f), async (route) => {
              const q = Buffer.from(route.request().postData()),
                r = JSON.parse(q.toString()),
                after = r[10];
              queries.push(after);
              const a = answer(
                f,
                item,
                q,
                after < available ? wires[after] : null,
                links[after],
                available,
              );
              if (after < available) links[after + 1] = a.link;
              entry.requests.push({
                mode,
                available,
                request: q.toString('hex'),
                candidatePage: Buffer.from(a.bytes).toString('hex'),
                responseBody:
                  mode === 'lost'
                    ? null
                    : Buffer.from(mode === 'halt' ? 'corrupt page' : a.bytes).toString('hex'),
                link: a.link,
              });
              save();
              if (mode === 'lost') {
                await route.abort();
                return;
              }
              await route.fulfill({
                status: 200,
                contentType: 'application/octet-stream',
                body: mode === 'halt' ? 'corrupt page' : a.bytes,
              });
            });
            const idle = () => waitPredicate(f.page, () => opened.receiver.status.phase === 'idle');
            await polling(f.page, item);
            await idle();
            entry.before = await captures(f.page);
            const baseline = entry.before.length;
            entry.startupRequests = queries.length;
            save();
            for (const action of actions) {
              coverage[action] = (coverage[action] ?? 0) + 1;
              const requestStart = queries.length;
              let transition = null;
              if (action === 'publish') {
                available++;
                await retry(f.page);
                await waitPredicate(f.page, () => opened.receiver.status.phase === 'working');
                await idle();
              } else if (action === 'local') {
                await edit(f.page, (await view(f.page)).length, 0, 'L');
                locals++;
              } else if (action === 'restart') {
                await close(f.page);
                await cold(f);
                const before = queries.length;
                await polling(f.page, item);
                await idle();
                assert.equal(queries[before], available);
              } else if (action === 'offline') {
                await online(f.page, false);
                await retry(f.page);
                transition = await driverStatus(f.page);
                assert.equal(transition.phase, 'offline');
                await online(f.page, true);
                await waitPredicate(f.page, () => opened.receiver.status.phase === 'working');
                await idle();
              } else {
                mode = action;
                await retry(f.page);
                await waitPredicate(f.page, () =>
                  ['retrying', 'blocked'].includes(opened.receiver.status.phase),
                );
                transition = await driverStatus(f.page);
                assert.equal(transition.receivedThrough, available);
                mode = 'good';
                await retry(f.page);
                await waitPredicate(f.page, () => opened.receiver.status.phase === 'working');
                await idle();
              }
              const expected =
                Array.from({ length: available }, (_, i) => `REMOTE${available - 1 - i} `).join(
                  '',
                ) +
                initial +
                'L'.repeat(locals);
              entry.observations.push({
                action,
                requestStart,
                requestEnd: queries.length,
                transition,
                visible: await view(f.page),
                status: await driverStatus(f.page),
                captures: await captures(f.page),
              });
              save();
              assert.equal(await view(f.page), expected);
              assert.equal((await driverStatus(f.page)).receivedThrough, available);
              assert.equal((await captures(f.page)).length, baseline + locals);
            }
            entry.final = {
              visible: await view(f.page),
              status: await driverStatus(f.page),
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
      { seed, numRuns: 10, endOnFailure: true },
    );
    for (const action of ['publish', 'local', 'lost', 'offline', 'halt', 'restart'])
      assert.ok(coverage[action] > 0, action);
    save();
  },
);
