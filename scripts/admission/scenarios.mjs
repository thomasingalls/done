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
    p.evaluate(({ method, args }) => window.admission[method](...args), { method, args });
  const base = (p, method, ...args) =>
    p.evaluate(({ method, args }) => window.content[method](...args), { method, args });
  const journal = (p, method, ...args) =>
    p.evaluate(({ method, args }) => window.journal[method](...args), { method, args });
  const snapshot = (p) => call(p, 'snapshot');
  const page = async () => {
    const p = await context.newPage();
    p.setDefaultTimeout(10000);
    p.on('pageerror', (e) => pageErrors.push(e.message));
    await p.goto(env.url);
    await p.waitForFunction(() => window.admission);
    return p;
  };
  const settled = async (p, id, isBase = false) => {
    await p.waitForFunction(
      ({ id, isBase }) =>
        ['resolved', 'rejected'].includes(
          (isBase ? window.content : window.admission).snapshot().entries[id]?.status,
        ),
      { id, isBase },
    );
    return (isBase ? await base(p, 'snapshot') : await snapshot(p)).entries[id];
  };
  const done = async (p, id, isBase = false) => {
    const r = await settled(p, id, isBase);
    if (r.status !== 'resolved') throw Error('Unexpected refusal ' + id + ': ' + JSON.stringify(r));
    return r.value;
  };
  const open = async (p, code, id = 's') => {
    await call(p, 'open', id, code);
    await done(p, id);
  };
  const gate = (p) => p.waitForFunction(() => window.content.snapshot().gates.includes('sealed'));
  const blocked = (p) =>
    p.waitForFunction(() => window.admission.snapshot().sessions.s.status.state === 'blocked');
  const crash = async (p) => {
    const cdp = await context.newCDPSession(p),
      died = p.waitForEvent('crash');
    void cdp.send('Page.crash').catch(() => {});
    await died;
    await p.close();
    schedule.push('Actual Page.crash without graceful close');
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
      case 'C01.pending-struct': {
        const [basis, dependent] = await call(a, 'structs');
        await call(a, 'receive', 'dependent', dependent);
        await done(a, 'dependent');
        check('unresolved-remote-invisible', (await snapshot(a)).sessions.s.visible, '');
        check('unresolved-bytes-committed', (await base(a, 'inventory')).content.length, 1);
        await call(a, 'submit', 'local', 'X');
        await done(a, 'local');
        await crash(a);
        a = await page();
        await open(a, code);
        check('local-recovers-before-missing-basis', (await snapshot(a)).sessions.s.visible, 'X');
        await call(a, 'receive', 'basis', basis);
        await done(a, 'basis');
        const recovered = (await snapshot(a)).sessions.s.visible;
        check(
          'pending-struct-integrates-after-recovery',
          [recovered.replace('X', ''), recovered.length],
          ['RL', 3],
        );
        break;
      }
      case 'C03.synchronous': {
        const r = await call(a, 'submit', 'local', 'A');
        check('accepted-before-handler-return', r.sessions.s.visible, 'A');
        check('projection-matches-accepted', r.sessions.s.projection, 'A');
        check(
          'local-publication',
          r.events.map((e) => e.source),
          ['local'],
        );
        check('journal-already-stored', Object.keys(await journal(a, 'inventory')).length, 1);
        check('content-still-empty', (await base(a, 'inventory')).content.length, 0);
        await crash(a);
        a = await page();
        await open(a, code);
        check('cold-acknowledged-replay', (await snapshot(a)).sessions.s.visible, 'A');
        break;
      }
      case 'C03.ordered-refusal': {
        await journal(a, 'fault', 'quota');
        await base(a, 'fault', 'gate-sealed');
        await call(a, 'submit', 'first', 'A');
        await gate(a);
        await call(a, 'submit', 'second', 'B');
        const r = await snapshot(a);
        if (!check('refused-prefix-is-private', r.sessions.s.visible, '')) break;
        if (!check('only-head-prepared', r.prepared.length, 1)) break;
        check(
          'projection-and-publication-private',
          [r.sessions.s.projection, r.events.length],
          ['', 0],
        );
        check(
          'both-tickets-pending',
          [r.entries.first.status, r.entries.second.status],
          ['pending', 'pending'],
        );
        check('journal-empty', Object.keys(await journal(a, 'inventory')).length, 0);
        await crash(a);
        a = await page();
        await open(a, code);
        check('unacknowledged-input-not-recovered', (await snapshot(a)).sessions.s.visible, '');
        break;
      }
      case 'C03.retry': {
        await journal(a, 'fault', 'quota');
        await base(a, 'fault', 'abort-content');
        await call(a, 'submit', 'first', 'A');
        await blocked(a);
        await call(a, 'submit', 'second', 'B');
        let r = await snapshot(a);
        check('failed-prefix-still-private', r.sessions.s.visible, '');
        check('suffix-not-prepared', r.prepared.length, 1);
        check('aborted-invocation-counted', (await base(a, 'counter')).reserved['1'], 1);
        await call(a, 'retry');
        await done(a, 'first');
        await done(a, 'second');
        r = await snapshot(a);
        if (
          !check(
            'retry-forces-second-content-invocation',
            (await base(a, 'counter')).reserved['1'],
            2,
          )
        )
          break;
        check(
          'preparation-sees-accepted-predecessor',
          r.prepared.map((p) => p.before),
          ['', 'A'],
        );
        check('ordered-result', r.sessions.s.visible, 'AB');
        await call(a, 'durable', 'durable');
        await done(a, 'durable');
        await crash(a);
        a = await page();
        await open(a, code);
        check('cold-retry-result', (await snapshot(a)).sessions.s.visible, 'AB');
        break;
      }
      case 'C01.remote-basis': {
        const p = await base(a, 'yjsProbe');
        await base(a, 'fault', 'gate-sealed');
        await call(a, 'receive', 'remote', p.updates[0]);
        await gate(a);
        let r = await snapshot(a);
        if (!check('remote-is-private-until-commit', r.sessions.s.visible, '')) break;
        check('remote-no-publication', r.events.length, 0);
        await base(a, 'release', 'sealed');
        await done(a, 'remote');
        await call(a, 'receive', 'delete', p.updates[1]);
        await done(a, 'delete');
        await call(a, 'submit', 'local', 'L');
        await done(a, 'local');
        r = await snapshot(a);
        check(
          'remote-events-follow-content',
          r.events.filter((e) => e.source === 'remote').map((e) => e.commits),
          [1, 2],
        );
        const expected = 'R'.repeat(17 * 1024 - 13) + 'L';
        check('dependent-local-result', r.sessions.s.visible, expected);
        await crash(a);
        a = await page();
        await open(a, code);
        check('offline-without-redelivery', (await snapshot(a)).sessions.s.visible, expected);
        break;
      }
      case 'C02.pending-delete': {
        const [insert, remove] = await call(a, 'deletes');
        await call(a, 'receive', 'remove', remove);
        await done(a, 'remove');
        check('delete-bytes-persisted', (await base(a, 'inventory')).content.length, 1);
        await call(a, 'submit', 'local', 'L');
        await done(a, 'local');
        await crash(a);
        a = await page();
        await open(a, code);
        await call(a, 'receive', 'insert', insert);
        await done(a, 'insert');
        check('pending-delete-survives-recovery', (await snapshot(a)).sessions.s.visible, 'L');
        break;
      }
      case 'C03.slicing': {
        await call(a, 'mode', 'slice');
        await call(a, 'afterFirstGate');
        await call(a, 'submit', 'paste', 'P'.repeat(2500));
        await gate(a);
        const r = await snapshot(a);
        check('only-first-slice-visible', r.sessions.s.visible.length, 1000);
        check('only-first-slice-committed', (await base(a, 'inventory')).content.length, 1);
        check('ticket-awaits-rest', r.entries.paste.status, 'pending');
        check(
          'second-prepares-after-first',
          r.prepared.map((p) => p.before.length),
          [0, 1000],
        );
        await crash(a);
        a = await page();
        await open(a, code);
        check('cold-prefix-length', (await snapshot(a)).sessions.s.visible.length, 1000);
        break;
      }
      case 'C03.capacity': {
        await journal(a, 'fault', 'quota');
        await base(a, 'fault', 'gate-sealed');
        await call(a, 'submit', 'first', 'A');
        await gate(a);
        const r = await call(a, 'capacity');
        if (!check('byte-capacity-refuses', r.code, 'queue-full')) break;
        check('pending-input-retained', (await snapshot(a)).sessions.s.status.pendingItems, 1);
        await base(a, 'release', 'sealed');
        await done(a, 'first');
        check('retained-input-completes', (await snapshot(a)).sessions.s.visible, 'A');
        break;
      }
      case 'C03.barrier': {
        await journal(a, 'fault', 'quota');
        await base(a, 'fault', 'gate-sealed');
        await call(a, 'submit', 'first', 'A');
        await gate(a);
        await call(a, 'durable', 'barrier');
        await call(a, 'submit', 'second', 'B');
        const r = await snapshot(a);
        if (!check('barrier-waits-for-prior-input', r.entries.barrier.status, 'pending')) break;
        await base(a, 'release', 'sealed');
        await done(a, 'barrier');
        await done(a, 'second');
        check('prefix-in-content', (await base(a, 'inventory')).content.length, 1);
        check('later-suffix-journalled', Object.keys(await journal(a, 'inventory')).length, 1);
        await call(a, 'durable', 'last');
        await done(a, 'last');
        check('strong-boundary-completes', (await snapshot(a)).sessions.s.status.durable, true);
        break;
      }
      case 'C03.timer': {
        await call(a, 'submit', 'local', 'A');
        check('initially-journal-only', (await snapshot(a)).sessions.s.status.durable, false);
        await a.waitForFunction(() => window.admission.snapshot().sessions.s.status.durable);
        check('timer-committed', (await base(a, 'inventory')).content.length, 1);
        check('timer-cleaned', Object.keys(await journal(a, 'inventory')).length, 0);
        break;
      }
      case 'C04.close': {
        await journal(a, 'fault', 'quota');
        await base(a, 'fault', 'gate-sealed');
        await call(a, 'submit', 'local', 'A');
        await gate(a);
        await call(a, 'close', 'closed');
        const b = await page();
        await base(b, 'exclusive', 'exclusive');
        await b.waitForTimeout(100);
        check('exclusion-waits', (await base(b, 'snapshot')).entries.exclusive.status, 'pending');
        check('late-ticket-refused', (await settled(a, 'local')).error.code, 'inactive-session');
        await base(a, 'release', 'sealed');
        await done(a, 'closed');
        await done(b, 'exclusive', true);
        const r = await snapshot(a);
        check('no-late-publication', r.events.length, 0);
        check(
          'all-wasm-memory-cleared',
          r.storage.memories.every((m) => m.zero),
          true,
        );
        check('late-content-refused', (await base(a, 'inventory')).content.length, 0);
        break;
      }
      case 'C09.persisted-yjs': {
        await call(a, 'close', 'closed');
        await done(a, 'closed');
        await base(a, 'open', 'raw', code);
        await done(a, 'raw', true);
        await base(a, 'append', 'bad', 'raw', [{ bytes: [255] }]);
        await done(a, 'bad', true);
        await base(a, 'close', 'raw-closed', 'raw');
        await done(a, 'raw-closed', true);
        await call(a, 'open', 'bad-open', code);
        check(
          'malformed-yjs-refuses-open',
          (await settled(a, 'bad-open')).error.code,
          'repair-required',
        );
        check('malformed-record-retained', (await base(a, 'inventory')).content.length, 1);
        check(
          'failed-open-clears-wasm',
          (await snapshot(a)).storage.memories.every((m) => m.zero),
          true,
        );
        break;
      }
      case 'C09.runtime-repair': {
        await call(a, 'submit', 'local', 'A');
        await journal(a, 'tamper', 'legacy', code);
        await call(a, 'durable', 'failed');
        await settled(a, 'failed');
        await blocked(a);
        const r = await snapshot(a);
        check('repair-disables-ordinary-snapshot', r.sessions.s.visible.code, 'repair-required');
        check('discard-cannot-mask-repair', (await call(a, 'discard')).code, 'repair-required');
        check('unreadable-carrier-retained', Object.values(await journal(a, 'inventory')), [
          '1:plaintext legacy',
        ]);
        break;
      }
      case 'C03.validation': {
        await call(a, 'rejectReceive', true);
        const p = await base(a, 'yjsProbe');
        await call(a, 'receive', 'unauthorized', p.updates[0]);
        check(
          'authority-refusal',
          (await settled(a, 'unauthorized')).error.code,
          'receive-refused',
        );
        await call(a, 'rejectReceive', false);
        await call(a, 'receive', 'malformed', [255]);
        check('syntax-refusal', (await settled(a, 'malformed')).error.code, 'receive-refused');
        check('invalid-input-never-persisted', (await base(a, 'inventory')).content.length, 0);
        await call(a, 'submit', 'valid', 'A');
        await done(a, 'valid');
        check('valid-successor-accepted', (await snapshot(a)).sessions.s.visible, 'A');
        break;
      }
      case 'C04.cross-tab': {
        let b = await page();
        await open(b, code);
        await call(a, 'submit', 'local', 'A');
        const wire = (await snapshot(a)).events[0].bytes;
        await base(b, 'fault', 'gate-sealed');
        await call(b, 'receive', 'cross', wire);
        await gate(b);
        await call(b, 'submit', 'dependent', 'B');
        const waiting = await snapshot(b);
        check('cross-tab-prefix-is-private', waiting.sessions.s.visible, '');
        check('cross-tab-dependent-is-unprepared', waiting.prepared.length, 0);
        await base(b, 'release', 'sealed');
        await done(b, 'cross');
        await done(b, 'dependent');
        check('cross-tab-local-result', (await snapshot(b)).sessions.s.visible, 'AB');
        await crash(b);
        b = await page();
        await open(b, code);
        check('cold-cross-tab-result', (await snapshot(b)).sessions.s.visible, 'AB');
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
