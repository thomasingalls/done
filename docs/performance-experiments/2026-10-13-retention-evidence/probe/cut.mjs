import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { loadavg, cpus, totalmem } from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  native,
  selected,
  close,
  args,
  syncBundle,
} from '../../../../test/account-sync/fixtures.mjs';
import { fixtureAcceptance, head, response } from '../../../../test/account-decisions/oracle.mjs';
import { decodeSubmission } from '../../../../account-protocol/submission.ts';
import { decodeNetworkEnvelope } from '../../../../account-protocol/envelope.ts';
const out = process.env.DEPTH_OUT;
if (!out) throw Error('DEPTH_OUT required');
mkdirSync(out, { recursive: true });
const pilot = false;
const comparison = process.env.CUT_REFERENCE;
const profileOnly = !comparison && !process.env.CUT_WAIT_CANDIDATE;
let candidateBundle = await syncBundle('retention-owner');
let ownerBundle = candidateBundle;
writeFileSync(join(out, 'candidate-bundle.js'), candidateBundle);
const hash = (b) => createHash('sha256').update(b).digest('hex');
const report = {
  source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  pilot,
  bundleSha256: hash(ownerBundle),
  host: { node: process.version, cpu: cpus()[0].model, memory: totalmem(), load: loadavg() },
  seeds: [],
  samples: [],
  errors: [],
};
const save = () => writeFileSync(join(out, 'results.json'), JSON.stringify(report, null, 2));
const diff = (a, b) => Object.fromEntries(Object.keys(b).map((k) => [k, b[k] - (a[k] ?? 0)]));
const metric = (p) => p.evaluate(() => __doneLedgerMetrics());
const digest = (p) =>
  p.evaluate(async () => {
    const b = editor.snapshot();
    return {
      bytes: b.length,
      hash: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b)), (n) =>
        n.toString(16).padStart(2, '0'),
      ).join(''),
      chars: editor.read().master.length,
    };
  });
async function open(p, item) {
  await p.evaluate(ownerBundle);
  return p.evaluate(async (item) => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    const start = performance.now();
    window.opened = await Harness.openOwnedSyncingAccountWorkspace(
      optionsFor(item),
      window.depthToken,
    );
    window.editor = opened.workspace;
    window.surface = editor.text({ kind: 'master' });
    return performance.now() - start;
  }, args(item));
}
async function inventory(p) {
  return p.evaluate(async () => {
    const db = await new Promise((yes, no) => {
      const r = indexedDB.open(opened.dbName);
      r.onsuccess = () => yes(r.result);
      r.onerror = () => no(r.error);
    });
    try {
      return await new Promise((yes, no) => {
        const tx = db.transaction(['meta', 'content', 'heads', 'outbound']),
          out = {};
        for (const name of ['meta', 'content', 'heads', 'outbound']) {
          const q = tx.objectStore(name).getAll();
          q.onsuccess = () => {
            out[name] = {
              rows: q.result.length,
              bytes: q.result.reduce((n, r) => n + (r?.ct?.length ?? 0), 0),
            };
          };
        }
        tx.oncomplete = () => yes(out);
        tx.onabort = () => no(tx.error);
      });
    } finally {
      db.close();
    }
  });
}
function deadlines(p) {
  const evaluate = p.evaluate.bind(p);
  p.evaluate = async (...args) => {
    let timer;
    try {
      return await Promise.race([
        evaluate(...args),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Error('Operation exceeded 120 seconds')), 120000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
}
async function observations(p) {
  await p.evaluate(() => {
    window.nativeCounts = {};
    window.longTasks = [];
    for (const name of [
      'decrypt',
      'verify',
      'digest',
      'importKey',
      'deriveKey',
      'sign',
      'encrypt',
    ]) {
      const fn = SubtleCrypto.prototype[name];
      SubtleCrypto.prototype[name] = function (...args) {
        nativeCounts[name] = (nativeCounts[name] ?? 0) + 1;
        return fn.apply(this, args);
      };
    }
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) longTasks.push({ at: e.startTime, ms: e.duration });
    }).observe({ type: 'longtask' });
  });
}
// The new context gets the same synthetic passkey oracle as the native fixture. It cannot access real accounts.
async function clone(f, item, storage) {
  const c = await f.context.browser().newContext({ storageState: storage });
  await c.route(f.server.origin + '/', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Disposable retention depth</title>',
    }),
  );
  await c.exposeBinding('observeNetInvocation', () => {});
  await c.exposeBinding('testAssertion', (_source, request) => {
    const v = item.key.assert(
      { options: { challenge: Buffer.from(request.challenge).toString('base64url') } },
      { client: { origin: f.server.origin } },
    );
    return {
      credentialId: v.id,
      ...Object.fromEntries(
        ['authenticatorData', 'clientDataJSON', 'signature'].map((k) => [
          k,
          [...Buffer.from(v.response[k], 'base64url')],
        ]),
      ),
    };
  });
  const p = await c.newPage();
  deadlines(p);
  await f.setup(p);
  await p.evaluate((token) => (window.depthToken = token), f.testOperatorToken);
  await observations(p);
  return { c, p, cdp: await c.newCDPSession(p) };
}
async function publication(f, p) {
  return p.evaluate(async (token) => {
    // The real scheduler remains offline; these explicit operations exercise its real outbound owner.
    const outbound = retentionTestOwner.outbound;
    const e = await outbound.prepareNextEnvelope();
    if (!e) throw Error('Expected a pending source');
    const prepared = await outbound.prepareSubmission(e.position);
    if (prepared.kind !== 'ready') throw Error('Submission not ready: ' + prepared.kind);
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
    try {
      return await outbound.submitPending(token);
    } finally {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    }
  }, f.testOperatorToken);
}
async function acceptRoute(f, item, context, links) {
  const signer = fixtureAcceptance(f, item.scope.workspaceId);
  await context.route(f.server.origin + '/account/delivery/submit', async (r) => {
    const wire = JSON.parse(r.request().postData())[3];
    const env = decodeNetworkEnvelope(
      decodeSubmission(new Uint8Array(Buffer.from(wire, 'hex'))).envelope,
    );
    const subject = {
      workspace: env.workspace_id,
      credential: env.credential_id,
      position: env.seq,
      epoch: env.epoch,
      digest: Buffer.from(env.digest).toString('hex'),
    };
    const h = head(subject, links[env.seq - 1] ?? '00'.repeat(32), env.epoch, signer);
    links[env.seq] = h.link;
    await r.fulfill({
      status: 200,
      contentType: 'application/octet-stream',
      body: Buffer.from(response({ kind: 'accepted', head: h, leaf: subject })),
    });
  });
}
async function toggle(p, depth) {
  await p.evaluate(async (depth) => {
    const _first = editor.read().master[0];
    await surface.input(
      { name: 'insert', text: depth % 2 ? 'A' : 'B' },
      { ranges: [{ anchor: 0, head: 1 }], main: 0 },
    ).accepted;
    await editor.whenDurable();
  }, depth);
}
async function cut(f, item, storage, expected, arm, rep, profile, queued = false, throttle = 1) {
  const { c, p, cdp } = await clone(f, item, storage);
  const row = { arm, rep, profile, throttle, queued, load: loadavg() };
  try {
    await open(p, item);
    assert.deepEqual(await digest(p), expected);
    if (throttle !== 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    await p.evaluate(() => {
      longTasks.length = 0;
      window.gaps = [];
      let last = performance.now();
      window.pulse = setInterval(() => {
        const now = performance.now();
        gaps.push(now - last);
        last = now;
      }, 10);
    });
    if (profile) {
      await cdp.send('Tracing.start', {
        categories: 'blink.user_timing,devtools.timeline',
        transferMode: 'ReturnAsStream',
      });
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.start');
    }
    const before = await metric(p),
      nativeBefore = await p.evaluate(() => ({ ...nativeCounts })),
      at = Date.now();
    row.result = await p.evaluate(async (queued) => {
      window.beforeCutText = editor.read().master;
      const work = opened.removeLocalHistory(0);
      window.queuedInput = undefined;
      window.inputLatency = undefined;
      if (queued)
        setTimeout(() => {
          const original = editor.read().master;
          const set = Storage.prototype.setItem;
          window.journalBeforeApply = false;
          Storage.prototype.setItem = function (k, v) {
            if (k.startsWith('done.pending-update.'))
              journalBeforeApply ||= editor.read().master === original;
            return set.call(this, k, v);
          };
          const inputAt = performance.now();
          window.queuedInput = surface
            .input(
              { name: 'insert', text: 'QUEUED ' },
              { ranges: [{ anchor: 0, head: 0 }], main: 0 },
            )
            .accepted.then(() => {
              window.inputLatency = performance.now() - inputAt;
            });
        }, 50);
      return work;
    }, queued);
    row.ms = Date.now() - at;
    if (profile) {
      const result = await cdp.send('Profiler.stop');
      writeFileSync(join(out, arm + '-' + rep + '.cpuprofile'), JSON.stringify(result.profile));
      const completed = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
      await cdp.send('Tracing.end');
      const { stream } = await completed;
      let trace = '';
      while (true) {
        const chunk = await cdp.send('IO.read', { handle: stream });
        trace += chunk.data;
        if (chunk.eof) break;
      }
      await cdp.send('IO.close', { handle: stream });
      writeFileSync(join(out, arm + '-' + rep + '.trace.json'), trace);
    }
    await p.waitForTimeout(50);
    row.tasks = await p.evaluate(() => {
      clearInterval(pulse);
      return longTasks;
    });
    row.gaps = await p.evaluate(() => gaps);
    row.work = diff(before.work, (await metric(p)).work);
    row.nativeCrypto = diff(nativeBefore, await p.evaluate(() => nativeCounts));
    assert.equal(row.result.kind, queued ? 'skipped' : 'removed', JSON.stringify(row.result));
    row.costs = (await metric(p)).costs;
    if (queued) {
      await p.evaluate(async () => {
        if (!queuedInput) throw Error('Queued-input timer did not fire');
        await queuedInput;
        await editor.whenDurable();
        if (!journalBeforeApply) throw Error('Journal ordering differs');
        if (!editor.read().master.startsWith('QUEUED ')) throw Error('Queued input lost');
        await editor.command({ kind: 'undo' }).accepted;
        if (editor.read().master !== beforeCutText) throw Error('Undo differs from pre-cut text');
      });
      await p.evaluate(async () => {
        await editor.command({ kind: 'redo' }).accepted;
        if (!editor.read().master.startsWith('QUEUED ')) throw Error('Redo lost');
        await editor.whenDurable();
      });
      row.inputLatency = await p.evaluate(() => window.inputLatency);
      row.journalBeforeApply = true;
      row.undoRedo = true;
    } else assert.deepEqual(await digest(p), expected);
    row.inventory = await inventory(p);
    const final = await digest(p);
    await close(p);
    await p.close();
    const reopened = await c.newPage();
    await f.setup(reopened);
    await reopened.evaluate((token) => (window.depthToken = token), f.testOperatorToken);
    await open(reopened, item);
    assert.deepEqual(await digest(reopened), final);
    await close(reopened);
    row.recovered = true;
    row.phase = 'passed';
  } catch (e) {
    row.phase = 'failed';
    row.error = String(e);
    throw e;
  } finally {
    report.samples.push(row);
    save();
    await c.close();
  }
}
test('deep own-history initial conversion', { timeout: 1800000 }, async (t) => {
  const f = await native(t),
    item = await selected(f, 'retention-preparation');
  deadlines(f.page);
  await f.page.evaluate((token) => (window.depthToken = token), f.testOperatorToken);
  report.host.chromium = f.context.browser().version();
  await open(f.page, item);
  await f.page.evaluate(async () => {
    await surface.input(
      { name: 'insert', text: 'A' + 'Review project notes and plan the next steps.\n'.repeat(273) },
      { ranges: [{ anchor: 0, head: editor.read().master.length }], main: 0 },
    ).accepted;
    await editor.whenDurable();
  });
  const links = ['00'.repeat(32)];
  await acceptRoute(f, item, f.context, links);
  assert.equal((await publication(f, f.page)).kind, 'accepted');
  const seedAt = Date.now(),
    depth = Number(process.env.CUT_DEPTH ?? 1201);
  for (let position = 2; position <= depth; position++) {
    await toggle(f.page, position);
    assert.equal((await publication(f, f.page)).kind, 'accepted');
    if (position % 100 === 0) console.log('seeded', position);
    if (Date.now() - seedAt > 900000) throw Error('Seed ceiling exceeded');
  }
  const expected = await digest(f.page);
  await close(f.page);
  const storage = await f.context.storageState({ indexedDB: true });
  report.depth = depth;
  report.expected = expected;
  save();
  if (profileOnly) await cut(f, item, storage, expected, 'reference', 0, true);
  else {
    const reference = comparison ? readFileSync(comparison, 'utf8') : candidateBundle;
    if (process.env.CUT_WAIT_CANDIDATE) {
      await cut(f, item, storage, expected, 'baseline-profile', 0, true);
      writeFileSync(join(out, 'baseline-ready'), 'ready');
      console.log('Baseline profile ready; waiting for candidate bundle.');
      const until = Date.now() + 1800000;
      while (!existsSync(process.env.CUT_WAIT_CANDIDATE)) {
        if (Date.now() > until) throw Error('Candidate wait exceeded');
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      candidateBundle = readFileSync(process.env.CUT_WAIT_CANDIDATE, 'utf8');
      writeFileSync(join(out, 'measured-candidate-bundle.js'), candidateBundle);
      report.measuredCandidateSha256 = hash(candidateBundle);
    }
    report.referenceBundleSha256 = hash(reference);
    for (let rep = 0; rep < 3; rep++)
      for (const arm of rep % 2 ? ['candidate', 'reference'] : ['reference', 'candidate']) {
        ownerBundle = arm === 'reference' ? reference : candidateBundle;
        console.log('measuring', arm, rep);
        await cut(f, item, storage, expected, arm, rep, false, false);
      }
    ownerBundle = reference;
    await cut(f, item, storage, expected, 'reference-4x', 0, true, false, 4);
    ownerBundle = candidateBundle;
    await cut(f, item, storage, expected, 'candidate-4x', 0, true, false, 4);
    ownerBundle = reference;
    await cut(f, item, storage, expected, 'reference-input', 0, false, true);
    ownerBundle = candidateBundle;
    await cut(f, item, storage, expected, 'candidate-input', 0, false, true);
    await cut(f, item, storage, expected, 'candidate-input-4x', 0, false, true, 4);
  }
});
