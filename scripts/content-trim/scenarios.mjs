import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
const digest = (v) =>
  createHash('sha256')
    .update(JSON.stringify(v ?? null))
    .digest('hex');
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
  const equal = (id, a, b) => check(id, digest(a), digest(b));
  const call = (p, owner, method, ...args) =>
    p.evaluate(({ owner, method, args }) => window[owner][method](...args), {
      owner,
      method,
      args,
    });
  const c = (p, method, ...args) => call(p, 'content', method, ...args),
    t = (p, method, ...args) => call(p, 'trim', method, ...args);
  const page = async () => {
    const p = await context.newPage();
    p.setDefaultTimeout(15000);
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(env.url);
    await p.waitForFunction(() => window.trim);
    return p;
  };
  const settled = async (p, id, owner = 'trim') => {
    await p.waitForFunction(
      ({ id, owner }) =>
        ['resolved', 'rejected'].includes(window[owner].snapshot().entries[id]?.status),
      { id, owner },
    );
    return (await call(p, owner, 'snapshot')).entries[id];
  };
  const gate = (p, name) =>
    p.waitForFunction((n) => window.trim.snapshot().gates.includes(n), name);
  const contentGate = (p, name) =>
    p.waitForFunction((n) => window.content.snapshot().gates.includes(n), name);
  const crash = async (p) => {
    const cd = await context.newCDPSession(p),
      dead = p.waitForEvent('crash');
    void cd.send('Page.crash').catch(() => {});
    await dead;
    await p.close();
    schedule.push('Actual renderer death without graceful close');
  };
  const open = async (p, code) => {
    await t(p, 'open', 'session', code);
    const r = await settled(p, 'session');
    if (r.status !== 'resolved') throw Error(JSON.stringify(r));
  };
  const append = async (p, id, updates) => {
    await t(
      p,
      'append',
      id,
      updates.map((bytes) => ({ bytes })),
    );
    const r = await settled(p, id);
    if (r.status !== 'resolved') throw Error(JSON.stringify(r));
    return r.value;
  };
  try {
    context = await env.browser.newContext();
    await context.route('**/*', (r) =>
      new URL(r.request().url()).origin === env.origin ? r.continue() : r.abort('blockedbyclient'),
    );
    let a = await page();
    let code = await c(a, 'enroll');
    await c(a, 'initialize', 'init', code);
    if ((await settled(a, 'init', 'content')).status !== 'resolved')
      throw Error('Initialization failed');
    await open(a, code);
    const probe = await t(a, 'probe'),
      [u1, u2, u3, uj] = probe.updates;
    const needsEmpty = ['T02.late', 'T04.dependencies', 'T17.single-state'].includes(definition.id);
    if (!needsEmpty) await append(a, 'seed', [u1, u2]);
    const before = await c(a, 'inventory'),
      controls = await t(a, 'controls');
    switch (definition.id) {
      case 'T01.union': {
        await t(a, 'append', 'other', [
          { kind: 'heads', bytes: [3] },
          { kind: 'outbound', bytes: [4] },
        ]);
        await settled(a, 'other');
        await t(a, 'journal', uj);
        const initial = await c(a, 'inventory'),
          journal = await t(a, 'journalInventory'),
          expected = await t(a, 'replay');
        await t(a, 'compact', 'trim');
        const r = await settled(a, 'trim');
        check('trim-completes', r.value?.status, 'compacted');
        check('only-input-content-deleted', r.value?.removed, [1, 2]);
        const after = await c(a, 'inventory');
        equal('heads-retained', after.heads, initial.heads);
        equal('outbound-retained', after.outbound, initial.outbound);
        equal('journal-retained', await t(a, 'journalInventory'), journal);
        check(
          'reservations-never-reconstructed',
          [after.meta[0].value.next_seq, after.meta[0].value.reserved],
          [6, { 1: 5 }],
        );
        const b = await page();
        await open(b, code);
        check('cold-replay-keeps-disk-union', await t(b, 'replay'), expected);
        await t(b, 'compact', 'noop');
        check('single-state-noop', (await settled(b, 'noop')).value?.status, 'unchanged');
        equal('noop-no-new-reservation', await c(b, 'inventory'), after);
        break;
      }
      case 'T02.late': {
        await append(a, 'one', [u1]);
        await c(a, 'open', 'late-session', code);
        await settled(a, 'late-session', 'content');
        await c(a, 'fault', 'gate-encrypt');
        await c(a, 'append', 'late', 'late-session', [{ bytes: u2 }]);
        await contentGate(a, 'encrypt');
        const b = await page();
        await open(b, code);
        await append(b, 'three', [u3]);
        await t(b, 'fault', 'hold-published');
        await t(b, 'compact', 'trim');
        await gate(b, 'published');
        check(
          'snapshot-sequence-follows-gap',
          (await c(b, 'inventory')).content.map((r) => r.key),
          [1, 3, 4],
        );
        await c(a, 'release', 'encrypt');
        check('late-batch-commits', (await settled(a, 'late', 'content')).value?.sequences, [2]);
        const late = (await c(a, 'inventory')).content.find((r) => r.key === 2);
        await t(b, 'release', 'published');
        check('trim-completes', (await settled(b, 'trim')).value?.status, 'compacted');
        const after = await c(b, 'inventory');
        equal(
          'late-record-survives',
          after.content.find((r) => r.key === 2),
          late,
        );
        check(
          'exact-coverage-set',
          after.content.map((r) => r.key),
          [2, 4],
        );
        check('late-semantic-union', await t(b, 'replay'), 'ABC');
        break;
      }
      case 'T03.concurrent': {
        const b = await page();
        await open(b, code);
        await t(a, 'fault', 'hold-seal', 'hold-published');
        await t(b, 'fault', 'hold-seal', 'hold-published');
        await t(a, 'compact', 'trim');
        await gate(a, 'seal');
        await t(b, 'compact', 'trim');
        await gate(b, 'seal');
        await t(a, 'release', 'seal');
        await gate(a, 'published');
        await t(b, 'release', 'seal');
        await gate(b, 'published');
        const both = await c(a, 'inventory');
        check(
          'both-replacements-published',
          both.content.map((r) => r.key),
          [1, 2, 3, 4],
        );
        await t(a, 'release', 'published');
        check('first-compacts', (await settled(a, 'trim')).value?.status, 'compacted');
        await t(b, 'release', 'published');
        check(
          'second-retains-on-missing-coverage',
          (await settled(b, 'trim')).value?.status,
          'retained',
        );
        const after = await c(b, 'inventory');
        equal('concurrent-replacements-retained', after.content, both.content.slice(2));
        check('concurrent-replay', await t(b, 'replay'), 'AB');
        break;
      }
      case 'T04.dependencies': {
        for (const mode of ['struct', 'delete']) {
          const p = await t(a, 'probe', mode);
          await append(a, 'pending-' + mode, [p.updates[1]]);
          await t(a, 'compact', 'trim-' + mode);
          check(mode + '-retained', (await settled(a, 'trim-' + mode)).value?.status, 'retained');
          const b = await page();
          await open(b, code);
          check(
            'pending-' + mode + '-recovers',
            await t(b, 'replay', 'session', [p.updates[0]]),
            p.expected,
          );
          await t(b, 'close', 'close');
          await settled(b, 'close');
          // Isolate the next unresolved-dependency case in another disposable origin context.
          if (mode === 'struct') {
            await context.close();
            context = await env.browser.newContext();
            await context.route('**/*', (r) =>
              new URL(r.request().url()).origin === env.origin
                ? r.continue()
                : r.abort('blockedbyclient'),
            );
            a = await page();
            const next = await c(a, 'enroll');
            await c(a, 'initialize', 'init', next);
            await settled(a, 'init', 'content');
            await open(a, next);
            // The next iteration needs its new code for cold open.
            code = next;
          }
        }
        break;
      }
      case 'T05.unreadable': {
        await t(a, 'append', 'head', [{ kind: 'heads', bytes: [3] }]);
        await settled(a, 'head');
        await t(a, 'corrupt', 3, 'heads');
        const damaged = await c(a, 'inventory');
        await t(a, 'compact', 'trim');
        check(
          'unreadable-retained-head-refuses',
          (await settled(a, 'trim')).error?.code,
          'repair-required',
        );
        equal('unreadable-no-record-deleted', await c(a, 'inventory'), damaged);
        check('unreadable-closes-owner', (await t(a, 'snapshot')).states.session, 'closed');
        break;
      }
      case 'T06.changed':
      case 'T07.recheck':
      case 'T08.new-damage':
      case 'T18.replacement': {
        const stage = ['T07.recheck', 'T08.new-damage'].includes(definition.id)
          ? 'audit'
          : 'published';
        await t(a, 'fault', 'hold-' + stage);
        await t(a, 'compact', 'trim');
        await gate(a, stage);
        const b = await page();
        await open(b, code);
        if (definition.id === 'T08.new-damage') await append(b, 'bad', [[255]]);
        else if (definition.id === 'T18.replacement') await t(b, 'corrupt', 3);
        else await t(b, 'rewrite', 1, code, 'X');
        const changed = await c(b, 'inventory');
        await t(a, 'release', stage);
        const r = await settled(a, 'trim');
        check(
          definition.id === 'T06.changed'
            ? 'changed-record-refuses'
            : definition.id === 'T07.recheck'
              ? 'changed-after-audit-refuses'
              : 'damage-refuses',
          r.error?.code,
          'repair-required',
        );
        equal('changed-census-no-deletion', await c(b, 'inventory'), changed);
        check('repair-closes-owner', (await t(a, 'snapshot')).states.session, 'closed');
        break;
      }
      case 'T09.journal':
      case 'T21.journal-recheck': {
        const boundary = definition.id === 'T09.journal' ? 'published' : 'audit';
        await t(a, 'fault', 'hold-' + boundary);
        await t(a, 'compact', 'trim');
        await gate(a, boundary);
        await t(a, 'journal', [255]);
        const current = await c(a, 'inventory'),
          journal = await t(a, 'journalInventory');
        await t(a, 'release', boundary);
        check(
          'post-publication-journal-refuses',
          (await settled(a, 'trim')).error?.code,
          'repair-required',
        );
        equal('journal-refusal-keeps-inputs', await c(a, 'inventory'), current);
        equal('journal-refusal-keeps-journal', await t(a, 'journalInventory'), journal);
        check('journal-damage-closes-owner', (await t(a, 'snapshot')).states.session, 'closed');
        break;
      }
      case 'T10.publish-abort': {
        await t(a, 'fault', 'abort-publish');
        await t(a, 'compact', 'trim');
        check('publish-abort-no-success', (await settled(a, 'trim')).error?.code, 'storage-failed');
        const after = await c(a, 'inventory');
        equal('publish-abort-no-deletion', after.content, before.content);
        check('aborted-seal-counted', after.meta[0].value.next_seq, 4);
        break;
      }
      case 'T11.delete-abort': {
        await t(a, 'fault', 'abort-delete');
        await t(a, 'compact', 'trim');
        const r = await settled(a, 'trim');
        check('delete-abort-has-no-success-receipt', r.error?.code, 'storage-failed');
        const after = await c(a, 'inventory');
        equal('delete-abort-keeps-every-input', after.content.slice(0, 2), before.content);
        check('delete-abort-keeps-replacement', after.content.length, 3);
        await t(a, 'compact', 'retry');
        check('retry-covers-duplicates', (await settled(a, 'retry')).value?.removed, [1, 2, 3]);
        check('retry-recovers-union', await t(a, 'replay'), 'AB');
        break;
      }
      case 'T12.kill-reservation':
      case 'T13.kill-publication':
      case 'T14.kill-deletion': {
        const stage =
          definition.id === 'T12.kill-reservation'
            ? 'seal'
            : definition.id === 'T13.kill-publication'
              ? 'published'
              : 'deleted';
        await t(a, 'fault', 'hold-' + stage);
        await t(a, 'compact', 'trim');
        await gate(a, stage);
        check('receipt-pending-at-kill', (await t(a, 'snapshot')).entries.trim.status, 'pending');
        const b = await page();
        await open(b, code);
        const atKill = await c(b, 'inventory');
        check('reservation-counted-before-kill', atKill.meta[0].value.next_seq, 4);
        await crash(a);
        a = b;
        check('offline-recovery-after-kill', await t(a, 'replay'), 'AB');
        await t(a, 'compact', 'retry');
        const r = await settled(a, 'retry');
        check(
          'fresh-maintenance-completes',
          ['compacted', 'unchanged'].includes(r.value?.status),
          true,
        );
        check('one-state-remains', (await c(a, 'inventory')).content.length, 1);
        break;
      }
      case 'T15.close': {
        await t(a, 'fault', 'hold-seal');
        await t(a, 'compact', 'trim');
        await gate(a, 'seal');
        await t(a, 'close', 'close');
        const b = await page();
        await c(b, 'exclusive', 'exclusive');
        await b.waitForFunction(() => navigator.locks.query().then((s) => s.pending.length > 0));
        check(
          'close-retains-shared-permit',
          (await c(b, 'snapshot')).entries.exclusive.status,
          'pending',
        );
        equal(
          'close-before-publication-keeps-input',
          (await c(b, 'inventory')).content,
          before.content,
        );
        await t(a, 'release', 'seal');
        check('cancelled-trim-no-receipt', (await settled(a, 'trim')).status, 'rejected');
        await settled(a, 'close');
        check(
          'successor-after-drain',
          (await settled(b, 'exclusive', 'content')).status,
          'resolved',
        );
        equal('close-no-late-publication', (await c(b, 'inventory')).content, before.content);
        break;
      }
      case 'T16.generation': {
        await t(a, 'fault', 'hold-published');
        await t(a, 'compact', 'trim');
        await gate(a, 'published');
        await c(a, 'tamper', 'generation', code);
        const changed = await c(a, 'inventory');
        await t(a, 'release', 'published');
        check(
          'generation-change-refuses',
          (await settled(a, 'trim')).error?.code,
          'generation-changed',
        );
        equal('generation-change-no-deletion', await c(a, 'inventory'), changed);
        break;
      }
      case 'T19.missing':
      case 'T20.journal-tag': {
        if (definition.id === 'T19.missing') await c(a, 'tamper', 'missing-counter');
        else {
          await t(a, 'journal', uj);
          await t(a, 'corruptJournal');
        }
        const damaged = await c(a, 'inventory'),
          journal = await t(a, 'journalInventory');
        await t(a, 'compact', 'trim');
        check(
          'missing-or-unreadable-refuses',
          (await settled(a, 'trim')).error?.code,
          'repair-required',
        );
        equal('failure-preserves-all-content', await c(a, 'inventory'), damaged);
        equal('failure-preserves-journal', await t(a, 'journalInventory'), journal);
        check('failure-closes-admission', (await t(a, 'snapshot')).states.session, 'closed');
        break;
      }
      case 'T17.single-state': {
        await t(a, 'append', 'bad', [{ kind: 'state', bytes: [255] }]);
        await settled(a, 'bad');
        const changed = await c(a, 'inventory');
        await t(a, 'compact', 'trim');
        check(
          'singleton-invalid-state-refuses',
          (await settled(a, 'trim')).error?.code,
          'repair-required',
        );
        equal('singleton-no-mutation', await c(a, 'inventory'), changed);
        break;
      }
    }
    if (definition.id !== 'T04.dependencies')
      equal('custody-openers-retained', await t(a, 'controls'), controls);
    check('no-unhandled-page-errors', errors, []);
    status = assertions.every((a) => a.passed) ? 'pass' : 'fail';
  } catch (cause) {
    error = { message: cause.message, stack: cause.stack };
  } finally {
    await context?.close();
  }
  return { ...definition, status, assertions, schedule, artifacts, ...(error ? { error } : {}) };
}
