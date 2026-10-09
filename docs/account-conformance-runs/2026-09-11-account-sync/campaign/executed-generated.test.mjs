import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  native,
  selected,
  syncing,
  settled,
  syncStatus,
  retryLane,
  close,
  cold,
  edit,
  view,
  captures,
  online,
  requestWire,
} from './fixtures.mjs';
import { decodeSubmission } from '../../account-protocol/submission.ts';
import { decodeNetworkEnvelope } from '../../account-protocol/envelope.ts';

test(
  'generated actual-service histories preserve authored text, source identity, exact position retry and cold receive progress',
  { timeout: 300000 },
  async (t) => {
    const seed = 9112062,
      histories = [],
      coverage = {};
    const save = () => {
      if (process.env.ACCOUNT_REPORT_DIR)
        writeFileSync(
          join(process.env.ACCOUNT_REPORT_DIR, 'generated-native.json'),
          JSON.stringify({ seed, histories, coverage }, null, 2) + '\n',
        );
    };
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.constantFrom('edit', 'offline-edit', 'lost-send', 'lost-read', 'compact', 'restart'),
          { minLength: 3, maxLength: 5 },
        ),
        async (generated) => {
          const actions = [...generated, 'edit', 'restart'],
            entry = { actions, completed: false };
          histories.push(entry);
          save();
          const f = await native(t),
            item = await selected(f, 'sync-generated-' + histories.length);
          try {
            let mode = 'good',
              expected,
              counter = 0;
            const wires = new Map(),
              invocationsAt = new Map();
            await f.context.route(f.server.origin + '/account/delivery/submit', async (route) => {
              const wire = requestWire(route),
                envelope = decodeSubmission(new Uint8Array(Buffer.from(wire, 'hex'))).envelope,
                n = decodeNetworkEnvelope(envelope).seq;
              if (wires.has(n)) assert.equal(wire, wires.get(n));
              else {
                wires.set(n, wire);
                invocationsAt.set(n, f.invocations.length);
              }
              const response = await route.fetch();
              if (mode === 'lost-send') await route.abort();
              else await route.fulfill({ response });
            });
            await f.context.route(f.server.origin + '/account/delivery/read-v2', async (route) => {
              if (mode === 'lost-read') await route.abort();
              else await route.continue();
            });
            await syncing(f.page, item);
            expected = await view(f.page);
            await settled(f.page);
            const baseline = await captures(f.page);
            for (const action of actions) {
              coverage[action] = (coverage[action] ?? 0) + 1;
              if (action === 'restart') {
                const before = await captures(f.page);
                await close(f.page);
                await cold(f);
                await syncing(f.page, item);
                await settled(f.page);
                assert.deepEqual(await captures(f.page), before);
              } else if (action === 'compact') {
                await f.page.evaluate(() => opened.compactContent());
              } else {
                if (action === 'offline-edit') await online(f.page, false);
                if (action.startsWith('lost')) mode = action;
                const text = ' [' + counter++ + ']';
                await edit(f.page, expected.length, 0, text);
                expected += text;
                if (action === 'offline-edit') await online(f.page, true);
                if (action.startsWith('lost')) {
                  if (action === 'lost-read') await retryLane(f.page, 'receive');
                  // Wait for evidence of the actual unknown reply before restarting; status polling is bounded.
                  const lane = action === 'lost-send' ? 'send' : 'receive';
                  const until = Date.now() + 10000;
                  while ((await syncStatus(f.page))[lane].failures === 0) {
                    if (Date.now() > until) throw Error('No unknown transport result');
                    await new Promise((r) => setTimeout(r, 20));
                  }
                  await close(f.page);
                  await cold(f);
                  mode = 'good';
                  await syncing(f.page, item);
                }
                await settled(f.page);
              }
              assert.equal(await view(f.page), expected);
              const c = await captures(f.page);
              assert.equal(c.length, baseline.length + counter);
              const n = c.reduce((n, c) => n + c.sources.length, 0),
                status = await syncStatus(f.page);
              assert.equal(status.send.acceptedThrough, n);
              assert.equal(status.receive.receivedThrough, n);
              assert.equal(wires.size, n);
              assert.equal(f.invocations.length, n);
              const spool = await f.page.evaluate(() => opened.spoolStatus());
              assert.deepEqual(
                spool.positions.map((p) => [p.source.id, p.source.index]),
                c.flatMap((c) => c.sources.map((_, i) => [c.id, i])),
              );
            }
            await close(f.page);
            entry.completed = true;
            entry.positions = wires.size;
            save();
          } finally {
            await f.context.close();
          }
        },
      ),
      { seed, numRuns: 8, endOnFailure: true },
    );
    for (const action of ['edit', 'offline-edit', 'lost-send', 'lost-read', 'compact', 'restart'])
      assert.ok(coverage[action] > 0, action);
    save();
  },
);
