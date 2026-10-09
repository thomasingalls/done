import { isDeepStrictEqual } from 'node:util';

export async function runCase(definition, env) {
  const assertions = [],
    artifacts = [],
    schedule = [],
    pageErrors = [];
  let context;
  const check = (id, actual, expected) => {
    const passed = isDeepStrictEqual(actual, expected);
    assertions.push({ id, actual, expected, passed });
    return passed;
  };
  const call = (page, method, ...args) =>
    page.evaluate(({ method, args }) => window.custody[method](...args), { method, args });
  const page = async (ctx) => {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => pageErrors.push(e.message));
    p.setDefaultTimeout(8000);
    await p.goto(env.url);
    await p.waitForFunction(() => Boolean(window.custody));
    return p;
  };
  const snapshot = (p) => call(p, 'snapshot');
  const settled = async (p, id) => {
    await p.waitForFunction(
      (id) => ['resolved', 'rejected'].includes(window.custody.snapshot().entries[id]?.status),
      id,
    );
    return (await snapshot(p)).entries[id];
  };
  const done = async (p, id) => {
    const result = await settled(p, id);
    if (result.status !== 'resolved')
      throw Error(`Unexpected ${id} refusal: ${JSON.stringify(result.error)}`);
    return result;
  };
  const enrolled = async (p, id = 'creation') => {
    const code = await call(p, 'begin', id);
    await call(p, 'confirm', id, code);
    await done(p, id);
    return code;
  };
  const open = async (p, code, id = 'session') => {
    await call(p, 'open', id, code);
    await done(p, id);
  };
  const gate = async (p, name) =>
    p.waitForFunction((name) => window.custody.snapshot().gates.includes(name), name);
  const crash = async (p) => {
    artifacts.push({
      point: 'before-renderer-death',
      snapshot: await snapshot(p),
      record: await call(p, 'record'),
    });
    const cdp = await p.context().newCDPSession(p),
      died = p.waitForEvent('crash');
    void cdp.send('Page.crash').catch(() => {});
    await died;
    await p.close();
    schedule.push('Actual Page.crash without a graceful close');
  };
  let status = 'error',
    error;
  try {
    if (definition.id === 'C13.profile-copy') {
      for (const planted of [false, true]) {
        const source = await env.profile(`source-${planted}`);
        let code;
        try {
          const p = await page(source);
          code = await enrolled(p);
          await call(p, 'seedProbe', code, planted);
          artifacts.push({
            point: `source-inventory-${planted}`,
            inventory: await call(p, 'inventory'),
          });
        } finally {
          await source.close();
        }
        const clone = await env.copyProfile(`source-${planted}`, `copy-${planted}`);
        try {
          const p = await page(clone);
          const attack = await call(p, 'attacker');
          artifacts.push({ point: `copied-profile-attack-${planted}`, attack });
          check(
            planted ? 'positive-control-opens-content' : 'copied-profile-has-no-content-opener',
            attack.content,
            planted,
          );
          check(
            planted ? 'positive-control-opens-future' : 'copied-profile-has-no-future-opener',
            attack.future,
            planted,
          );
          await call(p, 'open', 'missing', '');
          check(
            'no-factor-refuses-' + planted,
            (await settled(p, 'missing')).error?.code,
            'confirmation-required',
          );
          await open(p, code);
          await call(p, 'read', 'session');
          check(
            'external-factor-opens-copied-content-' + planted,
            (await done(p, 'session')).value,
            'custody content probe: survives cold unlock',
          );
          await call(p, 'close', 'session');
          await done(p, 'session');
        } finally {
          await clone.close();
        }
      }
      schedule.push(
        'Closed synthetic source profiles; copied whole directories; launched cold copies on the same host; factor retained only by the runner',
      );
    } else {
      context = await env.browser.newContext();
      await context.route('**/*', (route) =>
        new URL(route.request().url()).origin === env.origin
          ? route.continue()
          : route.abort('blockedbyclient'),
      );
      let a = await page(context);
      const b = await page(context);
      switch (definition.id) {
        case 'C12.genesis': {
          const code = await call(a, 'begin', 'c');
          check('no-custody-before-confirmation', await call(a, 'record'), null);
          await call(a, 'confirm', 'c', code[0] === '0' ? '1'.repeat(25) : '0'.repeat(25));
          if (
            !check(
              'wrong-confirmation-refused',
              (await settled(a, 'c')).error?.code,
              'confirmation-required',
            )
          )
            break;
          check('wrong-confirmation-writes-nothing', await call(a, 'record'), null);
          await call(a, 'confirm', 'c', code);
          await done(a, 'c');
          check('code-no-longer-redisplayed', (await snapshot(a)).entries.c.displayErased, true);
          const record = await call(a, 'record');
          check('protected-after-completion', record.state, 'protected');
          check('all-root-invocations-reserved', record.seal_reserved, 3);
          check(
            'credentials-both-sealed',
            record.credentials.map((c) => [c.role, c.sealed.v, c.sealed.ct.hex.length]),
            [
              ['wrapping', 2, 96],
              ['signing', 2, 96],
            ],
          );
          await call(a, 'seedProbe', code);
          await crash(a);
          await call(b, 'open', 'wrong', code[0] === '0' ? '1'.repeat(25) : '0'.repeat(25));
          check('wrong-factor-refused', (await settled(b, 'wrong')).error?.code, 'unlock-failed');
          await open(b, code);
          await call(b, 'read', 'session');
          check(
            'cold-offline-open',
            (await done(b, 'session')).value,
            'custody content probe: survives cold unlock',
          );
          artifacts.push({
            point: 'persisted-component-inventory',
            inventory: await call(b, 'inventory'),
          });
          break;
        }
        case 'C10.concurrent-creation': {
          const first = await call(a, 'begin', 'first'),
            second = await call(b, 'begin', 'second');
          await Promise.all([
            call(a, 'confirm', 'first', first),
            call(b, 'confirm', 'second', second),
          ]);
          const outcomes = await Promise.all([settled(a, 'first'), settled(b, 'second')]);
          check('exactly-one-creator-wins', outcomes.map((r) => r.status).sort(), [
            'rejected',
            'resolved',
          ]);
          const winner = outcomes[0].status === 'resolved' ? first : second,
            loser = winner === first ? second : first;
          check(
            'loser-is-existing-locked',
            outcomes.find((r) => r.status === 'rejected')?.error?.code,
            'locked-existing',
          );
          const before = await call(a, 'record');
          await open(a, winner);
          await call(b, 'open', 'loser', loser);
          check(
            'loser-cannot-enroll-factor',
            (await settled(b, 'loser')).error?.code,
            'unlock-failed',
          );
          check('winner-custody-unchanged', await call(b, 'record'), before);
          break;
        }
        case 'C12.reservation-abort': {
          const code = await call(a, 'begin', 'c');
          await call(a, 'fault', 'abort-reservation');
          await call(a, 'confirm', 'c', code);
          check('aborted-reservation-refuses', (await settled(a, 'c')).status, 'rejected');
          if (
            !check(
              'no-encryption-before-reservation-completes',
              (await snapshot(a)).rootEncryptions,
              0,
            )
          )
            break;
          check('abort-keeps-zero-count', (await call(a, 'record')).seal_reserved, 0);
          await call(a, 'resume', 'r', code);
          await done(a, 'r');
          check('retry-reserves-before-encrypt', (await call(a, 'record')).seal_reserved, 3);
          schedule.push('Abort reservation transaction after put request succeeds');
          break;
        }
        case 'C12.interrupted-creation': {
          const code = await call(a, 'begin', 'c');
          await call(a, 'fault', 'gate-envelope');
          await call(a, 'confirm', 'c', code);
          await gate(a, 'envelope');
          const staged = await call(b, 'record');
          if (!check('durable-reservation-before-encrypt', staged.seal_reserved, 3)) {
            await crash(a);
            break;
          }
          check('creation-is-not-openable', staged.state, 'creating');
          await call(b, 'open', 'partial', code);
          await b.waitForFunction(async () =>
            (await navigator.locks.query()).pending.some((l) => l.mode === 'shared'),
          );
          check(
            'shared-open-waits-for-creator',
            (await snapshot(b)).entries.partial.status,
            'pending',
          );
          await crash(a);
          check(
            'partial-open-refuses',
            (await settled(b, 'partial')).error?.code,
            'creation-pending',
          );
          await call(b, 'resume', 'r', code);
          await done(b, 'r');
          const final = await call(b, 'record');
          check('resume-retains-root', final.root_id, staged.root_id);
          check('resume-retains-store', final.store_id, staged.store_id);
          check('abandoned-seals-stay-counted', final.seal_reserved, 6);
          check(
            'credential-identities-retained',
            final.credentials.map((c) => c.id),
            [staged.creation_intent.wrappingId, staged.creation_intent.signingId],
          );
          check(
            'resume-rechecks-authenticated-intent',
            (await snapshot(b)).events.some(
              (e) => e.checkCreation === 'resume' && e.intentId === staged.creation_intent.id,
            ),
            true,
          );
          break;
        }
        case 'C12.completion-abort': {
          const code = await call(a, 'begin', 'c');
          await call(a, 'fault', 'abort-completion');
          await call(a, 'confirm', 'c', code);
          check('failed-completion-is-not-success', (await settled(a, 'c')).status, 'rejected');
          const r = await call(a, 'record');
          check(
            'all-or-nothing-custody-artifacts',
            [r.state, r.envelope, r.credentials],
            ['creating', null, null],
          );
          check('failed-completion-keeps-count', r.seal_reserved, 3);
          await call(b, 'open', 'partial', code);
          check(
            'uncommitted-protection-refused',
            (await settled(b, 'partial')).error?.code,
            'creation-pending',
          );
          await call(b, 'resume', 'retry', code);
          await done(b, 'retry');
          check('retry-count-is-monotonic', (await call(b, 'record')).seal_reserved, 6);
          schedule.push('Abort final custody transaction after put request succeeds');
          break;
        }
        case 'C12.metadata-authentication': {
          const code = await enrolled(a);
          await call(a, 'tamper', 'count');
          const before = await call(a, 'record');
          await call(b, 'open', 'tampered', code);
          check(
            'modified-count-refuses',
            (await settled(b, 'tampered')).error?.code,
            'repair-required',
          );
          check('damaged-record-is-retained', await call(a, 'record'), before);
          break;
        }
        case 'C10.partial-and-legacy': {
          const code = await enrolled(a);
          await call(a, 'seedProbe', code);
          for (const kind of ['partial', 'unknown', 'legacy', 'missing']) {
            await call(a, 'tamper', kind);
            const before = await call(a, 'record');
            await call(b, 'open', kind, code);
            check(
              'typed-refusal-' + kind,
              (await settled(b, kind)).error?.code,
              kind === 'legacy'
                ? 'migration-required'
                : kind === 'missing'
                  ? 'missing-custody'
                  : 'repair-required',
            );
            const next = await call(a, 'begin', 'retry-' + kind);
            await call(a, 'confirm', 'retry-' + kind, next);
            check('no-remint-' + kind, (await settled(a, 'retry-' + kind)).status, 'rejected');
            check('retained-' + kind, await call(b, 'record'), before);
          }
          break;
        }
        case 'C12.scope-and-authority': {
          const code = await enrolled(a);
          await call(b, 'open', 'denied', code, { denyAuthority: true });
          check(
            'authority-must-verify',
            (await settled(b, 'denied')).error?.code,
            'identity-refused',
          );
          await call(
            b,
            'open',
            'other',
            code,
            {},
            { slotId: 'test-slot', principalId: 'other-principal', workspaceId: 'test-workspace' },
          );
          check(
            'authority-reread-on-each-open',
            (await settled(b, 'other')).error?.code,
            'missing-custody',
          );
          await call(a, 'tamper', 'scope');
          const before = await call(a, 'record');
          await call(b, 'open', 'moved', code);
          check('moved-scope-refuses', (await settled(b, 'moved')).error?.code, 'repair-required');
          check('scope-refusal-does-not-repair', await call(a, 'record'), before);
          break;
        }
        case 'C12.seal-ceiling': {
          const code = await call(a, 'begin', 'c');
          await call(a, 'fault', 'abort-reservation');
          await call(a, 'confirm', 'c', code);
          await settled(a, 'c');
          await call(a, 'tamper', 'ceiling', code);
          const before = await call(a, 'record');
          await call(b, 'resume', 'limit', code);
          check(
            'ceiling-refuses-before-batch',
            (await settled(b, 'limit')).error?.code,
            'seal-budget-exhausted',
          );
          check('ceiling-does-not-encrypt', (await snapshot(b)).rootEncryptions, 0);
          check('ceiling-keeps-history', await call(a, 'record'), before);
          break;
        }
        case 'C12.session-lifetime': {
          const code = await enrolled(a);
          await call(a, 'seedProbe', code);
          await open(a, code);
          await open(b, code, 'second');
          await call(a, 'saveTask', 'session');
          await done(a, 'session');
          await call(a, 'stale', 'session');
          check(
            'finished-custody-task-refuses',
            (await settled(a, 'session')).error?.code,
            'inactive',
          );
          await call(a, 'fault', 'gate-decrypt');
          await call(a, 'read', 'session', 'read');
          await gate(a, 'decrypt');
          await call(a, 'close', 'session', 'closing');
          await call(b, 'close', 'second');
          await done(b, 'second');
          await call(b, 'exclusive', 'exclusive');
          await b.waitForFunction(async () => {
            const l = await navigator.locks.query();
            return (
              l.pending.some((x) => x.mode === 'exclusive') ||
              window.custody.snapshot().entries.exclusive.entered
            );
          });
          check(
            'decrypt-retains-permit-until-settled',
            (await snapshot(b)).entries.exclusive.entered,
            false,
          );
          check(
            'close-invalidates-immediately',
            (await snapshot(a)).entries.session.state,
            'closing',
          );
          await call(a, 'release', 'decrypt');
          check(
            'closing-decrypt-cannot-return-plaintext',
            (await settled(a, 'read')).error?.code,
            'inactive',
          );
          await done(a, 'closing');
          await done(b, 'exclusive');
          await call(a, 'stale', 'session');
          check('closed-task-refuses', (await settled(a, 'session')).error?.code, 'inactive');
          await open(a, code, 'fresh');
          await call(a, 'read', 'fresh');
          check(
            'fresh-acquisition-opens',
            (await done(a, 'fresh')).value,
            'custody content probe: survives cold unlock',
          );
          break;
        }
        case 'C12.cancel-crypto': {
          const code = await call(a, 'begin', 'c');
          await call(a, 'fault', 'gate-keygen');
          await call(a, 'confirm', 'c', code);
          await gate(a, 'keygen');
          await call(a, 'cancel', 'c');
          await call(b, 'exclusive', 'x');
          await b.waitForFunction(async () =>
            (await navigator.locks.query()).pending.some((l) => l.mode === 'exclusive'),
          );
          check(
            'keygen-retains-permit-until-settled',
            (await snapshot(b)).entries.x.entered,
            false,
          );
          await call(a, 'release', 'keygen');
          check('cancelled-creation-refuses', (await settled(a, 'c')).error?.code, 'inactive');
          await done(b, 'x');
          check('cancel-prevents-private-export', (await snapshot(a)).privateExports, 0);
          const record = await call(b, 'record');
          check('cancel-keeps-reservations', [record.state, record.seal_reserved], ['creating', 3]);
          await call(b, 'resume', 'r', code);
          await done(b, 'r');
          check('cancelled-creation-resumes', (await call(b, 'record')).seal_reserved, 6);
          break;
        }
        case 'C12.cancel-initialize': {
          const code = await enrolled(a);
          await call(a, 'open', 's', code, { authorityGate: true });
          await gate(a, 'authority');
          await call(a, 'abort', 's');
          await call(b, 'exclusive', 'x');
          await b.waitForFunction(async () =>
            (await navigator.locks.query()).pending.some((l) => l.mode === 'exclusive'),
          );
          check(
            'cancel-drains-authority-continuation',
            (await snapshot(b)).entries.x.entered,
            false,
          );
          await call(a, 'release', 'authority');
          check(
            'cancelled-initialization-refuses',
            (await settled(a, 's')).error?.code,
            'inactive',
          );
          await done(b, 'x');
          await open(b, code);
          break;
        }
        default:
          throw Error('Unknown case ' + definition.id);
      }
      for (const p of context.pages())
        if (!p.isClosed()) artifacts.push({ point: 'final', snapshot: await snapshot(p) });
    }
    status = assertions.length && assertions.every((a) => a.passed) ? 'pass' : 'fail';
  } catch (cause) {
    error = { message: cause.message, stack: cause.stack };
    status = 'error';
  } finally {
    await context?.close();
  }
  if (pageErrors.length) {
    status = 'error';
    error = { message: 'Unexpected browser errors: ' + pageErrors.join('; ') };
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
