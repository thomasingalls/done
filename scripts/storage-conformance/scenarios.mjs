import { isDeepStrictEqual } from 'node:util';
import { cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export async function runCase(definition, env) {
  const assertions = [],
    schedule = [],
    pages = [];
  let context, browser, profileEvidence, fixture;
  const check = (id, actual, expected) =>
    assertions.push({ id, actual, expected, passed: isDeepStrictEqual(actual, expected) });
  const note = (step) => schedule.push(step);
  const call = (page, method, ...args) => {
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Browser operation timed out: ${method}`)), 8000);
    });
    return Promise.race([
      page.evaluate(({ method, args }) => window.harness[method](...args), { method, args }),
      deadline,
    ]).finally(() => clearTimeout(timer));
  };
  const openPage = async (owner = context) => {
    const page = await owner.newPage();
    pages.push(page);
    page.setDefaultTimeout(8000);
    await page.goto(env.url);
    await page.waitForFunction(() => Boolean(window.harness));
    fixture = await call(page, 'setup', env.name);
    return page;
  };
  const gate = async (page, name) =>
    page.waitForFunction((name) => window.harness.gateState()[name] === 1, name);
  const settled = async (page, operation) => {
    await page.waitForFunction(
      (name) => window.harness.operations()[name]?.status !== 'pending',
      operation,
    );
    const state = (await call(page, 'operations'))[operation];
    if (!state) throw Error(`Operation never began: ${operation}`);
    return state;
  };
  const finish = async (page, operation) => {
    const result = await settled(page, operation);
    if (result.status !== 'resolved')
      throw Error(`${operation} unexpectedly rejected: ${result.message}`);
  };
  const crash = async (page) => {
    note('CDP Page.crash terminates the renderer; no application destroy or unload flush');
    const cdp = await context.newCDPSession(page);
    const crashed = page.waitForEvent('crash', { timeout: 8000 });
    void cdp.send('Page.crash').catch(() => {});
    await crashed;
    await page.close();
  };
  const seed = async (page, app = false) => {
    await call(page, 'open', app ? 'app' : 'a', true, app);
    if (!app) {
      await call(page, 'mapEdit', 'a', 'A', 'durable A');
      await call(page, 'flush', 'a');
    }
  };
  try {
    if (definition.id === 'C13.copied-profile') {
      const original = join(env.artifacts, 'profile-original'),
        copy = join(env.artifacts, 'profile-copy');
      mkdirSync(original, { recursive: true });
      context = await env.persistent(original);
      browser = null;
      const page = await openPage();
      await seed(page);
      note('Write real encrypted IndexedDB in a new persistent Chromium profile; close browser');
      await context.close();
      context = null;
      cpSync(original, copy, { recursive: true });
      profileEvidence = env.verifyCopy(original, copy);
      context = await env.persistent(copy);
      const copied = await openPage();
      const result = await call(copied, 'attemptOpen', 'a');
      check('copied-profile-refuses-without-factor', result.opened, false);
      if (!result.opened)
        return {
          status: 'not-implemented',
          assertions,
          schedule,
          profileEvidence,
          fixture,
          reason:
            'Copy refused, but no valid-factor positive control exists at this pin; refusal alone cannot establish factor protection.',
        };
      if (result.opened)
        check('copy-positive-content-control', (await call(copied, 'snapshot', 'a')).map, {
          A: 'durable A',
        });
      note(
        'Copied complete closed profile reopened at the same origin without any factor; same-host test only',
      );
    } else {
      browser = env.browser;
      context = await browser.newContext();
      await env.restrictNetwork(context);
      const a = await openPage();
      if (definition.id.startsWith('C01.') || definition.id === 'C02.delete-order') {
        await seed(a, true);
        await a.waitForFunction(() => window.harness.snapshot('app').transport !== null);
        if (definition.id === 'C02.delete-order') {
          await call(a, 'remote', 'insert');
          await call(a, 'flush', 'app');
        }
        await call(a, 'faults', 'arm', 'encrypt');
        const remote = await call(
          a,
          'remote',
          definition.id === 'C02.delete-order' ? 'delete' : 'insert',
          definition.id === 'C01.large-remote-offline' ? 'R'.repeat(17 * 1024) : 'R',
        );
        note(
          'Apply receive at the production provider-document seam; hold content encryption before its commit',
        );
        if (definition.id === 'C02.delete-order') {
          check('deletion-does-not-advance-vector', remote.sameVector, true);
          check('delete-waits-for-content-commit', remote.snapshot.canonical, 'R');
        } else if (definition.id === 'C01.receive-order') {
          check('receive-waits-for-content-commit', remote.snapshot.canonical, '');
          check('receive-not-yet-visible', remote.snapshot.visible, '');
        } else {
          const acknowledgement = await call(a, 'edit', 'app', 'L');
          await call(a, 'beginFlush', 'app');
          await gate(a, 'encrypt');
          const before = await call(a, 'inventory');
          env.checkpoints.push({
            name: 'before-crash',
            inventory: before,
            events: await call(a, 'events'),
          });
          await crash(a);
          const restored = await openPage();
          await call(restored, 'open', 'app', false, true);
          const replay = await call(restored, 'snapshot', 'app');
          check('offline-semantic-replay', replay.canonical, acknowledgement.canonical);
          note('New page replays local carriers only; no remote update is delivered');
        }
        if (!definition.id.includes('offline')) {
          await call(a, 'beginFlush', 'app');
          await gate(a, 'encrypt');
          await call(a, 'faults', 'release', 'encrypt');
          await finish(a, 'flush');
        }
      } else if (definition.id === 'C03.pending-input') {
        await seed(a, true);
        await a.waitForFunction(() => window.harness.snapshot('app').transport !== null);
        const initial = await call(a, 'snapshot', 'app');
        await call(a, 'faults', 'refuseJournal', 1);
        await call(a, 'faults', 'arm', 'encrypt');
        const first = await call(a, 'edit', 'app', 'first');
        const second = await call(a, 'edit', 'app', 'second');
        check('refused-input-not-visible', first.visible, initial.visible);
        check('later-input-cannot-bypass', second.visible, initial.visible);
        check('pending-not-exported', second.exported, initial.exported);
        check('pending-not-in-undo', second.undoDepth, initial.undoDepth);
        check('pending-not-in-transport', second.transport, initial.transport);
        await call(a, 'beginFlush', 'app');
        await gate(a, 'encrypt');
        env.checkpoints.push({
          name: 'before-crash',
          inventory: await call(a, 'inventory'),
          events: await call(a, 'events'),
        });
        await crash(a);
        const reopened = await openPage();
        await call(reopened, 'open', 'app', false, true);
        note(
          'Refuse first WAL append, allow the next, pause content encryption, dispatch real CodeMirror edits, crash',
        );
      } else if (definition.id === 'C04.writer-lifetime') {
        await seed(a);
        const observer = await openPage();
        const cdp = await context.newCDPSession(a);
        const before = await observer.evaluate(() => navigator.locks.query());
        await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
        try {
          const frozen = await observer.evaluate(() => navigator.locks.query());
          check(
            'writer-holds-shared-permit',
            before.held.some((l) => l.mode === 'shared'),
            true,
          );
          check(
            'freeze-retains-permit',
            frozen.held.some((l) => l.mode === 'shared'),
            true,
          );
          note('Observe LockManager from a second page while CDP freezes the real writer page');
        } finally {
          await cdp.send('Page.setWebLifecycleState', { state: 'active' });
        }
      } else if (definition.id === 'C07.late-reservation') {
        await seed(a);
        const b = await openPage();
        await call(b, 'open', 'a', false);
        await call(b, 'faults', 'arm', 'encrypt');
        await call(b, 'mapEdit', 'a', 'B', 'durable B');
        await call(b, 'beginFlush', 'a');
        await gate(b, 'encrypt');
        await call(a, 'mapEdit', 'a', 'C', 'durable C');
        await call(a, 'flush', 'a');
        const before = await call(a, 'records');
        check(
          'late-reservation-gap-is-present',
          before.map((r) => r.seq),
          [1, 3],
        );
        await call(a, 'faults', 'arm', 'state-committed');
        await call(a, 'beginTrim', 'a');
        await gate(a, 'state-committed');
        await call(b, 'faults', 'release', 'encrypt');
        await finish(b, 'flush');
        check(
          'late-row-committed-before-delete',
          (await call(a, 'records')).some((r) => r.seq === 2),
          true,
        );
        await call(a, 'faults', 'release', 'state-committed');
        await finish(a, 'trim');
        check(
          'late-record-survives',
          (await call(a, 'records')).some((r) => r.seq === 2),
          true,
        );
        await call(a, 'close', 'a');
        await call(b, 'close', 'a');
        await call(a, 'open', 'a', false);
        check('replay-union', (await call(a, 'snapshot', 'a')).map, {
          A: 'durable A',
          B: 'durable B',
          C: 'durable C',
        });
        note(
          'A commits 1; B reserves 2 and stalls encryption; A commits 3 and state 4; B commits 2; A deletes coverage',
        );
      } else if (definition.id === 'C08.other-writer') {
        // Open both replicas before either writes so A's live doc never sees B.
        await call(a, 'open', 'a', true);
        const b = await openPage();
        await call(b, 'open', 'a', false);
        await call(a, 'mapEdit', 'a', 'A', 'durable A');
        await call(a, 'flush', 'a');
        await call(b, 'mapEdit', 'a', 'B', 'durable B');
        await call(b, 'flush', 'a');
        check('snapshot-excludes-other-writer', (await call(a, 'snapshot', 'a')).map, {
          A: 'durable A',
        });
        await call(a, 'beginTrim', 'a');
        await finish(a, 'trim');
        await call(a, 'close', 'a');
        await call(b, 'close', 'a');
        await call(a, 'open', 'a', false);
        check('replay-union', (await call(a, 'snapshot', 'a')).map, {
          A: 'durable A',
          B: 'durable B',
        });
        note('Two independent pages commit; first page invokes production trim; reopen from disk');
      } else if (definition.id.startsWith('C09.') && definition.id !== 'C09.corrupt-journal') {
        await seed(a);
        await call(a, 'mapEdit', 'a', 'B', 'durable B');
        await call(a, 'flush', 'a');
        await call(a, 'close', 'a');
        await call(a, 'open', 'a', false);
        check('readable-reopen-control', (await call(a, 'snapshot', 'a')).map, {
          A: 'durable A',
          B: 'durable B',
        });
        if (definition.id === 'C09.changed-trim-input') {
          await call(a, 'faults', 'arm', 'state-committed');
          await call(a, 'beginTrim', 'a');
          await gate(a, 'state-committed');
          const id = await call(a, 'damageRecord');
          const damaged = (await call(a, 'records')).find((r) => r.seq === id);
          await call(a, 'faults', 'release', 'state-committed');
          await settled(a, 'trim');
          check(
            'changed-record-retained',
            (await call(a, 'records')).find((r) => r.seq === id) ?? null,
            damaged,
          );
          note('Mutate observed record bytes after replacement commit but before deletion');
        } else {
          await call(a, 'damageRecord', definition.id === 'C09.version-open');
          const before = await call(a, 'records');
          if (definition.id === 'C09.corrupt-trim') {
            await call(a, 'beginTrim', 'a');
            const result = await settled(a, 'trim');
            check('trim-refuses', result.status, 'rejected');
            check('whole-trim-preserves-input', await call(a, 'records'), before);
          } else {
            await call(a, 'close', 'a');
            const result = await call(a, 'attemptOpen', 'a');
            check('normal-open-refuses', result.opened, false);
            check('unreadable-carriers-retained', await call(a, 'records'), before);
          }
          note('Damage a real persisted ciphertext/version and invoke production load or trim');
        }
      } else if (definition.id === 'C10.partial-metadata') {
        await seed(a);
        await call(a, 'close', 'a');
        const records = await call(a, 'records');
        await call(a, 'clearMetadata');
        const result = await call(a, 'attemptOpen', 'a');
        check('partial-genesis-refuses', result.opened, false);
        check('partial-refusal-is-typed', result.typed ?? false, true);
        check('partial-metadata-not-reminted', await call(a, 'metadata'), []);
        check('existing-ciphertext-preserved', await call(a, 'records'), records);
        note(
          'Remove metadata only, retain ciphertext and custody, then use the existing-store open path',
        );
      } else if (definition.id === 'C09.corrupt-journal' || definition.id.startsWith('C11.')) {
        await seed(a);
        await call(a, 'faults', 'arm', 'encrypt');
        await call(a, 'mapEdit', 'a', 'B', 'journal B');
        await call(a, 'beginFlush', 'a');
        await gate(a, 'encrypt');
        const journal = await call(a, 'journal');
        if (!Object.keys(journal).length)
          throw Error('Schedule did not produce its required pending WAL');
        env.checkpoints.push({
          name: 'before-crash',
          inventory: await call(a, 'inventory'),
          events: await call(a, 'events'),
        });
        await crash(a);
        const owner = await openPage();
        if (definition.id === 'C09.corrupt-journal') {
          const key = await call(owner, 'damageJournal');
          const result = await call(owner, 'attemptOpen', 'a');
          check('unreadable-journal-refuses-open', result.opened, false);
          check(
            'unreadable-journal-retained',
            (await call(owner, 'journal'))[key],
            'unsupported journal fixture',
          );
        } else {
          const refuse = definition.id === 'C11.clear-refusal';
          const records = await call(owner, 'records');
          if (refuse) await call(owner, 'faults', 'refuseDelete', true);
          await call(owner, 'beginClear');
          const result = await settled(owner, 'clear');
          if (refuse) {
            check('clear-reports-refusal', result.status, 'rejected');
            check('refused-clear-preserves-journal', await call(owner, 'journal'), journal);
            check('refused-clear-preserves-content', await call(owner, 'records'), records);
          } else {
            check('clear-completes', result.status, 'resolved');
            check('clear-removes-journal', await call(owner, 'journal'), {});
          }
        }
      } else if (definition.id === 'C12.factor-genesis') {
        await seed(a);
        check('no-acknowledgement-without-factor', (await call(a, 'snapshot', 'a')).map, {});
        note(
          'Invoke the candidate’s exported persistent genesis/key APIs with no supplied factor; write and flush',
        );
      } else if (definition.id === 'C16.legacy-routing') {
        await call(a, 'seedLegacy');
        check('selected-legacy-still-visible', await call(a, 'openDefault'), 'legacy survives');
        note('Seed actual legacy openStore, then call the candidate’s default application startup');
      } else throw Error(`Unimplemented harness case: ${definition.id}`);
    }
    if (!assertions.length) throw Error('A case with no assertions cannot pass');
    return {
      status: assertions.every((a) => a.passed) ? 'pass' : 'fail',
      assertions,
      schedule,
      profileEvidence,
      fixture,
    };
  } catch (error) {
    return {
      status: 'error',
      assertions,
      schedule,
      fixture,
      error: { name: error.name, message: error.message, stack: error.stack },
    };
  } finally {
    for (const [index, page] of pages.entries()) {
      if (!page.isClosed()) {
        try {
          env.checkpoints.push({
            name: `page-${index}-final`,
            inventory: await call(page, 'inventory'),
            events: await call(page, 'events'),
            unhandled: await call(page, 'errors'),
          });
        } catch {
          /* crashed pages have their pre-crash checkpoint */
        }
      }
    }
    await context?.close().catch(() => {});
  }
}
