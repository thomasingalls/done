import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { load, typed, task } from './runtime.mjs';
import * as o from './oracle.mjs';
import { report, resultJSON } from '../account-checkpoint-contract/report.mjs';
const h = await load();
const sign = (r, helper = h) => helper.signLocalClaim(task, typed(r), o.code);
const verify = (r, helper = h) => helper.verifyLocalClaim(task, typed(r), o.code);
test('independent fixed key and all retained claim variants match actual factor-opened authentication', async () => {
  const evidence = [];
  for (const { name, claim } of o.fixtures()) {
    const parsed = h.parseLocalClaim(typed(claim), claim.initial.slot_id);
    assert.deepEqual(parsed, typed(claim));
    assert.equal(o.hex((await sign(claim)).mac), claim.mac);
    await verify(claim);
    evidence.push({ name, messageHex: o.hex(o.encode(claim)), mac: claim.mac });
  }
  report('fixed', { vectors: o.corpus().vectors.length, evidence });
});
test('declared field mutations and omission witnesses keep real HMAC operative', async () => {
  let mutations = 0,
    omissions = 0;
  for (const v of o.corpus().vectors) {
    for (const n of v.negatives) {
      assert.notEqual(n.resultHex, v.expected.resultHex);
      mutations++;
    }
    if (v.kind !== 'mac') continue;
    const k = await crypto.subtle.importKey(
      'raw',
      o.key(v.input.initial),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    for (const n of v.negatives)
      assert.equal(
        await crypto.subtle.verify('HMAC', k, o.bytes(v.expected.resultHex), o.bytes(n.messageHex)),
        false,
      );
    for (const n of v.encodedBindingControls) {
      assert.equal(n.omittedHex, n.changedOmittedHex);
      assert.equal(
        await crypto.subtle.verify('HMAC', k, o.bytes(n.resultHex), o.bytes(n.omittedHex)),
        true,
      );
      assert.equal(
        await crypto.subtle.verify('HMAC', k, o.bytes(v.expected.resultHex), o.bytes(n.omittedHex)),
        false,
      );
      omissions++;
    }
  }
  report('bindings', { mutations, omissions });
});
function paths(v, path = []) {
  return Array.isArray(v)
    ? v.flatMap((x, i) => paths(x, [...path, i]))
    : v && typeof v === 'object'
      ? Object.entries(v).flatMap(([k, x]) => paths(x, [...path, k]))
      : [{ path, value: v }];
}
function replace(r, path, value) {
  r = structuredClone(r);
  let x = r;
  for (const k of path.slice(0, -1)) x = x[k];
  x[path.at(-1)] = value;
  return r;
}
test('every retained claim input leaf is authenticated or rejected, including imported selection and nested cleanup', async () => {
  const evidence = [];
  let parsed = 0,
    auth = 0;
  for (const { name, claim } of o.fixtures())
    for (const { path, value } of paths(claim)) {
      const changed = replace(
        claim,
        path,
        typeof value === 'string' &&
          ['mac', 'salt', 'nonce', 'ct', 'publicKey'].includes(path.at(-1))
          ? (value[0] === '0' ? '1' : '0') + value.slice(1)
          : typeof value === 'boolean'
            ? !value
            : o.changed(value),
      );
      try {
        h.parseLocalClaim(typed(changed), claim.initial.slot_id);
      } catch {
        parsed++;
        evidence.push({ name, path, refused: 'parser' });
        continue;
      }
      await assert.rejects(verify(changed), name + ' ' + path.join('.'));
      auth++;
      evidence.push({ name, path, refused: 'authentication' });
    }
  report('input-leaves', { parsed, auth, total: evidence.length, evidence });
});
test('actual source omissions change the key, progress, imported tuple and cleanup fields', async () => {
  const f = o.fixtures(),
    evidence = [];
  for (const [name, r] of [
    ['keySlot', f[2].claim],
    ['keyRoot', f[2].claim],
    ['initialMac', f[2].claim],
    ['stage', f[2].claim],
    ['selectionMac', f[3].claim],
    ['cleanupNext', f[5].claim],
    ['cleanupDigest', f[5].claim],
  ]) {
    const mutant = await load(name),
      result = await sign(r, mutant);
    assert.notEqual(o.hex(result.mac), r.mac);
    await assert.rejects(verify({ ...r, mac: o.hex(result.mac) }));
    evidence.push({ name, changedMac: o.hex(result.mac), caught: true });
    if (name === 'stage') {
      const changed = { ...r, stage: 'content', mac: o.hex(result.mac) };
      await mutant.verifyLocalClaim(task, typed(changed), o.code);
      evidence.at(-1).acceptsChangedStage = true;
    }
  }
  report('source-controls', evidence);
});
test('cleanup v1 preserves narrow framing; v2 authenticates long payloads and escaped UTF-16 without collisions', async () => {
  const long = {
    ...o.fixtures()[5].claim,
    sourceCleanup: {
      ...o.cleanup(),
      entries: Array.from({ length: 40 }, (_, i) => ({
        key: 'done.pending-update.done.' + 'x'.repeat(1900) + '.' + i,
        digest: 'ae'.repeat(32),
      })),
      next: 41,
    },
  };
  const signed = o.sign(long);
  assert(o.encode(signed).length > 65535);
  assert.equal(o.hex((await sign(signed)).mac), signed.mac);
  await verify(signed);
  const old = { ...signed, sourceCleanup: { ...signed.sourceCleanup, v: 1 } };
  assert.throws(() => o.encode(old), /length|range|too long|65535/i);
  await assert.rejects(sign(old));
  const unpaired = '\ud800',
    replaced = '\ufffd';
  assert.throws(() => h.cleanupFields(1, 'done/legacy-cleanup-entry', 'local', unpaired));
  assert.notDeepEqual(
    h.cleanupFields(2, 'done/legacy-cleanup-entry', 'local', unpaired),
    h.cleanupFields(2, 'done/legacy-cleanup-entry', 'local', replaced),
  );
  assert.equal(
    o.hex(h.cleanupFields(2, 'done/local-import-cleanup', 'x', unpaired)),
    o.hex(Buffer.from(JSON.stringify(['done/local-import-cleanup/v2', 'x', unpaired]))),
  );
  report('framing', {
    longBytes: o.encode(signed).length,
    v1: 'refuses overflow',
    v2: 'matches and verifies',
    unpaired: 'escaped distinctly; no replacement alias',
  });
});
test('250 shrinking-enabled retained-claim histories round-trip stage, imported fields and cleanup progress', async () => {
  let checked = 0;
  const result = await fc.check(
    fc.asyncProperty(
      fc.constantFrom('custody', 'content', 'ready', 'imported', 'cleanup1', 'cleanup2'),
      fc.string({ maxLength: 64 }),
      fc.array(fc.uint8Array({ minLength: 32, maxLength: 32 }), { maxLength: 8 }),
      fc.nat(12),
      async (kind, origin, digests, n) => {
        let claim = {
          v: 1,
          initial: o.initial(),
          stage: ['custody', 'content', 'ready'].includes(kind) ? kind : 'ready',
        };
        if (kind === 'imported' || kind.startsWith('cleanup'))
          claim.imported = { ...o.imported(), sourceOrigin: origin };
        if (kind.startsWith('cleanup')) {
          const entries = digests.map((d, i) => ({
            key: 'done.pending-update.done.w.' + i,
            digest: typeof d === 'string' ? d : o.hex(d),
          }));
          claim.sourceCleanup = {
            ...o.cleanup(kind === 'cleanup1' ? 1 : 2),
            entries,
            next: n % (entries.length + 2),
          };
        }
        claim = o.sign(claim);
        assert.equal(o.hex((await sign(claim)).mac), claim.mac);
        await verify(claim);
        assert.deepEqual(h.parseLocalClaim(typed(claim), o.scope.slotId), typed(claim));
        const changed = structuredClone(claim);
        if (changed.sourceCleanup)
          changed.sourceCleanup.next =
            (changed.sourceCleanup.next + 1) % (changed.sourceCleanup.entries.length + 2);
        else if (changed.imported) changed.imported.sourceOrigin += 'x';
        else changed.stage = changed.stage === 'ready' ? 'content' : 'ready';
        await assert.rejects(verify(changed));
        checked++;
      },
    ),
    { seed: 5110940, numRuns: 250 },
  );
  report('properties', { ...resultJSON(result), checked });
  assert.equal(result.failed, false, String(result.errorInstance));
});
