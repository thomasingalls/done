import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { resolve } from 'node:path';
import { deliveryFixture } from './delivery-fixtures.mjs';
import { signed } from './fixtures.mjs';
import { verifySignature } from '../../account-protocol/admission.ts';
import {
  ceremonyRequestMessage,
  parseCeremonyRequest,
} from '../../account-protocol/ceremonyRelay.ts';
import {
  verifyMembershipCeremonyContext,
  verifyCeremonyCommit,
  verifyCeremonyPair,
  verifyCeremonyReveal,
  deriveCeremonyExchange,
} from '../../account-protocol/ceremonyExchange.ts';
const built = await build({
  configFile: false,
  logLevel: 'error',
  build: {
    write: false,
    minify: false,
    lib: { entry: resolve('test/account-membership/comparison-entry.ts'), formats: ['es'] },
  },
});
const client = await import(
  'data:text/javascript;base64,' +
    Buffer.from(
      (Array.isArray(built) ? built[0] : built).output.find((v) => v.type === 'chunk').code,
    ).toString('base64')
);
async function fixture(approver = 'existing') {
  const f = await deliveryFixture(approver),
    anchor = await client.verifyMembershipAnchor(
      f.f.f.base,
      f.f.f.successor,
      f.f.certification,
      f.f.anchor,
    ),
    parent = await client.verifyMembershipAdmission(f.admission, anchor);
  const durable = {},
    current = {},
    calls = [],
    saves = [],
    stop = new AbortController();
  let time = 1000,
    beforeSave,
    afterSave,
    afterRequest,
    transform;
  const remote = {
    ok: true,
    stage: 'waiting',
    existing: null,
    candidate: null,
    existingReveal: null,
    newReveal: null,
    decision: null,
    cancellation: null,
  };
  const owners = Object.fromEntries(
    ['existing', 'new'].map((role) => [
      role,
      {
        participant: role === 'existing' ? f.c.existing : f.c.candidate,
        load: async () => structuredClone(durable[role]),
        sign: async (bytes) => signed(f.keys[role], bytes),
      },
    ]),
  );
  for (const role of ['existing', 'new']) {
    durable[role] = client.beginMembershipComparison(role, parent);
    current[role] = structuredClone(durable[role]);
  }
  const request = async (path, body) => {
    assert.equal(path, '/account/membership/v2/ceremony');
    const r = parseCeremonyRequest(body),
      role = r.credentialId === f.c.existing.id ? 'existing' : 'new';
    assert.equal(r.v, 2);
    assert.equal(r.head, f.p.head);
    assert.equal(r.preparationId, f.admission.epoch.preparation.context.attemptId);
    await verifySignature(
      owners[role].participant.sPub,
      r.signature,
      await ceremonyRequestMessage(r),
    );
    const field =
      r.action === 'commit'
        ? role === 'existing'
          ? 'existing'
          : 'candidate'
        : r.action === 'reveal'
          ? role === 'existing'
            ? 'existingReveal'
            : 'newReveal'
          : 'decision';
    if (r.action !== 'read') {
      const saved = durable[role];
      assert.deepEqual(
        r.action === 'decide' ? r : r.payload,
        r.action === 'commit' ? saved.own : r.action === 'reveal' ? saved.reveal : saved.decision,
        'transmission requires committed state',
      );
      if (r.action === 'commit') {
        const authority = verifyMembershipCeremonyContext(
          r.payload.context,
          f.parent,
          { role, ...owners[role].participant },
          time,
        );
        await verifyCeremonyCommit(authority, r.payload, role, time);
        if (role === 'new') assert(remote.existing);
      } else {
        assert(remote.existing && remote.candidate);
        const authority = verifyMembershipCeremonyContext(
          remote.existing.context,
          f.parent,
          { role, ...owners[role].participant },
          1000,
        );
        const pair = await verifyCeremonyPair(authority, remote.existing, remote.candidate, 1000);
        if (r.action === 'reveal') await verifyCeremonyReveal(pair, r.payload, role, 1000);
        else {
          assert.equal(role, 'existing');
          const opening = await deriveCeremonyExchange(
            pair,
            remote.existingReveal,
            remote.newReveal,
            1000,
          );
          assert.equal(r.payload.transcriptHash, opening.transcriptHash);
        }
      }
      const value = r.action === 'decide' ? r : r.payload;
      if (remote[field]) assert.deepEqual(remote[field], value);
      remote[field] = structuredClone(value);
    }
    calls.push(structuredClone(r));
    await afterRequest?.(role, r);
    const result = structuredClone(remote);
    transform?.(result);
    return result;
  };
  return {
    f,
    parent,
    anchor,
    durable,
    current,
    calls,
    saves,
    remote,
    stop,
    time(v) {
      time = v;
    },
    hooks(v = {}) {
      ({ beforeSave, afterSave, afterRequest, transform } = v);
    },
    cold(role) {
      current[role] = structuredClone(durable[role]);
    },
    run(role, typed, authority = parent) {
      return client.continueMembershipComparison(
        current[role],
        owners[role],
        authority,
        {
          signal: stop.signal,
          now: () => time,
          request,
          save: async (check) => {
            beforeSave?.(role, current[role]);
            check?.();
            durable[role] = structuredClone(current[role]);
            saves.push(role);
            afterSave?.(role, current[role]);
          },
        },
        typed,
      );
    },
  };
}
async function compared(f) {
  assert.equal((await f.run('existing')).kind, 'waiting');
  assert.equal((await f.run('new')).kind, 'waiting');
  assert.equal((await f.run('existing')).kind, 'compare');
  const result = await f.run('new');
  assert.equal(result.kind, 'display');
  return result.code;
}
for (const approver of ['existing', 'new'])
  test(`durable continuation comparison supports ${approver} parent approver and exact redisplay`, async () => {
    const f = await fixture(approver),
      code = await compared(f),
      before = structuredClone(f.durable),
      saves = f.saves.length;
    f.cold('new');
    assert.deepEqual(await f.run('new'), { kind: 'display', code });
    assert.equal(f.saves.length, saves);
    assert.deepEqual(f.durable, before);
    assert.deepEqual(await f.run('existing', code), { kind: 'approved' });
    assert.deepEqual(await f.run('new'), { kind: 'approved' });
    const completed = f.saves.length;
    f.time(602000);
    f.cold('existing');
    f.cold('new');
    assert.deepEqual(await f.run('existing'), { kind: 'approved' });
    assert.deepEqual(await f.run('new'), { kind: 'approved' });
    assert.equal(f.saves.length, completed);
    assert.deepEqual(f.durable.existing.decision, f.durable.new.decision);
  });
test('failed persistence cannot send a commitment, and committed lost replies reuse exact nonces and messages', async () => {
  const f = await fixture();
  f.hooks({
    beforeSave(_role, p) {
      if (p.own) throw Error('commit interrupted');
    },
  });
  await assert.rejects(f.run('existing'), /commit interrupted/);
  assert.equal(f.calls.filter((c) => c.action === 'commit').length, 0);
  assert.equal(f.durable.existing.own, null);
  await assert.rejects(f.run('existing'), /did not persist/);
  f.cold('existing');
  f.hooks({
    afterRequest(_role, r) {
      if (r.action === 'commit') throw Error('lost commit reply');
    },
  });
  await assert.rejects(f.run('existing'), /lost commit reply/);
  const held = structuredClone(f.durable.existing),
    sent = f.calls.at(-1);
  f.cold('existing');
  f.hooks();
  assert.equal((await f.run('existing')).kind, 'waiting');
  assert.deepEqual(f.calls.at(-1), sent);
  assert.deepEqual(f.durable.existing, held);
  assert.equal((await f.run('new')).kind, 'waiting');
  f.hooks({
    afterRequest(_role, r) {
      if (r.action === 'reveal') throw Error('lost reveal reply');
    },
  });
  await assert.rejects(f.run('existing'), /lost reveal reply/);
  const reveal = structuredClone(f.durable.existing.reveal);
  f.cold('existing');
  f.hooks();
  assert.equal((await f.run('existing')).kind, 'compare');
  assert.deepEqual(f.durable.existing.reveal, reveal);
});
test('approval retry survives a lost reply and expiry; mismatch cannot become approval', async () => {
  const f = await fixture(),
    code = await compared(f);
  f.hooks({
    afterRequest(_role, r) {
      if (r.action === 'decide') throw Error('lost approval reply');
    },
  });
  await assert.rejects(f.run('existing', code), /lost approval reply/);
  const decision = structuredClone(f.durable.existing.decision);
  f.time(602000);
  f.hooks();
  f.cold('existing');
  assert.equal((await f.run('existing', 'AAAAA')).kind, 'approved');
  assert.equal((await f.run('new')).kind, 'approved');
  assert.deepEqual(f.durable.new.decision, decision);
  const g = await fixture(),
    correct = await compared(g);
  assert.equal((await g.run('existing', correct === 'AAAAA' ? 'BBBBB' : 'AAAAA')).kind, 'mismatch');
  assert.equal((await g.run('existing', correct)).kind, 'mismatch');
  assert.equal((await g.run('new')).kind, 'mismatch');
});
test('relay labels and unsigned context cannot authorize; a competing parent spends the comparison', async () => {
  const f = await fixture();
  await f.run('existing');
  f.hooks({
    transform(r) {
      r.stage = 'approved';
      r.existing.signature = 'ff'.repeat(64);
    },
  });
  await assert.rejects(f.run('new'));
  assert.equal(f.durable.new.context, null);
  assert.equal(f.durable.new.own, null);
  f.cold('new');
  f.hooks({
    transform(r) {
      r.stage = 'approved';
    },
  });
  assert.equal((await f.run('new')).kind, 'waiting');
  const before = f.calls.length;
  assert.equal((await f.run('existing', undefined, f.anchor)).kind, 'restart-required');
  assert.equal(f.calls.length, before);
  f.cold('existing');
  assert.equal((await f.run('existing')).kind, 'restart-required');
  assert.equal(f.calls.length, before);
});
test('changed signed decision scope, abort and incomplete local state cannot complete approval', async () => {
  const f = await fixture(),
    code = await compared(f);
  await f.run('existing', code);
  const held = structuredClone(f.durable.new);
  f.hooks({
    transform(r) {
      r.decision.head = 'ff'.repeat(32);
    },
  });
  await assert.rejects(f.run('new'));
  assert.deepEqual(f.durable.new, held);
  f.hooks();
  f.cold('new');
  f.durable.new.peer = null;
  f.cold('new');
  await assert.rejects(f.run('new'), /state is missing/);
  f.stop.abort();
  const count = f.calls.length;
  await assert.rejects(f.run('existing'));
  assert.equal(f.calls.length, count);
});
