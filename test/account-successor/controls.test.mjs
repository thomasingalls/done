import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verify } from 'node:crypto';
import { fixture, message } from './oracle.mjs';
import { verifySuccessor } from '../../account-protocol/successor.ts';

for (const control of ['recipient-carry-forward', 'retained-head'])
  test(`omitting ${control} admits an independently authenticated forbidden successor`, async (t) => {
    const parent = resolve('test-results/account-successor-controls');
    mkdirSync(parent, { recursive: true });
    const dir = mkdtempSync(join(parent, 'mutant-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    for (const file of readdirSync('account-protocol').filter((f) => f.endsWith('.ts'))) {
      let code = readFileSync(join('account-protocol', file), 'utf8');
      if (file === 'successor.ts') {
        // Remove the whole policy guard, retaining parsing and actual signature verification.
        const expression =
          control === 'recipient-carry-forward'
            ? /if \(\s*!same\(e\.certified\.value,[\s\S]*?throw Error\('Certified set changed'\);/
            : /if \(held\.epoch === 1[\s\S]*?throw Error\('Successor fork or rollback'\);/;
        assert.equal(
          [...code.matchAll(new RegExp(expression.source, 'g'))].length,
          1,
          'unique omission anchor',
        );
        code = code.replace(expression, '/* intentional policy omission */');
      }
      writeFileSync(join(dir, file), code);
    }
    const mutant = await import(pathToFileURL(join(dir, 'successor.ts'))),
      f = fixture();
    let s,
      held = f.held;
    if (control === 'recipient-carry-forward') {
      const e = structuredClone(f.epoch);
      e.certified.value.members[0].wPub = '99'.repeat(32);
      s = f.seal(e);
    } else {
      s = fixture(1, '99'.repeat(32)).successor;
      held = { epoch: 2, head: f.successor.head };
    }
    assert(
      verify(
        null,
        message('done/admission-successor/v1', s.epoch),
        f.keys.authority,
        Buffer.from(s.signature, 'hex'),
      ),
    );
    await assert.rejects(verifySuccessor(s, f.base, held));
    const forbidden = await mutant.verifySuccessor(s, f.base, held);
    assert.deepEqual(forbidden, s);
    if (control === 'recipient-carry-forward')
      assert.notEqual(
        forbidden.epoch.certified.value.members[0].wPub,
        f.request.certification.members[0].wPub,
      );
    else assert.notEqual(forbidden.head, held.head);
  });
