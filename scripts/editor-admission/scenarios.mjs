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
    const passed = isDeepStrictEqual(actual, expected);
    assertions.push({ id, actual, expected, passed });
    return passed;
  };
  const call = (page, method, ...args) =>
    page.evaluate(({ method, args }) => window.integration[method](...args), { method, args });
  const base = (page, method, ...args) =>
    page.evaluate(({ method, args }) => window.content[method](...args), { method, args });
  const journal = (page, method, ...args) =>
    page.evaluate(({ method, args }) => window.journal[method](...args), { method, args });
  const snapshot = (p) => call(p, 'snapshot');
  const settled = async (p, id, owner = 'integration') => {
    await p.waitForFunction(
      ({ id, owner }) =>
        ['resolved', 'rejected'].includes(window[owner].snapshot().entries[id]?.status),
      { id, owner },
    );
    const result = await p.evaluate(({ id, owner }) => window[owner].snapshot().entries[id], {
      id,
      owner,
    });
    if (result.status !== 'resolved') throw Error('Unexpected refusal: ' + JSON.stringify(result));
    return result.value;
  };
  const page = async () => {
    const p = await context.newPage();
    p.setDefaultTimeout(15000);
    p.on('pageerror', (e) => pageErrors.push(e.message));
    await p.goto(env.url);
    await p.waitForFunction(() => window.integration);
    return p;
  };
  const open = async (p, code) => {
    await call(p, 'open', code);
    await settled(p, 'open');
  };
  const idle = (p) =>
    p.waitForFunction(() => window.integration.snapshot().status.pendingItems === 0);
  const gate = (p) => p.waitForFunction(() => window.content.snapshot().gates.includes('sealed'));
  const crash = async (p) => {
    const cdp = await context.newCDPSession(p),
      died = p.waitForEvent('crash');
    void cdp.send('Page.crash').catch(() => {});
    await died;
    await p.close();
    schedule.push('Actual renderer death without close');
  };
  try {
    context = await env.browser.newContext();
    await context.route('**/*', (r) =>
      new URL(r.request().url()).origin === env.origin ? r.continue() : r.abort('blockedbyclient'),
    );
    let a = await page();
    const code = await base(a, 'enroll');
    await base(a, 'initialize', 'init', code);
    await settled(a, 'init', 'content');
    await open(a, code);
    switch (definition.id) {
      case 'E11.repair': {
        // Mutate in the same page evaluation as the synchronous append, before the 250ms timer.
        await a.evaluate(async () => {
          window.integration.input('seed', 'insert', 'damaged');
          await window.journal.tamper('legacy');
          window.integration.durable('repair');
        });
        await a.waitForFunction(
          () => window.integration.snapshot().status.pressure?.code === 'repair-required',
        );
        const s = await snapshot(a);
        check('repair-disables-ordinary-editor', [s.view, s.dom], ['', '']);
        check('repair-refuses-export', s.exported, undefined);
        check(
          'repair-retains-carrier',
          Object.values(await journal(a, 'inventory')).includes('1:plaintext legacy'),
          true,
        );
        check(
          'repair-disables-input',
          await a.locator('.cm-content').getAttribute('contenteditable'),
          'false',
        );
        break;
      }
      case 'E12.multicaret': {
        await call(a, 'paste', 'ab cd');
        await idle(a);
        await call(a, 'selectRanges', [
          [1, 1],
          [4, 4],
        ]);
        await a.keyboard.type('X');
        await idle(a);
        check('native-multicaret-insert', (await snapshot(a)).view, 'aXb cXd');
        await a.keyboard.press('Backspace');
        await idle(a);
        check('admitted-multicaret-delete', (await snapshot(a)).view, 'ab cd');
        break;
      }
      case 'E09.pending-death': {
        await a.keyboard.type('base');
        await idle(a);
        await call(a, 'durable', 'durable');
        await settled(a, 'durable');
        await journal(a, 'fault', 'quota');
        await base(a, 'fault', 'gate-sealed');
        await a.keyboard.type('X');
        await gate(a);
        await a.keyboard.type('Y');
        check(
          'pending-death-visible-prefix',
          [(await snapshot(a)).view, (await snapshot(a)).exported[0].content],
          ['base', 'base'],
        );
        await crash(a);
        a = await page();
        await open(a, code);
        check('cold-prefix-without-unaccepted-suffix', (await snapshot(a)).view, 'base');
        break;
      }
      case 'E10.checkbox': {
        await call(a, 'paste', '- [ ] task\n\n');
        await idle(a);
        await journal(a, 'fault', 'quota');
        await base(a, 'fault', 'gate-sealed');
        await a.getByRole('checkbox').click();
        await gate(a);
        check('task-widget-private-before-commit', (await snapshot(a)).view, '- [ ] task\n\n');
        await base(a, 'release', 'sealed');
        await idle(a);
        check('task-widget-admitted', (await snapshot(a)).view, '- [x] task\n\n');
        break;
      }
      case 'E01.typing': {
        await a.keyboard.type('hello');
        await idle(a);
        let s = await snapshot(a);
        check(
          'native-typing-visible',
          [s.view, s.accepted.text, s.exported[0].content],
          ['hello', 'hello', 'hello'],
        );
        await call(a, 'select', 0, 5);
        await a.keyboard.press('Meta+b');
        await idle(a);
        check('real-bold-command', (await snapshot(a)).view, '**hello**');
        await a.keyboard.press('Meta+z');
        await idle(a);
        check('real-undo-command', (await snapshot(a)).view, 'hello');
        await call(a, 'select', 0, 5);
        check('cut-copies-accepted', await call(a, 'cut'), 'hello');
        await idle(a);
        check('cut-is-admitted', (await snapshot(a)).view, '');
        await a.keyboard.press('Meta+z');
        await idle(a);
        await crash(a);
        a = await page();
        await open(a, code);
        check(
          'cold-real-editor',
          [(await snapshot(a)).view, (await snapshot(a)).accepted.undo],
          ['hello', 0],
        );
        break;
      }
      case 'E02.pressure': {
        await journal(a, 'fault', 'quota');
        await base(a, 'fault', 'gate-sealed');
        await a.keyboard.type('A');
        await gate(a);
        await a.keyboard.type('B');
        await call(a, 'paste', 'C');
        let s = await snapshot(a);
        check('pending-not-in-editor', [s.view, s.accepted.text, s.dom], ['', '', '']);
        check('pending-not-in-history', s.accepted.undo, 0);
        check('pending-not-in-export-or-send', [s.exported[0].content, s.outgoing.length], ['', 0]);
        check('three-intents-retained', s.status.pendingItems, 3);
        check('pressure-is-actionable', s.message.includes('waiting'), true);
        await base(a, 'fault', 'abort-content');
        await base(a, 'release', 'sealed');
        await a.waitForFunction(() => window.integration.snapshot().status.state === 'blocked');
        check('failed-content-keeps-editor-private', (await snapshot(a)).view, '');
        await a.getByRole('button', { name: 'Retry storage' }).click();
        await idle(a);
        check('queued-caret-order', (await snapshot(a)).view, 'ABC');
        await crash(a);
        a = await page();
        await open(a, code);
        check('cold-retried-text', (await snapshot(a)).view, 'ABC');
        break;
      }
      case 'E03.remote': {
        await call(a, 'input', 'seed', 'insert', 'AB');
        await settled(a, 'seed');
        const bytes = await call(a, 'remote', 1, 'R');
        await base(a, 'fault', 'gate-sealed');
        await call(a, 'receive', 'remote', bytes);
        await gate(a);
        check('remote-private-until-commit', (await snapshot(a)).view, 'AB');
        await call(a, 'input', 'undo', 'undo');
        await base(a, 'release', 'sealed');
        await settled(a, 'remote');
        await settled(a, 'undo');
        const s = await snapshot(a);
        check('undo-preserves-remote', s.view, 'R');
        check(
          'receive-publication-after-content',
          s.publications.find((p) => p.text === 'ARB')?.commits > 0,
          true,
        );
        check('receive-not-echoed', s.outgoing.length, 2);
        await crash(a);
        a = await page();
        await open(a, code);
        check('offline-remote-basis', (await snapshot(a)).view, 'R');
        break;
      }
      case 'E04.cross-tab': {
        const b = await page();
        await open(b, code);
        await base(b, 'fault', 'gate-sealed');
        await a.keyboard.type('R');
        await idle(a);
        await gate(b);
        check('channel-private-before-local-commit', (await snapshot(b)).view, '');
        await b.keyboard.type('L');
        check('dependent-input-private', (await snapshot(b)).view, '');
        await base(b, 'release', 'sealed');
        await idle(b);
        check('cross-tab-command-order', (await snapshot(b)).view, 'LR');
        await a.waitForFunction(() => window.integration.snapshot().view === 'LR');
        check('both-real-editors-converge', (await snapshot(a)).view, 'LR');
        check(
          'no-channel-errors',
          [(await snapshot(a)).errors, (await snapshot(b)).errors],
          [[], []],
        );
        await crash(a);
        await crash(b);
        a = await page();
        await open(a, code);
        check('cold-channel-dependent-text', (await snapshot(a)).view, 'LR');
        break;
      }
      case 'E05.paste': {
        const source = '🙂'.repeat(1250);
        await call(a, 'paste', source);
        await idle(a);
        check('unicode-paste-complete', (await snapshot(a)).view, source);
        check('paste-one-undo-step', (await snapshot(a)).accepted.undo, 1);
        await a.keyboard.press('Meta+z');
        await idle(a);
        check('whole-paste-undo', (await snapshot(a)).view, '');
        await a.keyboard.press('Meta+Shift+z');
        await idle(a);
        check('whole-paste-redo', (await snapshot(a)).view, source);
        await crash(a);
        a = await page();
        await open(a, code);
        check('cold-paste-result', (await snapshot(a)).view, source);
        break;
      }
      case 'E06.composition': {
        const cdp = await context.newCDPSession(a);
        await cdp.send('Input.imeSetComposition', {
          text: 'に',
          selectionStart: 1,
          selectionEnd: 1,
        });
        let s = await snapshot(a);
        check(
          'preedit-not-accepted',
          [s.accepted.text, s.accepted.undo, s.outgoing.length],
          ['', 0, 0],
        );
        await journal(a, 'fault', 'quota');
        await base(a, 'fault', 'gate-sealed');
        await cdp.send('Input.insertText', { text: '日本' });
        await new Promise((r) => setTimeout(r, 100));
        artifacts.push({ type: 'composition-events', snapshot: await snapshot(a) });
        await gate(a);
        s = await snapshot(a);
        check(
          'composition-commit-private',
          [s.view, s.accepted.text, s.accepted.undo],
          ['', '', 0],
        );
        await base(a, 'release', 'sealed');
        await idle(a);
        check('composition-commits-once', (await snapshot(a)).view, '日本');
        await a.keyboard.type('!');
        await idle(a);
        check('typing-after-composition', (await snapshot(a)).view, '日本!');
        break;
      }
      case 'E07.close': {
        await a.keyboard.type('old');
        await idle(a);
        await call(a, 'close');
        await settled(a, 'close');
        const s = await snapshot(a);
        check('close-clears-editor', s.view, '');
        check('close-refuses-export', s.exported, undefined);
        check(
          'close-disables-contenteditable',
          await a.locator('.cm-content').getAttribute('contenteditable'),
          'false',
        );
        break;
      }
      case 'E08.profile': {
        const rows = await call(a, 'profile');
        artifacts.push({ type: 'prepare-profile', cpuThrottle: 1, rows });
        check(
          'profile-sample-inventory',
          rows.map((r) => r.samples.length),
          [50, 50, 50, 50, 30],
        );
        check(
          'profile-finite-values',
          rows.every((r) => r.samples.every((n) => Number.isFinite(n) && n >= 0)),
          true,
        );
        break;
      }
    }
    check('no-unhandled-page-errors', pageErrors, []);
    status = assertions.every((a) => a.passed) ? 'pass' : 'fail';
  } catch (cause) {
    error = { message: cause.message, stack: cause.stack };
  } finally {
    await context?.close();
  }
  return { ...definition, status, assertions, schedule, artifacts, ...(error ? { error } : {}) };
}
