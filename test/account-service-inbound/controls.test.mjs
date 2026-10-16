import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { generateKeyPairSync } from 'node:crypto';
import { ready, mutate, inventory } from '../account-service-delivery/fixtures.mjs';
import { envelope } from '../account-transport/oracle.mjs';
import { query, read, pageProof } from './oracle.mjs';

const replace = (code, from, to) => {
  assert.equal(code.split(from).length, 2, 'Unique mutation anchor');
  return code.replace(from, to);
};
async function buildMutant(t, control) {
  const parent = resolve('test-results/account-service-inbound-controls');
  mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, control + '-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const folder of ['account-protocol', 'account-service']) {
    mkdirSync(join(dir, folder));
    for (const file of readdirSync(folder).filter((f) => f.endsWith('.ts'))) {
      let code = readFileSync(join(folder, file), 'utf8');
      if (folder === 'account-service' && file === 'delivery.ts') {
        if (control === 'reader' || control === 'publisher' || control === 'publisher-single')
          code = replace(
            code,
            control === 'reader'
              ? 'auth.members.find((member) => member.id === request.reader)'
              : '(auth.historicalMembers ?? auth.members).find(\n    (member) => member.id === request.publisher,\n  )',
            'auth.members[0]',
          );
        if (control === 'publisher')
          code = replace(
            code,
            'const auth = selectPublisher(await verifyCurrentWorkspaceAuthority(s, issuer), s.publisher),\n        { reader, publisher } = resolveInboundRoles(auth, request);',
            'const auth = await verifyCurrentWorkspaceAuthority(s, issuer),\n        { reader, publisher } = resolveInboundRoles(auth, request);',
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
  return {
    Core: (await load('core')).AccountCore,
    Authority: (await load('authority')).PrivateAuthority,
    MutantCustody: (await load('acceptance')).AcceptanceCustody,
  };
}
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
    `actual ${control} policy controls preserve independent refusals and expose the stated signing boundary`,
    { timeout: 15000 },
    async (t) => {
      const { Core, Authority, MutantCustody } = await buildMutant(t, control);
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
      const observe = (q, result) => ({
        request: Buffer.from(q).toString('hex'),
        result:
          result.kind === 'decision'
            ? { kind: result.kind, bytes: Buffer.from(result.bytes).toString('hex') }
            : result,
      });
      const ordinary = [],
        activation = [];
      for (const result of [await read(x, good), await owner.readInbound(core, good)]) {
        ordinary.push(observe(good, result));
        pageProof(result, good, x, retained);
      }
      let baseline, mutant, publisherLookup, redundantWitness;
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
        for (const result of [await read(x, q), await owner.readInbound(core, q)]) {
          activation.push(observe(q, result));
          assert.equal(result.kind, 'unknown');
        }
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
      if (control === 'witness') {
        const probe = await ready(t),
          first = probe.make();
        assert.equal((await probe.call(first)).kind, 'decision');
        const probeCore = new Core(probe.f.path, {
          origin: probe.authority.pin.origin,
          rpId: probe.authority.pin.rpId,
        });
        const probeOwner = Authority.open(
          probe.authority.path,
          probe.authority.pin,
          probe.authority.key,
        );
        t.after(() => {
          probeCore.close();
          probeOwner.close();
        });
        mutate(probe, (db) => db.exec('DELETE FROM delivery_decisions'));
        const before = inventory(probe),
          request = query(probe);
        redundantWitness = [
          await read(probe, request),
          await probeOwner.readInbound(probeCore, request),
        ];
        for (const result of redundantWitness)
          assert.deepEqual(result, { kind: 'unknown', reason: 'ledger-integrity' });
        assert.equal(inventory(probe), before);
      }
      if (control === 'witness')
        mutate(x, (db) => {
          const witness = JSON.parse(
            db.prepare('SELECT delivery_witness FROM promotions').get().delivery_witness,
          );
          witness.signature = 'ab'.repeat(64);
          db.prepare('UPDATE promotions SET delivery_witness=?').run(JSON.stringify(witness));
        });
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
          const refused = await read(x, q);
          baseline = observe(q, refused);
          assert.equal(refused.kind, 'unknown');
          q = query(x);
          const escaped = await owner.readInbound(core, q);
          mutant = observe(q, escaped);
          pageProof(escaped, q, x, retained);
        } finally {
          Date.now = now;
          AcceptanceCustody.prototype.inboundPage = original;
          MutantCustody.prototype.inboundPage = mutated;
        }
      } else {
        const refused = await read(x, q);
        baseline = observe(q, refused);
        assert.equal(refused.kind, 'unknown');
        if (control === 'current') {
          mutate(x, (db) => db.exec("UPDATE accounts SET state='active'"));
          armed = true;
        }
        if (control === 'publisher') {
          const single = await buildMutant(t, 'publisher-single');
          const singleCore = new single.Core(x.f.path, {
            origin: x.authority.pin.origin,
            rpId: x.authority.pin.rpId,
          });
          const singleOwner = single.Authority.open(
            x.authority.path,
            x.authority.pin,
            x.authority.key,
          );
          t.after(() => {
            singleCore.close();
            singleOwner.close();
          });
          const before = inventory(x);
          publisherLookup = observe(q, await singleOwner.readInbound(singleCore, q));
          assert.deepEqual(publisherLookup.result, { kind: 'unknown', reason: 'unavailable' });
          assert.equal(inventory(x), before);
        }
        const escaped = await owner.readInbound(core, q);
        mutant = observe(q, escaped);
        pageProof(escaped, q, x, control === 'publisher' ? [] : retained);
      }
      if (process.env.ACCOUNT_REPORT_DIR)
        writeFileSync(
          join(process.env.ACCOUNT_REPORT_DIR, 'control-' + control + '.json'),
          JSON.stringify(
            {
              control,
              baseline,
              mutant,
              ordinary,
              activation,
              redundantWitness,
              publisherLookup,
              publisherPolicyOmissions: control === 'publisher' ? 2 : undefined,
              publicKey: x.offer.epoch.acceptancePublicKey,
              originals: retained.map(({ w, r }) => ({
                envelope: Buffer.from(envelope(w)).toString('hex'),
                result: { kind: r.kind, bytes: Buffer.from(r.bytes).toString('hex') },
              })),
            },
            null,
            2,
          ) + '\n',
        );
    },
  );
