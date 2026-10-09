import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ready, mutate, inspect } from './fixtures.mjs';
for (const control of ['possession', 'current-authority'])
  test(`removing ${control} permits a positively verified forbidden preparation`, async (t) => {
    const parent = resolve('test-results/account-enrollment-controls');
    mkdirSync(parent, { recursive: true });
    const dir = mkdtempSync(join(parent, control + '-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    for (const folder of ['account-protocol', 'account-service']) {
      mkdirSync(join(dir, folder));
      for (const file of readdirSync(folder).filter((f) => f.endsWith('.ts'))) {
        let code = readFileSync(join(folder, file), 'utf8');
        if (folder === 'account-service' && file === 'enrollment.ts') {
          const from =
            control === 'possession'
              ? 'await verifyEnrollmentPossession(context, request.possession);'
              : "if (!current || row.authority_hash !== current.token) stage = 'stale';";
          assert.equal(code.split(from).length, 2, 'Unique omission anchor');
          code = code.replace(
            from,
            control === 'possession' ? 'void request.possession;' : "if (false) stage = 'stale';",
          );
        }
        writeFileSync(join(dir, folder, file), code);
      }
    }
    const { AccountCore } = await import(pathToFileURL(join(dir, 'account-service/core.ts'))),
      { PrivateAuthority } = await import(pathToFileURL(join(dir, 'account-service/authority.ts')));
    let armed = false,
      x;
    const hook = (point, op) => {
      if (armed && point === 'after-verify' && op === 'enrollment-finish') {
        armed = false;
        mutate(x, (db) => db.exec("UPDATE accounts SET state='pending'"));
      }
    };
    x = await ready(t, { hook });
    const owner = PrivateAuthority.open(x.authority.path, x.authority.pin, x.authority.key),
      core = new AccountCore(
        x.f.path,
        { origin: x.authority.pin.origin, rpId: x.authority.pin.rpId },
        { hook },
      );
    t.after(() => {
      owner.close();
      core.close();
    });
    const e = x.candidate(),
      c = await x.enroll('begin', e.input),
      p = x.prove(e, c);
    if (control === 'possession') p.possession = '00'.repeat(64);
    else armed = true;
    const baseline = await x.enroll('finish', p);
    assert.equal(
      control === 'possession' ? baseline.refusal : baseline.stage,
      control === 'possession' ? 'invalid-proof' : 'stale',
    );
    if (control === 'current-authority') {
      // Restore the identical pre-race fixture, then repeat the same account-state change for the mutant.
      mutate(x, (db) => {
        db.exec(
          "UPDATE accounts SET state='active'; UPDATE enrollment_preparations SET stage='challenge';",
        );
      });
      armed = true;
    }
    const forbidden = await owner.enrollment(core, 'finish', p);
    assert.equal(forbidden.stage, 'prepared', JSON.stringify(forbidden));
    inspect(forbidden, x, e);
    assert.equal(x.f.rows('enrollment_preparations')[0].proof_hash !== null, true);
    if (control === 'current-authority') assert.equal(x.f.rows('accounts')[0].state, 'pending');
  });
