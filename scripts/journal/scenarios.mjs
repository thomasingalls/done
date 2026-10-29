import { waitForState } from '../storage-conformance/observe.mjs';
const OBSERVATION_TIMEOUT_MS = 10000;
import { isDeepStrictEqual } from 'node:util';
export async function runCase(definition, env) {
  const assertions = [],
    artifacts = [],
    schedule = [],
    pageErrors = [];
  let context,
    error,
    status = 'error';
  const check = (id, actual, expected) => {
    actual ??= null;
    expected ??= null;
    const passed = isDeepStrictEqual(actual, expected);
    assertions.push({ id, actual, expected, passed });
    return passed;
  };
  const call = (p, method, ...args) =>
    p.evaluate(({ method, args }) => window.journal[method](...args), { method, args });
  const base = (p, method, ...args) =>
    p.evaluate(({ method, args }) => window.journal.base[method](...args), { method, args });
  const page = async () => {
    const p = await context.newPage();
    p.setDefaultTimeout(OBSERVATION_TIMEOUT_MS);
    p.on('pageerror', (e) => pageErrors.push(e.message));
    await p.goto(env.url);
    await waitForState(p, () => window.journal, undefined, OBSERVATION_TIMEOUT_MS);
    return p;
  };
  const snapshot = (p) => call(p, 'snapshot');
  const settled = async (p, id, isBase = false) => {
    await waitForState(
      p,
      ({ id, isBase }) =>
        ['resolved', 'rejected'].includes(
          (isBase ? window.journal.base : window.journal).snapshot().entries[id]?.status,
        ),
      { id, isBase },
      OBSERVATION_TIMEOUT_MS,
    );
    return (isBase ? await base(p, 'snapshot') : await snapshot(p)).entries[id];
  };
  const done = async (p, id, isBase = false) => {
    const r = await settled(p, id, isBase);
    if (r.status !== 'resolved')
      throw Error(`Unexpected ${id} refusal: ${JSON.stringify(r.error)}`);
    return r.value;
  };
  const open = async (p, code, id = 's') => {
    await call(p, 'open', id, code);
    await done(p, id);
  };
  const gate = (p, name, isBase = false) =>
    waitForState(
      p,
      ({ name, isBase }) =>
        (isBase ? window.journal.base : window.journal).snapshot().gates.includes(name),
      { name, isBase },
      OBSERVATION_TIMEOUT_MS,
    );
  const recover = async (p) => {
    await call(p, 'recover', 'recovery');
    return done(p, 'recovery');
  };
  const texts = (r) =>
    [...r.records, ...r.journal].map((r) => new TextDecoder().decode(new Uint8Array(r.bytes)));
  const crash = async (p, cdp) => {
    const session = cdp ?? (await context.newCDPSession(p)),
      died = p.waitForEvent('crash');
    void session.send('Page.crash').catch(() => {});
    await died;
    await p.close();
    schedule.push('Actual Page.crash without graceful shutdown');
  };
  try {
    context = await env.browser.newContext();
    await context.route('**/*', (r) =>
      new URL(r.request().url()).origin === env.origin ? r.continue() : r.abort('blockedbyclient'),
    );
    let a = await page();
    const code = await base(a, 'enroll');
    await base(a, 'initialize', 'init', code);
    await done(a, 'init', true);
    await open(a, code);
    switch (definition.id) {
      case 'C01.synchronous-crash': {
        const r = await call(a, 'append', 'journal only');
        check('append-is-synchronous', r.promise, false);
        check('append-has-no-subtle-await', r.subtleCalls, 0);
        check('append-uses-fresh-24-byte-nonce', r.nonceCalls, 1);
        if (!check('receipt-already-has-carrier', r.persisted?.startsWith('2:'), true)) break;
        check('content-not-yet-flushed', (await base(a, 'counter')).reserved['1'], 0);
        await crash(a);
        a = await page();
        await open(a, code);
        check('cold-journal-recovery', texts(await recover(a)), ['journal only']);
        await call(a, 'flush', 'flushed');
        await done(a, 'flushed');
        check('completed-flush-clears-journal', Object.keys(await call(a, 'inventory')).length, 0);
        check('post-flush-content-recovery', texts(await recover(a)), ['journal only']);
        break;
      }
      case 'C01.remote-basis': {
        const probe = await base(a, 'yjsProbe');
        await call(a, 'batch', 'remote', [probe.updates[0], probe.updates[1]]);
        await done(a, 'remote');
        check(
          'dependent-local-journals',
          (await call(a, 'append', probe.updates[2])).result.status,
          'journalled',
        );
        await crash(a);
        a = await page();
        await open(a, code);
        await call(a, 'replay', 'offline');
        check('offline-journal-plus-content', await done(a, 'offline'), probe.expected);
        break;
      }
      case 'C03.refusals': {
        const original = await call(a, 'append', 'keep');
        check('baseline-appends', original.result.status, 'journalled');
        const before = await call(a, 'inventory');
        for (const size of [16385, 65537]) {
          const r = await call(a, 'append', Array(size).fill(1));
          check('oversize-' + size, r.result, { status: 'refused', reason: 'oversize' });
          check('oversize-no-nonce-' + size, r.nonceCalls, 0);
        }
        await call(a, 'fault', 'unavailable');
        check('unavailable-does-not-acknowledge', (await call(a, 'append', 'unavailable')).result, {
          status: 'refused',
          reason: 'unavailable',
        });
        await call(a, 'fault', 'quota');
        check('quota-does-not-acknowledge', (await call(a, 'append', 'quota')).result, {
          status: 'refused',
          reason: 'quota',
        });
        check('refusals-preserve-prior-carrier', await call(a, 'inventory'), before);
        const b = await page();
        await call(b, 'fault', 'read-unavailable');
        await call(b, 'open', 'unavailable-open', code);
        check(
          'unavailable-normal-open-refuses',
          (await settled(b, 'unavailable-open')).error?.code,
          'unavailable',
        );
        check(
          'failed-open-clears-wasm',
          (await snapshot(b)).memories.every((m) => m.zero),
          true,
        );
        break;
      }
      case 'C03.watermark': {
        await call(a, 'fillWatermark');
        await recover(a);
        const observed = await call(a, 'observed');
        check(
          'counts-unrelated-utf16-characters',
          observed,
          1024 * 1024 - 100 + 'unrelated'.length,
        );
        const r = await call(a, 'append', 'x'.repeat(200));
        check('character-watermark-refuses', r.result, { status: 'refused', reason: 'quota' });
        check('watermark-precedes-seal', r.nonceCalls, 0);
        await call(a, 'clearUnrelated');
        await recover(a);
        check(
          'rescan-releases-pressure',
          (await call(a, 'append', 'after pressure')).result.status,
          'journalled',
        );
        break;
      }
      case 'C03.actual-quota': {
        await call(a, 'append', 'saved before quota');
        const before = await call(a, 'inventory'),
          quota = await call(a, 'actualQuota');
        check('native-quota-reached', quota.name, 'QuotaExceededError');
        check('native-quota-refuses', (await call(a, 'append', 'x'.repeat(16384))).result, {
          status: 'refused',
          reason: 'quota',
        });
        check('native-quota-retains-saved', await call(a, 'inventory'), before);
        artifacts.push({ point: 'actual-quota', quota });
        break;
      }
      case 'C09.unreadable': {
        for (const type of ['tag', 'legacy', 'unknown', 'generation', 'moved']) {
          // Each malformed-carrier test gets a fresh origin context and custody.
          if (type !== 'tag') {
            await context.close();
            context = await env.browser.newContext();
            await context.route('**/*', (r) =>
              new URL(r.request().url()).origin === env.origin
                ? r.continue()
                : r.abort('blockedbyclient'),
            );
            a = await page();
          }
          let c = code;
          if (type !== 'tag') {
            c = await base(a, 'enroll');
            await base(a, 'initialize', 'init', c);
            await done(a, 'init', true);
            await open(a, c);
          }
          await call(a, 'append', 'kept');
          await call(a, 'tamper', type, c);
          const before = await call(a, 'inventory');
          await call(a, 'recover', 'bad');
          check(
            type + '-refuses-recovery',
            (await settled(a, 'bad')).error?.code,
            'repair-required',
          );
          await call(a, 'flush', 'bad-flush');
          check(
            type + '-refuses-flush',
            (await settled(a, 'bad-flush')).error?.code,
            'repair-required',
          );
          const b = await page();
          await call(b, 'open', 'bad-open', c);
          check(
            type + '-refuses-normal-open',
            (await settled(b, 'bad-open')).error?.code,
            'repair-required',
          );
          check(type + '-preserves-all-bytes', await call(a, 'inventory'), before);
          check(type + '-does-not-write-content', (await base(a, 'counter')).reserved['1'], 0);
        }
        break;
      }
      case 'C09.enumeration-change': {
        await call(a, 'append', 'first');
        await call(a, 'append', 'second');
        // The disappearance is a conforming handoff: both exact payloads already committed to content.
        await call(a, 'batch', 'covered', ['first', 'second']);
        await settled(a, 'covered');
        await call(a, 'fault', 'change-during-read');
        await call(a, 'recover', 'changed');
        check(
          'changed-enumeration-retries-covered-handoff',
          [...new Set(texts((await settled(a, 'changed')).value))].sort(),
          ['first', 'second'],
        );
        check('surviving-entry-kept', Object.keys(await call(a, 'inventory')).length, 1);
        break;
      }
      case 'C11.abort-flush': {
        await call(a, 'append', 'one');
        await call(a, 'append', 'two');
        const before = await call(a, 'inventory');
        await base(a, 'fault', 'abort-content');
        await call(a, 'flush', 'aborted');
        check(
          'content-abort-rejects-flush',
          (await settled(a, 'aborted')).error?.code,
          'storage-failed',
        );
        check('aborted-flush-retains-journal', await call(a, 'inventory'), before);
        check('aborted-encryptions-stay-counted', (await base(a, 'counter')).reserved['1'], 2);
        check('aborted-content-is-empty', (await base(a, 'inventory')).content.length, 0);
        break;
      }
      case 'C11.crash-before-cleanup': {
        await call(a, 'append', 'duplicate-safe');
        const b = await page(),
          cdp = await context.newCDPSession(a);
        await cdp.send('Debugger.enable');
        const paused = new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(Error('Cleanup breakpoint not reached')), 10000);
          cdp.once('Debugger.paused', (value) => {
            clearTimeout(timeout);
            resolve(value);
          });
        });
        await call(a, 'fault', 'pause-cleanup');
        await call(a, 'flush', 'pending');
        await paused;
        check('content-completes-before-cleanup', (await base(b, 'inventory')).content.length, 1);
        check('wal-still-present-after-content', Object.keys(await call(b, 'inventory')).length, 1);
        await crash(a, cdp);
        a = await page();
        await open(a, code);
        check('cold-read-can-contain-both-carriers', texts(await recover(a)), [
          'duplicate-safe',
          'duplicate-safe',
        ]);
        await call(a, 'flush', 'again');
        await done(a, 'again');
        check(
          'repeated-flush-clears-exact-entry',
          Object.keys(await call(a, 'inventory')).length,
          0,
        );
        break;
      }
      case 'C11.changed-entry': {
        const r = await call(a, 'append', 'original');
        await base(a, 'fault', 'gate-sealed');
        await call(a, 'flush', 'pending');
        await gate(a, 'sealed', true);
        const b = await page();
        await call(b, 'tamper', 'changed-valid', code);
        const changed = await call(b, 'inventory');
        await base(a, 'release', 'sealed');
        const result = await done(a, 'pending');
        check('changed-entry-retained', await call(b, 'inventory'), changed);
        check('changed-cleanup-reports-retention', result.retained, 1);
        await open(b, code);
        check('original-and-replacement-recover', texts(await recover(b)), [
          'original',
          'replacement',
        ]);
        check('same-key-is-retained', Object.keys(changed), [r.result.key]);
        break;
      }
      case 'C11.cleanup-refused': {
        await call(a, 'foreign', '1:foreign plaintext');
        await call(a, 'append', 'durable twice');
        const before = await call(a, 'inventory');
        await call(a, 'fault', 'remove-refused');
        await call(a, 'flush', 'retained');
        const result = await done(a, 'retained');
        check(
          'cleanup-refusal-is-not-content-refusal',
          [result.contentReceipts.length, result.removed, result.retained],
          [1, 0, 1],
        );
        check('cleanup-refusal-preserves-wal', await call(a, 'inventory'), before);
        await call(a, 'fault', null);
        await call(a, 'flush', 'retry');
        await done(a, 'retry');
        check('cleanup-can-retry', Object.keys(await call(a, 'inventory')).length, 0);
        check('cleanup-keeps-other-namespace', await call(a, 'foreign'), '1:foreign plaintext');
        break;
      }
      case 'C01.handoff-race': {
        await call(a, 'append', 'between carriers');
        const b = await page();
        await open(b, code);
        await call(a, 'fault', 'gate-recovery');
        await call(a, 'recover', 'captured');
        await gate(a, 'recovery');
        await call(b, 'flush', 'moved');
        await done(b, 'moved');
        check('other-tab-finished-handoff', Object.keys(await call(b, 'inventory')).length, 0);
        await call(a, 'release', 'recovery');
        check('handoff-cannot-fall-between-reads', texts(await done(a, 'captured')), [
          'between carriers',
        ]);
        break;
      }
      case 'C04.close-and-keys': {
        await call(a, 'append', 'retained on close');
        await base(a, 'fault', 'gate-sealed');
        await call(a, 'flush', 'pending');
        await gate(a, 'sealed', true);
        await call(a, 'close', 'closing');
        const b = await page();
        await base(b, 'exclusive', 'exclusive');
        await waitForState(
          b,
          async () => (await navigator.locks.query()).pending.some((l) => l.mode === 'exclusive'),
          undefined,
          OBSERVATION_TIMEOUT_MS,
        );
        check(
          'close-holds-permit-during-flush',
          (await base(b, 'snapshot')).entries.exclusive.status,
          'pending',
        );
        await base(a, 'release', 'sealed');
        check('closed-flush-refuses', (await settled(a, 'pending')).error?.code, 'inactive');
        await done(a, 'closing');
        await done(b, 'exclusive', true);
        check('close-retains-wal', Object.keys(await call(a, 'inventory')).length, 1);
        check(
          'close-erases-wasm-instance',
          (await snapshot(a)).memories.every((m) => m.zero),
          true,
        );
        check('closed-append-refuses', (await call(a, 'append', 'stale')).error?.code, 'inactive');
        await open(b, code);
        check('fresh-factor-reopens-journal', texts(await recover(b)), ['retained on close']);
        break;
      }
      case 'C04.frozen-writer': {
        const b = await page(),
          cdp = await context.newCDPSession(a);
        await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
        await base(b, 'exclusive', 'exclusive');
        await waitForState(
          b,
          async () => (await navigator.locks.query()).pending.some((l) => l.mode === 'exclusive'),
          undefined,
          OBSERVATION_TIMEOUT_MS,
        );
        check(
          'frozen-writer-blocks-exclusive',
          (await base(b, 'snapshot')).entries.exclusive.status,
          'pending',
        );
        await cdp.send('Page.setWebLifecycleState', { state: 'active' });
        check(
          'resumed-cached-writer-appends',
          (await call(a, 'append', 'after freeze')).result.status,
          'journalled',
        );
        await crash(a, cdp);
        await done(b, 'exclusive', true);
        await open(b, code);
        check('late-frozen-writer-work-recovers', texts(await recover(b)), ['after freeze']);
        schedule.push(
          'Real CDP frozen/active lifecycle while another context waits for the slot exclusive permit',
        );
        break;
      }
      case 'C04.concurrent-writers': {
        const b = await page();
        await open(b, code);
        await Promise.all([call(a, 'appendMany', 25), call(b, 'appendMany', 25)]);
        check(
          'separate-writers-never-overwrite',
          Object.keys(await call(a, 'inventory')).length,
          50,
        );
        await base(a, 'fault', 'gate-sealed');
        await call(a, 'flush', 'first');
        await gate(a, 'sealed', true);
        const late = await call(b, 'append', 'late suffix');
        await base(a, 'release', 'sealed');
        await done(a, 'first');
        check('flush-retains-late-suffix', Object.keys(await call(b, 'inventory')), [
          late.result.key,
        ]);
        await call(b, 'flush', 'second');
        await done(b, 'second');
        check('all-content-survives-two-flushes', (await base(a, 'inventory')).content.length, 51);
        break;
      }
      case 'C11.chunked-flush': {
        const writes = await call(a, 'appendMany', 300);
        check(
          'more-than-one-batch-journalled',
          writes.filter((r) => r.status === 'journalled').length,
          300,
        );
        await call(a, 'fault', 'abort-second-chunk');
        await call(a, 'flush', 'partial');
        check(
          'second-chunk-abort-refuses',
          (await settled(a, 'partial')).error?.code,
          'storage-failed',
        );
        check(
          'only-completed-chunk-clears',
          [
            Object.keys(await call(a, 'inventory')).length,
            (await base(a, 'inventory')).content.length,
          ],
          [44, 256],
        );
        check(
          'failed-second-chunk-reservations-retained',
          (await base(a, 'counter')).reserved['1'],
          300,
        );
        await call(a, 'flush', 'retry');
        const r = await done(a, 'retry');
        check(
          'retry-reserves-exact-suffix',
          r.contentReceipts.map((r) => [r.sequences.length, r.sequences[0]]),
          [[44, 301]],
        );
        check(
          'retry-clears-remaining-chunk',
          [r.removed, r.retained, Object.keys(await call(a, 'inventory')).length],
          [44, 0, 0],
        );
        check('all-chunks-content-count', (await base(a, 'inventory')).content.length, 300);
        break;
      }
      case 'C03.host-smoke': {
        const measured = await call(a, 'measure');
        artifacts.push({ point: 'host-append-timing', ...measured });
        check(
          'full-path-completes-for-each-payload',
          measured.samples.map((s) => [s.size, s.n]),
          [
            [18, 20],
            [419, 20],
            [4096, 20],
            [16384, 20],
          ],
        );
        check(
          'measurement-appends-distinct-carriers',
          Object.keys(await call(a, 'inventory')).length,
          80,
        );
        schedule.push(
          '20 unthrottled timings per payload, actual distinct setItem writes; coarse non-isolated clock, no population p95 conclusion',
        );
        break;
      }
      default:
        throw Error('Unknown case');
    }
    for (const p of context.pages())
      if (!p.isClosed()) artifacts.push({ point: 'final', snapshot: await snapshot(p) });
    status = assertions.length && assertions.every((a) => a.passed) ? 'pass' : 'fail';
  } catch (cause) {
    status = 'error';
    error = { message: cause.message, stack: cause.stack };
  } finally {
    await context?.close();
  }
  if (pageErrors.length) {
    status = 'error';
    error = { message: pageErrors.join('; ') };
  }
  return {
    id: definition.id,
    title: definition.title,
    assertions,
    status,
    schedule,
    artifacts,
    error,
  };
}
