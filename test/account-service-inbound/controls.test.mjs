import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { generateKeyPairSync } from 'node:crypto';
import { ready, mutate } from '../account-service-delivery/fixtures.mjs';
import { query, read, pageProof } from './oracle.mjs';

const replace = (code, from, to) => {
  assert.equal(code.split(from).length, 2, 'Unique mutation anchor');
  return code.replace(from, to);
};
for (const control of [
  'reader',
  'publisher',
  'signature',
  'current',
  'registration',
  'witness',
  'expiry',
  'custody',
])
  test(
    `actual ${control} omission produces a signed page forbidden by the baseline`,
    { timeout: 15000 },
    async (t) => {
      const parent = resolve('test-results/account-service-inbound-controls');
      mkdirSync(parent, { recursive: true });
      const dir = mkdtempSync(join(parent, control + '-'));
      t.after(() => rmSync(dir, { recursive: true, force: true }));
      for (const folder of ['account-protocol', 'account-service']) {
        mkdirSync(join(dir, folder));
        for (const file of readdirSync(folder).filter((f) => f.endsWith('.ts'))) {
          let code = readFileSync(join(folder, file), 'utf8');
          if (folder === 'account-service' && file === 'delivery.ts') {
            if (control === 'reader' || control === 'publisher')
              code = replace(
                code,
                `auth.members.find((member) => member.id === request.${control})`,
                'auth.members[0]',
              );
            if (control === 'signature') {
              const re =
                /!\(await crypto\.subtle\.verify\(\s*'Ed25519',\s*reader.key,\s*unhex\(request.signature, 64\),\s*inboundRequestMessage\(request\),\s*\)\)/g;
              assert.equal([...code.matchAll(re)].length, 1);
              code = code.replace(re, 'false');
            }
            if (control === 'current') code = replace(code, 'if (!current) {', 'if (false) {');
            if (control === 'registration')
              code = replace(code, "registration['credentialId'] !== credential.id", 'false');
            if (control === 'witness')
              code = replace(
                code,
                'await verifyLedgerWitness(witness, auth, count, commitment);',
                'void witness;',
              );
            if (control === 'expiry' || control === 'custody') {
              const marker =
                '// change during a slow signing call. Withhold bytes on its far side too.';
              assert.equal(code.split(marker).length, 2);
              const [before, after] = code.split(marker);
              code =
                before +
                marker +
                (control === 'expiry'
                  ? replace(after, 'if (!live()) {', 'if (false) {')
                  : replace(
                      after,
                      'issuer.check(auth.seal, s.promotion.request_digest, auth.a.acceptanceKey);',
                      'void auth.seal;',
                    ));
            }
          }
          writeFileSync(join(dir, folder, file), code);
        }
      }
      const load = (file) => import(pathToFileURL(join(dir, 'account-service', file + '.ts')).href);
      const Core = (await load('core')).AccountCore,
        Authority = (await load('authority')).PrivateAuthority,
        MutantCustody = (await load('acceptance')).AcceptanceCustody;
      let armed = false,
        x;
      const hook = (point, op) => {
        if (armed && point === 'after-verify' && op === 'read-inbound') {
          armed = false;
          mutate(x, (db) => db.exec("UPDATE accounts SET state='pending'"));
        }
      };
      x = await ready(t, { hook });
      const core = new Core(
        x.f.path,
        { origin: x.authority.pin.origin, rpId: x.authority.pin.rpId },
        { hook },
      );
      const owner = Authority.open(x.authority.path, x.authority.pin, x.authority.key);
      t.after(() => {
        core.close();
        owner.close();
      });
      const w = x.make(),
        r = await x.call(w),
        good = query(x),
        retained = [{ w, r }];
      pageProof(await read(x, good), good, x, retained);
      pageProof(await owner.readInbound(core, good), good, x, retained);
      let q = query(
        x,
        0,
        1,
        control === 'reader' || control === 'publisher' ? { [control]: 'aa'.repeat(16) } : {},
        control === 'signature' ? generateKeyPairSync('ed25519').privateKey : x.s.privateKey,
      );
      if (control === 'registration') {
        let credential;
        mutate(x, (db) => {
          credential = db.prepare('SELECT id FROM credentials').get().id;
          db.exec("UPDATE credentials SET id='replaced'");
        });
        // Fresh activation independently binds the real passkey. Removing the older
        // registration check must no longer rescue a replaced current credential.
        assert.equal((await read(x, q)).kind, 'unknown');
        assert.equal((await owner.readInbound(core, q)).kind, 'unknown');
        mutate(x, (db) => {
          db.prepare('UPDATE credentials SET id=?').run(credential);
          const row = db.prepare("SELECT id,result FROM attempts WHERE mode='register'").get();
          const registration = JSON.parse(row.result);
          registration.credentialId = 'replaced';
          db.prepare('UPDATE attempts SET result=? WHERE id=?').run(
            JSON.stringify(registration),
            row.id,
          );
        });
        // Isolate registration provenance while preserving the current credential and
        // authenticated activation receipt; only this control's omitted guard differs.
      }
      if (control === 'witness') mutate(x, (db) => db.exec('DELETE FROM delivery_decisions'));
      if (control === 'current') armed = true;
      const now = Date.now;
      if (control === 'expiry' || control === 'custody') {
        const { AcceptanceCustody } = await import('../../account-service/acceptance.ts');
        const original = AcceptanceCustody.prototype.inboundPage;
        const mutated = MutantCustody.prototype.inboundPage;
        let clock = now();
        Date.now = () => clock;
        const wrap = (fn) =>
          function (...args) {
            const value = fn.apply(this, args);
            if (control === 'expiry') clock += 60001;
            else this.close();
            return value;
          };
        AcceptanceCustody.prototype.inboundPage = wrap(original);
        MutantCustody.prototype.inboundPage = wrap(mutated);
        try {
          q = query(x);
          assert.equal((await read(x, q)).kind, 'unknown');
          q = query(x);
          pageProof(await owner.readInbound(core, q), q, x, retained);
        } finally {
          Date.now = now;
          AcceptanceCustody.prototype.inboundPage = original;
          MutantCustody.prototype.inboundPage = mutated;
        }
      } else {
        assert.equal((await read(x, q)).kind, 'unknown');
        if (control === 'current') {
          mutate(x, (db) => db.exec("UPDATE accounts SET state='active'"));
          armed = true;
        }
        pageProof(await owner.readInbound(core, q), q, x, control === 'witness' ? [] : retained);
      }
      if (process.env.ACCOUNT_REPORT_DIR)
        writeFileSync(
          join(process.env.ACCOUNT_REPORT_DIR, 'control-' + control + '.json'),
          JSON.stringify(
            {
              control,
              baseline: 'refused',
              mutant: 'signed page escaped',
              ...(control === 'registration'
                ? {
                    isolatedFault:
                      'retained registration credential differs; activation and current credential agree',
                    replacedCurrentCredentialWithRegistrationCheckOmitted:
                      'still refused by activation binding',
                  }
                : {}),
              request: Buffer.from(q).toString('hex'),
            },
            null,
            2,
          ) + '\n',
        );
    },
  );
