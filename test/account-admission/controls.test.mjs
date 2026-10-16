import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prepared, hash } from './core-fixtures.mjs';
async function mutant(t, needle, replacement) {
  const parent = resolve('test-results/account-admission-controls');
  mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, 'mutant-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const folder of ['account-protocol', 'account-service']) {
    mkdirSync(join(dir, folder));
    for (const file of readdirSync(folder).filter((f) => f.endsWith('.ts'))) {
      let code = readFileSync(join(folder, file), 'utf8');
      if (folder === 'account-protocol' && file === 'admission.ts') {
        assert.equal(code.split(needle).length, 2, 'Unique approval-verification anchor');
        code = code.replace(needle, replacement);
      }
      writeFileSync(join(dir, folder, file), code);
    }
  }
  return {
    Core: (await import(pathToFileURL(join(dir, 'account-service/core.ts')).href)).AccountCore,
    Authority: (await import(pathToFileURL(join(dir, 'account-service/authority.ts')).href))
      .PrivateAuthority,
  };
}
for (const gate of ['origin', 'certification'])
  test(`removing ${gate} verification actually admits an unapproved genesis`, async (t) => {
    const x = await prepared(t),
      request = structuredClone(x.request);
    const needle =
      gate === 'origin'
        ? 'verifySignature(\n      r.recovery.bootstrapSigner,\n      r.originSignature,\n      await proofWork(checkpoint, originMessage(r)),\n    )'
        : 'verifySignature(\n      key,\n      r.certification.signature,\n      await proofWork(checkpoint, certificationMessage(r)),\n    )';
    // A certificate edit also changes the origin message: reseal that endorsement with the fixture's saved factor.
    if (gate === 'origin') request.originSignature = '00'.repeat(64);
    else {
      request.certification.signature = '00'.repeat(64);
      const { withRecoveryKeys } = await import('../../src/account/recovery.ts');
      const { originMessage } = await import('../../account-protocol/admission.ts');
      request.originSignature = await withRecoveryKeys(
        x.recovery.draft,
        x.recovery.code,
        crypto.subtle,
        async (_r, key) =>
          Buffer.from(
            await crypto.subtle.sign('Ed25519', key, await originMessage(request)),
          ).toString('hex'),
      );
    }
    const baseline = await x.authority.owner.beginPromotion(x.f.core, {
      retryKey: x.account.retryKey,
      request,
    });
    assert.equal(baseline.ok, false);
    const { Core, Authority } = await mutant(t, needle, 'Promise.resolve()'),
      core = new Core(x.f.path, { rpId: x.authority.pin.rpId, origin: x.authority.pin.origin }),
      owner = Authority.open(x.authority.path, x.authority.pin, x.authority.key);
    t.after(() => {
      core.close();
      owner.close();
    });
    const offer = await owner.beginPromotion(core, { retryKey: x.account.retryKey, request });
    assert.equal(offer.kind, 'promotion-offer');
    // Completion fields are independent of the changed approval signatures; the offered head is used exactly.
    const completion = await x.completion(offer);
    const result = await owner.finishPromotion(
      core,
      await x.activationInput(offer, completion, owner, core),
    );
    assert.equal(result.kind, 'promotion-receipt');
    const accountState = x.f.rows('accounts')[0].state;
    assert.equal(accountState, 'active');
    if (process.env.ACCOUNT_REPORT_DIR)
      writeFileSync(
        join(process.env.ACCOUNT_REPORT_DIR, 'control-' + gate + '.json'),
        JSON.stringify(
          {
            gate,
            baseline: 'refused',
            baselineOk: baseline.ok,
            accountState,
            expectedAccountId: x.account.result.accountId,
            requestDigest: hash(JSON.stringify(request)),
            originalSignature:
              gate === 'origin' ? x.request.originSignature : x.request.certification.signature,
            approvalSignature:
              gate === 'origin' ? request.originSignature : request.certification.signature,
            observed: 'account activated after approval verification removed',
            result,
          },
          null,
          2,
        ),
      );
  });
