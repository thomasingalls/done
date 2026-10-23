import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { resolve, join } from 'node:path';
import { writeFileSync } from 'node:fs';
import {
  remote,
  path,
  next,
  answer,
  close,
  open,
  view,
  status,
  controlBundle,
  configure,
  start,
  waitPredicate,
} from './fixtures.mjs';
const record = (name, value) => {
  if (process.env.ACCOUNT_REPORT_DIR)
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, 'control-' + name + '.json'),
      JSON.stringify(value, null, 2) + '\n',
    );
};
for (const mutation of ['queue', 'flight'])
  test(
    `effective ${mutation} omission exposes the forbidden result`,
    { timeout: 60000 },
    async (t) => {
      const observations = [];
      for (const changed of [false, true]) {
        const { f, item, wire, initial } = await remote(
          t,
          `transport-control-${mutation}-${changed}`,
        );
        if (changed) {
          await close(f.page);
          await f.page.evaluate(await controlBundle(mutation));
          await configure(f.page);
          await open(f.page, item);
        }
        if (mutation === 'queue') {
          await f.context.route(path(f), (route) =>
            route.fulfill({
              status: 200,
              contentType: 'application/octet-stream',
              body: answer(f, item, Buffer.from(route.request().postData()), wire).bytes,
            }),
          );
          const result = await next(f);
          assert.equal(result.kind, 'received');
          const through = (await status(f.page)).receivedThrough,
            text = await view(f.page);
          assert.equal(through, 1);
          assert.equal(text, (changed ? '' : 'REMOTE ') + initial);
          observations.push({ changed, through, initial, text, result });
        } else {
          await f.page.evaluate(() => {
            window.calls = 0;
            window.fetch = async () => {
              calls++;
              if (calls === 1)
                await new Promise((r) => {
                  window.release = r;
                });
              return new Response('refused', { status: 409 });
            };
          });
          await start(f);
          await waitPredicate(f.page, () => calls === 1);
          await f.page.evaluate((token) => {
            window.second = opened.receiveNext(token).catch((e) => ({ error: String(e) }));
          }, f.testOperatorToken);
          await f.page.evaluate(() => release());
          await f.page.evaluate(() => work);
          const result = await f.page.evaluate(() => second),
            observedCalls = await f.page.evaluate(() => calls);
          assert.equal(observedCalls, changed ? 2 : 1);
          assert.equal(result.kind, changed ? 'unknown' : 'busy');
          observations.push({ changed, calls: observedCalls, result });
        }
        await close(f.page);
        await f.context.close();
      }
      record(mutation, { effective: true, observations });
    },
  );

async function http(mutation) {
  const target =
    mutation === 'bound'
      ? ['if (length > responseLimit) {', 'if (false) {']
      : ['await cancellation;', 'void cancellation;'];
  let hits = 0;
  const built = await build({
    configFile: false,
    logLevel: 'error',
    plugins: mutation
      ? [
          {
            name: 'http-omission',
            enforce: 'pre',
            transform(code, id) {
              if (!id.endsWith('/src/account/privateDeliveryHttp.ts')) return;
              const matches = code.split(target[0]).length - 1;
              if (matches !== 1)
                throw Error(
                  `HTTP ${mutation}: expected one anchor in src/account/privateDeliveryHttp.ts, found ${matches}: ${JSON.stringify(target[0])}`,
                );
              hits++;
              return code.replace(target[0], target[1]);
            },
          },
        ]
      : [],
    build: {
      write: false,
      minify: false,
      lib: { entry: resolve('src/account/privateDeliveryHttp.ts'), formats: ['es'] },
    },
  });
  if (mutation && hits !== 1) throw Error('HTTP mutation not applied');
  const code = (Array.isArray(built) ? built[0] : built).output.find(
    (f) => f.type === 'chunk',
  ).code;
  return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64')))
    .privateDeliveryPost;
}
for (const mutation of ['bound', 'drain'])
  test(
    `effective HTTP ${mutation} omission exposes the forbidden result`,
    { timeout: 15000 },
    async () => {
      const original = globalThis.fetch,
        observations = [];
      try {
        for (const changed of [false, true]) {
          const post = await http(changed ? mutation : null),
            stopped = new AbortController();
          let release,
            pulled,
            cancelled = false,
            settled = false;
          const hit = new Promise((r) => {
            pulled = r;
          });
          globalThis.fetch = async () =>
            new Response(
              new ReadableStream(
                mutation === 'bound'
                  ? {
                      start(c) {
                        c.enqueue(new Uint8Array(17));
                        c.close();
                      },
                    }
                  : {
                      pull() {
                        pulled();
                      },
                      cancel() {
                        cancelled = true;
                        return new Promise((r) => {
                          release = r;
                        });
                      },
                    },
                // Signal only when the HTTP reader is waiting, not on eager stream prefill.
                { highWaterMark: 0 },
              ),
              { headers: { 'Content-Type': 'application/octet-stream' } },
            );
          const work = post(
            { origin: 'http://127.0.0.1:1' },
            'A'.repeat(43),
            'read-v2',
            new Uint8Array([1]),
            16,
            stopped.signal,
          ).then((r) => {
            settled = true;
            return r;
          });
          if (mutation === 'bound') {
            const result = await work;
            assert.equal(result?.length ?? null, changed ? 17 : null);
            observations.push({ changed, length: result?.length ?? null });
          } else {
            await hit;
            stopped.abort();
            await new Promise((r) => setImmediate(r));
            assert.equal(cancelled, true);
            assert.equal(settled, changed);
            observations.push({ changed, cancelled, settledBeforeCancellationCompleted: settled });
            release();
            const result = await work;
            observations.at(-1).settledAfterCancellationCompleted = settled;
            observations.at(-1).result = result;
            assert.equal(result, null);
          }
        }
      } finally {
        globalThis.fetch = original;
      }
      record(mutation, { effective: true, observations });
    },
  );
