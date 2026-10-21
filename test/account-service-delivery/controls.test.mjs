import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { ready, proof, mutate } from './fixtures.mjs';
const artifact = (name, v) => {
  if (process.env.ACCOUNT_REPORT_DIR)
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, name + '.json'),
      JSON.stringify(v, null, 2) + '\n',
    );
};
async function mutant(t, control) {
  const parent = resolve('test-results/account-service-delivery-controls');
  mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, 'mutant-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const folder of ['account-protocol', 'account-service']) {
    mkdirSync(join(dir, folder));
    for (const file of readdirSync(folder).filter((f) => f.endsWith('.ts'))) {
      let code = readFileSync(join(folder, file), 'utf8');
      if (folder === 'account-service' && file === 'delivery.ts') {
        const edits = {
          witness: [
            /(async function verifyLedgerWitness\([\s\S]*?\): Promise<void> \{)/g,
            '$1 return;',
          ],
          commit: [
            /db.exec\('COMMIT'\);\n        if \(proposed\) reuse\?\.tips\?\.committed\(s\);\n        hook\('after-commit', 'decide-submission'\);/g,
            "db.exec('ROLLBACK');\n        if (proposed) reuse?.tips?.committed(s);\n        hook('after-commit', 'decide-submission');",
          ],
          current: [
            /hook\('after-verify', 'decide-submission'\);\n        db.exec\('BEGIN IMMEDIATE'\);\n        if \(!unchanged\(db, s, reuse\)\)/g,
            "hook('after-verify', 'decide-submission');\n        db.exec('BEGIN IMMEDIATE');\n        if (false)",
          ],
          generation: [
            /if \(generation !== \(auth.history \? historyGeneration\(auth.history, epoch\) : auth.generation\)\)\n    return mismatch;/g,
            'void generation;',
          ],
        };
        const [pattern, replacement] = edits[control] ?? [];
        if (pattern) {
          assert.equal([...code.matchAll(pattern)].length, 1, 'Actual mutation anchor ' + control);
          code = code.replace(pattern, replacement);
        }
      }
      if (control === 'old-reader' && folder === 'account-service' && file === 'core.ts')
        code = execFileSync('git', ['show', '2cb42a2:account-service/core.ts'], {
          encoding: 'utf8',
          timeout: 5000,
          maxBuffer: 2 * 1024 * 1024,
        });
      writeFileSync(join(dir, folder, file), code);
    }
  }
  return {
    Core: (await import(pathToFileURL(join(dir, 'account-service/core.ts')).href)).AccountCore,
    Authority: (await import(pathToFileURL(join(dir, 'account-service/authority.ts')).href))
      .PrivateAuthority,
  };
}
for (const control of ['commit', 'generation', 'current', 'witness'])
  test(`actual ${control} control demonstrates the protected bad outcome`, async (t) => {
    let baseline;
    if (control !== 'witness') {
      let normal,
        armed = false;
      normal = await ready(t, {
        hook(point, op) {
          if (
            control === 'current' &&
            armed &&
            point === 'after-verify' &&
            op === 'decide-submission'
          ) {
            armed = false;
            mutate(normal, (db) => db.exec("UPDATE accounts SET state='pending'"));
          }
        },
      });
      const w = normal.make(1, 'baseline', { gen: control === 'generation' ? 2 : 1 });
      armed = true;
      const result = await normal.call(w);
      const outcome =
        result.kind === 'unknown'
          ? result.kind
          : proof(result, normal.offer.epoch.acceptancePublicKey, w.subject).kind;
      baseline = {
        outcome,
        persisted: normal.f.rows('delivery_decisions').length,
        account: normal.f.rows('accounts')[0].state,
      };
      assert.equal(
        outcome,
        control === 'generation' ? 'refused' : control === 'current' ? 'unknown' : 'accepted',
      );
      assert.equal(baseline.persisted, control === 'current' ? 0 : 1);
    }
    const x = await ready(t),
      { Core, Authority } = await mutant(t, control);
    let armed = false;
    const core = new Core(
        x.f.path,
        { origin: x.authority.pin.origin, rpId: x.authority.pin.rpId },
        {
          hook(point, op) {
            if (
              control === 'current' &&
              armed &&
              point === 'after-verify' &&
              op === 'decide-submission'
            ) {
              armed = false;
              mutate(x, (db) => db.exec("UPDATE accounts SET state='pending'"));
            }
          },
        },
      ),
      authority = Authority.open(x.authority.path, x.authority.pin, x.authority.key);
    t.after(() => {
      core.close();
      authority.close();
    });
    const call = (w) =>
      authority.decideSubmission(core, { workspaceId: x.workspace, bytes: w.bytes });
    let w = x.make(1, 'control', { gen: control === 'generation' ? 2 : 1 });
    let redundant, witnessCall;
    if (control === 'witness') {
      const bad = x.make(1, 'closed', { gen: 2 });
      const closure = await x.call(bad);
      assert.equal(proof(closure, x.offer.epoch.acceptancePublicKey, bad.subject).kind, 'refused');
      const savedRow = x.f.rows('delivery_decisions')[0];
      mutate(x, (db) => db.exec('DELETE FROM delivery_decisions'));
      w = x.make(1, 'restamped', { ct: bad.ct });
      const before = x.f.rows('delivery_decisions');
      redundant = [await x.call(w), await call(w)];
      for (const result of redundant)
        assert.deepEqual(result, { kind: 'unknown', reason: 'ledger-integrity' });
      assert.deepEqual(x.f.rows('delivery_decisions'), before);
      mutate(x, (db) => {
        db.prepare('INSERT INTO delivery_decisions VALUES (?,?,?,?,?,?,?,?)').run(
          ...Object.values(savedRow),
        );
        const witness = JSON.parse(
          db.prepare('SELECT delivery_witness FROM promotions').get().delivery_witness,
        );
        witness.signature = 'ab'.repeat(64);
        db.prepare('UPDATE promotions SET delivery_witness=?').run(JSON.stringify(witness));
      });
      // Count/shape and original signed closure still agree. Only witness authentication is damaged.
      // Both owners were quarantined by the deletion probe; restart both before this independent fault.
      x.f.restart();
      x.authority.restart();
      // Recreate the actual mutated owner without weakening its publisher count guard.
      const freshCore = new Core(x.f.path, {
        origin: x.authority.pin.origin,
        rpId: x.authority.pin.rpId,
      });
      const freshOwner = Authority.open(x.authority.path, x.authority.pin, x.authority.key);
      t.after(() => {
        freshCore.close();
        freshOwner.close();
      });
      witnessCall = (value) =>
        freshOwner.decideSubmission(freshCore, { workspaceId: x.workspace, bytes: value.bytes });
      w = x.make(1, 'restamped', { ct: bad.ct });
      const result = await x.call(w);
      baseline = {
        outcome: result.kind,
        persisted: x.f.rows('delivery_decisions').length,
        account: x.f.rows('accounts')[0].state,
      };
      assert.deepEqual(result, { kind: 'unknown', reason: 'ledger-integrity' });
      // The retained valid refusal requires its signed parent; preserve this independent policy.
      w = x.make(1, 'successor', {
        parent: proof(closure, x.offer.epoch.acceptancePublicKey, bad.subject).refusal,
      });
    }
    if (control === 'current') armed = true;
    const r = await (witnessCall ?? call)(w),
      p = proof(r, x.offer.epoch.acceptancePublicKey, w.subject);
    assert.equal(p.kind, 'accepted');
    const rows = x.f.rows('delivery_decisions');
    assert.equal(rows.length, control === 'commit' ? 0 : control === 'witness' ? 2 : 1);
    artifact('control-' + control, {
      baseline,
      redundant,
      outcome: p.kind,
      persisted: rows.length,
      account: x.f.rows('accounts')[0].state,
      description: {
        commit: 'Signed acceptance escapes without any durable decision.',
        generation: 'Certified epoch generation mismatch is accepted.',
        current: 'Acceptance commits after membership becomes inactive.',
        witness:
          'An unauthenticated witness allows acceptance after a valid retained refusal; deletion still refuses with the count guard.',
      }[control],
    });
  });
test('the committed v3 reader refuses schema 4 without modifying it', async (t) => {
  const x = await ready(t),
    { Core } = await mutant(t, 'old-reader');
  assert.throws(
    () => new Core(x.f.path, { origin: x.authority.pin.origin, rpId: x.authority.pin.rpId }),
    /Unsupported account schema/,
  );
  assert.equal(x.f.rows('delivery_decisions').length, 0);
  assert.equal((await x.call(x.make())).kind, 'decision');
});
