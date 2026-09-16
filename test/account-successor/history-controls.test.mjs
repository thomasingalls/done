import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verify } from 'node:crypto';
import * as production from '../../account-protocol/admissionHistory.ts';
import { historyFixture, wire, expected, accepted, link, head, ZERO } from './history-oracle.mjs';
import { headMessage } from '../account-decisions/oracle.mjs';

for (const control of ['proof-issuance-boundary', 'prefix-link'])
  test(`omitting ${control} admits independently signed evidence outside the retained boundary`, async (t) => {
    const parent = resolve('test-results/account-successor-controls');
    mkdirSync(parent, { recursive: true });
    const dir = mkdtempSync(join(parent, 'history-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    for (const file of readdirSync('account-protocol').filter((f) => f.endsWith('.ts'))) {
      let code = readFileSync(join('account-protocol', file), 'utf8');
      if (file === 'admissionHistory.ts') {
        const expression =
          control === 'proof-issuance-boundary'
            ? /response\.head\.epoch !== \(response\.head\.position <= h\.boundary\.position \? 1 : 2\) \|\|/
            : / \|\|\s*link !== h\.boundary\.link/;
        assert.equal(
          [...code.matchAll(new RegExp(expression.source, 'g'))].length,
          1,
          'unique omission anchor',
        );
        code = code.replace(expression, '');
      }
      writeFileSync(join(dir, file), code);
    }
    const mutant = await import(pathToFileURL(join(dir, 'admissionHistory.ts'))),
      f = historyFixture(1),
      args = [f.successor, f.base, f.held],
      normal = await production.verifyAdmissionHistory(...args),
      changed = await mutant.verifyAdmissionHistory(...args);
    if (control === 'proof-issuance-boundary') {
      const w = wire(f, 2),
        before = f.epoch.heads.find((h) => h.position === 1).link,
        proof = accepted(f, w, 1, before),
        claim = head(w.subject, before, 1, f.keys.acceptance);
      assert(
        verify(null, headMessage(claim), f.keys.acceptance, Buffer.from(claim.signature, 'hex')),
      );
      assert.equal(
        (await production.verifyHistoryDecision(proof, expected(w, before), normal.current, normal))
          .kind,
        'unknown',
      );
      const forbidden = await mutant.verifyHistoryDecision(
        proof,
        expected(w, before),
        changed.current,
        changed,
      );
      assert.equal(forbidden.kind, 'accepted');
      assert(forbidden.head.position > normal.boundary.position && forbidden.head.epoch === 1);
    } else {
      const different = wire(f, 1, 1, 'different accepted history'),
        good = production.createAdmissionPrefixVerifier(normal),
        bad = mutant.createAdmissionPrefixVerifier(changed);
      await good.append(different.bytes); // Production verifies the real signature, digest and route.
      assert.throws(() => good.finish());
      await bad.append(different.bytes);
      const forbidden = bad.finish();
      assert.equal(forbidden.position, normal.boundary.position);
      assert.equal(forbidden.link, link(different.subject, ZERO));
      assert.notEqual(forbidden.link, normal.boundary.link);
    }
  });
