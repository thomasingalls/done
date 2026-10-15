import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { load } from './runtime.mjs';
import {
  corpus,
  fixtures,
  scope,
  kg,
  key,
  keyInfo,
  bytes,
  hex,
  json,
  mac,
  initial,
  intent,
} from './oracle.mjs';
export function report(name, value) {
  if (process.env.ACCOUNT_REPORT_DIR) {
    mkdirSync(process.env.ACCOUNT_REPORT_DIR, { recursive: true });
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, name + '.json'),
      JSON.stringify(value, null, 2) + '\n',
    );
  }
}
const h = await load(),
  vectors = corpus().vectors,
  typed = (v) =>
    typeof v?.mac === 'string' ? { ...structuredClone(v), mac: bytes(v.mac) } : structuredClone(v);
const parsed = (f, s, v) =>
  f.family === 'counter' ? h.parseCounter(typed(v), s, intent) : h.parseWitness(typed(v));
const payload = (f, s, v) =>
  f.family === 'counter' ? h.counterPayload(s, v) : h.witnessPayload(s, v);
const nativeKey = await h.hkdf(
  bytes(kg),
  new Uint8Array(),
  h.fields(
    'done/content-metadata/v1',
    scope.slotId,
    scope.principalId,
    scope.workspaceId,
    scope.storeId,
  ),
  { name: 'HMAC', hash: 'SHA-256', length: 256 },
  ['sign', 'verify'],
);

test('fixed metadata key, both initialization states and all counter variants agree with independent bytes', async () => {
  assert.equal(
    hex(
      h.fields(
        'done/content-metadata/v1',
        scope.slotId,
        scope.principalId,
        scope.workspaceId,
        scope.storeId,
      ),
    ),
    hex(keyInfo(scope)),
  );
  assert.equal(nativeKey.extractable, false);
  assert.deepEqual(nativeKey.usages, ['sign', 'verify']);
  assert.equal(
    hex(new Uint8Array(await crypto.subtle.sign('HMAC', nativeKey, json(['probe'])))),
    hex(mac(key(scope), json(['probe']))),
  );
  for (const f of fixtures()) {
    const p = parsed(f, scope, f.value),
      expected = vectors.find((v) => v.id === f.id).expected;
    assert.equal(hex(payload(f, scope, p)), expected.messageHex);
    assert.equal(
      hex(new Uint8Array(await crypto.subtle.sign('HMAC', nativeKey, payload(f, scope, p)))),
      expected.resultHex,
    );
    assert(
      await crypto.subtle.verify(
        'HMAC',
        nativeKey,
        bytes(expected.resultHex),
        payload(f, scope, p),
      ),
    );
    assert.equal(
      hex(
        payload(f, scope, parsed(f, scope, Object.fromEntries(Object.entries(f.value).reverse()))),
      ),
      expected.messageHex,
    );
  }
  // The metadata key intentionally omits rootId; payload authentication includes it.
  assert.equal(hex(key({ ...scope, rootId: 'ff'.repeat(16) })), hex(key(scope)));
  for (const n of vectors[0].negatives) {
    assert.notEqual(n.resultHex, hex(key(scope)));
    const s = n.scope;
    const changed = await h.hkdf(
      bytes(n.kg ?? kg),
      new Uint8Array(),
      h.fields('done/content-metadata/v1', s.slotId, s.principalId, s.workspaceId, s.storeId),
      { name: 'HMAC', hash: 'SHA-256', length: 256 },
      ['sign'],
    );
    assert.equal(
      hex(new Uint8Array(await crypto.subtle.sign('HMAC', changed, json(['probe'])))),
      hex(mac(bytes(n.resultHex), json(['probe']))),
    );
  }
  report('fixed', {
    vectors: vectors.length,
    keyInfoHex: hex(keyInfo(scope)),
    extractable: nativeKey.extractable,
    usages: nativeKey.usages,
    rootId: 'payload-bound, deliberately not a KDF field',
  });
});
test('every specified metadata input binds or refuses; encoded omission witnesses preserve real HMAC checks', async () => {
  let refused = 0,
    bound = 0,
    omissions = 0;
  for (const f of fixtures()) {
    const v = vectors.find((v) => v.id === f.id);
    for (const n of v.negatives) {
      let p;
      try {
        p = parsed(f, n.input.scope, n.input.value);
      } catch {
        refused++;
        continue;
      }
      const b = payload(f, n.input.scope, p);
      assert.notEqual(hex(b), v.expected.messageHex, n.path.join('.'));
      assert.equal(
        await crypto.subtle.verify('HMAC', nativeKey, bytes(v.expected.resultHex), b),
        false,
      );
      bound++;
    }
    for (const n of v.encodedBindingControls) {
      const original = bytes(v.expected.messageHex),
        changed = bytes(n.changedHex),
        omitted = bytes(n.omittedHex);
      assert.notEqual(hex(mac(key(scope), original)), hex(mac(key(scope), changed)));
      assert.equal(n.omittedHex, n.changedOmittedHex);
      const sig = await crypto.subtle.sign('HMAC', nativeKey, omitted);
      assert(await crypto.subtle.verify('HMAC', nativeKey, sig, bytes(n.changedOmittedHex)));
      assert.equal(await crypto.subtle.verify('HMAC', nativeKey, sig, changed), false);
      omissions++;
    }
  }
  report('bindings', { refused, bound, total: refused + bound, omissions });
});
test('closed structured-clone parsers reject malformed counters without inferring missing allocation state', () => {
  let refusals = 0;
  for (const f of fixtures()) {
    const check = (v, code = 'repair-required') => {
      assert.throws(() => parsed(f, scope, v), { code });
      refusals++;
    };
    for (const field of Object.keys(f.value)) {
      const v = structuredClone(f.value);
      delete v[field];
      check(v);
    }
    check({ ...f.value, extra: true });
    check({ ...f.value, v: 3 }, f.family === 'counter' ? 'app-update-required' : 'repair-required');
    check({ ...f.value, mac: '00'.repeat(31) });
  }
  const base = initial(2);
  const check = (v) => {
    assert.throws(() => h.parseCounter(v, scope, intent));
    refusals++;
  };
  for (const v of [
    null,
    [],
    Object.create(null),
    { ...typed(base), reserved: [] },
    { ...typed(base), reserved: Object.create(null) },
    { ...typed(base), reserved: {} },
    { ...typed(base), reserved: { '01': 0 } },
    { ...typed(base), reserved: { 0: 0 } },
    { ...typed(base), reserved: { 9007199254740992: 0 } },
    { ...typed(base), reserved: { 2: 0 } },
    { ...typed(base), reserved: { 1: -1 } },
    { ...typed(base), reserved: { 1: 2 ** 32 } },
    { ...typed(base), next_seq: 2 },
    { ...typed(base), active_gen: 0 },
    { ...typed(base), next_seq: NaN },
    { ...typed(base), next_seq: Infinity },
    { ...typed(base), next_seq: Number.MAX_SAFE_INTEGER + 1 },
    { ...typed(base), spool: { events: -1, hash: '00'.repeat(32) } },
    { ...typed(base), spool: { events: 0, hash: 'AB'.repeat(32) } },
    { ...typed(base), spool: { events: 0, hash: '00'.repeat(32), extra: 1 } },
    { ...typed(base), spool: { events: Number.MAX_SAFE_INTEGER + 1, hash: '00'.repeat(32) } },
  ])
    check(v);
  const p = h.parseCounter(typed(base), scope, intent),
    w = h.parseWitness(typed(fixtures()[0].value));
  const copy = typed(base);
  const detached = h.parseCounter(copy, scope, intent);
  copy.mac[0] = 1;
  copy.reserved['1'] = 4;
  copy.spool.hash = 'ff'.repeat(32);
  assert.equal(detached.mac[0], 0);
  assert.equal(detached.reserved['1'], 0);
  assert.equal(detached.spool.hash, '00'.repeat(32));
  assert.equal(p.v, 2);
  assert.equal(w.state, 'creating');
  // Parser deliberately leaves ledger completeness and active owner generation to later owners.
  assert.equal(
    h.parseCounter({ ...typed(base), spool: { events: 1, hash: '00'.repeat(32) } }, scope, intent)
      .spool.events,
    1,
  );
  assert.throws(() => h.fields('x\ud800'));
  assert.throws(() => h.fields('x'.repeat(65536)));
  assert.equal(h.fields('🙂').length, 6);
  const negativeZero = h.parseCounter(
    { ...typed(base), reserved: { 1: -0 }, spool: { events: -0, hash: '00'.repeat(32) } },
    scope,
    intent,
  );
  assert.equal(hex(h.counterPayload(scope, negativeZero)), hex(h.counterPayload(scope, p)));
  report('parsers', {
    refusals,
    closedObjects: true,
    detached: true,
    spoolSemanticCheck: 'not implied by parseCounter',
  });
});
test('200 generated allocation/restart histories match an independent integer budget and authenticate retained counters', async () => {
  let histories = 0,
    steps = 0,
    refusals = 0;
  const traces = [];
  const result = await fc.check(
    fc.asyncProperty(
      fc.boolean(),
      fc.array(
        fc.record({
          n: fc.integer({ min: 1, max: 256 }),
          rotate: fc.boolean(),
          event: fc.boolean(),
        }),
        { minLength: 2, maxLength: 30 },
      ),
      async (edge, ops) => {
        let gen = 1,
          seq = edge ? 2 ** 32 - 256 : 1,
          reserved = { 1: seq - 1 },
          events = 0,
          c = { ...typed(initial(2)), next_seq: seq, reserved: { ...reserved } };
        c.mac = new Uint8Array(
          await crypto.subtle.sign('HMAC', nativeKey, h.counterPayload(scope, c)),
        );
        for (const op of ops) {
          if (op.rotate) {
            gen++;
            reserved[String(gen)] = 0;
            c = { ...c, active_gen: gen, reserved: { ...reserved } };
          }
          const prior = structuredClone(c),
            expected = BigInt(reserved[String(gen)]) + BigInt(op.n);
          if (expected >= 2n ** 32n) {
            assert.throws(() => h.reserveCounter(c, op.n, gen), /Rotate/);
            refusals++;
            continue;
          }
          const next = h.reserveCounter(c, op.n, gen);
          seq += op.n;
          reserved[String(gen)] += op.n;
          assert.equal(next.next_seq, seq);
          assert.deepEqual(next.reserved, reserved);
          assert.deepEqual(next.spool, c.spool);
          assert.equal(
            BigInt(seq) - 1n,
            Object.values(reserved).reduce((s, n) => s + BigInt(n), 0n),
          );
          if (op.event) {
            events++;
            next.spool = { events, hash: hex(mac(key(scope), json([events, seq]))) };
          }
          next.mac = new Uint8Array(
            await crypto.subtle.sign('HMAC', nativeKey, h.counterPayload(scope, next)),
          );
          const cold = h.parseCounter(
            {
              ...structuredClone(next),
              reserved: Object.fromEntries(Object.entries(next.reserved).reverse()),
            },
            scope,
            intent,
          );
          assert(
            await crypto.subtle.verify('HMAC', nativeKey, cold.mac, h.counterPayload(scope, cold)),
          );
          assert(h.equalCounter(scope, next, cold));
          assert.equal(h.equalCounter(scope, prior, cold), false);
          const lie = {
            ...cold,
            next_seq: cold.next_seq + 1,
            reserved: { ...cold.reserved, [gen]: cold.reserved[gen] + 1 },
          };
          assert.equal(
            await crypto.subtle.verify('HMAC', nativeKey, cold.mac, h.counterPayload(scope, lie)),
            false,
          );
          c = cold;
          steps++;
        }
        histories++;
        traces.push({ edge, operations: ops.length, gen, seq, events });
      },
    ),
    { seed: 5110918, numRuns: 200 },
  );
  report('properties', {
    ...result,
    errorInstance: result.errorInstance ? String(result.errorInstance) : null,
    histories,
    steps,
    refusals,
    traces,
  });
  assert.equal(result.failed, false, String(result.errorInstance));
});
test('actual source omissions lose root/state/spool MAC bindings and allocator guards; crypto remains operative', async () => {
  const evidence = [];
  for (const [control, f, mutate] of [
    ['root', fixtures()[5], (s) => ({ ...s, rootId: 'ff'.repeat(16) })],
    ['witnessState', fixtures()[0]],
    ['counterSpool', fixtures()[5]],
  ]) {
    const m = await load(control),
      v = typed(f.value),
      s2 = mutate ? mutate(scope) : scope,
      v2 =
        control === 'witnessState'
          ? { ...v, state: 'ready' }
          : control === 'counterSpool'
            ? { ...v, spool: { events: v.spool.events + 1, hash: 'bb'.repeat(32) } }
            : v;
    const fn = f.family === 'counter' ? 'counterPayload' : 'witnessPayload';
    const old = await crypto.subtle.sign('HMAC', nativeKey, h[fn](scope, v));
    assert.equal(await crypto.subtle.verify('HMAC', nativeKey, old, h[fn](s2, v2)), false);
    const omitted = await crypto.subtle.sign('HMAC', nativeKey, m[fn](scope, v));
    assert(await crypto.subtle.verify('HMAC', nativeKey, omitted, m[fn](s2, v2)));
    evidence.push({ control, baseline: 'refused', omitted: 'accepted' });
  }
  const c = typed(initial()),
    different = { ...c, mac: new Uint8Array(32).fill(7) };
  assert.equal(h.equalCounter(scope, c, different), false);
  assert((await load('equalMac')).equalCounter(scope, c, different));
  assert.throws(() => h.parseCounter({ ...c, next_seq: 2 }, scope, intent));
  assert.equal((await load('sum')).parseCounter({ ...c, next_seq: 2 }, scope, intent).next_seq, 2);
  const edge = { ...c, next_seq: 2 ** 32, reserved: { 1: 2 ** 32 - 1 } };
  assert.throws(() => h.reserveCounter(edge, 1, 1));
  assert.equal((await load('ceiling')).reserveCounter(edge, 1, 1).reserved['1'], 2 ** 32);
  report('controls', {
    bindingControls: evidence,
    equalMac: 'changed MAC accepted only by comparison omission',
    allocationSum: 'inconsistent allocation accepted only by parser guard omission',
    ceiling: 'prohibited grant returned only by ceiling omission',
  });
});
