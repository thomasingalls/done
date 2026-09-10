import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { join, resolve } from 'node:path';
import { randomBytes, verify, createPublicKey } from 'node:crypto';
import { writeFileSync, readFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { prepared, fixture, registered } from '../account-recovery/fixtures.mjs';
import { policy, fresh } from '../account-core/fixtures.mjs';
import { PrivateAuthority } from '../../account-service/authority.ts';
import { generateRecovery, confirmRecovery } from '../../src/account/recovery.ts';
import { verifyPendingProof } from '../../account-protocol/preparation.ts';
async function owned(t) {
  const f = fixture(t),
    key = randomBytes(32),
    path = f.path + '.root',
    pin = PrivateAuthority.initialize(path, policy, key),
    authority = PrivateAuthority.open(path, pin, key);
  t.after(() => {
    authority.close();
    key.fill(0);
  });
  const a = await registered(f),
    generated = await generateRecovery({
      principalId: 'principal',
      workspaceId: 'workspace',
      lineageId: 'lineage',
      authRoot: pin.authRoot,
    });
  const input = { retryKey: a.retryKey, draft: generated.draft },
    view = await f.core.beginRecovery(input),
    proof = {
      retryKey: a.retryKey,
      recoveryId: view.recoveryId,
      response: a.key.assert(view),
      recoveryProof: await confirmRecovery(
        generated.draft,
        generated.code,
        view.options.challenge,
        view.draftDigest,
      ),
    };
  const receipt = await f.core.finishRecovery(proof);
  assert.equal(receipt.ok, true);
  return {
    f,
    a,
    authority,
    pin,
    input,
    proof,
    receipt,
    request: () => ({
      retryKey: a.retryKey,
      accountId: a.result.accountId,
      nonce: randomBytes(32).toString('hex'),
    }),
  };
}

test('current signed observation binds nonce, pin, account and confirmed draft; historical receipts cannot reauthorize abandonment', async (t) => {
  const x = await owned(t),
    request = x.request(),
    proof = x.authority.pending(x.f.core, request),
    state = await verifyPendingProof(x.pin, request.nonce, proof);
  assert.equal(state.status, 'eligible');
  // Reconstruct LP and ordered JSON independently of the protocol helper.
  const lp = (...s) =>
    Buffer.concat(
      s.map((x) => {
        const b = Buffer.from(x),
          n = Buffer.alloc(2);
        n.writeUInt16BE(b.length);
        return Buffer.concat([n, b]);
      }),
    );
  const p = x.pin,
    pinBytes = lp('done/service-authority-pin/v1', '1', p.serviceId, p.origin, p.rpId, p.authRoot);
  const bytes = lp(
    'done/pending-account-observation/v1',
    pinBytes.toString('hex'),
    request.nonce,
    JSON.stringify(state),
  );
  assert(
    verify(
      null,
      bytes,
      createPublicKey({
        key: Buffer.concat([
          Buffer.from('302a300506032b6570032100', 'hex'),
          Buffer.from(p.authRoot, 'hex'),
        ]),
        format: 'der',
        type: 'spki',
      }),
      Buffer.from(proof.signature, 'hex'),
    ),
  );
  await assert.rejects(verifyPendingProof(p, 'fe'.repeat(32), proof));
  await assert.rejects(
    verifyPendingProof({ ...p, authRoot: 'ee'.repeat(32) }, request.nonce, proof),
  );
  assert.equal(x.authority.pending(x.f.core, { ...request, accountId: fresh() }).ok, false);
  const retired = x.authority.pending(x.f.core, request, true);
  assert.equal((await verifyPendingProof(p, request.nonce, retired)).status, 'abandoned');
  assert.deepEqual(await x.f.core.finishRecovery(x.proof), x.receipt);
  assert.deepEqual(await x.f.core.beginRecovery(x.input), x.receipt);
  assert.equal(x.authority.pending(x.f.core, x.request()).ok, false);
  x.f.restart();
  assert.equal(x.authority.pending(x.f.core, x.request()).ok, false);
  assert.equal(x.authority.pending(x.f.core, x.request(), true).state.status, 'abandoned');
  x.f.seedActive(request.accountId);
  assert.equal(x.authority.pending(x.f.core, x.request(), true).ok, false);
});

test('120 generated service histories retain cancellation despite old receipts, restart, lost replies and wrong capabilities', async () => {
  let runs = 0;
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.constantFrom('inspect', 'abandon', 'restart', 'receipt', 'wrong'), {
        minLength: 1,
        maxLength: 10,
      }),
      async (commands) => {
        // Scoped fixture resources are closed at each generated history.
        const cleanups = [],
          scope = { after: (fn) => cleanups.push(fn) },
          x = await owned(scope);
        let abandoned = false;
        try {
          for (const command of commands) {
            if (command === 'restart') {
              x.f.restart();
              continue;
            }
            if (command === 'receipt') {
              assert.deepEqual(await x.f.core.finishRecovery(x.proof), x.receipt);
              continue;
            }
            if (command === 'wrong') {
              assert.equal(
                x.authority.pending(x.f.core, { ...x.request(), retryKey: fresh() }).ok,
                false,
              );
              continue;
            }
            const result = x.authority.pending(x.f.core, x.request(), command === 'abandon');
            if (command === 'abandon') abandoned = true;
            if (command === 'inspect' && abandoned) assert.equal(result.ok, false);
            else assert.equal(result.state.status, abandoned ? 'abandoned' : 'eligible');
          }
          runs++;
        } finally {
          for (const cleanup of cleanups.reverse()) cleanup();
        }
      },
    ),
    { numRuns: 120, seed: 9202026, endOnFailure: true },
  );
  assert.equal(runs, 120);
});
for (const point of ['before-commit', 'after-commit'])
  test('SIGKILL ' + point + ' abandonment is resolved cold', async (t) => {
    const x = await prepared(t);
    await x.f.core.finishRecovery(x.proof);
    const input = { retryKey: x.account.retryKey, accountId: x.account.result.accountId };
    const child = fork(
      new URL('../account-core/worker.mjs', import.meta.url),
      [x.f.path, point, 'abandon-preparation'],
      { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] },
    );
    t.after(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    });
    await once(child, 'message');
    const death = once(child, 'exit');
    child.send({ action: 'abandonPreparation', input });
    assert.deepEqual(await death, [null, 'SIGKILL']);
    x.f.restart();
    assert.equal(x.f.core.pendingPreparation(input).ok, point === 'before-commit');
    assert.equal(x.f.core.abandonPreparation(input).state.status, 'abandoned');
    assert.equal(x.f.core.pendingPreparation(input).ok, false);
  });

test('current-eligibility fault control accepts an abandoned account only when live-state checks are removed', async (t) => {
  const dir = resolve('test-results/account-promotion/control-source-' + process.pid);
  mkdirSync(dir, { recursive: true });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const name of ['account-service', 'account-protocol'])
    cpSync(name, join(dir, name), { recursive: true });
  const path = join(dir, 'account-service/core.ts'),
    original = readFileSync(path, 'utf8');
  // Scope the control to the intended owner; admission has its own live-state guard.
  const start = original.indexOf('\n  pendingPreparation(');
  assert.ok(start > 0);
  // Include #pendingCredential, which implements preparation's registration-state check.
  const end = original.indexOf('\n  #recoveryView(', start);
  assert.ok(end > start);
  const target = original.slice(start, end);
  assert.equal(target.split("attempt.state !== 'done' ||").length, 2);
  assert.equal(target.split("row?.state !== 'done'").length, 2);
  const mutant =
    original.slice(0, start) +
    target
      .replace("attempt.state !== 'done' ||", 'false ||')
      .replace("row?.state !== 'done'", 'false') +
    original.slice(end);
  assert.notEqual(mutant, original);
  writeFileSync(path, mutant);
  const { AccountCore } = await import(pathToFileURL(path));
  const x = await prepared(t);
  await x.f.core.finishRecovery(x.proof);
  const input = { retryKey: x.account.retryKey, accountId: x.account.result.accountId };
  x.f.core.abandonPreparation(input);
  assert.equal(x.f.core.pendingPreparation(input).ok, false);
  const bad = new AccountCore(x.f.path, policy);
  try {
    const accepted = bad.pendingPreparation(input);
    assert.equal(accepted.ok, true);
    assert.equal(accepted.state.status, 'eligible');
    if (process.env.ACCOUNT_REPORT_DIR)
      writeFileSync(
        join(process.env.ACCOUNT_REPORT_DIR, 'control-current-state.json'),
        JSON.stringify({ baseline: 'refused', mutant: 'accepted-abandoned-account' }, null, 2),
      );
  } finally {
    bad.close();
  }
});

test('abandonment owns absent, expired and cancelled recovery drafts without making the old registration reusable', async (t) => {
  for (const stage of ['absent', 'expired', 'cancelled']) {
    let now = 1000;
    const f = fixture(t, { now: () => now }),
      a = await registered(f),
      input = { retryKey: a.retryKey, accountId: a.result.accountId };
    if (stage !== 'absent') {
      const generated = await generateRecovery({
        principalId: 'p',
        workspaceId: 'w',
        lineageId: 'l',
        authRoot: 'ab'.repeat(32),
      });
      await f.core.beginRecovery({ retryKey: a.retryKey, draft: generated.draft });
      if (stage === 'expired') {
        now += 11 * 60 * 1000;
        assert.equal(f.core.resumeRecovery({ retryKey: a.retryKey }).refusal, 'expired');
      } else f.core.cancelRecovery({ retryKey: a.retryKey });
    }
    const result = f.core.abandonPreparation(input);
    assert.equal(result.state.status, 'abandoned');
    f.restart();
    assert.deepEqual(f.core.abandonPreparation(input), result);
    assert.equal(f.core.resume({ retryKey: a.retryKey }).refusal, 'cancelled');
    assert.equal(f.core.pendingPreparation(input).ok, false);
  }
});
