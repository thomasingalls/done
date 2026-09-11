import test from 'node:test';
import assert from 'node:assert/strict';
import { verify, createPublicKey } from 'node:crypto';
import {
  fixture,
  encode,
  submissionWireParts,
  submissionParts,
  responseValues,
  privateKey,
} from '../account-transport-contract/oracle.mjs';
import { load, bytes, hex, json, fc, property, report } from './helpers.mjs';
const h = await load(),
  f = fixture();
const wires = f.submissions.map((s) => new Uint8Array(encode(submissionWireParts(s))));
function offsets(wire) {
  const fields = [];
  let at = 0;
  for (let i = 0; i < 3; i++) {
    const n = new DataView(wire.buffer, wire.byteOffset + at, 2).getUint16(0);
    fields.push({ at, size: 2, value: n });
    at += 2 + n;
  }
  for (let i = 0; i < 2; i++) {
    const n = new DataView(wire.buffer, wire.byteOffset + at, 4).getUint32(0);
    fields.push({ at, size: 4, value: n });
    at += 4 + n;
  }
  return fields;
}
test('generated internal length-prefix changes refuse for first and successor submissions', () => {
  const cases = wires.flatMap((wire, variant) =>
    offsets(wire).map((field) => ({ variant, ...field })),
  );
  property(
    'submission-lengths',
    fc.tuple(
      fc.integer({ min: 0, max: cases.length - 1 }),
      fc.integer({ min: 0, max: 0xffffffff }),
    ),
    ([pick, value]) => {
      const c = cases[pick],
        raw = wires[c.variant].slice();
      const n = c.size === 2 ? value % 65536 : value;
      // Never discard a generated example: pick a different representable count.
      const changed = n === c.value ? (n + 1) % (c.size === 2 ? 65536 : 2 ** 32) : n;
      const view = new DataView(raw.buffer);
      if (c.size === 2) view.setUint16(c.at, changed);
      else view.setUint32(c.at, changed);
      assert.throws(() => h.decodeSubmission(raw));
    },
    112110,
    500,
  );
  report('submission-prefix-layout', cases);
});

test('parent framing must be refusal and canonical; nested corruption cannot hide behind a valid outer frame', () => {
  const wire = wires[1],
    off = offsets(wire)[4];
  for (const parent of [
    json(responseValues(f.responses[1])),
    new TextEncoder().encode(
      ' ' + new TextDecoder().decode(wire.slice(off.at + 4, off.at + 4 + off.value)),
    ),
    new Uint8Array([0xff]),
  ]) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(parent.length);
    const raw = new Uint8Array(
      Buffer.concat([wire.slice(0, off.at), length, parent, wire.slice(off.at + 4 + off.value)]),
    );
    assert.throws(() => h.decodeSubmission(raw));
  }
  const envelopeStart = offsets(wires[0])[3].at + 4;
  const malformed = wires[0].slice();
  malformed[envelopeStart + 2] = 0xff;
  assert.throws(() => h.decodeSubmission(malformed));
  assert.throws(() => h.decodeSubmission(new Uint8Array([0xff, ...wires[0]])));
});

test('generated detached signature bytes round-trip structurally without conferring signature authority', () => {
  property(
    'submission-positive',
    fc.tuple(fc.boolean(), fc.uint8Array({ minLength: 64, maxLength: 64 })),
    ([successor, signature]) => {
      const s = { ...f.submissions[Number(successor)], signature: hex(signature) };
      const raw = new Uint8Array(encode(submissionWireParts(s))),
        parsed = h.decodeSubmission(raw);
      assert.equal(hex(parsed.signature), s.signature);
      assert.equal(hex(h.encodeSubmission(parsed)), hex(raw));
      raw.fill(0);
      assert.equal(hex(parsed.envelope), s.envelope);
      assert.equal(hex(parsed.signature), s.signature);
    },
    112111,
  );
  const s = { ...f.submissions[0], signature: '00'.repeat(64) };
  h.decodeSubmission(new Uint8Array(encode(submissionWireParts(s))));
  assert.equal(
    verify(
      null,
      encode(submissionParts(s)),
      createPublicKey(privateKey(f.keys.member.seed)),
      bytes(s.signature),
    ),
    false,
  );
});
