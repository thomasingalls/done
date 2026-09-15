import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { DatabaseSync } from 'node:sqlite';
import { verify, createPublicKey } from 'node:crypto';
import { prepared, lp } from '../account-admission/core-fixtures.mjs';
import { bindingMessage } from '../../account-protocol/slot.ts';
const binding = (x) =>
  x.authority.owner.promotionBinding(x.f.core, {
    retryKey: x.account.retryKey,
    requestDigest: x.offer.epoch.requestDigest,
  });
const active = async (t, options = {}) => {
  const x = await prepared(t, options);
  x.offer = await x.begin();
  x.receipt = await x.finish(x.offer);
  return x;
};
test('binding is derived from the exact admitted credential, signed in row-12 bytes and stable across restart', async (t) => {
  const x = await active(t),
    before = x.f.rows('credentials'),
    promotion = x.f.rows('promotions');
  const result = await binding(x),
    b = result.stored.binding;
  assert.equal(b.credId, x.account.key.id);
  assert.equal(b.publicKey, before[0].spki);
  assert.equal(b.accountId, x.account.result.accountId);
  assert.equal(b.principalId, x.request.candidate.principalId);
  const bytes = lp(
    'done/slotbind/v1',
    '1',
    b.accountId,
    b.principalId,
    'localhost',
    '1',
    b.credId,
    b.publicKey,
  );
  assert.deepEqual(Buffer.from(bindingMessage(b)), bytes);
  assert.ok(
    verify(
      null,
      bytes,
      createPublicKey({
        key: Buffer.from('302a300506032b6570032100' + x.authority.pin.authRoot, 'hex'),
        format: 'der',
        type: 'spki',
      }),
      Buffer.from(result.stored.bindingSignature, 'hex'),
    ),
  );
  x.f.restart();
  x.authority.restart();
  assert.deepEqual(await binding(x), result);
  assert.deepEqual(x.f.rows('credentials'), before);
  assert.deepEqual(x.f.rows('promotions'), promotion);
});
test('pending, wrong-capability, forged SPKI and changed current eligibility refuse issuance', async (t) => {
  const x = await prepared(t);
  x.offer = await x.begin();
  assert.equal((await binding(x)).ok, false);
  await x.finish(x.offer);
  for (const input of [
    { retryKey: 'A'.repeat(43), requestDigest: x.offer.epoch.requestDigest },
    { retryKey: x.account.retryKey, requestDigest: '00'.repeat(32) },
    {
      retryKey: x.account.retryKey,
      requestDigest: x.offer.epoch.requestDigest,
      publicKey: x.account.key.id,
    },
  ])
    assert.equal((await x.authority.owner.promotionBinding(x.f.core, input)).ok, false);
  const db = new DatabaseSync(x.f.path),
    old = x.f.rows('credentials')[0];
  db.prepare('UPDATE credentials SET spki=?').run('302a300506032b6570032100' + '01'.repeat(32));
  assert.equal((await binding(x)).ok, false);
  db.prepare('UPDATE credentials SET spki=?,state=?').run(old.spki, 'staged');
  assert.equal((await binding(x)).ok, false);
  db.close();
});
test('credential state changed after signing cannot return a binding from a stale observation', async (t) => {
  let x,
    armed = true;
  x = await active(t, {
    hook(point, operation) {
      if (point === 'after-verify' && operation === 'slot-binding' && armed) {
        armed = false;
        const db = new DatabaseSync(x.f.path);
        db.prepare("UPDATE credentials SET state='staged'").run();
        db.close();
      }
    },
  });
  assert.equal((await binding(x)).ok, false);
});
test(
  '60 generated issuance histories preserve the independent active/pending eligibility ledger',
  { timeout: 60000 },
  async () => {
    const histories = [];
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom('issue', 'activate', 'restart', 'wrong'), {
          minLength: 2,
          maxLength: 14,
        }),
        async (commands) => {
          const cleanups = [],
            context = { after: (fn) => cleanups.push(fn) },
            x = await prepared(context);
          x.offer = await x.begin();
          let activated = false,
            first;
          try {
            for (const command of commands) {
              if (command === 'activate') {
                await x.finish(x.offer);
                activated = true;
              }
              if (command === 'restart') {
                x.f.restart();
                x.authority.restart();
              }
              if (command === 'issue') {
                const result = await binding(x);
                if (!activated) assert.equal(result.ok, false);
                else {
                  assert.equal(result.kind, 'promotion-slot-binding');
                  if (first) assert.deepEqual(result, first);
                  first = result;
                }
              }
              if (command === 'wrong')
                assert.equal(
                  (
                    await x.authority.owner.promotionBinding(x.f.core, {
                      retryKey: 'A'.repeat(43),
                      requestDigest: x.offer.epoch.requestDigest,
                    })
                  ).ok,
                  false,
                );
            }
            histories.push({ commands, activated, status: 'passed' });
          } finally {
            for (const fn of cleanups.reverse()) await fn();
          }
        },
      ),
      { seed: 9252026, numRuns: 60, endOnFailure: true },
    );
    if (process.env.ACCOUNT_REPORT_DIR) {
      const { writeFileSync } = await import('node:fs'),
        { join } = await import('node:path');
      writeFileSync(
        join(process.env.ACCOUNT_REPORT_DIR, 'generated-service.json'),
        JSON.stringify({ seed: 9252026, histories }, null, 2),
      );
    }
  },
);

test('credential-integrity control actually signs a substituted key only when the COSE/SPKI guard is disabled', async (t) => {
  const { cpSync, readFileSync, writeFileSync, mkdirSync, rmSync } = await import('node:fs');
  const { resolve, join } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const { generateKeyPairSync } = await import('node:crypto');
  const dir = resolve('test-results/account-handoff/control-' + process.pid);
  mkdirSync(dir, { recursive: true });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const name of ['account-service', 'account-protocol'])
    cpSync(name, join(dir, name), { recursive: true });
  const file = join(dir, 'account-service/core.ts'),
    source = readFileSync(file, 'utf8'),
    needle = 'validateCredentialKey(credential);';
  assert.equal(source.split(needle).length, 2);
  writeFileSync(file, source.replace(needle, 'void 0;'));
  const { AccountCore } = await import(pathToFileURL(file));
  const x = await active(t),
    key = generateKeyPairSync('ed25519'),
    pub = key.publicKey.export({ format: 'der', type: 'spki' }).toString('hex');
  const original = await binding(x);
  const db = new DatabaseSync(x.f.path);
  db.prepare('UPDATE credentials SET spki=?').run(pub);
  db.close();
  const baseline = await binding(x);
  assert.equal(baseline.ok, false);
  const bad = new AccountCore(x.f.path, { rpId: 'localhost', origin: 'http://localhost:4999' });
  try {
    const accepted = await x.authority.owner.promotionBinding(bad, {
      retryKey: x.account.retryKey,
      requestDigest: x.offer.epoch.requestDigest,
    });
    assert.equal(accepted.stored.binding.publicKey, pub);
    assert.ok(
      verify(
        null,
        bindingMessage(accepted.stored.binding),
        createPublicKey({
          key: Buffer.from('302a300506032b6570032100' + x.authority.pin.authRoot, 'hex'),
          format: 'der',
          type: 'spki',
        }),
        Buffer.from(accepted.stored.bindingSignature, 'hex'),
      ),
    );
    if (process.env.ACCOUNT_REPORT_DIR)
      writeFileSync(
        join(process.env.ACCOUNT_REPORT_DIR, 'control-credential.json'),
        JSON.stringify(
          {
            baseline: 'substituted credential refused',
            baselineOk: baseline.ok,
            authRoot: x.authority.pin.authRoot,
            original,
            substitutedKey: pub,
            accepted,
          },
          null,
          2,
        ),
      );
  } finally {
    bad.close();
  }
});
