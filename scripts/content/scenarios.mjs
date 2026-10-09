import { isDeepStrictEqual } from 'node:util';

export async function runCase(definition, env) {
  const assertions = [],
    artifacts = [],
    schedule = [],
    pageErrors = [];
  let context,
    status = 'error',
    error;
  const check = (id, actual, expected) => {
    const passed = isDeepStrictEqual(actual, expected);
    assertions.push({ id, actual: actual ?? null, expected: expected ?? null, passed });
    return passed;
  };
  const call = (page, method, ...args) =>
    page.evaluate(({ method, args }) => window.content[method](...args), { method, args });
  const page = async () => {
    const p = await context.newPage();
    p.setDefaultTimeout(8000);
    p.on('pageerror', (e) => pageErrors.push(e.message));
    await p.goto(env.url);
    await p.waitForFunction(() => window.content);
    return p;
  };
  const snapshot = (p) => call(p, 'snapshot');
  const settled = async (p, id) => {
    await p.waitForFunction(
      (id) => ['resolved', 'rejected'].includes(window.content.snapshot().entries[id]?.status),
      id,
    );
    return (await snapshot(p)).entries[id];
  };
  const done = async (p, id) => {
    const value = await settled(p, id);
    if (value.status !== 'resolved')
      throw Error(`Unexpected ${id} refusal: ${JSON.stringify(value.error)}`);
    return value.value;
  };
  const open = async (p, code, id = 's') => {
    await call(p, 'open', id, code);
    await done(p, id);
  };
  const append = async (p, bytes, id = 'write', session = 's') => {
    await call(p, 'append', id, session, bytes);
    return done(p, id);
  };
  const close = async (p, session = 's') => {
    await call(p, 'close', 'close-' + session, session);
    await done(p, 'close-' + session);
  };
  const gate = (p, name) =>
    p.waitForFunction((n) => window.content.snapshot().gates.includes(n), name);
  const crash = async (p) => {
    artifacts.push({
      point: 'before-renderer-death',
      snapshot: await snapshot(p),
      counter: await call(p, 'counter'),
    });
    const cdp = await context.newCDPSession(p),
      died = p.waitForEvent('crash');
    void cdp.send('Page.crash').catch(() => {});
    await died;
    await p.close();
    schedule.push('Actual renderer death via Page.crash');
  };
  try {
    context = await env.browser.newContext();
    await context.route('**/*', (route) =>
      new URL(route.request().url()).origin === env.origin
        ? route.continue()
        : route.abort('blockedbyclient'),
    );
    let a = await page();
    const code = await call(a, 'enroll');
    if (definition.id === 'C10.content-initialization') {
      await call(a, 'fault', 'gate-ready');
      await call(a, 'initialize', 'init', code);
      await gate(a, 'ready');
      const before = await call(a, 'witness');
      check('creating-witness-precedes-content-ready', before.state, 'creating');
      check('empty-counter-committed-before-ready', (await call(a, 'counter')).next_seq, 1);
      await crash(a);
      a = await page();
      await call(a, 'open', 'partial', code);
      check('partial-open-refuses', (await settled(a, 'partial')).error?.code, 'creation-pending');
      await call(a, 'initialize', 'resume', code);
      await done(a, 'resume');
      check('resume-retains-creation-identity', (await call(a, 'witness')).intent, before.intent);
      await open(a, code);
      await append(a, [{ bytes: 'durable' }]);
      await close(a);
      const witness = await call(a, 'witness');
      await call(a, 'tamper', 'missing-counter');
      await call(a, 'open', 'missing', code);
      check(
        'missing-counter-refuses',
        (await settled(a, 'missing')).error?.code,
        'missing-content',
      );
      await call(a, 'initialize', 'reset', code);
      check(
        'initialized-counter-cannot-reset',
        (await settled(a, 'reset')).error?.code,
        'already-initialized',
      );
      await call(a, 'deleteDb');
      await call(a, 'open', 'deleted', code);
      check(
        'deleted-database-refuses',
        (await settled(a, 'deleted')).error?.code,
        'missing-content',
      );
      check('missing-storage-retains-witness', await call(a, 'witness'), witness);
      schedule.push(
        'Kill after counter completion before witness-ready; resume; delete counter and then content database',
      );
    } else {
      await call(a, 'initialize', 'init', code);
      await done(a, 'init');
      await open(a, code);
      switch (definition.id) {
        case 'C15.concurrent-allocation': {
          const b = await page();
          await open(b, code);
          const batch = ['update', 'state', 'heads', 'outbound'].map((kind, i) => ({
            kind,
            bytes: 'kind-' + i,
          }));
          await Promise.all(
            Array.from({ length: 12 }, (_, i) =>
              call(i % 2 ? b : a, 'append', 'b' + i, 's', batch),
            ),
          );
          const receipts = await Promise.all(
            Array.from({ length: 12 }, (_, i) => done(i % 2 ? b : a, 'b' + i)),
          );
          const seqs = receipts.flatMap((r) => r.sequences).sort((a, b) => a - b);
          check(
            'all-kinds-share-disjoint-reservations',
            seqs,
            Array.from({ length: 48 }, (_, i) => i + 1),
          );
          const count = await call(a, 'counter');
          check('all-invocations-counted', [count.next_seq, count.reserved['1']], [49, 48]);
          await call(a, 'load', 'all', 's');
          check('all-records-survive-concurrent-writes', (await done(a, 'all')).length, 48);
          const inv = await call(a, 'inventory');
          check(
            'kinds-use-designated-stores',
            [inv.content.length, inv.heads.length, inv.outbound.length],
            [24, 12, 12],
          );
          schedule.push('Twelve concurrent four-kind batches from two shared sessions');
          break;
        }
        case 'C15.reservation-abort': {
          await call(a, 'fault', 'abort-reservation');
          await call(a, 'append', 'aborted', 's', [{ bytes: 'no receipt' }]);
          check('aborted-reservation-refuses', (await settled(a, 'aborted')).status, 'rejected');
          check('no-encryption-after-aborted-reservation', (await snapshot(a)).encryptions, 0);
          check('aborted-reservation-not-counted', (await call(a, 'counter')).next_seq, 1);
          const receipt = await append(a, [{ bytes: 'retry' }]);
          check('retry-uses-ungranted-range', receipt.sequences, [1]);
          break;
        }
        case 'C15.abandoned-seals': {
          await call(a, 'fault', 'gate-sealed');
          await call(a, 'append', 'lost', 's', [{ bytes: 'lost' }]);
          await gate(a, 'sealed');
          check('native-encryption-happened', (await snapshot(a)).encryptions, 1);
          if (
            !check(
              'abandoned-encryption-remains-counted',
              (await call(a, 'counter')).reserved['1'],
              1,
            )
          )
            break;
          await crash(a);
          a = await page();
          await open(a, code);
          const r = await append(a, [{ bytes: 'after crash' }]);
          check('abandoned-sequence-not-reused', r.sequences, [2]);
          check('count-includes-crashed-attempt', (await call(a, 'counter')).reserved['1'], 2);
          break;
        }
        case 'C15.content-abort': {
          await call(a, 'fault', 'abort-content');
          await call(
            a,
            'append',
            'aborted',
            's',
            ['update', 'state', 'heads', 'outbound'].map((kind) => ({ kind, bytes: 'atomic' })),
          );
          check('aborted-batch-has-no-receipt', (await settled(a, 'aborted')).status, 'rejected');
          const inv = await call(a, 'inventory');
          check(
            'all-stores-rollback',
            [inv.content.length, inv.heads.length, inv.outbound.length],
            [0, 0, 0],
          );
          check('aborted-encryptions-stay-counted', (await call(a, 'counter')).reserved['1'], 4);
          check(
            'retry-abandons-whole-old-range',
            (await append(a, [{ bytes: 'retry' }])).sequences,
            [5],
          );
          break;
        }
        case 'C15.ceiling': {
          await call(a, 'tamper', 'ceiling', code);
          await call(a, 'append', 'edge', 's', [{ bytes: 'one' }, { bytes: 'two' }]);
          check(
            'ceiling-refuses-before-encryption',
            (await settled(a, 'edge')).error?.code,
            'rotation-required',
          );
          check('ceiling-invokes-no-aes', (await snapshot(a)).encryptions, 0);
          check('ceiling-preserves-counter', (await call(a, 'counter')).reserved['1'], 2 ** 32 - 2);
          break;
        }
        case 'C14.generation-fence': {
          await call(a, 'fault', 'gate-sealed');
          await call(a, 'append', 'old', 's', [{ bytes: 'old generation' }]);
          await gate(a, 'sealed');
          const b = await page();
          await call(b, 'tamper', 'generation', code);
          await call(a, 'release', 'sealed');
          check(
            'changed-generation-refuses-commit',
            (await settled(a, 'old')).error?.code,
            'generation-changed',
          );
          check('outgoing-record-not-committed', (await call(b, 'inventory')).content.length, 0);
          check('old-range-retains-count', (await call(b, 'counter')).reserved['1'], 1);
          schedule.push(
            'Fixture deliberately bypasses the exclusive activation owner to exercise the independent IDB generation fence',
          );
          break;
        }
        case 'C09.unreadable-load': {
          await append(a, [{ bytes: 'prefix' }, { bytes: 'suffix' }]);
          await call(a, 'backup');
          for (const type of ['tag', 'version', 'kind', 'wrong-store']) {
            await call(a, 'tamper', type);
            const before = await call(a, 'inventory');
            await call(a, 'load', 'bad-' + type, 's');
            check(
              type + '-refuses-whole-load',
              (await settled(a, 'bad-' + type)).error?.code,
              'repair-required',
            );
            const b = await page();
            await call(b, 'open', 'bad', code);
            check(
              type + '-refuses-normal-open',
              (await settled(b, 'bad')).error?.code,
              'repair-required',
            );
            await b.close();
            check(type + '-retains-carriers', await call(a, 'inventory'), before);
            await call(a, 'restore');
          }
          break;
        }
        case 'C09.metadata': {
          await append(a, [{ bytes: 'kept' }]);
          await call(a, 'tamper', 'count');
          const before = await call(a, 'inventory');
          await call(a, 'append', 'bad', 's', [{ bytes: 'uncounted' }]);
          check('changed-count-refuses', (await settled(a, 'bad')).error?.code, 'repair-required');
          check('tampered-counter-never-encrypts', (await snapshot(a)).encryptions, 1);
          check('counter-tampering-preserves-carriers', await call(a, 'inventory'), before);
          break;
        }
        case 'C09.immutable-record': {
          await append(a, [{ bytes: 'immutable' }]);
          await call(a, 'tamper', 'collision');
          const before = await call(a, 'inventory');
          await call(a, 'append', 'collision', 's', [{ bytes: 'replacement' }]);
          check(
            'duplicate-record-refuses',
            (await settled(a, 'collision')).error?.code,
            'storage-failed',
          );
          check(
            'old-record-bytes-not-replaced',
            (await call(a, 'inventory')).content,
            before.content,
          );
          check('failed-insertion-counted', (await call(a, 'counter')).reserved['1'], 2);
          break;
        }
        case 'C04.content-close': {
          await call(a, 'fault', 'gate-encrypt');
          await call(a, 'append', 'pending', 's', [{ bytes: 'late' }]);
          await gate(a, 'encrypt');
          await call(a, 'close', 'closing', 's');
          const b = await page();
          await call(b, 'exclusive', 'exclusive');
          await b.waitForFunction(async () =>
            (await navigator.locks.query()).pending.some((l) => l.mode === 'exclusive'),
          );
          check(
            'close-retains-permit-during-native-work',
            (await snapshot(b)).entries.exclusive.status,
            'pending',
          );
          await call(a, 'release', 'encrypt');
          check(
            'closed-session-rejects-late-write',
            (await settled(a, 'pending')).error?.code,
            'inactive',
          );
          await done(a, 'closing');
          await done(b, 'exclusive');
          check('late-write-not-committed', (await call(a, 'inventory')).content.length, 0);
          await open(a, code, 'fresh');
          await append(a, [{ bytes: 'readable' }], 'durable', 'fresh');
          await call(a, 'fault', 'gate-decrypt');
          await call(a, 'load', 'reading', 'fresh');
          await gate(a, 'decrypt');
          await call(a, 'close', 'close-fresh', 'fresh');
          await call(a, 'release', 'decrypt');
          check(
            'close-withholds-late-plaintext',
            (await settled(a, 'reading')).error?.code,
            'inactive',
          );
          await done(a, 'close-fresh');
          await call(a, 'append', 'stale', 'fresh', [{ bytes: 'no' }]);
          check('stale-session-refuses', (await settled(a, 'stale')).error?.code, 'inactive');
          break;
        }
        case 'C01.byte-replay': {
          const probe = await call(a, 'yjsProbe');
          await append(a, [
            { bytes: probe.updates[2] },
            { bytes: probe.updates[1] },
            { bytes: probe.updates[0] },
          ]);
          check(
            'received-dependency-exceeds-journal-limit',
            probe.updates[0].length > 16 * 1024,
            true,
          );
          await crash(a);
          a = await page();
          await open(a, code);
          check(
            'offline-dependency-and-deletion-replay',
            await call(a, 'replay', 's'),
            probe.expected,
          );
          schedule.push(
            'Persist dependent local update and delete before their 17 KiB remote dependency; cold offline apply of the complete stored byte set',
          );
          break;
        }
        case 'C07.full-snapshot': {
          await call(
            a,
            'append',
            'copied',
            's',
            [{ bytes: 'before' }, { kind: 'state', bytes: 'state' }, { bytes: 'after' }],
            true,
          );
          await done(a, 'copied');
          await call(a, 'load', 'all', 's');
          check(
            'state-does-not-drop-earlier-records',
            (await done(a, 'all')).map((r) => new TextDecoder().decode(new Uint8Array(r.bytes))),
            ['before', 'state', 'after'],
          );
          const inv = await call(a, 'inventory');
          check('only-selected-record-fields-persist', Object.keys(inv.content[0].value).sort(), [
            'ct',
            'gen',
            'kind',
            'nonce',
            'seq',
            'v',
          ]);
          check('public-capability-has-no-key-or-reservation', await call(a, 'publicShape', 's'), [
            'appendBatch',
            'close',
            'generation',
            'loadRecords',
            'publicCredentials',
            'rootId',
            'scope',
            'signal',
            'state',
            'storeId',
          ]);
          break;
        }
        default:
          throw Error('Unknown case');
      }
    }
    for (const p of context.pages())
      if (!p.isClosed()) artifacts.push({ point: 'final', snapshot: await snapshot(p) });
    status = assertions.length && assertions.every((a) => a.passed) ? 'pass' : 'fail';
  } catch (cause) {
    error = { message: cause.message, stack: cause.stack };
    status = 'error';
  } finally {
    await context?.close();
  }
  if (pageErrors.length) {
    error = { message: 'Unexpected page errors: ' + pageErrors.join('; ') };
    status = 'error';
  }
  return {
    id: definition.id,
    title: definition.title,
    status,
    assertions,
    schedule,
    artifacts,
    error,
  };
}
