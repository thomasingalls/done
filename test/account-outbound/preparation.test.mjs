import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { createHash, hkdfSync } from 'node:crypto';
import fc from 'fast-check';
import { model, violations } from './model.mjs';

const artifact = (name, value) => {
  if (process.env.OUTBOUND_REPORT_DIR)
    writeFileSync(
      join(process.env.OUTBOUND_REPORT_DIR, name),
      JSON.stringify(value, null, 2) + '\n',
    );
};
test('existing S0-4 model undercounts same-generation recovery and successor mints', () => {
  const file = readFileSync('test/outboundSpool.test.ts', 'utf8');
  // Execute the actual existing model declarations, excluding Vitest and its test cases.
  const prefix = file.slice(file.indexOf('type SpoolState'), file.indexOf('// --- the service'));
  assert.ok(prefix.includes('const mintAt') && prefix.includes('const mintSuccessor'));
  const old = new Function(
    stripTypeScriptTypes(prefix) + '\nreturn {client,reserve,mintAt,mintSuccessor};',
  )();
  const reserved = old.reserve(old.client());
  const invocations = [];
  for (let n = 0; n < 3; n++) {
    // Encrypt is outside IDB: discard the result as a crash before the promote's commit would.
    invocations.push(old.mintAt(structuredClone(reserved.c), reserved.position, null).e);
  }
  assert.equal(new Set(invocations.map((e) => e.digest)).size, 3);
  assert.equal(reserved.c.reserved[reserved.c.gen], 1);
  const first = old.mintAt(reserved.c, reserved.position, null);
  const successor = old.mintSuccessor(first.c, reserved.position, 'verified-refusal');
  assert.equal(successor.c.reserved[first.c.gen], 1);
  artifact('counterexample-model-budget.json', {
    source: 'test/outboundSpool.test.ts',
    sha256: createHash('sha256').update(file).digest('hex'),
    crashTrace: ['reserve once', 'mint; lose promote', 'mint; lose promote', 'mint; lose promote'],
    actualInvocations: invocations.length,
    durableCount: 1,
    successorTrace: ['reserve once', 'mint', 'verified refusal', 'mint successor'],
    successorActualInvocations: 2,
    successorDurableCount: 1,
    scope: 'Model counterexamples, not a production network-writer defect; no writer exists yet.',
  });
});
test('v1 key derivation shares the actual network key across distinct credential budgets', () => {
  const v = JSON.parse(readFileSync('test/vectors/envelope.json', 'utf8')).vectors[0];
  const kg = Buffer.from(v.inputs.k_g, 'hex'),
    info = Buffer.from(v.derived.hkdf_info, 'hex');
  const a = Buffer.from(hkdfSync('sha256', kg, Buffer.alloc(0), info, 32));
  const b = Buffer.from(hkdfSync('sha256', kg, Buffer.alloc(0), info, 32));
  assert.deepEqual(a, b);
  const limit = 2 ** 32,
    each = limit / 2;
  assert.ok(each < limit);
  assert.equal(each + each, limit);
  artifact('counterexample-key-domain.json', {
    credentials: ['device-A', 'device-B'],
    sameKg: true,
    sameInfo: true,
    equalDerivedKeys: true,
    countEach: each,
    sumUnderOneKey: each + each,
    firstDisallowed: limit,
    scope:
      'Exact HKDF equality plus arithmetic; not billions of real encryptions or a collision attack.',
  });
});
test('proposed split reservations count each crashed seal and retain the same position', () => {
  const m = model(5);
  m.accept('edit');
  m.reserve();
  for (let n = 0; n < 4; n++) {
    m.reserveSeal();
    m.seal();
    m.crash();
  }
  m.reserveSeal();
  m.seal();
  assert.equal(m.oracle.invocations[1], 4);
  assert.equal(m.disk().seals[1], 4);
  assert.equal(m.disk().next, 2);
  assert.equal(m.disk().rows[0].bytes, null);
  m.rotate();
  m.reserveSeal();
  m.seal();
  m.persist();
  m.send();
  m.crash();
  m.send();
  assert.deepEqual(violations(m, 5), []);
  assert.equal(m.oracle.sent.length, 2);
  assert.deepEqual(m.oracle.sent[0], m.oracle.sent[1]);
});
test('independent oracle detects each deliberately broken preparation model', () => {
  const cases = [];
  for (const [fault, expected] of [
    ['listenerGap', 'lost-admission'],
    ['counterOnly', 'position-gap'],
    ['sendEarly', 'changed-retry'],
  ]) {
    const m = model(12, { [fault]: true });
    m.accept('edit');
    m.reserve();
    m.reserveSeal();
    m.seal();
    m.send();
    m.crash();
    const errors = violations(m);
    assert.ok(errors.includes(expected), `${fault}: ${errors}`);
    cases.push({ fault, expected, observed: errors });
  }
  artifact('model-controls.json', cases);
});
test('generated crash histories preserve capture, allocation, invocation count and exact retry', () => {
  const seed = 9312026,
    inputs = [];
  const commands = [
    'accept',
    'refuse',
    'remote',
    'reserve',
    'reserveSeal',
    'seal',
    'persist',
    'send',
    'crash',
    'compact',
    'rotate',
  ];
  fc.assert(
    fc.property(
      fc.array(fc.constantFrom(...commands), { minLength: 1, maxLength: 100 }),
      (history) => {
        inputs.push(history);
        const m = model();
        for (const [i, command] of history.entries()) {
          if (command === 'accept') m.accept(`local-${i}`, 'local', i % 2 ? 'human' : 'system');
          else if (command === 'remote') m.accept(`remote-${i}`, 'remote', 'another-actor');
          else if (command !== 'refuse') m[command](); // Refused input never reaches durable admission.
          assert.deepEqual(violations(m), [], `${i}: ${history}`);
        }
        // Conditional progress after crashes cease, with a fresh budget and no network decisions.
        m.crash();
        m.rotate();
        for (let n = 0; n < history.length; n++) {
          m.reserve();
          m.reserveSeal();
          m.seal();
          m.persist();
          m.compact();
          if (m.disk().seals[m.disk().generation] === 11) m.rotate();
        }
        const captured = m.disk().rows.flatMap((r) => (r.bytes ? r.intents.map((i) => i.id) : []));
        for (const i of m.oracle.acknowledged.filter((i) => i.source === 'local'))
          assert.ok(captured.includes(i.id));
        assert.deepEqual(violations(m), []);
      },
    ),
    { seed, numRuns: 1000 },
  );
  artifact('preparation-generated.json', {
    seed,
    runs: inputs.length,
    inputs,
    limits:
      'Atomic metadata/capsule commits and crypto tokens are modelled. No IDB, authentication, refusal/head verifier, or rotation implementation is tested.',
  });
});
