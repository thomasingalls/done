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
  const settled = async (p, id, owner = 'integration', expected = 'resolved') => {
    await p.waitForFunction(
      ({ id, owner }) =>
        ['resolved', 'rejected'].includes(window[owner].snapshot().entries[id]?.status),
      { id, owner },
    );
    const result = await p.evaluate(({ id, owner }) => window[owner].snapshot().entries[id], {
      id,
      owner,
    });
    if (result.status !== expected) throw Error('Unexpected outcome: ' + JSON.stringify(result));
    return expected === 'resolved' ? result.value : result.error;
  };
  const page = async () => {
    const p = await context.newPage();
    p.setDefaultTimeout(12000);
    p.on('pageerror', (e) => pageErrors.push(e.message));
    await p.goto(env.url);
    await p.waitForFunction(() => window.integration);
    return p;
  };
  const open = async (p, code, actor, channel) => {
    await call(p, 'open', code, actor, channel);
    await settled(p, 'open');
  };
  const idle = (p) =>
    p.waitForFunction(() => window.integration.snapshot().status.pendingItems === 0);
  const gate = (p) => p.waitForFunction(() => window.content.snapshot().gates.includes('sealed'));
  const command = async (p, id, value) => {
    await call(p, 'command', id, value);
    return (await settled(p, id)).value;
  };
  const next = { date: '2026-09-08', section: 'next' },
    done = { ...next, section: 'done' },
    master = { kind: 'master' };
  const compose = async (p, text = 'card', to = next) =>
    (await command(p, 'compose-' + text, { kind: 'compose', text, to })).id;
  const durable = async (p) => {
    await call(p, 'durable', 'durable');
    await settled(p, 'durable');
  };
  const crash = async (p) => {
    const cdp = await context.newCDPSession(p),
      died = p.waitForEvent('crash');
    void cdp.send('Page.crash').catch(() => {});
    await died;
    await p.close();
    schedule.push('Actual renderer death without closing the admission session');
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
    if (definition.id !== 'W09.initialize')
      await open(a, code, 'human-one', definition.id === 'W04.cross-tab');
    switch (definition.id) {
      case 'W10.repair': {
        const id = await compose(a);
        await call(a, 'mount', id);
        await a.evaluate(async () => {
          window.integration.input('seed', { kind: 'master' }, 'damaged');
          await window.journal.tamper('legacy');
          window.integration.durable('repair');
        });
        await a.waitForFunction(
          () => window.integration.snapshot().status.pressure?.code === 'repair-required',
        );
        const s = await snapshot(a);
        check(
          'repair-clears-both-ordinary-surfaces',
          [s.views.goals.text, s.views.card.text, s.views.goals.editable, s.views.card.editable],
          ['', '', 'false', 'false'],
        );
        check('repair-refuses-workspace-export', s.exported, undefined);
        check(
          'repair-retains-unreadable-journal',
          Object.values(await journal(a, 'inventory')).includes('1:plaintext legacy'),
          true,
        );
        break;
      }
      case 'W01.surfaces': {
        const id = await compose(a);
        await call(a, 'mount', id);
        await a.locator('#goals .cm-content').click();
        await a.keyboard.type('G');
        await idle(a);
        await call(a, 'select', 'card', 4);
        await a.locator('#card .cm-content').focus();
        await a.keyboard.type('!');
        await idle(a);
        await command(a, 'move', { kind: 'move', id, to: done });
        let s = await snapshot(a);
        check(
          'surfaces-and-move-visible',
          [s.views.goals.text, s.views.card.text, s.accepted.cards[0].location, s.accepted.undo],
          ['G', 'card!', done, 4],
        );
        check(
          'accepted-export-includes-card',
          s.exported.some((e) => e.content.includes('card!')),
          true,
        );
        await a.keyboard.press('Meta+z');
        await idle(a);
        check(
          'card-shortcut-undoes-workspace-move',
          (await snapshot(a)).accepted.cards[0].location,
          next,
        );
        await a.locator('#goals .cm-content').focus();
        await a.keyboard.press('Meta+z');
        await idle(a);
        check('goals-shortcut-undoes-card-text', (await snapshot(a)).views.card.text, 'card');
        await command(a, 'undo-goals', { kind: 'undo' });
        await command(a, 'undo-create', { kind: 'undo' });
        s = await snapshot(a);
        check(
          'human-undo-preserves-day',
          [s.accepted.cards.length, s.accepted.days.length, s.accepted.master],
          [0, 1, ''],
        );
        await call(a, 'close');
        await settled(a, 'close');
        s = await snapshot(a);
        check(
          'close-clears-both-editors',
          [s.views.goals.text, s.views.card.text, s.views.goals.editable, s.views.card.editable],
          ['', '', 'false', 'false'],
        );
        check('close-refuses-export', s.exported, undefined);
        break;
      }
      case 'W02.pressure': {
        const id = await compose(a);
        await durable(a);
        await journal(a, 'fault', 'quota');
        await base(a, 'fault', 'gate-sealed');
        await call(a, 'command', 'move', { kind: 'move', id, to: done });
        await gate(a);
        await a.keyboard.type('Q');
        let s = await snapshot(a);
        check('pending-history-private', s.accepted.undo, 1);
        check(
          'pending-command-private',
          [s.accepted.cards[0].location, s.views.goals.text, s.outgoing.length],
          [next, '', 1],
        );
        await base(a, 'fault', 'abort-content');
        await base(a, 'release', 'sealed');
        await a.waitForFunction(() => window.integration.snapshot().status.state === 'blocked');
        s = await snapshot(a);
        check(
          'aborted-command-keeps-prefix',
          [s.accepted.cards[0].location, s.accepted.undo, s.views.goals.text],
          [next, 1, ''],
        );
        await call(a, 'retry');
        await settled(a, 'move');
        await idle(a);
        s = await snapshot(a);
        check(
          'retry-promotes-command-and-dependent-input',
          [s.accepted.cards[0].location, s.views.goals.text, s.accepted.undo],
          [done, 'Q', 3],
        );
        await crash(a);
        a = await page();
        await open(a, code);
        s = await snapshot(a);
        check(
          'offline-recovery-agrees',
          [s.accepted.cards[0].location, s.views.goals.text, s.accepted.undo],
          [done, 'Q', 0],
        );
        break;
      }
      case 'W03.undo-death': {
        const id = await compose(a);
        await command(a, 'move', { kind: 'move', id, to: done });
        await durable(a);
        await journal(a, 'fault', 'quota');
        await base(a, 'fault', 'gate-sealed');
        await call(a, 'command', 'undo', { kind: 'undo' });
        await gate(a);
        const s = await snapshot(a);
        check(
          'undo-private-until-carrier',
          [s.accepted.cards[0].location, s.accepted.undo, s.accepted.redo],
          [done, 2, 0],
        );
        check(
          'unaccepted-undo-not-exported',
          s.exported.find((e) => e.path.includes(next.date))?.content.includes('card'),
          true,
        );
        await crash(a);
        a = await page();
        await open(a, code);
        check(
          'cold-state-excludes-unaccepted-undo',
          (await snapshot(a)).accepted.cards[0].location,
          done,
        );
        break;
      }
      case 'W04.cross-tab': {
        const id = await compose(a);
        await durable(a);
        const b = await page();
        await open(b, code, 'human-two', true);
        await a.waitForFunction(() =>
          window.integration.snapshot().accepted.actors.some((x) => x.id === 'human-two'),
        );
        await idle(a);
        await idle(b);
        check(
          'handshake-supplies-second-actor',
          (await snapshot(a)).accepted.actors.map((x) => x.id).sort(),
          ['human-one', 'human-two', 'system'],
        );
        await base(a, 'fault', 'gate-sealed');
        await command(b, 'move', { kind: 'move', id, to: done });
        await gate(a);
        await call(a, 'command', 'dependent', {
          kind: 'move',
          id,
          to: { ...next, section: 'scheduled' },
        });
        const before = await snapshot(a);
        check(
          'channel-and-dependent-command-private',
          [before.accepted.cards[0].location, before.accepted.undo],
          [next, 1],
        );
        const commits = before.commits;
        await base(a, 'release', 'sealed');
        await settled(a, 'dependent');
        await idle(a);
        await b.waitForFunction(
          () => window.integration.snapshot().accepted.cards[0].location.section === 'scheduled',
        );
        let s = await snapshot(a);
        check('channel-command-order', s.accepted.cards[0].location.section, 'scheduled');
        check(
          'receive-published-after-local-disk',
          s.publications.find((p) => p.state.cards[0]?.location.section === 'done')?.commits >
            commits,
          true,
        );
        check('no-channel-errors', [s.errors, (await snapshot(b)).errors], [[], []]);
        await crash(a);
        await crash(b);
        a = await page();
        await open(a, code);
        s = await snapshot(a);
        check('cold-cross-tab-state', s.accepted.cards[0].location.section, 'scheduled');
        break;
      }
      case 'W05.system': {
        const id = await compose(a);
        const second = await compose(a, 'two');
        await command(a, 'bulk', { kind: 'bulk', from: next.date, to: done });
        let s = await snapshot(a);
        check(
          'bulk-outside-human-history',
          [s.accepted.undo, s.accepted.days[0].done.length],
          [2, 2],
        );
        const update = await call(a, 'corruptMembership', second);
        await call(a, 'receive', 'duplicate', update);
        await settled(a, 'duplicate');
        await idle(a);
        s = await snapshot(a);
        check(
          'membership-repair-is-admitted-system-work',
          [s.accepted.days[0].next, s.accepted.days[0].done.length, s.accepted.undo],
          [[], 2, 2],
        );
        await command(a, 'settings', { kind: 'settings', rolloverHour: 4 });
        await command(a, 'actor', { kind: 'actor', patch: { name: 'Alice' } });
        s = await snapshot(a);
        check(
          'metadata-preserves-content-history',
          [
            s.accepted.undo,
            s.accepted.settings.rolloverHour,
            s.accepted.actors.find((x) => x.id === 'human-one').name,
          ],
          [2, 4, 'Alice'],
        );
        check(
          'initial-card-survives-system-work',
          s.accepted.cards.some((c) => c.id === id),
          true,
        );
        break;
      }
      case 'W06.remote': {
        await a.keyboard.type('A');
        await idle(a);
        await durable(a);
        const update = await call(a, 'remoteText', 'R');
        await base(a, 'fault', 'gate-sealed');
        await call(a, 'receive', 'remote', update);
        await gate(a);
        await call(a, 'command', 'undo', { kind: 'undo' });
        check(
          'received-text-and-undo-private',
          [(await snapshot(a)).views.goals.text, (await snapshot(a)).accepted.undo],
          ['A', 1],
        );
        await base(a, 'release', 'sealed');
        await settled(a, 'remote');
        await settled(a, 'undo');
        const s = await snapshot(a);
        check('undo-preserves-remote', s.views.goals.text, 'R');
        check('receive-not-echoed', s.outgoing.length, 2);
        await crash(a);
        a = await page();
        await open(a, code);
        check('cold-remote-basis', (await snapshot(a)).views.goals.text, 'R');
        break;
      }
      case 'W07.history': {
        const id = await compose(a);
        await call(a, 'input', 'edit', { kind: 'card', id }, '!', 4);
        await settled(a, 'edit');
        await command(a, 'remove', { kind: 'remove', id });
        await command(a, 'undo-remove', { kind: 'undo' });
        check('nested-card-restored', (await snapshot(a)).accepted.cards[0]?.text, 'card!');
        await command(a, 'undo-edit', { kind: 'undo' });
        check('undo-edit-in-restored-card', (await snapshot(a)).accepted.cards[0]?.text, 'card');
        for (let i = 0; i < 3; i++) {
          await command(a, 'redo-edit', { kind: 'redo' });
          check('redo-restored-edit-' + i, (await snapshot(a)).accepted.cards[0]?.text, 'card!');
          await command(a, 'undo-edit', { kind: 'undo' });
          check('repeat-restored-undo-' + i, (await snapshot(a)).accepted.cards[0]?.text, 'card');
        }
        break;
      }
      case 'W08.rules': {
        const id = await compose(a, 'first second', done);
        check(
          'business-null-receipt',
          await command(a, 'no-previous', { kind: 'merge', id }),
          null,
        );
        const split = await command(a, 'split', { kind: 'split', id, at: 5, tailFrom: 6 });
        check(
          'split-preserves-existing-semantics',
          (await snapshot(a)).accepted.cards.map((c) => c.text).sort(),
          ['first', 'second'],
        );
        await command(a, 'merge', { kind: 'merge', id: split });
        check(
          'merge-preserves-existing-semantics',
          (await snapshot(a)).accepted.cards[0].text,
          'firstsecond',
        );
        await compose(a, 'one');
        await compose(a, 'two');
        await compose(a, 'three');
        check(
          'capacity-refusal',
          await command(a, 'four', { kind: 'compose', to: next, text: 'four' }),
          false,
        );
        await call(a, 'setDate', '2026-09-15');
        await call(a, 'mount', id);
        check('frozen-card-readonly', (await snapshot(a)).views.card.editable, 'false');
        await call(a, 'input', 'frozen', { kind: 'card', id }, 'x', 0);
        check(
          'frozen-input-refused',
          Boolean((await settled(a, 'frozen', 'integration', 'rejected')).message),
          true,
        );
        await call(a, 'input', 'goals', master, 'still editable');
        await settled(a, 'goals');
        check('goals-remain-editable', (await snapshot(a)).views.goals.text, 'still editable');
        break;
      }
      case 'W09.initialize': {
        await base(a, 'fault', 'gate-sealed');
        await call(a, 'open', code);
        await gate(a);
        const s = await snapshot(a);
        check(
          'no-editor-before-initialization-commit',
          [s.entries.open.status, s.views, s.accepted],
          ['pending', {}, undefined],
        );
        await base(a, 'fault', 'abort-content');
        await base(a, 'release', 'sealed');
        const failed = await settled(a, 'open', 'integration', 'rejected');
        check('initialization-failure-exposed', Boolean(failed.message), true);
        check('failed-initialization-never-mounts', (await snapshot(a)).views, {});
        await crash(a);
        a = await page();
        await open(a, code);
        const recovered = await snapshot(a);
        check(
          'initialization-retry-recovers-actor-without-undo',
          [recovered.accepted.actors.map((x) => x.id).sort(), recovered.accepted.undo],
          [['human-one', 'system'], 0],
        );
        check('initialized-before-open-completion', recovered.commits > 0, true);
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
