import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect } from 'node:net';
import { installedChromium } from '../../scripts/release-validation/browser.mjs';
import { createStageRunner } from '../../scripts/release-validation/stage.mjs';
import { boundedStage } from '../../scripts/release-validation/manifest.mjs';
import { digest, filePins } from '../../scripts/release-validation/identity.mjs';
import { groupState } from '../../scripts/release-validation/process-group.mjs';
const runtime = installedChromium();
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
function fixture(t, mode) {
  const base = mkdtempSync(join(tmpdir(), 'done-custody-owner-control-'));
  const root = join(base, 'checkout'),
    output = join(base, 'reports'),
    marker = join(base, 'ready.json');
  mkdirSync(join(root, 'scripts/release-validation'), { recursive: true });
  copyFileSync(
    'scripts/release-validation/process-guard.mjs',
    join(root, 'scripts/release-validation/process-guard.mjs'),
  );
  writeFileSync(
    join(root, 'profiles.mjs'),
    readFileSync('scripts/custody/profiles.mjs', 'utf8').replace(
      "'@playwright/test'",
      JSON.stringify(import.meta.resolve('@playwright/test')),
    ),
  );
  writeFileSync(
    join(root, 'subject.mjs'),
    `
    import assert from 'node:assert/strict';
    import { createServer } from 'node:http';
    import { writeFileSync } from 'node:fs';
    import { join } from 'node:path';
    import { ownedProfiles } from './profiles.mjs';
    const server = createServer((req,res) => res.end('<title>Persistent profile control</title>'));
    await new Promise(r => server.listen(0,'127.0.0.1',r));
    const origin = 'http://127.0.0.1:' + server.address().port, records=[];
    const save = () => writeFileSync(process.env.OWNER_RECORDS, JSON.stringify(records));
    const owner = ownedProfiles({directory:join(process.env.RELEASE_CUSTODY_OUTPUT,'custody','profiles'),origin,records,save});
    const source = await owner.profile('source-false');
    const page = await source.newPage(); await page.goto(origin);
    await page.evaluate(() => localStorage.setItem('native-control','cold-copied-value'));
    await assert.rejects(owner.copyProfile('source-false','copy-false'),/live or failed source/);
    writeFileSync(process.env.OWNER_MARKER,JSON.stringify({worker:process.pid,port:server.address().port,profile:records[0].profile,endpoint:records[0].endpoint,pid:records[0].pid}));
    if (process.env.MODE === 'restart-death') {
      await source.close();
      const resumed = await owner.reopenProfile('source-false');
      const next = await resumed.newPage(); await next.goto(origin);
      process.exit(9);
    } else if (process.env.MODE === 'restart') {
      await assert.rejects(owner.reopenProfile('source-false'),/live or failed profile/);
      assert.throws(()=>owner.reopenProfile('copy-false'),/unknown profile/);
      await source.close();
      for (let i=0;i<2;i++) {
        const resumed=await owner.reopenProfile('source-false');
        const next=await resumed.newPage(); await next.goto(origin);
        assert.equal(await next.evaluate(()=>localStorage.getItem('native-control')),'cold-copied-value');
        await resumed.close();
      }
      await assert.rejects(owner.reopenProfile('source-false'),/reopen limit/);
      records.at(-1).failure='injected close failure';
      await assert.rejects(owner.reopenProfile('source-false'),/live or failed profile/);
      delete records.at(-1).failure;
      await owner.close(); await new Promise(r=>server.close(r));
    } else if (process.env.MODE === 'normal') {
      await source.close();
      const clone = await owner.copyProfile('source-false','copy-false');
      const next = await clone.newPage(); await next.goto(origin);
      assert.equal(await next.evaluate(() => localStorage.getItem('native-control')),'cold-copied-value');
      await clone.close(); await owner.close(); await new Promise(r => server.close(r));
    } else if (process.env.MODE === 'death') process.exit(9);
    else { process.on('SIGTERM',()=>{}); setInterval(()=>{},100); }
  `,
  );
  const stage = boundedStage(
    'custody-profile-' + mode,
    ['node', 'subject.mjs'],
    { kind: 'exit', exitCodes: [0] },
    {
      variant: 'node-inherited-chromium-v1',
      fixture: { kind: 'chromium-inherited-profiles', startupMs: 15000 },
      deadlineMs: mode === 'timeout' ? 8000 : 20000,
      graceMs: 1000,
      maxLogBytes: 65536,
      env: { MODE: mode, OWNER_MARKER: marker, OWNER_RECORDS: join(base, 'profiles.json') },
    },
  );
  const fingerprint = () => ({
    revision: 'native-profile-control',
    sourceDigest: digest(
      filePins(root, [
        'subject.mjs',
        'profiles.mjs',
        'scripts/release-validation/process-guard.mjs',
      ]),
    ),
    dependencyDigest: 'fixture-only',
    runtime: { node: process.version },
    tools: { chromium: digest(runtime.snapshot) },
  });
  const run = createStageRunner({ root, output, fingerprint, browserRuntime: runtime });
  let drained = false;
  t.after(() => {
    if (drained) rmSync(base, { recursive: true, force: true });
    else t.diagnostic('Retained profile owner control: ' + base);
  });
  return {
    run,
    stage,
    marker,
    base,
    output,
    markDrained: () => {
      drained = true;
    },
  };
}
async function ready(f) {
  const until = Date.now() + 18000;
  while (!existsSync(f.marker) && Date.now() < until) await delay(20);
  assert(existsSync(f.marker), 'Persistent control not ready');
  return JSON.parse(readFileSync(f.marker));
}
async function drained(f, receipt, marker) {
  assert.equal(receipt.result.groupDrained, true, receipt.result.reason);
  assert.equal(groupState(marker.worker), 'gone');
  const records = JSON.parse(readFileSync(join(f.base, 'profiles.json')));
  const processes = execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,pgid=,args='], {
    encoding: 'utf8',
    timeout: 5000,
  }).split('\n');
  for (const row of records) {
    assert.deepEqual(
      processes.filter((line) => line.includes(row.profile)),
      [],
      'Persistent browser escaped the worker group',
    );
    const port = new URL(row.endpoint).port;
    const refused = await new Promise((resolve) => {
      const socket = connect({ host: '127.0.0.1', port: Number(port) });
      socket.setTimeout(500);
      socket.once('connect', () => {
        socket.destroy();
        resolve(false);
      });
      socket.once('error', (e) => {
        socket.destroy();
        resolve(e.code === 'ECONNREFUSED');
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });
    });
    assert(refused, 'Persistent CDP still listening');
  }
  f.markDrained();
  console.log(
    JSON.stringify({
      nativeControl: receipt.stageId,
      status: receipt.status,
      reason: receipt.result.reason,
      elapsedMs: receipt.result.elapsedMs,
      groupDrained: true,
      records,
    }),
  );
  return records;
}
test('persistent source closes before a complete cold profile copy and both browsers exit cleanly', async (t) => {
  const f = fixture(t, 'normal'),
    receipt = await f.run(f.stage);
  t.diagnostic(readFileSync(join(f.output, receipt.key, 'output.log'), 'utf8').slice(-2000));
  const marker = await ready(f),
    records = await drained(f, receipt, marker);
  assert.equal(receipt.status, 'passed', receipt.result.reason);
  assert.deepEqual(
    records.map((r) => [r.name, r.closed, r.exit]),
    [
      ['source-false', true, 0],
      ['copy-false', true, 0],
    ],
  );
  assert.equal(records[1].copy.sourceDigest, records[1].copy.destinationDigest);
});
test('deadline drains persistent Chromium inherited by a TERM-resistant worker', async (t) => {
  const f = fixture(t, 'timeout'),
    receipt = await f.run(f.stage);
  assert.equal(receipt.result.reason, 'timeout');
  assert(receipt.result.elapsedMs < 13000);
  await drained(f, receipt, await ready(f));
});
test('cancellation drains the persistent profile and owning worker together', async (t) => {
  const f = fixture(t, 'cancel'),
    controller = new AbortController(),
    pending = f.run(f.stage, { signal: controller.signal });
  const marker = await ready(f);
  controller.abort();
  const receipt = await pending;
  assert.equal(receipt.result.reason, 'cancelled');
  await drained(f, receipt, marker);
});
test('worker death leaves no persistent browser or CDP listener and cannot pass', async (t) => {
  const f = fixture(t, 'death'),
    receipt = await f.run(f.stage);
  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.result.code, 9);
  await drained(f, receipt, await ready(f));
});

test('persistent profile reopens twice after clean exit and refuses live, unknown, failed or excess reopen', async (t) => {
  const f = fixture(t, 'restart'),
    receipt = await f.run(f.stage);
  t.diagnostic(readFileSync(join(f.output, receipt.key, 'output.log'), 'utf8').slice(-2000));
  const records = await drained(f, receipt, await ready(f));
  assert.equal(receipt.status, 'passed', receipt.result.reason);
  assert.equal(records.length, 3);
  assert.equal(new Set(records.map((r) => r.pid)).size, 3);
  assert.equal(new Set(records.map((r) => r.profile)).size, 1);
  assert(records.every((r) => r.closed && r.exit === 0 && !r.failure));
  assert.deepEqual(
    records.slice(1).map((r) => r.reopen),
    records.slice(0, 2).map((r, i) => ({ priorPid: r.pid, ordinal: i + 1 })),
  );
});

test('worker death after persistent-profile reopen drains both browser generations and listeners', async (t) => {
  const f = fixture(t, 'restart-death'),
    receipt = await f.run(f.stage);
  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.result.code, 9);
  const records = await drained(f, receipt, await ready(f));
  assert.equal(records.length, 2);
  assert.equal(records[1].reopen.priorPid, records[0].pid);
});
