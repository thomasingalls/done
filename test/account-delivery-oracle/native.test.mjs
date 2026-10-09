import test from 'node:test';
import assert from 'node:assert/strict';
import {
  native,
  selected,
  open,
  close,
  cold,
  prepare,
  edit,
  subjects,
  envelopes,
  captures,
  submission,
  record,
} from '../account-delivery/fixtures.mjs';
import {
  fixtureAcceptance,
  head,
  refusal,
  response,
  link,
  hash,
  refusalMessage,
} from '../account-decisions/oracle.mjs';
import { bundle, fullStatus, census, report } from './helpers.mjs';
import { expected } from './oracle.ts';
const ZERO = '00'.repeat(32);
const script = await bundle(undefined, true);
async function run(t, kind, reverse, control) {
  const f = await native(t),
    setup = f.setup;
  const injected = control ? await bundle(control, true) : script;
  f.setup = async (page) => {
    await setup(page);
    await page.evaluate(injected);
  };
  await f.setup(f.page);
  const item = await selected(f, 'oracle-' + kind + '-' + reverse + '-' + (control ?? 'real'));
  await open(f.page, item);
  await prepare(f.page);
  await edit(f.page, 0, 0, 'second source ');
  await f.page.evaluate(() => editor.whenDurable());
  while ((await subjects(f.page)).length < 2) await prepare(f.page);
  const original = await submission(f.page),
    [a, b] = await subjects(f.page),
    signer = fixtureAcceptance(f, item.scope.workspaceId);
  assert.equal(original.kind, 'ready');
  let claims;
  if (kind === 'refusals')
    claims = ['stale-epoch', 'retired-generation'].map((reason) => {
      const r = refusal(a, signer, ZERO, reason);
      return {
        event: { kind: 'refused', position: 1, final: false, id: hash(refusalMessage(r)) },
        wire: [...response({ kind: 'refused', refusal: r })],
      };
    });
  else
    claims = [a, b].map((s, i) => ({
      event: { kind: 'accepted', position: i + 1, final: true, id: '' },
      wire: [
        ...response({
          kind: 'accepted',
          head: head(s, i ? link(a, ZERO) : ZERO, 1, signer, true),
          leaf: s,
        }),
      ],
    }));
  if (reverse) claims.reverse();
  const originalCaptures = await captures(f.page),
    originalEnvelopes = await envelopes(f.page),
    text = await f.page.evaluate(() => editor.read().master),
    invocations = f.invocations.length;
  await close(f.page);
  const initial = await census(f.page, item);
  await cold(f);
  await open(f.page, item);
  const events = [],
    proofs = [];
  let mismatches = 0;
  const snapshot = () => {
    const responses = new Map();
    for (const p of proofs) {
      const xs = responses.get(p.event.position) ?? [];
      xs.push(p.wire);
      responses.set(p.event.position, xs);
    }
    return expected(events, { submissions: [[1, original.bytes]], responses: [...responses] });
  };
  const check = async () => {
    const actual = await fullStatus(f.page),
      want = snapshot();
    if (control && events.length === 2) {
      assert.throws(() => assert.deepEqual(actual, want));
      mismatches++;
      assert.equal(actual.publication, 'conflict');
    } else assert.deepEqual(actual, want);
    assert.equal(await f.page.evaluate(() => editor.read().master), text);
    assert.deepEqual(await envelopes(f.page), originalEnvelopes);
    const now = await captures(f.page);
    for (const c of originalCaptures)
      assert.deepEqual(
        now.find((x) => x.id === c.id),
        c,
      );
    for (const c of now.filter((c) => !originalCaptures.some((old) => old.id === c.id))) {
      assert.equal(c.principal, item.scope.principalId);
      for (const s of c.sources) {
        assert.equal(s.actor, item.scope.principalId);
        assert.equal(s.kind, 'human');
        assert.deepEqual(s.bytes, [0, 0]);
      }
    }
    assert.equal(f.invocations.length, invocations);
    return actual;
  };
  const disk = async () => {
    const after = await census(f.page, item);
    for (const before of initial.rows.filter((r) => ['heads', 'outbound'].includes(r.kind)))
      assert.deepEqual(
        after.rows.find((r) => r.seq === before.seq && r.kind === before.kind),
        before,
      );
    const wires = after.rows
      .filter((r) => r.kind === 'heads')
      .flatMap((r) => {
        const v = JSON.parse(Buffer.from(r.bytes).toString());
        return v[0] === 'done/account-delivery/v1' && v[9] === 'response' ? [v[11]] : [];
      });
    assert.deepEqual(
      wires,
      proofs.map((p) => Buffer.from(p.wire).toString('hex')),
    );
    assert.equal(after.witness.events, initial.witness.events + proofs.length);
    return { responseWires: wires, witness: after.witness };
  };
  const observed = [];
  for (const p of claims) {
    assert.equal((await record(f.page, p.event.position, p.wire)).recorded, true);
    events.push(p.event);
    proofs.push(p);
    observed.push(await check());
    assert.equal((await record(f.page, p.event.position, p.wire)).recorded, false);
    await close(f.page);
    await disk();
    await cold(f);
    await open(f.page, item);
    await check();
  }
  const third = response({ kind: 'accepted', head: head(a, ZERO, 1, signer), leaf: a });
  assert.equal((await record(f.page, 1, third)).recorded, false);
  await check();
  await f.page.evaluate(() => opened.compactContent());
  await close(f.page);
  const final = await disk();
  await cold(f);
  await open(f.page, item);
  await check();
  await close(f.page);
  if (control) assert.ok(mismatches > 0);
  report('native-' + kind + '-' + reverse + '-' + (control ?? 'real'), {
    events,
    expected: snapshot(),
    observed,
    final,
    control: control ?? null,
    mismatches,
    networkInvocations: invocations,
    issuer:
      'fixture acceptance signer; contradictory authority claims, not current service issuance',
  });
}
for (const kind of ['refusals', 'finals'])
  for (const reverse of [false, true])
    test(
      kind +
        ' retain exact first evidence and proof bytes through compaction/restart; reversed=' +
        reverse,
      { timeout: 60000 },
      (t) => run(t, kind, reverse),
    );
for (const [kind, control] of [
  ['refusals', 'refusalId'],
  ['finals', 'finalCutoff'],
])
  test(
    'native ' + control + ' control preserves old status but fails full retained-state assertions',
    { timeout: 60000 },
    (t) => run(t, kind, false, control),
  );
