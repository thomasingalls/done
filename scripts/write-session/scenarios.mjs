import { waitForState } from '../storage-conformance/observe.mjs';
const OBSERVATION_TIMEOUT_MS = 8000;
import { isDeepStrictEqual } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

export async function runCase(definition, env) {
  const pageErrors = [];
  const assertions = [],
    schedule = [],
    artifacts = [],
    pages = [];
  const check = (id, actual, expected) => {
    const passed = isDeepStrictEqual(actual, expected);
    assertions.push({ id, actual, expected, passed });
    return passed;
  };
  const context = await env.browser.newContext();
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === env.origin
      ? route.continue()
      : route.abort('blockedbyclient'),
  );
  const call = async (page, method, ...args) => {
    let timer;
    try {
      return await Promise.race([
        page.evaluate(({ method, args }) => window.lifecycle[method](...args), { method, args }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Error('Timed out: ' + method)), 8000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  const page = async () => {
    const p = await context.newPage();
    p.on('pageerror', (error) => pageErrors.push(error.message));
    pages.push(p);
    p.setDefaultTimeout(OBSERVATION_TIMEOUT_MS);
    await p.goto(env.url);
    await waitForState(p, () => Boolean(window.lifecycle), undefined, OBSERVATION_TIMEOUT_MS);
    return p;
  };
  const state = async (p, id) => (await call(p, 'snapshot')).entries[id];
  const settled = async (p, id, operation) => {
    await waitForState(
      p,
      ({ id, operation }) => {
        const status = window.lifecycle.snapshot().entries[id]?.operations[operation]?.status;
        return status && status !== 'pending';
      },
      { id, operation },
      OBSERVATION_TIMEOUT_MS,
    );
    return (await state(p, id)).operations[operation];
  };
  const done = async (p, id, operation) => {
    const result = await settled(p, id, operation);
    if (result.status !== 'resolved')
      throw Error(`Unexpected ${id}/${operation} refusal: ${JSON.stringify(result.error)}`);
    return result;
  };
  const open = async (p, id, slot = 'slot', flags = {}) => {
    await call(p, 'open', id, slot, flags);
    await done(p, id, 'open');
  };
  const close = async (p, id) => {
    await call(p, 'close', id);
    await done(p, id, 'close');
  };
  const gate = async (p, name) =>
    waitForState(
      p,
      (name) => window.lifecycle.snapshot().gates.includes(name),
      name,
      OBSERVATION_TIMEOUT_MS,
    );
  const entered = async (p, id) =>
    waitForState(
      p,
      (id) => window.lifecycle.snapshot().entries[id]?.entered,
      id,
      OBSERVATION_TIMEOUT_MS,
    );
  // Await the predicate itself. A Promise returned inside Playwright's page
  // polling callback can be truthy before the native query has returned false.
  const until = async (predicate) => {
    const deadline = Date.now() + 8000;
    do {
      if (await predicate()) return;
      await delay(10);
    } while (Date.now() < deadline);
    throw Error('Timed out waiting for native lock observation');
  };
  const queuedOrEntered = (p, id) =>
    until(
      async () =>
        (await state(p, id)).entered ||
        (await call(p, 'locks')).pending.some((l) => l.mode === 'exclusive'),
    );
  const sharedQueued = (p) =>
    until(async () => (await call(p, 'locks')).pending.some((l) => l.mode === 'shared'));
  const crash = async (p) => {
    artifacts.push({
      point: 'before-renderer-crash',
      snapshot: await call(p, 'snapshot'),
      locks: await call(p, 'locks'),
    });
    const cdp = await context.newCDPSession(p),
      died = p.waitForEvent('crash');
    void cdp.send('Page.crash').catch(() => {});
    await died;
    await p.close();
    schedule.push('CDP Page.crash; no graceful close or unload flush');
  };
  try {
    const a = await page(),
      b = await page();
    switch (definition.id) {
      case 'C04.shared-scope': {
        await open(a, 'a');
        await open(b, 'b');
        const locks = await call(a, 'locks'),
          name = await call(a, 'name', 'slot');
        check(
          'two-shared-holders',
          locks.held.filter((l) => l.name === name && l.mode === 'shared').length,
          2,
        );
        await call(b, 'exclusive', 'x', 'slot', { hold: true });
        await queuedOrEntered(b, 'x');
        await open(a, 'other', 'other-slot');
        check('other-slot-is-independent', (await state(a, 'other')).state, 'active');
        await close(a, 'a');
        await close(b, 'b');
        await entered(b, 'x');
        await call(b, 'release', 'x:exclusive');
        await done(b, 'x', 'exclusive');
        schedule.push(
          'Two tabs acquire shared permits; other slot opens while same-slot exclusive waits',
        );
        break;
      }
      case 'C04.freeze-barrier': {
        await open(a, 'a');
        await open(b, 'b');
        const cdp = await context.newCDPSession(a);
        await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
        try {
          await call(b, 'exclusive', 'x', 'slot', { hold: true });
          await queuedOrEntered(b, 'x');
          if (!check('frozen-writer-blocks-exclusive', (await state(b, 'x')).entered, false)) break;
          await close(b, 'b');
          check('closing-one-writer-is-insufficient', (await state(b, 'x')).entered, false);
          check(
            'frozen-shared-permit-remains',
            (await call(b, 'locks')).held.filter((l) => l.mode === 'shared').length,
            1,
          );
        } finally {
          await cdp.send('Page.setWebLifecycleState', { state: 'active' });
        }
        check('resume-keeps-session-active', (await state(a, 'a')).state, 'active');
        check('resumed-writer-can-write', await call(a, 'write', 'a'), 'wrote');
        await close(a, 'a');
        await entered(b, 'x');
        await call(a, 'open', 'fresh');
        await sharedQueued(a);
        check('exclusive-blocks-key-initialization', (await state(a, 'fresh')).initializations, 0);
        await call(b, 'release', 'x:exclusive');
        await done(b, 'x', 'exclusive');
        await done(a, 'fresh', 'open');
        check('fresh-initialization-after-grant', (await state(a, 'fresh')).initializations, 1);
        schedule.push(
          'Freeze A; queue exclusive; close B; resume/close A; attempt initialization under exclusive',
        );
        break;
      }
      case 'C04.drain-cleanup': {
        await open(a, 'a', 'slot', { disposeGate: true });
        await call(a, 'abortReentry', 'a');
        await call(a, 'block', 'a');
        await gate(a, 'a:work');
        await call(a, 'close', 'a');
        check('close-disables-immediately', (await state(a, 'a')).state, 'closing');
        check('abort-handler-cannot-write', (await state(a, 'a')).abortWrite, 'inactive');
        await call(b, 'exclusive', 'x');
        await queuedOrEntered(b, 'x');
        check('work-blocks-exclusive', (await state(b, 'x')).entered, false);
        await call(a, 'release', 'a:work');
        await settled(a, 'a', 'work');
        // The cleanup-removal mutant skips the gate; observe either gate or completed close.
        await waitForState(
          a,
          () => {
            const s = window.lifecycle.snapshot();
            return s.gates.includes('a:dispose') || s.entries.a.state === 'closed';
          },
          undefined,
          OBSERVATION_TIMEOUT_MS,
        );
        check('closing-callback-cannot-write', (await call(a, 'snapshot')).writes, []);
        if ((await call(a, 'snapshot')).gates.includes('a:dispose')) {
          check('cleanup-blocks-exclusive', (await state(b, 'x')).entered, false);
          await call(a, 'release', 'a:dispose');
        }
        await done(a, 'a', 'close');
        await entered(b, 'x');
        check('cache-cleared-before-exclusive', (await state(a, 'a')).hasCache, false);
        check('closed-session-refuses-writes', await call(a, 'write', 'a'), 'inactive');
        await close(a, 'a');
        check('cleanup-runs-once', (await state(a, 'a')).disposals, 1);
        schedule.push(
          'Pause work, close synchronously, attempt abort reentry, release work, pause cache disposal',
        );
        break;
      }
      case 'C04.detached-work': {
        await open(a, 'a');
        await call(a, 'block', 'a', true);
        await gate(a, 'a:work');
        await done(a, 'a', 'work');
        await call(a, 'close', 'a');
        await call(b, 'exclusive', 'x');
        await queuedOrEntered(b, 'x');
        check('detached-work-blocks-exclusive', (await state(b, 'x')).entered, false);
        await call(a, 'release', 'a:work');
        await done(a, 'a', 'close');
        await entered(b, 'x');
        const snapshot = await call(a, 'snapshot');
        const released = snapshot.events.findIndex(
          (e) => e.kind === 'gate-release' && e.name === 'a:work',
        );
        const disposed = snapshot.events.findIndex(
          (e) => e.kind === 'dispose-start' && e.id === 'a',
        );
        // The competing renderer can run late after an illegal release. This
        // local event order detects skipped draining regardless of that delay.
        check('detached-work-precedes-disposal', released >= 0 && disposed > released, true);
        artifacts.push({ point: 'detached-work-drain-order', snapshot });
        check('detached-task-did-not-write', (await call(a, 'snapshot')).writes, []);
        schedule.push(
          'Task returns without awaiting a registered wait; close must still drain that wait',
        );
        break;
      }
      case 'C04.stale-task': {
        await open(a, 'old');
        await call(a, 'save', 'old');
        check('finished-task-cannot-write', await call(a, 'invokeSaved', 'old'), 'inactive');
        await close(a, 'old');
        await call(b, 'exclusive', 'x', 'slot', { generation: 2 });
        await done(b, 'x', 'exclusive');
        await open(a, 'fresh');
        check('reacquisition-rereads-generation', (await state(a, 'fresh')).generation, 2);
        check('old-session-stays-closed', (await state(a, 'old')).state, 'closed');
        check('old-callback-not-revived', await call(a, 'invokeSaved', 'old'), 'inactive');
        check('fresh-session-can-write', await call(a, 'write', 'fresh'), 'wrote');
        check('only-fresh-generation-written', (await call(a, 'snapshot')).writes, [2]);
        schedule.push(
          'Retain a task callback; finish task; close; change synthetic durable generation under exclusive; reopen',
        );
        break;
      }
      case 'C04.cancel-queued': {
        schedule.push(
          'Hold exclusive; queue a writer; abort before grant; release exclusive and acquire afresh',
        );
        await call(b, 'exclusive', 'x', 'slot', { hold: true });
        await entered(b, 'x');
        await call(a, 'open', 'a');
        await sharedQueued(a);
        await call(a, 'abort', 'a');
        check(
          'queued-acquisition-cancelled',
          (await settled(a, 'a', 'open')).error?.code,
          'cancelled',
        );
        check('cancelled-request-never-initializes', (await state(a, 'a')).initializations, 0);
        check('uninitialized-request-needs-no-disposal', (await state(a, 'a')).disposals, 0);
        await call(b, 'release', 'x:exclusive');
        await done(b, 'x', 'exclusive');
        await open(a, 'fresh');
        check('cancelled-request-does-not-block-reopen', (await state(a, 'fresh')).state, 'active');
        break;
      }
      case 'C04.cancel-initialize': {
        schedule.push(
          'Grant shared permit and pause initialization; abort; queue exclusive; resume initializer and require cleanup',
        );
        await call(a, 'open', 'a', 'slot', { initializeGate: true });
        await gate(a, 'a:initialize');
        await call(a, 'abort', 'a');
        await call(b, 'exclusive', 'x');
        await queuedOrEntered(b, 'x');
        check('cancelled-initialization-still-pins-work', (await state(b, 'x')).entered, false);
        await call(a, 'release', 'a:initialize');
        check(
          'cancelled-initialization-refuses-open',
          (await settled(a, 'a', 'open')).status,
          'rejected',
        );
        await entered(b, 'x');
        check('cancelled-initialization-clears-cache', (await state(a, 'a')).hasCache, false);
        check('partial-initialization-disposed-once', (await state(a, 'a')).disposals, 1);
        break;
      }
      case 'C04.initialize-error': {
        schedule.push(
          'Reject the initializer; require cleanup before a subsequent exclusive acquisition',
        );
        await call(a, 'open', 'a', 'slot', { initializeFail: true });
        check(
          'initialization-error-refuses-open',
          (await settled(a, 'a', 'open')).status,
          'rejected',
        );
        check('failed-initialization-disposes', (await state(a, 'a')).disposals, 1);
        check(
          'failed-initializer-had-loaded-key',
          (await call(a, 'snapshot')).events.some((e) => e.kind === 'cache-loaded' && e.id === 'a'),
          true,
        );
        check('failed-initializer-clears-loaded-key', (await state(a, 'a')).hasCache, false);
        await call(b, 'exclusive', 'x');
        await done(b, 'x', 'exclusive');
        check('failed-initialization-releases-permit', (await state(b, 'x')).entered, true);
        break;
      }
      case 'C04.cleanup-error': {
        schedule.push(
          'Reject cache disposal; require disabled writes and a retained permit until renderer death',
        );
        await open(a, 'a', 'slot', { disposeFail: true });
        await call(a, 'close', 'a');
        check(
          'cleanup-failure-reported',
          (await settled(a, 'a', 'close')).error?.code,
          'cleanup-failed',
        );
        check('failed-session-disabled', await call(a, 'write', 'a'), 'inactive');
        await call(b, 'exclusive', 'x');
        await queuedOrEntered(b, 'x');
        check('failed-cleanup-retains-permit', (await state(b, 'x')).entered, false);
        await crash(a);
        await entered(b, 'x');
        check('dead-runtime-no-longer-holds-capability', (await state(b, 'x')).entered, true);
        break;
      }
      case 'C04.renderer-death': {
        await open(a, 'a');
        await call(b, 'exclusive', 'x');
        await queuedOrEntered(b, 'x');
        check('live-writer-blocks-exclusive', (await state(b, 'x')).entered, false);
        await crash(a);
        await done(b, 'x', 'exclusive');
        check('renderer-death-releases-permit', (await state(b, 'x')).entered, true);
        break;
      }
      case 'C04.worker-lifetime': {
        schedule.push(
          'Worker blocks tab-exclusive; graceful close releases; a second worker session releases only after termination',
        );
        await call(a, 'worker', 'open', 'worker');
        await until(
          async () => (await call(a, 'worker', 'snapshot')).entries.worker?.state === 'active',
        );
        await call(b, 'exclusive', 'x');
        await queuedOrEntered(b, 'x');
        check('worker-blocks-tab-exclusive', (await state(b, 'x')).entered, false);
        await call(a, 'worker', 'close', 'worker');
        await done(b, 'x', 'exclusive');
        await until(
          async () => (await call(a, 'worker', 'snapshot')).entries.worker?.state === 'closed',
        );
        check(
          'worker-cleanup-clears-cache',
          (await call(a, 'worker', 'snapshot')).entries.worker.hasCache,
          false,
        );
        await call(a, 'worker', 'open', 'second');
        await until(
          async () => (await call(a, 'worker', 'snapshot')).entries.second?.state === 'active',
        );
        await call(b, 'exclusive', 'y');
        await queuedOrEntered(b, 'y');
        check('second-worker-session-blocks', (await state(b, 'y')).entered, false);
        artifacts.push({
          point: 'before-worker-termination',
          snapshot: await call(a, 'worker', 'snapshot'),
        });
        await call(a, 'terminateWorker');
        await done(b, 'y', 'exclusive');
        check('worker-termination-releases-permit', (await state(b, 'y')).entered, true);
        break;
      }
      case 'C04.exclusive-error': {
        schedule.push(
          'Hold exclusive and queue writer; throw from exclusive operation; dispose cache before writer initializes',
        );
        await call(a, 'exclusive', 'x', 'slot', { hold: true, fail: true });
        await entered(a, 'x');
        await call(b, 'open', 'b');
        await sharedQueued(b);
        check(
          'exclusive-error-case-blocks-initialization',
          (await state(b, 'b')).initializations,
          0,
        );
        await call(a, 'release', 'x:exclusive');
        check(
          'exclusive-error-propagates',
          (await settled(a, 'x', 'exclusive')).error?.message,
          'Injected exclusive operation failure',
        );
        await done(b, 'b', 'open');
        check('exclusive-error-disposes-cache', (await state(a, 'x')).hasCache, false);
        check('writer-proceeds-after-exclusive-error', (await state(b, 'b')).state, 'active');
        break;
      }
      case 'C04.navigation': {
        await open(a, 'old');
        await call(a, 'save', 'old');
        await a.goto(env.url + '?away');
        await waitForState(a, () => Boolean(window.lifecycle), undefined, OBSERVATION_TIMEOUT_MS);
        // A BFCache restore commits navigation without a new load event. Wait for
        // that boundary, then verify the restored/new document and its capability below.
        await a.goBack({ waitUntil: 'commit' });
        await waitForState(a, () => Boolean(window.lifecycle), undefined, OBSERVATION_TIMEOUT_MS);
        const restored = (await call(a, 'snapshot')).entries.old;
        check(
          'navigation-does-not-revive-session',
          restored?.state ?? 'new-document',
          restored ? 'closed' : 'new-document',
        );
        if (restored)
          check('restored-callback-refused', await call(a, 'invokeSaved', 'old'), 'inactive');
        await call(b, 'exclusive', 'x');
        await done(b, 'x', 'exclusive');
        check('navigation-releases-old-permit', (await state(b, 'x')).entered, true);
        schedule.push(
          restored
            ? 'Browser restored old document with closed capability'
            : 'Browser created a new document; BFCache restoration not observed',
        );
        break;
      }
      default:
        throw Error('Unknown lifecycle case');
    }
    return {
      ...definition,
      status: assertions.every((a) => a.passed) ? 'pass' : 'fail',
      assertions,
      schedule,
      artifacts,
    };
  } catch (error) {
    return {
      ...definition,
      status: 'error',
      assertions,
      schedule,
      artifacts,
      error: { message: error.message, stack: error.stack },
    };
  } finally {
    for (const [i, p] of pages.entries())
      if (!p.isClosed()) {
        try {
          artifacts.push({
            point: `page-${i}-final`,
            snapshot: await call(p, 'snapshot'),
            locks: await call(p, 'locks'),
          });
        } catch (error) {
          artifacts.push({ point: `page-${i}-unavailable`, error: error.message });
        }
      }
    artifacts.push({ point: 'unexpected-page-errors', errors: pageErrors });
    await context.close();
  }
}
