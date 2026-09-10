import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fc from 'fast-check';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  native,
  selected,
  sending,
  close,
  cold,
  edit,
  driverStatus,
  settled,
  retry,
  online,
  intercept,
  deliveryStatus,
  waitUntil,
} from './fixtures.mjs';
import { fixtureAcceptance, refusal, response, head } from '../account-decisions/oracle.mjs';
import { decodeSubmission } from '../../account-protocol/submission.ts';
import { decodeNetworkEnvelope } from '../../account-protocol/envelope.ts';
const artifact = (name, v) => {
  if (process.env.ACCOUNT_REPORT_DIR)
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, name + '.json'),
      JSON.stringify(v, null, 2) + '\n',
    );
};
const requestWire = (route) => JSON.parse(route.request().postData())[3];
const subject = (wire) => {
  const e = decodeNetworkEnvelope(
    decodeSubmission(new Uint8Array(Buffer.from(wire, 'hex'))).envelope,
  );
  return {
    workspace: e.workspace_id,
    credential: e.credential_id,
    position: e.seq,
    digest: Buffer.from(e.digest).toString('hex'),
    epoch: e.epoch,
  };
};
const rows = (f) => {
  const db = new DatabaseSync(f.dbPath, { readOnly: true });
  try {
    return db
      .prepare('SELECT position,submission,response FROM delivery_decisions ORDER BY ordinal')
      .all();
  } finally {
    db.close();
  }
};
async function drained(f) {
  await settled(f.page);
}
test(
  'startup and rapid edits drain automatically, Local remains usable and idle notifications do not spin',
  { timeout: 45000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'driver-edits'),
      sent = [];
    let inflight = 0,
      max = 0;
    await intercept(f, async (route) => {
      inflight++;
      max = Math.max(max, inflight);
      sent.push(requestWire(route));
      try {
        const answer = await route.fetch();
        await route.fulfill({ response: answer });
      } finally {
        inflight--;
      }
    });
    await sending(f.page, item);
    await drained(f);
    assert.ok((await driverStatus(f.page)).acceptedThrough >= 1);
    assert.deepEqual(
      await f.page.evaluate(() =>
        ['prepareNextEnvelope', 'prepareSubmission', 'submitPending', 'recordResponse'].filter(
          (k) => k in opened,
        ),
      ),
      [],
    );
    await f.page.evaluate(async () => {
      const tickets = [];
      for (let i = 0; i < 8; i++)
        tickets.push(
          surface.input(
            { name: 'insert', text: 'burst ' + i + ' ' },
            { ranges: [{ anchor: 0, head: 0 }], main: 0 },
          ).accepted,
        );
      await Promise.all(tickets);
    });
    await drained(f);
    const final = await driverStatus(f.page),
      all = rows(f);
    assert.equal(final.acceptedThrough, all.length);
    assert.ok(all.length >= 9);
    assert.equal(max, 1);
    const spool = await f.page.evaluate(() => opened.spoolStatus());
    assert.equal(spool.attempts, all.length);
    assert.equal(f.invocations.length, all.length);
    for (const [i, row] of all.entries())
      assert.equal(Buffer.from(row.submission).toString('hex'), sent[i]);
    const count = sent.length;
    await f.page.evaluate(async () => {
      for (let i = 0; i < 6; i++) await editor.whenDurable();
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(sent.length, count);
    assert.equal((await driverStatus(f.page)).phase, 'idle');
    await close(f.page);
  },
);
test(
  'unknown replies back off despite edits, then online wake retries exact bytes before new content',
  { timeout: 45000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'driver-reconnect'),
      sent = [];
    let lose = true;
    await intercept(f, async (route) => {
      sent.push(requestWire(route));
      if (lose) {
        await route.fetch();
        await route.abort('failed');
      } else await route.continue();
    });
    await sending(f.page, item);
    await f.page.waitForFunction(() => opened.driver.status.phase === 'retrying');
    const first = sent[0],
      count = f.invocations.length;
    await online(f.page, false);
    await edit(f.page, 0, 0, 'offline edit ');
    await f.page.evaluate(() => editor.whenDurable());
    for (let i = 0; i < 15; i++) await retry(f.page);
    assert.equal(sent.length, 1);
    assert.equal(f.invocations.length, count);
    lose = false;
    await online(f.page, true);
    await settled(f.page);
    // An online wake schedules the pass; wait for the accepted prefix to actually include the offline edit.
    await f.page.waitForFunction(
      () => opened.driver.status.phase === 'idle' && opened.driver.status.acceptedThrough > 1,
    );
    assert.equal(sent[1], first);
    assert.equal(rows(f).length, (await driverStatus(f.page)).acceptedThrough);
    await close(f.page);
  },
);
test(
  'cold restart resolves a persisted unknown wrapper before any new seal',
  { timeout: 45000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'driver-restart'),
      sent = [];
    let lost = true;
    await intercept(f, async (route) => {
      sent.push({ wire: requestWire(route), seals: f.invocations.length });
      if (lost) {
        await route.fetch();
        await route.abort('failed');
      } else await route.continue();
    });
    await sending(f.page, item);
    await f.page.waitForFunction(() => opened.driver.status.phase === 'retrying');
    const prior = sent[0];
    await close(f.page);
    const before = f.invocations.length;
    await cold(f);
    lost = false;
    await sending(f.page, item);
    await drained(f);
    assert.equal(sent[1].wire, prior.wire);
    assert.equal(sent[1].seals, before);
    assert.ok((await driverStatus(f.page)).acceptedThrough >= 1);
    await close(f.page);
  },
);
for (const kind of ['closed', 'conflict', 'finalized'])
  test(
    `verified ${kind} evidence halts automatic publication and retains later Local edits`,
    { timeout: 35000 },
    async (t) => {
      const f = await native(t),
        item = await selected(f, 'driver-' + kind),
        key = fixtureAcceptance(f, item.scope.workspaceId),
        sent = [];
      await intercept(f, async (route) => {
        const wire = requestWire(route),
          s = subject(wire);
        sent.push(wire);
        const answer =
          kind === 'closed'
            ? response({ kind: 'refused', refusal: refusal(s, key) })
            : response({
                kind: 'accepted',
                head: head(
                  kind === 'conflict' ? { ...s, digest: 'ff'.repeat(32) } : s,
                  '00'.repeat(32),
                  1,
                  key,
                  kind === 'finalized',
                ),
                leaf: kind === 'conflict' ? { ...s, digest: 'ff'.repeat(32) } : s,
              });
        await route.fulfill({
          status: 200,
          contentType: 'application/octet-stream',
          body: Buffer.from(answer),
        });
      });
      await sending(f.page, item);
      await f.page.waitForFunction(() => opened.driver.status.phase === 'blocked');
      assert.equal((await driverStatus(f.page)).reason, kind);
      await edit(f.page, 0, 0, 'after halt ');
      await f.page.evaluate(() => editor.whenDurable());
      await retry(f.page);
      await f.page.waitForFunction(() => opened.driver.status.phase === 'blocked');
      assert.equal(sent.length, 1);
      await close(f.page);
      await cold(f);
      await sending(f.page, item);
      await f.page.waitForFunction(() => opened.driver.status.phase === 'blocked');
      assert.equal((await deliveryStatus(f.page)).state, kind);
      assert.ok((await f.page.evaluate(() => editor.read().master)).startsWith('after halt '));
      await close(f.page);
    },
  );
test(
  'close during backoff removes wake sources and never waits for the retry deadline',
  { timeout: 35000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'driver-stop');
    let sent = 0;
    await intercept(f, (route) => {
      sent++;
      return route.fulfill({ status: 503, body: 'offline' });
    });
    await sending(f.page, item);
    await f.page.waitForFunction(() => opened.driver.status.phase === 'retrying');
    const start = Date.now();
    await close(f.page);
    assert.ok(Date.now() - start < 1000);
    const count = sent;
    await f.page.evaluate(() => {
      opened.driver.retry();
      dispatchEvent(new Event('online'));
    });
    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.equal(sent, count);
    assert.equal((await driverStatus(f.page)).phase, 'closed');
  },
);
test(
  'close drains a late fetch while retaining the native slot permit',
  { timeout: 35000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'driver-late');
    await f.page.evaluate(() => {
      const original = fetch;
      window.hit = false;
      window.fetch = async (...args) => {
        if (String(args[0]).endsWith('/account/delivery/submit')) {
          window.hit = true;
          window.fetchSignal = args[1].signal;
          await new Promise((resolve) => (window.release = resolve));
          return new Response(new Uint8Array([0]), {
            headers: { 'Content-Type': 'application/octet-stream' },
          });
        }
        return original(...args);
      };
    });
    await sending(f.page, item);
    await f.page.waitForFunction(() => hit);
    await f.page.evaluate((slot) => {
      window.closing = editor.close();
      window.competed = false;
      window.competitor = navigator.locks.request(
        Harness.slotPermitName(slot),
        () => (window.competed = true),
      );
    }, item.slotId);
    await waitUntil(f.page, async () => (await navigator.locks.query()).pending.length > 0);
    assert.equal(await f.page.evaluate(() => fetchSignal.aborted), true);
    assert.equal(await f.page.evaluate(() => competed), false);
    await f.page.evaluate(() => release());
    await f.page.evaluate(() => closing);
    await f.page.evaluate(() => competitor);
    assert.equal((await driverStatus(f.page)).phase, 'closed');
  },
);
test(
  'Local storage failure pauses publication and restoring admission wakes retained work',
  { timeout: 40000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'driver-storage');
    let sent = 0;
    await intercept(f, (route) => {
      sent++;
      return route.continue();
    });
    await sending(f.page, item);
    await drained(f);
    const before = sent;
    await f.page.evaluate(() => {
      const set = Storage.prototype.setItem,
        add = IDBObjectStore.prototype.add;
      Storage.prototype.setItem = function () {
        throw new DOMException('quota', 'QuotaExceededError');
      };
      window.restoreStorage = () => {
        Storage.prototype.setItem = set;
        IDBObjectStore.prototype.add = add;
      };
      IDBObjectStore.prototype.add = function (value, ...args) {
        const r = add.call(this, value, ...args);
        if (value?.kind === 'outbound')
          r.addEventListener('success', () => this.transaction.abort());
        return r;
      };
      window.ticket = surface.input(
        { name: 'insert', text: 'after storage repair ' },
        { ranges: [{ anchor: 0, head: 0 }], main: 0 },
      );
    });
    await f.page.waitForFunction(
      () => editor.status.state === 'blocked' && opened.driver.status.reason === 'local-storage',
    );
    assert.equal(sent, before);
    await retry(f.page);
    assert.equal(sent, before);
    await f.page.evaluate(() => {
      restoreStorage();
      editor.retry();
    });
    await f.page.evaluate(() => ticket.accepted);
    await f.page.waitForFunction(
      () =>
        opened.driver.status.phase === 'idle' &&
        opened.driver.status.acceptedThrough > 0 &&
        editor.read().master.startsWith('after storage repair '),
    );
    await waitUntil(f.page, async () => {
      const s = await opened.spoolStatus();
      return (
        opened.driver.status.phase === 'idle' &&
        s.positions.length === opened.driver.status.acceptedThrough
      );
    });
    assert.ok(sent > before);
    await close(f.page);
  },
);
test(
  'eight generated native edit/disconnect/lost-reply/restart histories preserve each exact wrapper and drain all captures',
  { timeout: 180000 },
  async () => {
    const seed = 9132026,
      histories = [];
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom('edit', 'offline', 'lost', 'retry', 'restart'), {
          minLength: 3,
          maxLength: 6,
        }),
        async (commands) => {
          histories.push(commands);
          console.log('driver history ' + histories.length + '/8: ' + JSON.stringify(commands));
          artifact('generated-native', { seed, histories, status: 'running' });
          const cleanups = [];
          const f = await native({ after: (callback) => cleanups.push(callback) }),
            item = await selected(f, 'history-' + histories.length),
            seen = new Map();
          let fault = false;
          try {
            await intercept(f, async (route) => {
              const wire = requestWire(route),
                s = subject(wire),
                previous = seen.get(s.position);
              if (previous) assert.equal(wire, previous);
              else seen.set(s.position, wire);
              if (fault) {
                await route.fetch();
                await route.abort('failed');
              } else await route.continue();
            });
            await sending(f.page, item);
            await drained(f);
            let expected = await f.page.evaluate(() => editor.read().master);
            for (const [index, command] of commands.entries()) {
              if (command === 'restart') {
                await close(f.page);
                await cold(f);
                await sending(f.page, item);
                await drained(f);
                assert.equal(await f.page.evaluate(() => editor.read().master), expected);
                continue;
              }
              if (command === 'retry') {
                await f.page.evaluate(
                  () =>
                    new Promise((resolve) => {
                      const off = opened.driver.onStatus((s) => {
                        if (s.phase === 'idle') {
                          off();
                          resolve();
                        }
                      });
                      for (let i = 0; i < 20; i++) opened.driver.retry();
                    }),
                );
                continue;
              }
              const before = (await driverStatus(f.page)).acceptedThrough,
                oldSeals = f.invocations.length;
              if (command === 'offline') await online(f.page, false);
              if (command === 'lost') fault = true;
              const text = `${histories.length}/${index} `;
              expected = text + expected;
              await edit(f.page, 0, 0, text);
              if (command === 'offline') {
                await f.page.evaluate(() => editor.whenDurable());
                assert.equal(f.invocations.length, oldSeals);
                await online(f.page, true);
              }
              if (command === 'lost') {
                await f.page.waitForFunction(() => opened.driver.status.phase === 'retrying');
                const seals = f.invocations.length;
                await close(f.page);
                await cold(f);
                fault = false;
                await sending(f.page, item);
                // The first retry is checked against the previously observed exact wrapper above.
                assert.ok(f.invocations.length >= seals);
              }
              await f.page.waitForFunction(
                (before) =>
                  opened.driver.status.phase === 'idle' &&
                  opened.driver.status.acceptedThrough > before,
                before,
                { timeout: 20000 },
              );
              assert.equal(await f.page.evaluate(() => editor.read().master), expected);
            }
            const all = rows(f),
              spool = await f.page.evaluate(() => opened.spoolStatus());
            assert.equal(all.length, spool.positions.length);
            assert.equal(spool.attempts, all.length);
            assert.equal(seen.size, all.length);
            for (const row of all)
              assert.equal(Buffer.from(row.submission).toString('hex'), seen.get(row.position));
            await close(f.page);
          } finally {
            for (const cleanup of cleanups.reverse()) await cleanup();
          }
        },
      ),
      { seed, numRuns: 8, endOnFailure: true },
    );
    artifact('generated-native', { seed, histories, status: 'passed' });
  },
);

test(
  'browser polling awaits false results instead of treating their Promise as success',
  { timeout: 15000 },
  async (t) => {
    const f = await native(t);
    const early = await f.page.waitForFunction(async () => false, undefined, { timeout: 100 });
    assert.equal(await early.jsonValue(), false);
    await assert.rejects(
      waitUntil(f.page, async () => false, undefined, 100),
      /timed out/,
    );
    await f.page.evaluate(() => {
      window.pollReady = false;
      setTimeout(() => (window.pollReady = true), 50);
    });
    await waitUntil(f.page, async () => pollReady);
    artifact('polling-reproduction', {
      installedWait: 'returned false as successful result',
      correctedWait: 'waits for true, rejects persistent false',
    });
  },
);
