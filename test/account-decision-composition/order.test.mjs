import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { proof } from '../account-service-delivery/fixtures.mjs';
import {
  native,
  prepared,
  decide,
  issue,
  subject,
  service,
  open,
  close,
  cold,
  record,
  census,
  args,
  view,
  deliveryStatus,
  captures,
  assertCaptures,
  envelopes,
  status as spoolStatus,
  evidence,
  hash,
} from './fixtures.mjs';

async function runHistory(f, id, commands) {
  const x = await prepared(f, id, 'closed');
  await decide(x);
  const successor = await f.page.evaluate(
    ({ item, own, snapshot, parent }) =>
      Harness.authorCompetingRequest(item.slotId, item.code, own, 'conflict', snapshot, parent),
    { item: args(x.item), own: x.own.bytes, snapshot: x.snapshot, parent: x.answer },
  );
  const accepted = await issue(f, x.item, successor),
    retainedService = service(f),
    offer = JSON.parse(
      retainedService.promotions.find((p) => p.workspace_id === x.item.scope.workspaceId).offer,
    );
  assert.equal(
    proof(accepted, offer.epoch.acceptancePublicKey, subject(successor)).kind,
    'accepted',
  );
  const answers = { refusal: x.answer, winner: [...accepted.bytes] },
    retained = [];
  const seals = f.invocations.length;
  let conflict = false,
    closed = false;
  await open(f.page, x.item);
  const check = async () => {
    assert.deepEqual(await deliveryStatus(f.page), {
      state: conflict ? 'conflict' : closed ? 'closed' : 'ready',
      acceptedThrough: 0,
      finalThrough: null,
      closed: closed ? [1] : [],
      submissions: [1],
      responses: retained.length ? [{ position: 1, count: retained.length }] : [],
    });
    assert.equal(await view(f.page), x.text);
    assert.deepEqual(await envelopes(f.page), x.envelopes);
    assert.deepEqual(await spoolStatus(f.page), x.spool);
    assert.equal(f.invocations.length, seals);
    assert.deepEqual(service(f), retainedService);
  };
  const checkDisk = async () => {
    const disk = await census(f.page, x.item);
    for (const original of x.before.rows.filter((r) => ['heads', 'outbound'].includes(r.kind)))
      assert.deepEqual(
        disk.rows.find((r) => r.seq === original.seq && r.kind === original.kind),
        original,
      );
    const responses = disk.rows.flatMap((r) => {
      if (r.kind !== 'heads') return [];
      const v = JSON.parse(Buffer.from(r.bytes).toString());
      return v[0] === 'done/account-delivery/v1' && v[9] === 'response' ? [v[11]] : [];
    });
    assert.deepEqual(
      responses,
      retained.map((key) => Buffer.from(answers[key]).toString('hex')),
    );
    assert.equal(disk.witness.events, x.before.witness.events + retained.length);
  };
  try {
    for (const op of commands) {
      if (op === 'restart') {
        const c = await captures(f.page);
        await close(f.page);
        await checkDisk();
        await cold(f);
        await open(f.page, x.item);
        assertCaptures(await captures(f.page), c);
      } else if (op === 'compact') await f.page.evaluate(() => opened.compactContent());
      else if (op === 'retry-service') {
        assert.deepEqual([...(await issue(f, x.item, x.own.bytes)).bytes], answers.refusal);
        assert.deepEqual([...(await issue(f, x.item, successor)).bytes], answers.winner);
      } else {
        const expectedWrite = !conflict && !retained.includes(op),
          r = await record(f.page, 1, answers[op]);
        assert.equal(
          r.recorded,
          expectedWrite,
          'Only the permitted exact proof set may be retained',
        );
        if (expectedWrite) {
          retained.push(op);
          if (op === 'winner') conflict = true;
          else closed = true;
        }
      }
      await check();
    }
    await close(f.page);
    await checkDisk();
    return {
      commands,
      retained,
      conflict,
      closed,
      responseDigests: Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, hash(v)])),
    };
  } finally {
    await close(f.page).catch(() => {});
  }
}
for (const first of ['refusal', 'winner'])
  test(
    `two genuinely issued outcomes preserve exact evidence when ${first} arrives first`,
    { timeout: 45000 },
    async (t) => {
      const f = await native(t),
        second = first === 'winner' ? 'refusal' : 'winner';
      const out = await runHistory(f, 'order-' + first, [
        first,
        'restart',
        second,
        'retry-service',
        first,
        'compact',
        'restart',
      ]);
      assert.equal(out.conflict, true);
      assert.deepEqual(out.retained, first === 'winner' ? ['winner'] : ['refusal', 'winner']);
      evidence('order-' + first, out);
    },
  );

test(
  '12 generated genuine refusal/successor arrival histories compare complete retained proof sets',
  { timeout: 210000 },
  async (t) => {
    const f = await native(t),
      histories = [],
      seed = 112108;
    let serial = 0;
    const result = await fc.check(
      fc.asyncProperty(
        fc.array(fc.constantFrom('refusal', 'winner', 'restart', 'retry-service', 'compact'), {
          minLength: 3,
          maxLength: 8,
        }),
        async (commands) => {
          histories.push(
            await runHistory(f, 'order-history-' + serial++, [
              ...commands,
              'refusal',
              'winner',
              'restart',
            ]),
          );
        },
      ),
      { seed, numRuns: 12 },
    );
    evidence('generated-order', {
      seed,
      histories,
      numRuns: result.numRuns,
      failed: result.failed,
      numShrinks: result.numShrinks,
      path: result.counterexamplePath,
      counterexample: result.counterexample,
      error: result.errorInstance ? String(result.errorInstance) : null,
    });
    assert.equal(result.failed, false, String(result.errorInstance));
    assert(
      histories.some((h) => h.retained.length === 1) &&
        histories.some((h) => h.retained.length === 2),
    );
  },
);
