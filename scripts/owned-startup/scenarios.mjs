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
  const call = (p, method, ...args) =>
    p.evaluate(({ method, args }) => window.startup[method](...args), { method, args });
  const base = (p, method, ...args) =>
    p.evaluate(({ method, args }) => window.content[method](...args), { method, args });
  const snapshot = (p) => call(p, 'snapshot');
  const settled = async (p, id, owner = 'startup') => {
    await p.waitForFunction(
      ({ id, owner }) =>
        ['resolved', 'rejected'].includes(window[owner].snapshot().entries[id]?.status),
      { id, owner },
    );
    const entry = await p.evaluate(({ id, owner }) => window[owner].snapshot().entries[id], {
      id,
      owner,
    });
    if (entry.status !== 'resolved')
      throw Error('Unexpected fixture rejection: ' + JSON.stringify(entry));
    return entry.value;
  };
  const page = async () => {
    const p = await context.newPage();
    p.setDefaultTimeout(15000);
    p.on('pageerror', (e) => pageErrors.push(e.message));
    await p.goto(env.url);
    await p.waitForFunction(() => window.startup);
    return p;
  };
  const inspect = async (p, id = 'inspect', workspaceId) => {
    await call(p, 'inspect', id, workspaceId);
    return settled(p, id);
  };
  const open = async (p, code, id = 'open', workspaceId) => {
    await call(p, 'open', id, code, workspaceId);
    return settled(p, id);
  };
  const gate = (p, name, owner = 'content') =>
    p.waitForFunction(({ name, owner }) => window[owner].snapshot().gates.includes(name), {
      name,
      owner,
    });
  const crash = async (p) => {
    const cdp = await context.newCDPSession(p),
      died = p.waitForEvent('crash');
    void cdp.send('Page.crash').catch(() => {});
    await died;
    await p.close();
    schedule.push('Actual renderer death without graceful close');
  };
  const notExposed = async (p, id) => {
    const s = await snapshot(p);
    check(
      id,
      [s.mounts, s.channels, s.accepted, s.exported, s.view],
      [0, 0, undefined, undefined, undefined],
    );
  };
  try {
    context = await env.browser.newContext();
    await context.route('**/*', (r) =>
      new URL(r.request().url()).origin === env.origin ? r.continue() : r.abort('blockedbyclient'),
    );
    let a = await page(),
      code;
    if (!['O01.absence', 'O06.legacy', 'O07.creation'].includes(definition.id))
      code = await call(a, 'seed');
    switch (definition.id) {
      case 'O01.absence': {
        const before = await call(a, 'databases');
        check('absent-is-observed-fresh', (await inspect(a)).kind, 'fresh');
        check('preflight-no-database-side-effects', await call(a, 'databases'), before);
        check('normal-open-does-not-enroll', (await open(a, '0'.repeat(25))).kind, 'fresh');
        check('open-no-database-side-effects', await call(a, 'databases'), before);
        await notExposed(a, 'fresh-never-exposed');
        break;
      }
      case 'O02.orphan': {
        await call(a, 'mutate', 'unindexed');
        const before = await call(a, 'inventory');
        check('orphan-not-fresh', (await inspect(a)).kind, 'repair-required');
        check('orphan-open-refuses', (await open(a, code)).kind, 'repair-required');
        check('orphan-carriers-retained', await call(a, 'inventory'), before);
        await notExposed(a, 'orphan-never-exposed');
        break;
      }
      case 'O03.missing-content':
      case 'O04.missing-custody':
      case 'O05.routing': {
        const mutation = {
          'O03.missing-content': 'missing-content',
          'O04.missing-custody': 'missing-custody',
          'O05.routing': 'route',
        }[definition.id];
        await call(a, 'mutate', mutation);
        const before = await call(a, 'inventory');
        check('incomplete-open-is-repair', (await open(a, code)).kind, 'repair-required');
        check('no-replacement-or-cleanup', await call(a, 'inventory'), before);
        await notExposed(a, 'incomplete-never-exposed');
        break;
      }
      case 'O06.legacy': {
        await call(a, 'legacy');
        const before = await call(a, 'inventory');
        check('selected-legacy-disposition', await inspect(a), {
          kind: 'migration-required',
          reason: 'selected-legacy-route',
        });
        check(
          'legacy-normal-open-refuses',
          (await open(a, '0'.repeat(25))).kind,
          'migration-required',
        );
        check('legacy-routing-and-content-retained', await call(a, 'inventory'), before);
        await notExposed(a, 'legacy-not-replaced');
        break;
      }
      case 'O07.creation': {
        code = await call(a, 'partial');
        await base(a, 'fault', 'gate-ready');
        await base(a, 'initialize', 'partial', code);
        await gate(a, 'ready');
        await crash(a);
        a = await page();
        const before = await call(a, 'inventory');
        check('partial-creation-classified', await inspect(a), {
          kind: 'creation-pending',
          reason: 'content-intent-needs-verified-resumption',
        });
        check('partial-normal-open-refuses', (await open(a, code)).kind, 'creation-pending');
        check('partial-intent-and-counter-retained', await call(a, 'inventory'), before);
        await notExposed(a, 'partial-never-exposed');
        break;
      }
      case 'O08.clear': {
        for (const state of ['clearing', 'cleared']) {
          await call(a, 'marker', state);
          const before = await call(a, 'inventory');
          check(state + '-disposition', (await inspect(a, 'inspect-' + state)).kind, state);
          check(state + '-blocks-open', (await open(a, code, 'open-' + state)).kind, state);
          check(state + '-does-not-authorize-deletion', await call(a, 'inventory'), before);
        }
        await notExposed(a, 'clear-never-exposed');
        break;
      }
      case 'O09.corrupt': {
        await call(a, 'mutate', 'ciphertext');
        const before = await call(a, 'inventory');
        check('preflight-is-not-authentication', (await inspect(a)).kind, 'unlock-required');
        check('authenticated-open-refuses-damage', (await open(a, code)).kind, 'repair-required');
        check('damage-preserved-without-app-initialization', await call(a, 'inventory'), before);
        await notExposed(a, 'damage-never-exposed');
        break;
      }
      case 'O10.factor': {
        const before = await call(a, 'inventory'),
          wrong = code.replace(/[0-9A-Z]/u, (c) => (c === '0' ? '1' : '0'));
        check('wrong-factor-refuses', (await open(a, wrong, 'wrong')).kind, 'unlock-failed');
        check('wrong-factor-no-carrier-writes', await call(a, 'inventory'), before);
        await notExposed(a, 'wrong-factor-never-exposed');
        check('valid-factor-opens', (await open(a, code)).kind, 'ready');
        const s = await snapshot(a);
        check(
          'ready-after-replay-and-initialization',
          [
            s.view,
            s.accepted.undo,
            s.accepted.actors.some((x) => x.id === 'startup-human'),
            s.mounts,
            s.channels,
          ],
          ['retained', 0, true, 1, 1],
        );
        check(
          'classification-under-shared-permit',
          s.checks.every((c) => c.shared),
          true,
        );
        break;
      }
      case 'O11.recheck': {
        check('earlier-inspection-is-unlock-required', (await inspect(a)).kind, 'unlock-required');
        const b = await page();
        await call(b, 'holdExclusive', 'transition', 'clearing');
        await gate(b, 'exclusive', 'startup');
        const before = await call(a, 'inventory');
        await call(a, 'open', 'open', code);
        const locks = await a.evaluate(() => navigator.locks.query());
        check(
          'open-queues-behind-exclusive',
          locks.pending.some((l) => l.mode === 'shared'),
          true,
        );
        await notExposed(a, 'queued-open-not-exposed');
        await call(b, 'release', 'exclusive');
        await settled(b, 'transition');
        check('open-rechecks-after-grant', (await settled(a, 'open')).kind, 'clearing');
        check('failed-open-does-not-initialize', await call(a, 'inventory'), before);
        break;
      }
      case 'O12.replay': {
        await base(a, 'fault', 'gate-decrypt');
        await call(a, 'open', 'open', code);
        await gate(a, 'decrypt');
        await notExposed(a, 'replay-not-exposed');
        const b = await page();
        await call(b, 'holdExclusive', 'transition');
        await call(a, 'cancel');
        check(
          'cancel-waits-for-owned-native-work',
          (await snapshot(a)).entries.open.status,
          'pending',
        );
        const locks = await a.evaluate(() => navigator.locks.query());
        check(
          'exclusive-cannot-pass-undrained-open',
          [
            locks.held.some((l) => l.mode === 'shared'),
            locks.pending.some((l) => l.mode === 'exclusive'),
          ],
          [true, true],
        );
        await base(a, 'release', 'decrypt');
        check('cancelled-open-result', (await settled(a, 'open')).kind, 'cancelled');
        await gate(b, 'exclusive', 'startup');
        await call(b, 'release', 'exclusive');
        await settled(b, 'transition');
        await notExposed(a, 'cancelled-open-not-exposed');
        check('retry-reacquires-and-opens', (await open(a, code, 'retry')).kind, 'ready');
        check('retry-recovers-content', (await snapshot(a)).view, 'retained');
        break;
      }
      case 'O13.init-death': {
        await base(a, 'fault', 'gate-sealed');
        await call(a, 'open', 'open', code);
        await gate(a, 'sealed');
        await notExposed(a, 'initialization-awaits-durable-barrier');
        await crash(a);
        a = await page();
        check('restart-resumes-open', (await open(a, code)).kind, 'ready');
        const s = await snapshot(a);
        check(
          'cold-open-recovers-before-exposure',
          [
            s.view,
            s.accepted.undo,
            s.accepted.actors.filter((x) => x.id === 'startup-human').length,
          ],
          ['retained', 0, 1],
        );
        await call(a, 'input', 'edit', '!');
        await settled(a, 'edit');
        check('reopened-owner-admits-input', (await snapshot(a)).view, '!retained');
        break;
      }
      case 'O14.future': {
        await call(a, 'future', code);
        await settled(a, 'future');
        const before = await call(a, 'inventory');
        check('future-schema-update-required', (await open(a, code)).kind, 'app-update-required');
        check('future-schema-not-rewritten', await call(a, 'inventory'), before);
        await notExposed(a, 'future-schema-not-exposed');
        break;
      }
      case 'O15.scope': {
        const other = await call(a, 'seed', 'other-workspace', 'independent');
        await call(a, 'mutate', 'journal');
        check(
          'valid-other-workspace-opens',
          (await open(a, other, 'other', 'other-workspace')).kind,
          'ready',
        );
        check('target-damage-refuses', (await open(a, code, 'damaged')).kind, 'repair-required');
        const s = await snapshot(a);
        check(
          'other-workspace-remains-usable',
          [s.view, s.status.state, s.mounts],
          ['independent', 'active', 1],
        );
        await call(a, 'input', 'edit', '!');
        await settled(a, 'edit');
        check('other-workspace-still-admits', (await snapshot(a)).view, '!independent');
        break;
      }
    }
    check('no-database-enumeration', (await snapshot(a)).enumerationCalls, 0);
    check('no-unhandled-page-errors', pageErrors, []);
    status = assertions.every((a) => a.passed) ? 'pass' : 'fail';
  } catch (cause) {
    error = { message: cause.message, stack: cause.stack };
  } finally {
    await context?.close();
  }
  return { ...definition, status, assertions, schedule, artifacts, ...(error ? { error } : {}) };
}
