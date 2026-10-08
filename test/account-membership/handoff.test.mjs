import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { deliveryFixture } from './delivery-fixtures.mjs';
import { signed } from './fixtures.mjs';
import {
  verifyMembershipDelivery,
  verifyMembershipInstallation,
  membershipTransferMessage,
} from '../../account-protocol/membershipDelivery.ts';
import { verifySignature } from '../../account-protocol/admission.ts';
const require = createRequire(import.meta.url),
  vr = createRequire(require.resolve('vite'));
const { rolldown } = await import(vr.resolve('rolldown'));
const bundle = await rolldown({
  input: fileURLToPath(new URL('./handoff-entry.ts', import.meta.url)),
});
let built;
try {
  built = await bundle.generate({ format: 'esm' });
} finally {
  await bundle.close();
}
const directory = mkdtempSync(join(tmpdir(), 'done-membership-handoff-')),
  path = join(directory, 'client.mjs');
writeFileSync(path, built.output[0].code);
process.once('exit', () => rmSync(directory, { recursive: true, force: true }));
const client = await import(pathToFileURL(path).href);

// Model the vault's committed view explicitly. These tests exercise the real browser coordinator
// and signatures; actual IndexedDB custody remains the next owner-integration check.
async function fixture() {
  const f = await deliveryFixture('new');
  const anchor = await client.verifyMembershipAnchor(
    f.f.f.base,
    f.f.f.successor,
    f.f.certification,
    f.f.anchor,
  );
  const parent = await client.verifyMembershipAdmission(f.admission, anchor);
  let remoteDelivery = null,
    remoteCertification = null,
    afterRequest,
    beforeSave,
    afterSave;
  const calls = [],
    counts = { wrap: 0, seal: 0, installed: 0, installSigned: 0 };
  const durable = {},
    current = {};
  for (const role of ['existing', 'new']) {
    const other = role === 'existing' ? 'new' : 'existing';
    const commits = { existing: f.delivery.existing, new: f.delivery.candidate },
      reveals = { existing: f.delivery.existingReveal, new: f.delivery.newReveal };
    durable[role] = {
      role,
      own: commits[role],
      peer: commits[other],
      reveal: reveals[role],
      peerReveal: reveals[other],
      decision: f.delivery.decision,
    };
    current[role] = structuredClone(durable[role]);
  }
  const owners = Object.fromEntries(
    ['existing', 'new'].map((role) => [
      role,
      {
        participant: role === 'existing' ? f.c.existing : f.c.candidate,
        load: async () => structuredClone(durable[role]),
        sign: async (message) => {
          if (Buffer.from(message).includes(Buffer.from('done/membership-key-installed/v2')))
            counts.installSigned++;
          return signed(f.keys[role], message);
        },
        wrapContent: async () => {
          counts.wrap++;
          return structuredClone(f.delivery.wrap);
        },
        sealIncoming: async () => {
          counts.seal++;
          return { sequence: counts.seal, ct: 'ef'.repeat(48) };
        },
        checkInstalled: async (key) => {
          assert.deepEqual(key, durable[role].content.key);
          counts.installed++;
        },
      },
    ]),
  );
  const save = async (role) => {
    beforeSave?.(role, current[role]);
    durable[role] = structuredClone(current[role]);
    afterSave?.(role, current[role]);
  };
  const request = async (path, body) => {
    assert.equal(path, '/account/membership/v2/transfer');
    const role = body.credentialId === f.c.existing.id ? 'existing' : 'new';
    await verifySignature(
      owners[role].participant.sPub,
      body.signature,
      await membershipTransferMessage(body),
    );
    assert.equal(body.parent, f.p.head);
    assert.equal(body.preparationId, f.admission.epoch.preparation.context.attemptId);
    calls.push(structuredClone(body));
    if (body.action === 'deliver') {
      await verifyMembershipDelivery(body.payload, f.parent);
      assert.deepEqual(body.payload, durable.existing.content.delivery);
      if (remoteDelivery) assert.deepEqual(body.payload, remoteDelivery);
      remoteDelivery = structuredClone(body.payload);
    } else if (body.action === 'install') {
      await verifyMembershipInstallation(body.payload, remoteDelivery);
      assert.deepEqual(body.payload, durable.new.content.installation);
      remoteCertification = f.certify({
        ...f.epoch,
        delivery: remoteDelivery,
        installation: body.payload,
      });
    }
    await afterRequest?.(body);
    return {
      ok: true,
      delivery: structuredClone(remoteDelivery),
      certification: structuredClone(remoteCertification),
    };
  };
  return {
    f,
    durable,
    current,
    owners,
    counts,
    calls,
    run: (role, certification = null) =>
      client.continueMembershipHandoff(
        current[role],
        owners[role],
        { base: f.f.f.base, membership: parent, certification },
        () => save(role),
        request,
      ),
    restart: (role) => {
      current[role] = structuredClone(durable[role]);
    },
    hooks: (hooks = {}) => {
      ({ beforeSave, afterSave, afterRequest } = hooks);
    },
    get certification() {
      return remoteCertification;
    },
  };
}

test('browser continuation handoff preserves all recipients and requires persisted installation before certification', async () => {
  const x = await fixture();
  assert.equal(await x.run('new'), 'approved');
  assert.equal(x.counts.seal, 0);
  assert.equal(await x.run('existing'), 'approved');
  assert.equal(x.counts.wrap, 1);
  assert.deepEqual(
    x.durable.existing.content.delivery.certificate.members,
    x.f.certificate.members,
  );
  assert.equal(await x.run('new'), 'certified');
  assert.equal(x.counts.seal, 1);
  assert.equal(x.counts.installSigned, 1);
  assert.equal(x.counts.installed, 1);
  x.restart('new');
  assert.equal(await x.run('new', x.certification), 'certified');
  assert.equal(x.counts.seal, 1);
  assert.equal(x.counts.installSigned, 1);
  x.restart('existing');
  assert.equal(await x.run('existing', x.certification), 'certified');
  assert.equal(x.counts.wrap, 1);
});

test('wrapped delivery persists before sending and exact bytes survive a lost save or network reply', async () => {
  const x = await fixture();
  x.hooks({
    beforeSave: () => {
      throw Error('save refused');
    },
  });
  await assert.rejects(x.run('existing'), /save refused/);
  assert.equal(x.calls.length, 0);
  x.hooks();
  await assert.rejects(x.run('existing'), /did not persist/);
  assert.equal(x.calls.length, 0);
  x.restart('existing');
  x.hooks({
    afterSave: () => {
      throw Error('save reply lost');
    },
  });
  await assert.rejects(x.run('existing'), /save reply lost/);
  assert.equal(x.calls.length, 0);
  x.restart('existing');
  x.hooks({
    afterRequest: (r) => {
      if (r.action === 'deliver') throw Error('delivery reply lost');
    },
  });
  await assert.rejects(x.run('existing'), /delivery reply lost/);
  const sent = structuredClone(x.calls.at(-1));
  x.hooks();
  x.restart('existing');
  assert.equal(await x.run('existing'), 'approved');
  assert.deepEqual(x.calls.at(-1), sent);
  assert.equal(x.counts.wrap, 2); // One failed pre-save proposal and one retained proposal.
});

test('key installation and countersignature retry from committed custody after interruptions', async () => {
  const x = await fixture();
  await x.run('existing');
  x.hooks({
    beforeSave: (role, p) => {
      if (role === 'new' && p.content?.key) throw Error('key save refused');
    },
  });
  await assert.rejects(x.run('new'), /key save refused/);
  assert.equal(x.counts.installSigned, 0);
  assert(!x.calls.some((r) => r.action === 'install'));
  x.hooks();
  await assert.rejects(x.run('new'), /did not persist/);
  x.restart('new');
  x.hooks({
    afterSave: (role, p) => {
      if (role === 'new' && p.content?.installation) throw Error('installation save reply lost');
    },
  });
  await assert.rejects(x.run('new'), /installation save reply lost/);
  assert.equal(x.counts.installSigned, 1);
  assert(!x.calls.some((r) => r.action === 'install'));
  x.restart('new');
  x.hooks({
    afterRequest: (r) => {
      if (r.action === 'install') throw Error('certification reply lost');
    },
  });
  await assert.rejects(x.run('new'), /certification reply lost/);
  const installation = structuredClone(x.calls.at(-1));
  x.hooks();
  x.restart('new');
  assert.equal(await x.run('new', x.certification), 'certified');
  assert.deepEqual(x.calls.at(-1), installation);
  assert.equal(x.counts.installSigned, 1);
  assert.equal(x.counts.seal, 2);
});

test('mismatched approval, missing durable custody and substituted device refuse before key release', async () => {
  const x = await fixture();
  x.current.existing.decision.payload.outcome = 'mismatch';
  await assert.rejects(x.run('existing'));
  assert.equal(x.counts.wrap, 0);
  x.restart('existing');
  x.owners.existing.participant = x.f.c.candidate;
  await assert.rejects(x.run('existing'), /another device/);
  assert.equal(x.counts.wrap, 0);
  x.owners.existing.participant = x.f.c.existing;
  await x.run('existing');
  await x.run('new');
  x.restart('new');
  x.current.new.content.key = null;
  await assert.rejects(x.run('new', x.certification), /key is missing/);
  x.restart('existing');
  delete x.current.existing.content;
  await assert.rejects(x.run('existing', x.certification), /Saved delivery is missing/);
  assert.equal(x.counts.wrap, 1);
});

test('continuation progress preserves the first ceremony and refuses an older writer or incomplete value', async () => {
  const original = { v: 1, role: 'new', content: { installed: true } };
  let stored = structuredClone(original);
  const raw = {
    load: async () => structuredClone(stored),
    save: async (next) => {
      stored = structuredClone(next);
    },
  };
  const legacy = client.approvalProgress(raw, 'legacy'),
    current = client.approvalProgress(raw, 'membership');
  assert.deepEqual(await legacy.load(), original);
  assert.equal(await current.load(), null);
  await current.save({ v: 2, stage: 'pending' });
  assert.deepEqual(stored.previous, original);
  await assert.rejects(legacy.load(), /current owner/);
  await assert.rejects(legacy.save({ v: 1 }), /current owner/);
  const before = structuredClone(stored);
  await assert.rejects(current.save(undefined), /missing/);
  assert.deepEqual(stored, before);
  assert.deepEqual(await current.load(), { v: 2, stage: 'pending' });
  const next = { v: 2, stage: 'next' };
  await current.archiveConnection(await current.load(), next);
  assert.equal(stored.v, 3);
  assert.deepEqual(stored.previous, original);
  assert.deepEqual(stored.archived, [{ v: 2, stage: 'pending' }]);
  await current.save({ ...next, stage: 'continued' });
  assert.deepEqual(stored.archived, [{ v: 2, stage: 'pending' }]);
  const retained = structuredClone(stored);
  await assert.rejects(current.archiveConnection(next, {}), /changed/);
  assert.deepEqual(stored, retained);
  await assert.rejects(legacy.archiveConnection(await current.load(), {}), /Invalid/);
  stored = { ...stored, v: 4 };
  await assert.rejects(current.load(), /Unsupported/);
});
