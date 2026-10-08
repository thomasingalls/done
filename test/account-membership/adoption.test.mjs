import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { resolve } from 'node:path';
import { deliveryFixture } from './delivery-fixtures.mjs';
import { membershipRotationFixture } from './rotation-fixtures.mjs';
const result = await build({
  configFile: false,
  logLevel: 'error',
  build: {
    write: false,
    minify: false,
    lib: { entry: resolve('test/account-membership/adoption-entry.ts'), formats: ['es'] },
  },
});
const code = (Array.isArray(result) ? result[0] : result).output.find(
  (v) => v.type === 'chunk',
).code;
const client = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const event = (epoch, payload = 'event') =>
  new TextEncoder().encode(JSON.stringify(['cut-probe', 1, 2, 3, 4, epoch, payload]));
async function fixture() {
  const f = await deliveryFixture('new'),
    base = f.f.f.base;
  const anchor = {
    successor: f.f.f.successor,
    certification: f.f.certification,
    continuations: [],
  };
  const proofs = { ...anchor, continuations: [f.admission, f.certification] };
  const initial = (await client.verifyMembershipChain(anchor, base)).history;
  return { f, base, proofs, initial };
}
test('original and joined adopters retain exact local boundaries while skipping unseen heads', async () => {
  const { f, base, proofs, initial } = await fixture();
  const events = [event(3), event(3, 'another')];
  let before = client.emptySpoolWitness();
  for (const bytes of events)
    before = await client.extendSpoolWitness(before, bytes, crypto.subtle);
  const record = client.parseInstalledMembership({
    v: 1,
    proofs,
    cuts: [{ epoch: 5, head: f.certification.head, before }],
  });
  const marker = {
    v: 9,
    source: {
      workspaceId: initial.current.workspace,
      principalId: initial.principal,
      generation: 1,
    },
    credentialIds: ['00'.repeat(16), initial.credential],
    pin: base.pin,
    admission: { request: base.request, receipt: base.receipt },
    successor: {
      artifact: proofs.successor,
      certification: proofs.certification,
      before: client.emptySpoolWitness(),
    },
    membership: record,
  };
  const route = await client.heldCaptureRoute(marker);
  assert.equal(route.epoch, 5);
  await client.verifyInstalledSuccessor(
    { events, positions: [] },
    route,
    marker.successor,
    crypto.subtle,
    undefined,
    record,
  );
  for (const id of [f.f.context.existing.id, f.f.context.candidate.id]) {
    const history = await client.installedMembershipHistory(
      record,
      base,
      client.historyPublisher(initial, id),
    );
    assert.equal(history.credential, id);
    assert.equal(history.current.tip, 5);
    const spool = { events: [...events, event(5)], positions: [] };
    await client.verifyInstalledMembership(spool, history, record, 3, crypto.subtle);
    for (const bad of [
      [],
      [event(3)],
      [event(3), event(3, 'changed'), event(5)],
      [...events, event(4)],
      [...events, event(3)],
    ])
      await assert.rejects(
        client.verifyInstalledMembership(
          { ...spool, events: bad },
          history,
          record,
          3,
          crypto.subtle,
        ),
      );
  }
  const both = client.parseInstalledMembership({
    ...record,
    cuts: [
      { epoch: 4, head: f.admission.head, before },
      { epoch: 5, head: f.certification.head, before },
    ],
  });
  await client.verifyInstalledMembership(
    { events, positions: [] },
    await client.installedMembershipHistory(both, base, initial),
    both,
    3,
    crypto.subtle,
  );
});
test('adoption rejects forged ancestry, reordered cuts, incomplete accepted prefixes and wrong installation', async () => {
  const { f, base, proofs, initial } = await fixture();
  const record = {
    v: 1,
    proofs,
    cuts: [{ epoch: 5, head: f.certification.head, before: client.emptySpoolWitness() }],
  };
  const copy = (change) => {
    const v = structuredClone(record);
    change(v);
    return v;
  };
  for (const change of [
    (v) => v.cuts.reverse().push(v.cuts[0]),
    (v) => (v.cuts[0].before.hash = 'ff'.repeat(32)),
    (v) => (v.cuts[0].head = 'ff'.repeat(32)),
    (v) => (v.unrecognized = true),
  ])
    assert.throws(() => client.parseInstalledMembership(copy(change)));
  for (const change of [
    (v) => (v.proofs.certification.signature = 'ff'.repeat(64)),
    (v) => v.cuts.unshift({ epoch: 4, head: 'ff'.repeat(32), before: client.emptySpoolWitness() }),
  ])
    await assert.rejects(client.installedMembershipHistory(copy(change), base, initial));
  const history = (await client.verifyMembershipChain(proofs, base)).history;
  await assert.rejects(client.installedMembershipHistory(record, base, history));
  // A valid service transition claims an accepted envelope absent from the local spool.
  const e = structuredClone(f.epoch);
  e.heads.find((h) => h.credentialId === initial.credential).position = 1;
  e.heads.find((h) => h.credentialId === initial.credential).link = 'ab'.repeat(32);
  const certification = f.certify(e);
  const missing = client.parseInstalledMembership({
    v: 1,
    proofs: { ...proofs, continuations: [f.admission, certification] },
    cuts: [{ epoch: 5, head: certification.head, before: client.emptySpoolWitness() }],
  });
  const missingHistory = await client.installedMembershipHistory(missing, base, initial);
  await assert.rejects(
    client.verifyInstalledMembership(
      { events: [], positions: [] },
      missingHistory,
      missing,
      3,
      crypto.subtle,
    ),
  );
});

test('generation-one installation refuses a valid rotation until the actual generation owner exists', async () => {
  const f = await membershipRotationFixture(),
    proof = f.rotate();
  const initial = (await client.verifyMembershipChain(f.proofs, f.f.f.base)).history;
  const record = {
    v: 1,
    proofs: { ...f.proofs, continuations: [proof] },
    cuts: [{ epoch: proof.epoch.epoch, head: proof.head, before: client.emptySpoolWitness() }],
  };
  for (const id of f.p.certificate.members.map((m) => m.id))
    await assert.rejects(
      client.installedMembershipHistory(record, f.f.f.base, client.historyPublisher(initial, id)),
      /generation activation/,
    );
});
