import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fixture,
  createLocal,
  openLocal,
  prepareRecovery,
  select,
  insert,
  close,
  read,
  sync,
  settle,
  sample,
  report,
} from './fixtures.mjs';

async function account(t) {
  const f = await fixture(t),
    item = await createLocal(f, 'liveness');
  await openLocal(f, item);
  await insert(f, 'Synthetic baseline.');
  await close(f);
  await prepareRecovery(f, item);
  await select(f, item);
  await sync(f, item);
  await settle(f);
  return { f, item };
}
const offline = async (f) => {
  await f.page.evaluate(async () => {
    setOnline(false);
    await editor.whenDurable();
    await opened.receiveStatus();
  });
};

test(
  'growing genuine v9 history: counts, ordinary polling, burst and instrumentation control',
  { timeout: 900000 },
  async (t) => {
    const { f, item } = await account(t),
      rows = [],
      history = [];
    let expected = (await read(f)).master;
    const save = () =>
      report('growth', { metadata: f.metadata, status: 'running', rows, history, expected });
    const observe = async (jobs) => {
      await offline(f);
      const shape = await f.page.evaluate(async () => {
        const captures = await opened.listCaptures();
        const sourceRefs = captures.flatMap((c) => c.sources.map((_, index) => [c.id, index]));
        for (const c of captures) for (const s of c.sources) s.bytes.fill(0);
        return {
          capsules: captures.length,
          sourceRefs,
          delivery: await opened.deliveryStatus(),
          spool: await opened.spoolStatus(),
          receive: await opened.receiveStatus(),
          documentBytes: new TextEncoder().encode(editor.read().master).length,
        };
      });
      assert.deepEqual(
        shape.spool.positions.flatMap((p) =>
          [p.source, ...(p.additional ?? [])].map((s) => [s.id, s.index]),
        ),
        shape.sourceRefs,
      );
      assert.equal(shape.delivery.acceptedThrough, shape.spool.positions.length);
      assert.equal(shape.receive.receivedThrough, shape.spool.positions.length);
      for (let repeat = 0; repeat < 3; repeat++) {
        rows.push(
          await sample(f, `status-${jobs}-${repeat}`, () =>
            f.page.evaluate(async () => ({
              delivery: await opened.deliveryStatus(),
              receive: await opened.receiveStatus(),
              spool: await opened.spoolStatus(),
            })),
          ),
        );
        rows.at(-1).shape = shape;
        save();
      }
    };
    const idle = async (jobs) => {
      // Observe the setup pass itself ending: a current idle/prefix snapshot does not prove a
      // just-scheduled retry has run. Start measuring only after its working -> idle transition.
      await f.page.evaluate(
        () =>
          new Promise((resolve) => {
            let worked = false;
            const detach = opened.sync.onStatus((status) => {
              if (status.receive.phase === 'working') worked = true;
              if (worked && status.receive.phase === 'idle') {
                detach();
                resolve();
              }
            });
            setOnline(true);
            opened.sync.retry('receive');
          }),
      );
      await settle(f, 0, false);
      rows.push(
        await sample(f, `idle-poll-${jobs}`, async () => {
          const result = await f.page.evaluate(
            () =>
              new Promise((resolve) => {
                const start = performance.now();
                let worked = false;
                const detach = opened.sync.onStatus((status) => {
                  if (status.receive.phase === 'working') worked = true;
                  if (worked && status.receive.phase === 'idle') {
                    detach();
                    resolve({ elapsedMs: performance.now() - start, status });
                  }
                });
              }),
          );
          await f.page.evaluate(() => setOnline(false));
          return result;
        }),
      );
      assert.equal(
        rows.at(-1).service.rows['service.census'].calls,
        1,
        'Exactly one ordinary read, excluding setup',
      );
      save();
    };
    await observe(0);
    await idle(0);
    for (let batch = 0; batch < 3; batch++) {
      const before = await f.page.evaluate(() => opened.sync.status.send.acceptedThrough);
      const measured = await sample(f, `eight-jobs-${batch}`, async () => {
        await f.page.evaluate(() => {
          syncTimeline = [];
          globalThis.localAdmissions = 0;
          globalThis.detachLocalCounter = editor.outgoing((bytes) => {
            bytes.fill(0);
            globalThis.localAdmissions++;
          });
          setOnline(true);
        });
        for (let n = 1; n <= 8; n++) {
          const job = batch * 8 + n,
            text = job === 12 ? 'paste '.repeat(1400) : ` [${job}]`;
          const at = performance.now();
          const deletion = job % 6 === 0 && job !== 12;
          let result;
          if (deletion) {
            result = await f.page.evaluate(async () => {
              const end = editor.read().master.length;
              await editor
                .text({ kind: 'master' })
                .input({ name: 'backspace' }, { ranges: [{ anchor: end - 3, head: end }], main: 0 })
                .accepted;
              return editor.read().master;
            });
            expected = expected.slice(0, -3);
          } else {
            result = await insert(f, text);
            expected += text;
          }
          assert.equal(result, expected);
          history.push({
            job,
            operation: deletion ? 'delete-tail' : 'insert',
            bytes: deletion ? 3 : Buffer.byteLength(text),
            acceptedMs: performance.now() - at,
          });
          save();
          console.log('Admitted job ' + job + ': ' + history.at(-1).operation);
        }
        const through = await settle(f, before + 1, false);
        const localAdmissions = await f.page.evaluate(() => {
          detachLocalCounter();
          setOnline(false);
          return globalThis.localAdmissions;
        });
        return {
          through,
          localAdmissions,
          timeline: await f.page.evaluate(() => syncTimeline),
          scheduler: await f.page.evaluate(() => opened.sync.status),
        };
      });
      assert.equal(
        measured.client.rows['sync.wake'].size,
        measured.value.localAdmissions,
        'Every send wake belongs to an actual local admission, not a remote promotion',
      );
      rows.push(measured);
      save();
      console.log('Growing history: ' + (batch + 1) * 8 + ' jobs');
      await observe((batch + 1) * 8);
    }
    await idle(24);
    await close(f);
    const controls = [];
    for (const measured of [false, true]) {
      await f.cold(measured);
      await sync(f, item, false);
      assert.equal((await read(f)).master, expected);
      for (let repeat = 0; repeat < 3; repeat++)
        controls.push({
          measured,
          ...(await sample(f, `control-${measured}-${repeat}`, () =>
            f.page.evaluate(async () => ({
              delivery: await opened.deliveryStatus(),
              receive: await opened.receiveStatus(),
              spool: await opened.spoolStatus(),
            })),
          )),
        });
      await close(f);
    }
    report('growth', {
      metadata: f.metadata,
      status: 'passed',
      rows,
      history,
      controls,
      expected,
      coldReopen: true,
    });
  },
);
