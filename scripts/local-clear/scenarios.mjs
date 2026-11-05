import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
const digest = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
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
  const g = (p, method, ...args) => call(p, 'genesis', method, ...args),
    c = (p, method, ...args) => call(p, 'clear', method, ...args);
  const page = async () => {
    const p = await context.newPage();
    p.setDefaultTimeout(15000);
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(env.url);
    await p.waitForFunction(() => window.clear);
    return p;
  };
  const settled = async (p, id, owner = 'clear') => {
    try {
      await p.waitForFunction(
        ({ id, owner }) =>
          ['resolved', 'rejected'].includes(window[owner].snapshot().entries[id]?.status),
        { id, owner },
      );
    } catch (cause) {
      try {
        artifacts.push({
          type: 'failed-state-observation',
          id,
          owner,
          value: await p.evaluate(
            async ({ id, owner }) => {
              const view = window[owner].snapshot(),
                entry = view.entries[id];
              return {
                visibility: document.visibilityState,
                status: entry?.status,
                errorCode: entry?.error?.code,
                gates: view.gates,
                locks: await navigator.locks.query(),
              };
            },
            { id, owner },
          ),
        });
      } catch {
        /* Preserve the original observer failure if its context is gone. */
      }
      throw cause;
    }
    return (await call(p, owner, 'snapshot')).entries[id];
  };
  const gate = (p, name) =>
    p.waitForFunction((name) => window.clear.snapshot().gates.includes(name), name);
  const pending = (p) =>
    p.waitForFunction(() => navigator.locks.query().then((s) => s.pending.length > 0));
  const crash = async (p) => {
    const cd = await context.newCDPSession(p),
      dead = p.waitForEvent('crash');
    void cd.send('Page.crash').catch(() => {});
    await dead;
    await p.close();
    schedule.push('Actual renderer death without graceful close');
  };
  const seed = async (p, slot = 'local-slot', id = 'create') => {
    const code = await g(p, 'begin', slot);
    await g(p, 'confirm', id, code);
    const r = await settled(p, id, 'genesis');
    if (r.status !== 'resolved') throw Error(JSON.stringify(r));
    const target = await c(p, 'prepare', code, slot);
    await c(p, 'seedJournal', code);
    return { code, target };
  };
  const marker = (inv, slot = 'local-slot') =>
    inv['done.custody'].entries.find((r) => r.key[0] === slot && r.key[1] === 'local-clear-v1')
      ?.value;
  const controlRows = (inv, slot = 'local-slot') =>
    inv['done.custody'].entries.filter((r) => r.key[0] === slot);
  const noIntent = (rows) => rows.filter((r) => r.key[1] !== 'local-clear-v1');
  const prefix = (t) => `done.pending-update.${encodeURIComponent(t.dbName)}.`;
  const finishCheck = async (p, t) => {
    const inv = await g(p, 'inventory'),
      rows = controlRows(inv, t.slotId);
    check(
      'terminal-has-no-content-openers',
      rows.map((r) => [r.key[1], r.value.stage]),
      [['local-clear-v1', 'cleared']],
    );
    check('target-database-absent', Boolean(inv[t.dbName]), false);
    check(
      'target-journal-absent',
      Object.keys(inv.localStorage).filter((k) => k.startsWith(prefix(t))),
      [],
    );
    check(
      'target-index-absent',
      inv['done.slots'].slots.filter((r) => r.key === t.slotId),
      [],
    );
    return inv;
  };
  try {
    context = await env.browser.newContext();
    await context.route('**/*', (r) =>
      new URL(r.request().url()).origin === env.origin ? r.continue() : r.abort('blockedbyclient'),
    );
    let a = await page();
    const { code, target } = await seed(a);
    const before = await g(a, 'inventory');
    if (definition.boundary) {
      const b = await page();
      await c(b, 'setTarget', target);
      await c(a, 'fault', 'hold-' + definition.boundary);
      await c(a, 'start', 'clear', code);
      await gate(a, definition.boundary);
      check(
        'receipt-waits-for-completion',
        (await c(a, 'snapshot')).entries.clear.status,
        'pending',
      );
      await c(b, 'resume', 'resume', code);
      await pending(b);
      check(
        'resumer-waits-for-exclusive-owner',
        (await c(b, 'snapshot')).entries.resume.status,
        'pending',
      );
      await crash(a);
      a = b;
      check('resumed-clear-completes', (await settled(a, 'resume')).value?.kind, 'cleared');
      await finishCheck(a, target);
      check('terminal-startup-refusal', (await g(a, 'inspect')).kind, 'cleared');
      schedule.push(
        `Creator killed after native ${definition.boundary} completion; waiting resumer rereads and authenticates remaining stages`,
      );
    } else
      switch (definition.id) {
        case 'L01.success': {
          check(
            'real-encrypted-journal-seeded',
            Object.keys(before.localStorage).filter((k) => k.startsWith(prefix(target))).length,
            3,
          );
          check('real-content-seeded', before[target.dbName].content.length > 0, true);
          await c(a, 'start', 'clear', code);
          check('clear-receipt', (await settled(a, 'clear')).value?.kind, 'cleared');
          const after = await finishCheck(a, target);
          check(
            'terminal-marker-no-factor-copy',
            JSON.stringify(marker(after)).includes(code),
            false,
          );
          check('terminal-prevents-normal-open', (await g(a, 'inspect')).kind, 'cleared');
          const otherCode = await g(a, 'begin');
          await g(a, 'confirm', 'fresh', otherCode);
          check(
            'terminal-prevents-autogenesis',
            (await settled(a, 'fresh', 'genesis')).error?.disposition?.kind,
            'cleared',
          );
          equal('terminal-refusal-no-new-carriers', await g(a, 'inventory'), after);
          break;
        }
        case 'L02.blocked': {
          await c(a, 'blockContent');
          await c(a, 'start', 'clear', code);
          await a.waitForFunction(() => window.clear.snapshot().progress.some((p) => p.blocked));
          // Allow native event/crypto continuations to settle while the non-cooperating connection remains open.
          await a.waitForTimeout(200);
          const held = await c(a, 'retained');
          const m = held['done.custody'].find((r) => r.key[1] === 'local-clear-v1').value;
          check('blocked-delete-not-complete', m.stage, 'content');
          equal('blocked-keeps-journal', held.journal, before.localStorage);
          equal(
            'blocked-keeps-custody',
            noIntent(held['done.custody']),
            before['done.custody'].entries,
          );
          equal('blocked-keeps-index', held['done.slots'], before['done.slots'].slots);
          const b = await page();
          await g(b, 'barrier', 'after');
          await pending(b);
          check(
            'blocked-retains-exclusive-permit',
            (await g(b, 'snapshot')).entries.after.status,
            'pending',
          );
          await c(a, 'unblock');
          await settled(a, 'clear');
          await settled(b, 'after', 'genesis');
          await finishCheck(a, target);
          schedule.push(
            'Actual native deleteDatabase blocked by a retained connection; no timeout or lease release; continuation after connection close',
          );
          break;
        }
        case 'L03.refused': {
          await c(a, 'fault', 'delete-error');
          await c(a, 'start', 'clear', code);
          check('delete-refusal-no-success', (await settled(a, 'clear')).status, 'rejected');
          const after = await g(a, 'inventory');
          equal('delete-refusal-keeps-journal', after.localStorage, before.localStorage);
          equal('delete-refusal-keeps-content', after[target.dbName], before[target.dbName]);
          equal(
            'delete-refusal-keeps-custody',
            noIntent(after['done.custody'].entries),
            before['done.custody'].entries,
          );
          equal('delete-refusal-keeps-index', after['done.slots'], before['done.slots']);
          check('delete-refusal-retains-intent', marker(after).stage, 'content');
          await c(a, 'resume', 'retry', code);
          check('delete-refusal-resumes', (await settled(a, 'retry')).value?.kind, 'cleared');
          schedule.push(
            'Adapter throws SecurityError at native deleteDatabase invocation before issuing a request',
          );
          break;
        }
        case 'L11.journal': {
          await c(a, 'fault', 'journal-partial');
          await c(a, 'start', 'clear', code);
          check('partial-journal-no-success', (await settled(a, 'clear')).status, 'rejected');
          const partial = await g(a, 'inventory');
          check('partial-journal-retains-suffix', Object.keys(partial.localStorage).length, 2);
          check('partial-stage', marker(partial).stage, 'journal');
          equal(
            'partial-keeps-every-opener',
            noIntent(partial['done.custody'].entries),
            before['done.custody'].entries,
          );
          equal('partial-keeps-index', partial['done.slots'], before['done.slots']);
          await crash(a);
          a = await page();
          await c(a, 'setTarget', target);
          await c(a, 'fault', 'journal-error');
          await c(a, 'resume', 'refused', code);
          await settled(a, 'refused');
          equal('refused-suffix-stays-exact', await g(a, 'inventory'), partial);
          await c(a, 'fault', 'journal-noop');
          await c(a, 'resume', 'noop', code);
          check('silent-removal-no-success', (await settled(a, 'noop')).status, 'rejected');
          equal('silent-removal-keeps-state', await g(a, 'inventory'), partial);
          await c(a, 'fault', null);
          await c(a, 'resume', 'retry', code);
          check('journal-resume', (await settled(a, 'retry')).value?.kind, 'cleared');
          await finishCheck(a, target);
          schedule.push(
            'One real synchronous journal removal, injected throw, renderer death, refused/no-op removals, then successful resumption',
          );
          break;
        }
        case 'L12.aborts': {
          await c(a, 'fault', 'abort-intent');
          await c(a, 'start', 'first', code);
          check(
            'intent-request-success-provisional',
            (await settled(a, 'first')).status,
            'rejected',
          );
          equal('intent-abort-preserves-all', await g(a, 'inventory'), before);
          await c(a, 'fault', 'abort-stage-index');
          await c(a, 'start', 'keys', code);
          await settled(a, 'keys');
          let inv = await g(a, 'inventory');
          check('key-delete-abort-keeps-stage', marker(inv).stage, 'custody');
          equal(
            'key-delete-abort-keeps-openers',
            noIntent(inv['done.custody'].entries),
            before['done.custody'].entries,
          );
          await c(a, 'fault', 'abort-index-delete');
          await c(a, 'resume', 'index', code);
          await settled(a, 'index');
          inv = await g(a, 'inventory');
          check('index-abort-keeps-stage', marker(inv).stage, 'index');
          check('index-abort-has-no-openers', inv['done.custody'].entries.length, 1);
          equal('index-abort-keeps-route', inv['done.slots'], before['done.slots']);
          await c(a, 'resume', 'retry', code);
          check('aborted-phases-resume', (await settled(a, 'retry')).value?.kind, 'cleared');
          await finishCheck(a, target);
          schedule.push(
            'Native transaction.abort after request success at intent, atomic custody removal/progress, and index deletion',
          );
          break;
        }
        case 'L13.factor': {
          await c(a, 'fault', 'abort-index-delete');
          await c(a, 'start', 'clear', code);
          await settled(a, 'clear');
          const keyless = await g(a, 'inventory');
          check('no-content-opener-for-resume', keyless['done.custody'].entries.length, 1);
          await c(a, 'resume', 'wrong', '0'.repeat(25));
          check(
            'wrong-factor-cannot-finish-keyless-clear',
            (await settled(a, 'wrong')).error?.disposition?.kind,
            'unlock-failed',
          );
          equal('wrong-factor-preserves-keyless-progress', await g(a, 'inventory'), keyless);
          await c(a, 'resume', 'valid', code);
          check(
            'valid-factor-finishes-keyless-clear',
            (await settled(a, 'valid')).value?.kind,
            'cleared',
          );
          break;
        }
        case 'L14.guards': {
          await c(a, 'fault', 'delete-error');
          await c(a, 'start', 'clear', code);
          await settled(a, 'clear');
          const held = await g(a, 'inventory');
          await c(a, 'lowOpen', 'low', code);
          const low = await settled(a, 'low');
          check(
            'component-refuses-before-key-access',
            [low.error?.disposition?.kind, (await c(a, 'snapshot')).decryptions],
            ['clearing', 0],
          );
          await c(a, 'lowClose');
          await g(a, 'open', 'open', 'local-slot', code);
          check(
            'owned-open-refuses',
            (await settled(a, 'open', 'genesis')).value?.kind,
            'clearing',
          );
          const newCode = await g(a, 'begin');
          await g(a, 'confirm', 'new', newCode);
          check(
            'fresh-creation-refuses',
            (await settled(a, 'new', 'genesis')).error?.disposition?.kind,
            'clearing',
          );
          equal('refused-opens-retain-carriers', await g(a, 'inventory'), held);
          await c(a, 'resume', 'resume', code);
          check('guarded-clear-resumes', (await settled(a, 'resume')).value?.kind, 'cleared');
          break;
        }
        case 'L15.lifetime': {
          const other = await seed(a, 'other', 'other');
          await c(a, 'setTarget', target);
          await g(a, 'open', 'open', 'local-slot', code);
          check('writer-opens', (await settled(a, 'open', 'genesis')).value?.kind, 'ready');
          const b = await page();
          await c(b, 'setTarget', target);
          const cd = await context.newCDPSession(a);
          await cd.send('Page.setWebLifecycleState', { state: 'frozen' });
          await c(b, 'start', 'clear', code);
          await pending(b);
          check(
            'frozen-writer-blocks-clear',
            (await c(b, 'snapshot')).entries.clear.status,
            'pending',
          );
          await g(b, 'open', 'other', 'other', other.code);
          check(
            'other-slot-continues',
            (await settled(b, 'other', 'genesis')).value?.kind,
            'ready',
          );
          const otherBefore = await g(b, 'inventory');
          await cd.send('Page.setWebLifecycleState', { state: 'active' });
          await g(a, 'input', 'late', 'late-before-clear');
          await settled(a, 'late', 'genesis');
          await g(a, 'close');
          check('clear-after-writer-drain', (await settled(b, 'clear')).value?.kind, 'cleared');
          const after = await finishCheck(b, target);
          equal(
            'independent-content-survives',
            after[other.target.dbName],
            otherBefore[other.target.dbName],
          );
          check('independent-editor-still-active', (await g(b, 'snapshot')).mounts, 1);
          schedule.push(
            'Real frozen shared writer blocks clear; unrelated slot opens; resumed writer admits late input and closes before exclusive cleanup',
          );
          break;
        }
        case 'L16.recheck': {
          await c(a, 'start', 'stale', code, { ...target, storeId: 'ff'.repeat(16) });
          check(
            'stale-target-refuses',
            (await settled(a, 'stale')).error?.disposition?.kind,
            'repair-required',
          );
          equal('stale-target-no-writes', await g(a, 'inventory'), before);
          await g(a, 'open', 'open', 'local-slot', code);
          await settled(a, 'open', 'genesis');
          const b = await page();
          await c(b, 'setTarget', target);
          await c(b, 'start', 'queued', code);
          await pending(b);
          await c(a, 'addUnknown');
          await g(a, 'close');
          const retained = await g(a, 'inventory');
          check(
            'grant-rereads-unknown-reference',
            (await settled(b, 'queued')).error?.disposition?.kind,
            'repair-required',
          );
          equal('unknown-reference-not-swept', await g(a, 'inventory'), retained);
          break;
        }
        case 'L17.cancel': {
          await c(a, 'blockContent');
          await c(a, 'start', 'clear', code);
          await a.waitForFunction(() => window.clear.snapshot().progress.some((p) => p.blocked));
          await c(a, 'cancel');
          const b = await page();
          await g(b, 'barrier', 'next');
          await pending(b);
          check(
            'cancelled-delete-still-retains-permit',
            (await g(b, 'snapshot')).entries.next.status,
            'pending',
          );
          const retained = await c(a, 'retained');
          equal('cancelled-block-keeps-journal', retained.journal, before.localStorage);
          await c(a, 'unblock');
          check('cancelled-call-no-success', (await settled(a, 'clear')).status, 'rejected');
          await settled(b, 'next', 'genesis');
          const after = await g(a, 'inventory');
          check('native-delete-cannot-rollback', Boolean(after[target.dbName]), false);
          check('cancel-retains-authorized-intent', marker(after).stage, 'content');
          equal(
            'cancel-keeps-openers',
            noIntent(after['done.custody'].entries),
            before['done.custody'].entries,
          );
          await c(a, 'resume', 'resume', code);
          check('cancelled-delete-resumes', (await settled(a, 'resume')).value?.kind, 'cleared');
          schedule.push(
            'Cancellation while actual native deletion is blocked; request still settles before permit release; intent resumes after irreversible deletion',
          );
          break;
        }
      }
    check('production-does-not-enumerate-databases', (await g(a, 'snapshot')).enumerationCalls, 0);
    check('no-unhandled-page-errors', errors, []);
    status = assertions.every((a) => a.passed) ? 'pass' : 'fail';
  } catch (cause) {
    error = { message: cause.message, stack: cause.stack };
  } finally {
    await context?.close();
  }
  return { ...definition, status, assertions, schedule, artifacts, ...(error ? { error } : {}) };
}
