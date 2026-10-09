import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const report = (name, value) => {
  if (!process.env.ACCOUNT_REPORT_DIR) return;
  mkdirSync(process.env.ACCOUNT_REPORT_DIR, { recursive: true });
  writeFileSync(
    join(process.env.ACCOUNT_REPORT_DIR, name + '.json'),
    JSON.stringify(value, null, 2) + '\n',
  );
};
// Storage oracle: completed and flushed state are independent. Invocations live outside
// storage, so abandoned ciphertext and remotely observed attempts cannot be refunded.
function execute(history, policy = 'strict') {
  const domains = ['root', 'store', 'network'];
  const committed = [0, 0, 0],
    flushed = [0, 0, 0],
    invoked = [0, 0, 0],
    retained = [0, 0, 0];
  const actors = [null, null];
  let successes = 0,
    refused = 0;
  const limit = 17;
  const check = () => {
    for (let d = 0; d < 3; d++) {
      assert(
        committed[d] >= invoked[d],
        `${domains[d]} undercount: ${committed[d]} < ${invoked[d]}`,
      );
      assert(invoked[d] < limit, `${domains[d]} lifetime exceeded`);
    }
  };
  for (const { op, actor = 0, domain = 0, count = 1 } of history) {
    let a = actors[actor];
    if (op === 'start' && !a) {
      if (committed[domain] + count >= limit) {
        refused++;
        continue;
      }
      actors[actor] = { domain, count, before: committed[domain], stage: 'pending' };
    } else if (op === 'complete' && a?.stage === 'pending') {
      if (committed[a.domain] !== a.before) {
        actors[actor] = null;
        continue;
      }
      committed[a.domain] += a.count;
      // A strict transaction flushes the preceding database prefix, including any
      // network attempt record. Local record allocation alone is not that grant.
      if (policy !== 'relaxed') flushed[a.domain] = committed[a.domain];
      a.stage = 'granted';
    } else if (
      op === 'invoke' &&
      a &&
      (a.stage === 'granted' || (policy === 'early' && a.stage === 'pending'))
    ) {
      invoked[a.domain] += a.count;
      a.stage = 'used';
      successes++;
    } else if (op === 'retain' && a?.stage === 'used') {
      retained[a.domain] += a.count;
      actors[actor] = null;
    } else if (op === 'abandon') actors[actor] = null;
    else if (op === 'flush') {
      flushed[domain] = committed[domain];
    } else if (op === 'page' || op === 'power') {
      actors.fill(null);
      if (op === 'power') for (let d = 0; d < 3; d++) committed[d] = flushed[d];
    }
    check();
  }
  return { committed, flushed, invoked, retained, successes, refused };
}
const command = fc.record({
  op: fc.constantFrom('start', 'complete', 'invoke', 'retain', 'abandon', 'flush', 'page', 'power'),
  actor: fc.integer({ min: 0, max: 1 }),
  domain: fc.integer({ min: 0, max: 2 }),
  count: fc.integer({ min: 1, max: 3 }),
});
const seed = 150915;
test('generated concurrent grants count abandoned AES across page loss, power loss, and retries', () => {
  fc.assert(
    fc.property(fc.array(command, { minLength: 1, maxLength: 300 }), (h) => {
      execute(h);
    }),
    { seed, numRuns: 4000 },
  );
  // Non-vacuous successful/lifetime controls for each domain, including grants that
  // were consumed without ever retaining ciphertext.
  const h = [];
  for (let domain = 0; domain < 3; domain++)
    for (let i = 0; i < 20; i++)
      h.push({ op: 'start', domain }, { op: 'complete' }, { op: 'invoke' }, { op: 'power' });
  const r = execute(h);
  assert.deepEqual(r.invoked, [16, 16, 16]);
  assert.deepEqual(r.retained, [0, 0, 0]);
  assert.equal(r.refused, 12);
  report('model', {
    seed,
    runs: 4000,
    maxCommands: 300,
    legitimate: r,
    assumption:
      'strict completion persists; native API reporting is tested separately, physical flush is not measured',
  });
});
for (const policy of ['relaxed', 'early'])
  test(`${policy} omission control must produce a shrunk undercount`, () => {
    const result = fc.check(
      fc.property(fc.array(command, { minLength: 1, maxLength: 300 }), (h) => {
        execute(h, policy);
      }),
      { seed, numRuns: 4000 },
    );
    assert(result.failed, 'control was not detected');
    assert.match(String(result.errorInstance), /undercount|lifetime exceeded/);
    report('control-' + policy, {
      seed,
      path: result.counterexamplePath,
      counterexample: result.counterexample,
      error: String(result.errorInstance),
    });
  });
