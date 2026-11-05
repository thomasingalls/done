import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { generateKeyPairSync } from 'node:crypto';
import { ready, mutate } from '../account-service-delivery/fixtures.mjs';
import { query, pageProof } from './oracle.mjs';
const artifact = (name, value) => {
  if (process.env.ACCOUNT_REPORT_DIR)
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, name + '.json'),
      JSON.stringify(value, null, 2) + '\n',
    );
};
for (const control of ['signature', 'current'])
  test(`actual service ${control} mutation discloses a signed page to an unauthorized reader`, async (t) => {
    const parent = resolve('test-results/account-transport-controls');
    mkdirSync(parent, { recursive: true });
    const dir = mkdtempSync(join(parent, 'mutant-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    for (const folder of ['account-protocol', 'account-service']) {
      mkdirSync(join(dir, folder));
      for (const file of readdirSync(folder).filter((f) => f.endsWith('.ts'))) {
        let code = readFileSync(join(folder, file), 'utf8');
        if (folder === 'account-service' && file === 'delivery.ts') {
          const pattern =
            control === 'signature'
              ? /!\(await crypto\.subtle\.verify\(\s*'Ed25519',\s*auth.key,\s*unhex\(request.signature, 64\),\s*readRequestMessage\(request\),\s*\)\)/g
              : /(hook\('after-verify', 'read-accepted'\);\s*db.exec\('BEGIN'\);\s*if \()!unchanged\(db, s, reuse\)/g;
          assert.equal([...code.matchAll(pattern)].length, 1, 'Mutation anchor');
          code = code.replace(pattern, control === 'current' ? '$1false' : 'false');
        }
        writeFileSync(join(dir, folder, file), code);
      }
    }
    const Core = (await import(pathToFileURL(join(dir, 'account-service/core.ts')).href))
      .AccountCore;
    const Authority = (await import(pathToFileURL(join(dir, 'account-service/authority.ts')).href))
      .PrivateAuthority;
    let armed = false;
    const x = await ready(t),
      w = x.make(),
      r = await x.call(w);
    const core = new Core(
      x.f.path,
      { origin: x.authority.pin.origin, rpId: x.authority.pin.rpId },
      {
        hook(point, op) {
          if (armed && point === 'after-verify' && op === 'read-accepted') {
            armed = false;
            mutate(x, (db) => db.exec("UPDATE accounts SET state='pending'"));
          }
        },
      },
    );
    const authority = Authority.open(x.authority.path, x.authority.pin, x.authority.key);
    t.after(() => {
      core.close();
      authority.close();
    });
    const q = query(
      x,
      0,
      8,
      {},
      control === 'signature' ? generateKeyPairSync('ed25519').privateKey : x.s.privateKey,
    );
    if (control === 'signature')
      assert.equal((await x.authority.owner.readAccepted(x.f.core, q)).kind, 'unknown');
    else armed = true;
    const result = await authority.readAccepted(core, q);
    pageProof(result, q, x, [{ w, r }]);
    if (control === 'current')
      assert.equal((await x.authority.owner.readAccepted(x.f.core, q)).kind, 'unknown');
    artifact('control-' + control, {
      outcome: 'signed ciphertext page escaped',
      unauthorized:
        control === 'signature'
          ? 'foreign private key'
          : 'account changed to pending during verification',
    });
  });
