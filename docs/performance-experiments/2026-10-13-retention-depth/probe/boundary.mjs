import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
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
const pilot = true;
const ownerBundle = await syncBundle('retention-owner');
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
    report.acceptedEnvelopeCiphertextBytes = env.ct.length;
    const h = head(subject, links[env.seq - 1] ?? '00'.repeat(32), env.epoch, signer);
    links[env.seq] = h.link;
    await r.fulfill({
      status: 200,
      contentType: 'application/octet-stream',
      body: Buffer.from(response({ kind: 'accepted', head: h, leaf: subject })),
    });
  });
}
test('verify shallow fixture source boundary', { timeout: 120000 }, async (t) => {
  const f = await native(t),
    item = await selected(f, 'retention-depth');
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
  const depth = 1;
  {
    const snap = await digest(f.page);
    const expected = snap;
    if (report.seeds.length) assert.equal(snap.chars, report.seeds[0].snapshot.chars);
    await close(f.page);
    const complete = await f.context.storageState({ indexedDB: true });
    const checkPage = await f.context.newPage();
    await f.setup(checkPage);
    await checkPage.evaluate((token) => (window.depthToken = token), f.testOperatorToken);
    await open(checkPage, item);
    report.sourceBoundary = await checkPage.evaluate(async () => {
      const capsules = await opened.listCaptures(),
        spool = await opened.spoolStatus();
      const allocated = new Set(
        spool.positions.flatMap((p) =>
          [p.source, ...(p.additional ?? [])].map((s) => s.id + ':' + s.index),
        ),
      );
      const sources = capsules.flatMap((c) => c.sources.map((_, i) => c.id + ':' + i));
      for (const c of capsules) Harness.eraseCapsule(c);
      return {
        sources: sources.length,
        allocated: allocated.size,
        unallocated: sources.filter((s) => !allocated.has(s)).length,
      };
    });
    await close(checkPage);
    await checkPage.close();
    assert.equal(report.sourceBoundary.unallocated, 0);
    const { c, p } = await clone(f, item, complete);
    let cut;
    try {
      await open(p, item);
      const before = await metric(p),
        at = Date.now();
      cut = await p.evaluate(() => opened.removeLocalHistory(0));
      const ms = Date.now() - at;
      assert.equal(cut.kind, 'removed', JSON.stringify(cut));
      assert.deepEqual(await digest(p), expected);
      const inv = await inventory(p);
      assert.equal(inv.content.rows + inv.heads.rows + inv.outbound.rows, 0);
      report.seeds.push({
        depth,
        snapshot: snap,
        cut,
        cutMs: ms,
        cutWork: diff(before.work, (await metric(p)).work),
        inventory: inv,
        longTasks: await p.evaluate(() => longTasks),
      });
      await close(p);
    } finally {
      await c.close();
    }
    save();
    return;
  }
});
