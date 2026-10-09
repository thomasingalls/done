import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { dirname, join } from 'node:path';
import {
  native,
  prepared,
  decide,
  issue,
  service,
  open,
  close,
  cold,
  census,
  assertOpen,
  assertRetained,
  deliveryBoundary,
  waitUntil,
  crash,
  evidence,
  hash,
} from './fixtures.mjs';

async function killIssue(t, x, point) {
  const child = fork(
    new URL('../account-service-delivery/worker.mjs', import.meta.url),
    [
      x.f.dbPath,
      join(dirname(x.f.dbPath), 'root.sqlite'),
      JSON.stringify(x.f.pin),
      x.f.testOperatorKey.toString('hex'),
      point,
    ],
    { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], serialization: 'advanced' },
  );
  let errors = '';
  child.stderr.on('data', (b) => (errors += b));
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  });
  const [ready] = await Promise.race([
    once(child, 'message'),
    once(child, 'exit').then(() => {
      throw Error(errors);
    }),
  ]);
  assert.equal(ready.ready, true);
  const dead = once(child, 'exit');
  child.send({ workspaceId: x.item.scope.workspaceId, bytes: new Uint8Array(x.request) });
  const [code, signal] = await dead;
  assert.equal(code, null);
  assert.equal(signal, 'SIGKILL');
}
for (const kind of ['closed', 'conflict'])
  for (const side of ['before-commit', 'after-commit'])
    test(
      `${kind} service SIGKILL ${side} then browser readback preserves one issued outcome`,
      { timeout: 45000 },
      async (t) => {
        const f = await native(t),
          x = await prepared(f, 'service-cut-' + kind + side, kind);
        const initial = service(f);
        await killIssue(t, x, side);
        const cut = service(f);
        if (side === 'before-commit') assert.deepEqual(cut, initial);
        else assert.equal(cut.decisions.length, 1);
        await decide(x);
        if (side === 'after-commit') assert.deepEqual(service(f), cut);
        const result = await issue(f, x.item, x.request);
        assert.deepEqual([...result.bytes], x.answer);
        await open(f.page, x.item);
        await f.page.evaluate((token) => opened.submitPending(token), f.testOperatorToken);
        await assertOpen(x, true);
        await close(f.page);
        assertRetained(x, await census(f.page, x.item), true);
        evidence(`service-${kind}-${side}`, {
          signal: 'SIGKILL',
          responseDigest: hash(x.answer),
          exactServiceReadback: true,
          browserRecorded: true,
        });
      },
    );

for (const kind of ['closed', 'conflict'])
  for (const side of ['before', 'after'])
    test(
      `${kind} renderer dies ${side} response commit and cold owner derives only durable proof`,
      { timeout: 45000 },
      async (t) => {
        const f = await native(t),
          x = await prepared(f, 'renderer-cut-' + kind + side, kind);
        await decide(x);
        await open(f.page, x.item);
        await deliveryBoundary(f.page, 'response', side);
        await f.page.evaluate((token) => {
          window.hit = false;
          window.work = opened.submitPending(token).then(
            (r) => r,
            (e) => String(e),
          );
        }, f.testOperatorToken);
        await waitUntil(f.page, () => hit);
        await crash(f);
        await cold(f);
        assertRetained(x, await census(f.page, x.item), side === 'after');
        await open(f.page, x.item);
        await assertOpen(x, side === 'after');
        const r = await f.page.evaluate(
          (token) => opened.submitPending(token),
          f.testOperatorToken,
        );
        assert.equal(
          r.kind,
          side === 'after' ? 'blocked' : kind === 'closed' ? 'refused' : 'conflict',
        );
        await assertOpen(x, true);
        assert.deepEqual(service(f), x.service);
        await close(f.page);
        assertRetained(x, await census(f.page, x.item), true);
        evidence(`renderer-${kind}-${side}`, {
          crashed: true,
          durableAtCut: side === 'after',
          exactRecovery: true,
          noReseal: true,
        });
      },
    );
