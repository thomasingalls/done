import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './runtime.mjs';
import {
  fixture,
  hex,
  json,
  zero,
  sourceValues,
  spoolValues,
  deliveryValues,
  hash,
  makeEnvelope,
  makeSubmission,
  makeAnswer,
} from './oracle.mjs';
import { encode, envelopeParts } from '../account-transport-contract/oracle.mjs';
import { publicKey, report } from './helpers.mjs';
const h = await load(),
  reference = await load('coldPrefixReference');
const f = fixture(),
  key = await publicKey(f);
function history(n, wrongLinkAt = 0) {
  const rows = [];
  let previous = zero;
  const push = (kind, values) =>
    rows.push({ kind, seq: rows.length + 1, gen: 1, bytes: new Uint8Array(json(values)) });
  for (let position = 1; position <= n; position++) {
    const capsule = { ...f.capsule, id: position.toString(16).padStart(32, '0') };
    push('outbound', sourceValues(capsule));
    push(
      'heads',
      spoolValues(f.route, {
        type: 'position',
        position,
        source: { id: capsule.id, index: 0, hash: hash(json(sourceValues(capsule))) },
      }),
    );
    push('heads', spoolValues(f.route, { type: 'attempt', position, attempt: position }));
    const env = makeEnvelope(f, position, f.updates[0], position.toString(16).padStart(24, '0'));
    push(
      'outbound',
      spoolValues(f.route, {
        type: 'envelope',
        position,
        attempt: position,
        wire: hex(encode(envelopeParts(env))),
      }),
    );
    push(
      'outbound',
      deliveryValues(f.route, f.authority, {
        type: 'submission',
        position,
        wire: makeSubmission(f, env),
      }),
    );
    const answer = makeAnswer(f, env, position === wrongLinkAt ? zero : previous);
    push(
      'heads',
      deliveryValues(f.route, f.authority, { type: 'response', position, wire: answer.proof }),
    );
    previous = answer.link;
  }
  return rows;
}
async function verify(lib, rows) {
  let links = 0;
  const subtle = new Proxy(crypto.subtle, {
    get(target, name) {
      if (name === 'digest')
        return (algorithm, input) => {
          if (Buffer.from(input).includes(Buffer.from('done/accept/v1'))) links++;
          return target.digest(algorithm, input);
        };
      const value = Reflect.get(target, name);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const state = await lib.verifyDelivery(
    lib.inspectDelivery(rows, f.route, f.authority),
    f.route,
    f.authority,
    key,
    subtle,
  );
  return { state, links };
}
test('complete cold replay computes a linear number of chain links and agrees with the prior walker', async () => {
  const results = [];
  for (const positions of [8, 32, 128]) {
    const rows = history(positions);
    const a = await verify(h, rows),
      b = await verify(reference, rows);
    assert.deepEqual(a.state, b.state);
    assert.equal(a.state.acceptedThrough, positions);
    // One cached prefix link and one independent response-head verification per position.
    assert.equal(a.links, 2 * positions);
    assert.equal(b.links, positions * positions);
    results.push({ positions, candidateLinks: a.links, referenceLinks: b.links });
  }
  report('cold-prefix-growth', results);
});
test('one thousand authenticated positions still require only two thousand link hashes', async () => {
  const result = await verify(h, history(1000));
  assert.equal(result.state.acceptedThrough, 1000);
  assert.equal(result.links, 2000);
  report('cold-prefix-thousand', { positions: 1000, candidateLinks: result.links });
});
test('a correctly signed response with the wrong preceding chain is still refused', async () => {
  for (const lib of [h, reference])
    await assert.rejects(verify(lib, history(12, 9)), /Unverified persisted response/);
});
test('missing earlier allocation and reordered authentic delivery remain refused', async () => {
  const missing = history(12);
  missing.splice(6, 1);
  const reordered = history(12);
  [reordered[5].bytes, reordered[11].bytes] = [reordered[11].bytes, reordered[5].bytes];
  for (const lib of [h, reference]) {
    await assert.rejects(verify(lib, missing));
    await assert.rejects(verify(lib, reordered));
  }
});
