import { isDeepStrictEqual } from 'node:util';
export async function runCase(definition, env) {
  const assertions = [],
    schedule = [],
    artifacts = [],
    errors = [];
  let context,
    status = 'error',
    error;
  const check = (id, actual, expected) =>
    assertions.push({ id, actual, expected, passed: isDeepStrictEqual(actual, expected) });
  const call = (p, method, ...args) =>
    p.evaluate(({ method, args }) => window.genesis[method](...args), { method, args });
  const page = async () => {
    const p = await context.newPage();
    p.setDefaultTimeout(15000);
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(env.url);
    await p.waitForFunction(() => window.genesis, undefined, { polling: 25 });
    return p;
  };
  const settled = async (p, id) => {
    try {
      await p.waitForFunction(
        (id) => ['resolved', 'rejected'].includes(window.genesis.snapshot().entries[id]?.status),
        id,
        { polling: 25 },
      );
    } catch (cause) {
      artifacts.push({
        kind: 'settled-timeout',
        id,
        snapshot: await call(p, 'snapshot'),
        locks: await call(p, 'locks'),
      });
      throw cause;
    }
    return (await call(p, 'snapshot')).entries[id];
  };
  const gate = (p, name) =>
    p.waitForFunction((name) => window.genesis.snapshot().gates.includes(name), name, {
      polling: 25,
    });
  const crash = async (p) => {
    const cdp = await context.newCDPSession(p),
      dead = p.waitForEvent('crash');
    void cdp.send('Page.crash').catch(() => {});
    await dead;
    await p.close();
    schedule.push('Actual renderer death, without graceful close');
  };
  const create = async (p, slot = 'local-slot', id = 'create') => {
    const code = await call(p, 'begin', slot);
    await call(p, 'confirm', id, code);
    const result = await settled(p, id);
    if (result.status !== 'resolved') throw Error(JSON.stringify(result));
    return { code, receipt: result.value };
  };
  const open = async (p, code, slot = 'local-slot', id = 'open') => {
    await call(p, 'open', id, slot, code);
    return (await settled(p, id)).value;
  };
  try {
    context = await env.browser.newContext();
    await context.route('**/*', (r) =>
      new URL(r.request().url()).origin === env.origin ? r.continue() : r.abort('blockedbyclient'),
    );
    let a = await page();
    if (definition.boundary) {
      const point = definition.boundary,
        code = await call(a, 'begin');
      await call(a, 'fault', 'hold-' + point);
      await call(a, 'confirm', 'create', code);
      await gate(a, point);
      const before = await call(a, 'claim', 'local-slot');
      check(
        'uncommitted-receipt-not-exposed',
        [(await call(a, 'snapshot')).entries.create.status, (await call(a, 'snapshot')).mounts],
        ['pending', 0],
      );
      const b = await page();
      await call(b, 'resume', 'queued', 'local-slot', code);
      await b.waitForFunction(
        () => window.genesis.locks().then((s) => s.pending.length > 0),
        undefined,
        { polling: 25 },
      );
      check(
        'resume-waits-for-exclusive-owner',
        (await call(b, 'snapshot')).entries.queued.status,
        'pending',
      );
      await crash(a);
      a = b;
      check('verified-resume-completes', (await settled(a, 'queued')).value?.kind, 'created');
      const after = await call(a, 'claim', 'local-slot');
      check('winning-identity-set-unchanged', after.initial, before.initial);
      check('authenticated-progress-completes', after.stage, 'ready');
      check('resumed-workspace-opens', (await open(a, code)).kind, 'ready');
      await call(a, 'input', 'edit', 'local genesis recovered');
      await settled(a, 'edit');
      check(
        'admitted-editor-after-genesis',
        (await call(a, 'snapshot')).text,
        'local genesis recovered',
      );
      await crash(a);
      a = await page();
      check('offline-reopen-after-edit', (await open(a, code)).kind, 'ready');
      check('offline-edit-recovered', (await call(a, 'snapshot')).text, 'local genesis recovered');
      schedule.push(
        `Held native completion callback after ${point} transaction commit; killed creator; resumed from reread claim under exclusion`,
      );
    } else
      switch (definition.id) {
        case 'G01.confirm': {
          const before = await call(a, 'inventory'),
            code = await call(a, 'begin');
          check('ceremony-does-not-persist', await call(a, 'inventory'), before);
          const wrong = code.replace(/[0-9A-Z]/u, (c) => (c === '0' ? '1' : '0'));
          await call(a, 'confirm', 'wrong', wrong);
          check(
            'mismatched-confirmation-refused',
            (await settled(a, 'wrong')).error?.code,
            'confirmation-required',
          );
          check('wrong-confirmation-no-writes', await call(a, 'inventory'), before);
          await call(a, 'confirm', 'valid', code);
          const r = await settled(a, 'valid');
          check('confirmed-local-created', r.value?.kind, 'created');
          check('local-ready-for-unlock', (await call(a, 'inspect')).kind, 'unlock-required');
          check('no-editor-before-open', (await call(a, 'snapshot')).mounts, 0);
          check('offline-factor-open', (await open(a, code)).kind, 'ready');
          break;
        }
        case 'G02.race': {
          const b = await page(),
            ca = await call(a, 'begin'),
            cb = await call(b, 'begin');
          await call(a, 'fault', 'hold-claim');
          await call(a, 'confirm', 'a', ca);
          await gate(a, 'claim');
          await call(b, 'confirm', 'b', cb);
          await b.waitForFunction(
            () => window.genesis.locks().then((s) => s.pending.length > 0),
            undefined,
            { polling: 25 },
          );
          const initial = (await call(a, 'claim', 'local-slot')).initial;
          check('loser-queues', (await call(b, 'snapshot')).entries.b.status, 'pending');
          await call(a, 'release', 'claim');
          check('winner-completes', (await settled(a, 'a')).value?.kind, 'created');
          check(
            'loser-sees-existing-locked',
            (await settled(b, 'b')).error?.disposition?.kind,
            'unlock-required',
          );
          check(
            'race-retains-one-identity',
            (await call(b, 'claim', 'local-slot')).initial,
            initial,
          );
          const before = await call(b, 'inventory');
          check('losing-code-cannot-open', (await open(b, cb)).kind, 'unlock-failed');
          check('losing-unlock-no-writes', await call(b, 'inventory'), before);
          check(
            'loser-can-unlock-winner',
            (await open(b, ca, 'local-slot', 'winner')).kind,
            'ready',
          );
          break;
        }
        case 'G12.abort': {
          const code = await call(a, 'begin');
          await call(a, 'fault', 'abort-claim');
          await call(a, 'confirm', 'aborted', code);
          check('claim-abort-refuses', (await settled(a, 'aborted')).status, 'rejected');
          check(
            'identity-and-custody-abort-together',
            (await call(a, 'inventory'))['done.custody'].entries,
            [],
          );
          const b = await create(a, 'local-slot', 'after-abort');
          check('fresh-after-atomic-abort', b.receipt.kind, 'created');
          const other = await call(a, 'begin', 'index-abort');
          await call(a, 'fault', 'abort-index');
          await call(a, 'confirm', 'index', other);
          check('index-request-is-provisional', (await settled(a, 'index')).status, 'rejected');
          check(
            'index-abort-retains-intent',
            (await call(a, 'inspect', 'index-abort')).kind,
            'creation-pending',
          );
          await call(a, 'resume', 'resume', 'index-abort', other);
          check('index-abort-resumes', (await settled(a, 'resume')).value?.kind, 'created');
          break;
        }
        case 'G13.cancel': {
          const code = await call(a, 'begin');
          await call(a, 'fault', 'hold-crypto');
          await call(a, 'confirm', 'create', code);
          await gate(a, 'crypto');
          const b = await page();
          await call(b, 'barrier', 'next');
          await call(a, 'cancel');
          await b.waitForFunction(
            () => window.genesis.locks().then((s) => s.pending.length > 0),
            undefined,
            { polling: 25 },
          );
          check(
            'cancel-drains-native-crypto',
            (await call(b, 'snapshot')).entries.next.status,
            'pending',
          );
          await call(a, 'release', 'crypto');
          check('cancelled-creator-no-receipt', (await settled(a, 'create')).status, 'rejected');
          check('exclusive-after-drain', (await settled(b, 'next')).value, 'exclusive-granted');
          check('cancel-before-claim-is-fresh', (await call(b, 'inspect')).kind, 'fresh');
          check('cancel-no-editor', (await call(a, 'snapshot')).mounts, 0);
          break;
        }
        case 'G14.missing': {
          const { code } = await create(a);
          await call(a, 'damage', 'local-slot', 'missing-complete');
          const before = await call(a, 'inventory');
          await call(a, 'resume', 'resume', 'local-slot', code);
          check(
            'missing-complete-refuses',
            (await settled(a, 'resume')).error?.disposition?.kind,
            'repair-required',
          );
          check('missing-complete-preserves', await call(a, 'inventory'), before);
          const other = await create(a, 'other', 'other');
          await call(a, 'damage', 'other', 'missing-custody');
          const retained = await call(a, 'inventory');
          await call(a, 'resume', 'custody', 'other', other.code);
          check(
            'missing-custody-refuses',
            (await settled(a, 'custody')).error?.disposition?.kind,
            'repair-required',
          );
          check('initial-snapshot-not-restored', await call(a, 'inventory'), retained);
          break;
        }
        case 'G15.auth': {
          const { code } = await create(a),
            before = await call(a, 'inventory');
          check('wrong-factor-refuses', (await open(a, '0'.repeat(25))).kind, 'unlock-failed');
          check('wrong-factor-no-writes', await call(a, 'inventory'), before);
          await call(a, 'damage', 'local-slot', 'mac');
          const damaged = await call(a, 'inventory');
          await call(a, 'resume', 'resume', 'local-slot', code);
          check(
            'damaged-progress-refuses',
            (await settled(a, 'resume')).error?.disposition?.kind,
            'repair-required',
          );
          check('damaged-progress-preserved', await call(a, 'inventory'), damaged);
          break;
        }
        case 'G16.index': {
          const { code } = await create(a);
          check('open-holds-shared', (await open(a, code)).kind, 'ready');
          const before = await call(a, 'inventory'),
            b = await page();
          await call(b, 'legacy', 'close', 'local-slot', 'closeSlot');
          await b.waitForFunction(
            () => window.genesis.locks().then((s) => s.pending.length > 0),
            undefined,
            { polling: 25 },
          );
          check(
            'index-write-waits-for-live-writer',
            (await call(b, 'snapshot')).entries.close.status,
            'pending',
          );
          await call(a, 'close');
          check('legacy-cannot-close-local', (await settled(b, 'close')).status, 'rejected');
          // Closing flushes any existing journal; capture after close for later index comparisons.
          const closed = await call(b, 'inventory');
          await call(b, 'legacy', 'remove', 'local-slot', 'removeSlot');
          check('legacy-cannot-delete-local', (await settled(b, 'remove')).status, 'rejected');
          check('legacy-keeps-local-carriers', await call(b, 'inventory'), closed);
          check('index-route-unchanged', closed['done.slots'], before['done.slots']);
          break;
        }
        case 'G17.scope': {
          const first = await create(a),
            second = await create(a, 'other', 'other');
          const routes = await call(a, 'list', 'local-slot', first.code),
            other = await call(a, 'list', 'other', second.code);
          check(
            'picker-returns-requested-slot',
            routes.map((r) => r.principal),
            [first.receipt.scope.principalId],
          );
          check(
            'other-picker-independent',
            other.map((r) => r.principal),
            [second.receipt.scope.principalId],
          );
          await call(a, 'damage', 'local-slot', 'unknown');
          const before = await call(a, 'inventory');
          check(
            'unknown-slot-carrier-refuses',
            (await open(a, first.code)).kind,
            'repair-required',
          );
          check('unknown-carrier-not-deleted', await call(a, 'inventory'), before);
          check(
            'other-still-opens',
            (await open(a, second.code, 'other', 'other-open')).kind,
            'ready',
          );
          await call(a, 'close');
          await call(a, 'damage', 'other', 'closed');
          check(
            'closed-slot-refuses',
            (await open(a, second.code, 'other', 'closed')).kind,
            'slot-closed',
          );
          break;
        }
      }
    check('no-native-database-enumeration', (await call(a, 'snapshot')).enumerationCalls, 0);
    check('no-unhandled-page-errors', errors, []);
    status = assertions.every((a) => a.passed) ? 'pass' : 'fail';
  } catch (cause) {
    error = { message: cause.message, stack: cause.stack };
  } finally {
    await context?.close();
  }
  return { ...definition, status, assertions, schedule, artifacts, ...(error ? { error } : {}) };
}
