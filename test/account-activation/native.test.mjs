import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { resolve } from 'node:path';
import {
  native,
  seed,
  prepare,
  genesis,
  admit,
  args,
  snapshot,
} from '../account-admission/fixtures.mjs';
import { evidence } from './fixtures.mjs';
const ready = async (f, id) => {
  const item = await f.ready(id);
  await seed(f.page, item, [{ at: 4, remove: 0, insert: ' activation recovery', disk: false }]);
  await prepare(f.page, item);
  await genesis(f.page, item);
  return item;
};
async function control(gate) {
  const result = await build({
    configFile: false,
    logLevel: 'error',
    plugins: [
      {
        name: 'activation-control',
        enforce: 'pre',
        transform(code, id) {
          if (!id.endsWith('/src/crdt/promotionAdmission.ts')) return;
          if (gate === 'target') {
            const needle = 'requireActivationTarget(challenge.context, target, options.pin);';
            assert(code.includes(needle));
            return code.replace(needle, 'void 0;');
          }
          const start = code.indexOf(
              '            await task.wait(async () =>\n              verifySignature(',
            ),
            end = code.indexOf('            assertedContext', start);
          assert(start > 0 && end > start);
          return code.slice(0, start) + code.slice(end);
        },
      },
    ],
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('test/account-admission/browser.ts'),
        name: 'Harness',
        formats: ['iife'],
      },
    },
  });
  return (Array.isArray(result) ? result[0] : result).output.find((f) => f.type === 'chunk').code;
}
for (const gate of ['signature', 'target'])
  test(
    `client rejects changed ${gate} before prompting; omitted check actually prompts`,
    { timeout: 30000 },
    async (t) => {
      const f = await native(t),
        first = await ready(f, 'first');
      await f.page.evaluate(() => {
        const challenge = admissionTransport.challenge;
        admissionTransport.challenge = async (input) => {
          window.captured = await challenge(input);
          return captured;
        };
        window.assertActivation = () => {
          throw Error('capture only');
        };
      });
      await assert.rejects(admit(f.page, first), /capture only/);
      const captured = await f.page.evaluate(() => captured);
      const item = gate === 'target' ? await ready(f, 'second') : first;
      await f.page.evaluate(
        ({ captured, gate }) => {
          admissionTransport.challenge = async () =>
            gate === 'target' ? captured : { ...captured, signature: '00'.repeat(64) };
          window.prompted = 0;
          window.assertActivation = () => {
            prompted++;
            throw Error('prompt reached');
          };
        },
        { captured, gate },
      );
      await assert.rejects(admit(f.page, item), gate === 'target' ? /target changed/ : /signature/);
      const baselinePrompts = await f.page.evaluate(() => prompted);
      assert.equal(baselinePrompts, 0);
      await f.page.evaluate(await control(gate));
      await assert.rejects(admit(f.page, item), /prompt reached/);
      const mutantPrompts = await f.page.evaluate(() => prompted);
      assert.equal(mutantPrompts, 1);
      assert.equal((await snapshot(f.page, item)).marker.stage, 'admission-offered');
      evidence('control-client-' + gate, {
        gate,
        baselinePrompts,
        mutantPrompts,
        marker: (await snapshot(f.page, item)).marker.stage,
      });
    },
  );
test(
  'cancelled assertion forwards abort and drains before a queued tab acquires the slot',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await ready(f, 'cancel'),
      other = await f.context.newPage();
    await f.setup(other);
    await f.page.evaluate((item) => {
      window.abort = new AbortController();
      window.seenAbort = false;
      window.finishes = 0;
      window.settled = false;
      const finish = admissionTransport.finish;
      admissionTransport.finish = (input) => {
        finishes++;
        return finish(input);
      };
      window.work = Harness.admitLocalPromotion({
        ...item,
        pin,
        proveAuthority: prove,
        transport,
        admissionTransport,
        signal: abort.signal,
        assertActivation: (options, signal) =>
          new Promise((resolve) => {
            signal.addEventListener('abort', () => (window.seenAbort = true), { once: true });
            window.release = async () => resolve(await testActivationAssertion(options));
          }),
      }).then(
        (v) => {
          settled = true;
          return v;
        },
        (e) => {
          settled = true;
          return String(e);
        },
      );
    }, args(item));
    await f.page.waitForFunction(() => !!window.release);
    await f.page.evaluate(() => abort.abort());
    const seenAbort = await f.page.evaluate(() => window.seenAbort);
    assert.equal(seenAbort, true);
    await other.evaluate((item) => {
      window.done = false;
      window.work = Harness.admitLocalPromotion({
        ...item,
        pin,
        proveAuthority: prove,
        transport,
        admissionTransport,
        assertActivation,
      }).then((v) => {
        done = true;
        return v;
      });
    }, args(item));
    await other.waitForFunction(async () => (await navigator.locks.query()).pending.length > 0);
    const beforeRelease = {
      settled: await f.page.evaluate(() => settled),
      otherDone: await other.evaluate(() => done),
      pending: (await other.evaluate(() => navigator.locks.query())).pending.length,
    };
    assert.equal(beforeRelease.settled, false);
    assert.equal(beforeRelease.otherDone, false);
    await f.page.evaluate(() => release());
    await f.page.evaluate(() => work);
    const finishCalls = await f.page.evaluate(() => window.finishes),
      result = await other.evaluate(() => work);
    assert.equal(finishCalls, 0);
    assert.equal(result.kind, 'promotion-receipt');
    evidence('native-cancel', { seenAbort, beforeRelease, finishes: finishCalls, result });
  },
);
for (const stage of ['prompt', 'lost-finish'])
  test(
    `renderer death at ${stage} cold-recovers; committed result needs no new assertion`,
    { timeout: 30000 },
    async (t) => {
      const f = await native(t),
        item = await ready(f, stage);
      await f.page.evaluate(
        ({ item, stage }) => {
          window.hit = false;
          if (stage === 'prompt')
            window.assertActivation = () =>
              new Promise(() => {
                window.hit = true;
              });
          else {
            const finish = admissionTransport.finish;
            admissionTransport.finish = async (input) => {
              window.receipt = await finish(input);
              window.hit = true;
              return new Promise(() => {});
            };
          }
          window.work = Harness.admitLocalPromotion({
            ...item,
            pin,
            proveAuthority: prove,
            transport,
            admissionTransport,
            assertActivation,
          }).catch(String);
        },
        { item: args(item), stage },
      );
      await f.page.waitForFunction(() => hit);
      const receipt = await f.page.evaluate(() => window.receipt);
      const cdp = await f.context.newCDPSession(f.page),
        crashed = f.page.waitForEvent('crash');
      void cdp.send('Page.crash').catch(() => {});
      await crashed;
      await f.page.close();
      f.page = await f.context.newPage();
      await f.setup(f.page);
      await f.page.evaluate(() => {
        window.prompts = 0;
        const call = assertActivation;
        window.assertActivation = (options) => {
          prompts++;
          return call(options);
        };
      });
      const result = await admit(f.page, item);
      assert.equal(result.kind, 'promotion-receipt');
      const coldPrompts = await f.page.evaluate(() => prompts);
      assert.equal(coldPrompts, stage === 'prompt' ? 1 : 0);
      if (receipt) assert.deepEqual(result, receipt);
      evidence('native-' + stage, {
        stage,
        coldPrompts,
        beforeCrash: receipt ?? null,
        receipt: result,
      });
    },
  );
