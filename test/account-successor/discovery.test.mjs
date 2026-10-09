import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import {
  ready,
  state,
  mutate,
  discoveryQuery,
  discover,
  discoveryProof,
} from './discovery-fixtures.mjs';
import { worker, deadline } from './process-fixtures.mjs';

test('signed discovery is a read-only locator before and after admission, including held child and cold service', async (t) => {
  const x = await ready(t),
    q = discoveryQuery(x),
    before = state(x);
  discoveryProof(x, await discover(x, q), q, null);
  assert.equal(state(x), before);
  const p = await x.prepare(),
    prepared = state(x);
  discoveryProof(x, await discover(x, q), q, null);
  assert.equal(state(x), prepared);
  const successor = await x.admit(p.input),
    held = discoveryQuery(x, { epoch: 2, head: successor.head }),
    after = state(x);
  for (const request of [q, held])
    discoveryProof(x, await discover(x, request), request, successor);
  assert.equal(state(x), after);
  x.f.restart();
  x.authority.restart();
  discoveryProof(x, await discover(x, held), held, successor);
  assert.equal(state(x), after);
});

test('candidate possession, operator access and signed wrong scope cannot discover account authority', async (t) => {
  const x = await ready(t),
    p = await x.prepare(),
    successor = await x.admit(p.input),
    before = state(x);
  const valid = discoveryQuery(x);
  const requests = [
    {},
    { ...valid, extra: true },
    { ...valid, signature: '00'.repeat(64) },
    { ...valid, nonce: 'a'.repeat(4096) },
    discoveryQuery(
      x,
      { credentialId: p.entry.input.candidate.credentialId, epoch: 2, head: successor.head },
      p.entry.key,
    ),
    discoveryQuery(x, { lineageId: '55'.repeat(32) }),
    discoveryQuery(x, { workspaceId: '55'.repeat(16) }),
    discoveryQuery(x, { head: '55'.repeat(32) }),
    discoveryQuery(x, { epoch: 2 }),
    discoveryQuery(x, { expiresAt: Date.now() - 1 }),
    discoveryQuery(x, { expiresAt: Date.now() + 90000 }),
    discoveryQuery(x, { pin: { ...x.authority.pin, serviceId: '66'.repeat(16) } }),
  ];
  for (const request of requests) assert.equal((await discover(x, request)).ok, false);
  assert.equal(state(x), before);
  const owned = structuredClone(valid),
    pending = discover(x, owned);
  owned.nonce = '77'.repeat(32);
  owned.pin.serviceId = '88'.repeat(16);
  discoveryProof(x, await pending, valid, successor);
});

for (const damage of ['ledger', 'pointer', 'artifact', 'account', 'recovery'])
  test(`discovery refuses ${damage} damage instead of signing a locator from partial state`, async (t) => {
    const x = await ready(t),
      p = await x.prepare();
    await x.call(x.make());
    await x.admit(p.input);
    mutate(x, (db) =>
      db.exec(
        {
          ledger: 'DELETE FROM delivery_decisions',
          pointer: 'UPDATE promotions SET successor_head=NULL',
          artifact: "UPDATE workspace_successors SET artifact='{}'",
          account: "UPDATE accounts SET state='pending'",
          recovery: 'DELETE FROM recovery',
        }[damage],
      ),
    );
    const before = state(x);
    assert.equal((await discover(x, discoveryQuery(x))).ok, false);
    assert.equal(state(x), before);
  });

for (const boundary of ['after-verify', 'before-commit'])
  for (const cause of ['expiry', 'custody'])
    test(`discovery rechecks ${cause} at ${boundary}`, async (t) => {
      let action,
        now = 1000;
      const x = await ready(t, {
        now: () => now,
        hook(point, op) {
          if (op === 'discover-authority') action?.(point);
        },
      });
      const request = discoveryQuery(x, { expiresAt: now + 30000 }),
        before = state(x);
      action = (at) => {
        if (at !== boundary) return;
        if (cause === 'expiry') now = request.expiresAt;
        else x.authority.owner.close();
      };
      assert.equal((await discover(x, request)).ok, false);
      assert.equal(state(x), before);
    });

test(
  'discovery rechecks an admission committed by another process during verification',
  { timeout: 15000 },
  async (t) => {
    const x = await ready(t),
      p = await x.prepare(),
      request = discoveryQuery(x),
      slow = await worker(t, x, 'after-verify', 'pause', process.cwd(), 'discover-authority');
    const stopped = deadline(once(slow.child, 'message'));
    slow.child.send({ operation: 'discover', input: request });
    assert.equal((await stopped)[0].paused, true);
    const successor = await x.admit(p.input),
      answer = deadline(once(slow.child, 'message'));
    slow.child.kill('SIGCONT');
    discoveryProof(x, (await answer)[0].result, request, successor);
    await slow.close();
  },
);

test(
  '30 generated preparation/admission/publication/restart histories preserve exact signed discovery without database mutation',
  { timeout: 30000 },
  async (t) => {
    const { default: fc } = await import('fast-check');
    const { decision, ZERO } = await import('./service-fixtures.mjs');
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom('prepare', 'admit', 'publish', 'parent', 'current', 'restart'), {
          minLength: 1,
          maxLength: 14,
        }),
        async (operations) => {
          const x = await ready(t);
          let prepared,
            artifact = null,
            position = 0,
            previous = ZERO;
          for (const op of operations) {
            if (op === 'prepare' && !prepared && !artifact) prepared = await x.prepare();
            if (op === 'admit' && prepared) {
              const next = await x.admit(prepared.input);
              if (artifact) assert.deepEqual(next, artifact);
              else
                assert.deepEqual(
                  next.epoch.heads.find((h) => h.credentialId === x.credential),
                  { credentialId: x.credential, position, link: previous },
                );
              artifact = next;
            }
            if (op === 'publish') {
              const wire = x.make(++position, 'generated discovery', { epoch: artifact ? 2 : 1 });
              previous = decision(x, await x.call(wire), wire, previous, artifact ? 2 : 1).head
                .link;
            }
            if (op === 'restart') {
              x.f.restart();
              x.authority.restart();
            }
            const request = discoveryQuery(
                x,
                op === 'current' && artifact ? { epoch: 2, head: artifact.head } : {},
              ),
              before = state(x);
            discoveryProof(x, await discover(x, request), request, artifact);
            assert.equal(state(x), before);
          }
        },
      ),
      { seed: 16091605, numRuns: 30 },
    );
  },
);
