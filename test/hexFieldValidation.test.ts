// @vitest-environment node
// Phase 542: long hex fields must not depend on the regular-expression engine.
// WebKit 26.5 reports no match for /^(?:[0-9a-f]{2})+$/ on valid input longer than 2,785,276
// characters (measured with Playwright's bundled engines; see the phase 542 record). Node does
// not, so these cases emulate that one measured behaviour and pin the accept/reject set.
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { lowerHexBytes, hex } from '../account-protocol/recovery';
import { inboundBytes } from '../account-protocol/inboundTransport';
import { SUBMISSION_LIMIT } from '../account-protocol/submission';
import { decodeSubmit, encodeSubmit } from '../account-protocol/deliveryTransport';
import { decodeSpoolEntry, encodeSpoolEntry } from '../src/crdt/spoolRecord';
import { decodeDeliveryEntry } from '../src/crdt/deliveryRecord';
import { decodeSourceCapsule, encodeSourceCapsule } from '../src/crdt/sourceCapture';
import {
  decodeLocalBaseline,
  encodeLocalBaseline,
  baselineAuthenticationPayload,
} from '../src/crdt/localBaselineRecord';
import { Y } from '../src/crdt/yjs';
import { entry, A } from './account-inbound/fixtures';
import { context } from './account-inbound-codecs/oracle';

afterEach(() => {
  vi.restoreAllMocks();
});
const GROUPED = '^(?:[0-9a-f]{2})+$';
const WEBKIT_GROUPED_LIMIT = 2_785_276;
/** Reproduce the measured WebKit result for the grouped pattern only; every other test is real. */
const emulateWebKit = () => {
  const real = RegExp.prototype.test;
  vi.spyOn(RegExp.prototype, 'test').mockImplementation(function (this: RegExp, input: string) {
    if (this.source === GROUPED && String(input).length > WEBKIT_GROUPED_LIMIT) return false;
    return real.call(this, input);
  });
};
const PAST_WEBKIT = WEBKIT_GROUPED_LIMIT + 2;
// Deep equality is too slow for megabyte arrays; compare bytes directly.
const same = (a: Uint8Array | undefined, b: Uint8Array) =>
  !!a && Buffer.from(a).equals(Buffer.from(b));
const longHex = (chars: number) => 'a5'.repeat(chars / 2);
const malformed = (valid: string): [string, string][] => [
  ['empty', ''],
  ['odd length', valid.slice(0, -1)],
  ['uppercase', 'A' + valid.slice(1)],
  ['non-hex at start', 'g' + valid.slice(1)],
  [
    'non-hex in the middle',
    valid.slice(0, valid.length / 2) + 'x' + valid.slice(valid.length / 2 + 1),
  ],
  ['non-hex at end', valid.slice(0, -1) + 'z'],
  ['whitespace', valid.slice(0, -1) + ' '],
];
const base = context(),
  route = {
    workspace: base.authority.workspace,
    credential: A,
    principal: A,
    epoch: 1,
    generation: 1,
  };

it('lowerHexBytes accepts exactly non-empty, even-length lowercase hex and decodes every byte', () => {
  const all = new Uint8Array(256).map((_, i) => i);
  expect(lowerHexBytes(hex(all))).toEqual(all);
  expect(lowerHexBytes('00ff')).toEqual(new Uint8Array([0, 255]));
  for (const [name, value] of malformed('0123456789abcdef'))
    expect(lowerHexBytes(value), name).toBeUndefined();
  for (const c of ['G', 'F', '/', ':', '@', '`', 'g', '٠', '０'])
    expect(lowerHexBytes('0' + c), c).toBeUndefined();
  // The grouped pattern it replaces, on short input where every engine agrees.
  const grouped = new RegExp(GROUPED);
  for (const value of ['', '0', '00', 'aB', 'ab', '0g', 'fff', 'ffff', ' 00', '00\n'])
    expect(lowerHexBytes(value) !== undefined, JSON.stringify(value)).toBe(grouped.test(value));
});

it('inbound and private-delivery hex fields keep their bounds and accept long valid input on WebKit', () => {
  emulateWebKit();
  const long = longHex(PAST_WEBKIT);
  expect(new RegExp(GROUPED).test(long)).toBe(false); // the emulation is active
  expect(
    same(inboundBytes(long, PAST_WEBKIT / 2), new Uint8Array(PAST_WEBKIT / 2).fill(0xa5)),
  ).toBe(true);
  expect(() => inboundBytes(long + 'a5', PAST_WEBKIT / 2)).toThrow('Invalid inbound frame');
  expect(() => inboundBytes(42, 4)).toThrow('Invalid inbound frame');
  for (const [name, value] of malformed(long))
    expect(() => inboundBytes(value, PAST_WEBKIT), name).toThrow('Invalid inbound frame');
  // Exactly at, then one byte past, the submission bound.
  const ws = '01'.repeat(16),
    at = new Uint8Array(SUBMISSION_LIMIT).fill(0xa5);
  expect(same(decodeSubmit(encodeSubmit(ws, at)).bytes, at)).toBe(true);
  const frame = (field: string) =>
    new TextEncoder().encode(JSON.stringify(['done/private-submit/v1', 1, ws, field]));
  expect(() => decodeSubmit(frame(hex(at) + 'a5'))).toThrow('Invalid private delivery frame');
  for (const [name, value] of malformed(longHex(64)))
    expect(() => decodeSubmit(frame(value)), name).toThrow('Invalid private delivery frame');
}, 60000);

it('a long spool envelope and a long delivery submission pass their hex step on WebKit', () => {
  emulateWebKit();
  const update = new Uint8Array(PAST_WEBKIT / 2 + 1024).fill(7);
  const wire = entry({ publisher: A, updates: [update] }, 1).envelope;
  expect(wire.length * 2).toBeGreaterThan(PAST_WEBKIT);
  const spool = { type: 'envelope' as const, position: 1, attempt: 1, wire };
  const decoded = decodeSpoolEntry(encodeSpoolEntry(spool, route), route);
  expect(decoded.type === 'envelope' && same(decoded.wire, wire)).toBe(true);
  const spoolFrame = (field: string) =>
    new TextEncoder().encode(
      JSON.stringify([
        'done/account-spool/v1',
        1,
        route.workspace,
        A,
        A,
        1,
        1,
        'envelope',
        1,
        [1, field],
      ]),
    );
  for (const [name, value] of malformed(hex(wire)))
    expect(() => decodeSpoolEntry(spoolFrame(value), route), name).toThrow('Invalid spool hex');
  // A submission this long is not a valid submission; the hex step must still accept it.
  const deliveryFrame = (field: string) =>
    new TextEncoder().encode(
      JSON.stringify([
        'done/account-delivery/v1',
        1,
        route.workspace,
        A,
        A,
        1,
        1,
        base.authority.lineage,
        base.authority.head,
        'submission',
        1,
        field,
      ]),
    );
  let reached: unknown;
  try {
    decodeDeliveryEntry(deliveryFrame(hex(wire)), route, base.authority);
  } catch (cause) {
    reached = cause;
  }
  expect(String(reached)).not.toContain('Invalid delivery wire');
  for (const [name, value] of malformed(hex(wire)))
    expect(() => decodeDeliveryEntry(deliveryFrame(value), route, base.authority), name).toThrow(
      'Invalid delivery wire',
    );
}, 60000);

it('source capsules refuse malformed update hex and accept their largest valid field', () => {
  emulateWebKit();
  // The capsule bound keeps this field under the WebKit limit; its semantics are pinned anyway.
  const doc = new Y.Doc({ gc: false });
  doc.getText('t').insert(0, 'q'.repeat(1024 * 1024 - 4096));
  const bytes = new Uint8Array(Y.encodeStateAsUpdate(doc));
  doc.destroy();
  const capsule = {
    ...route,
    v: 1 as const,
    id: '0a'.repeat(16),
    sources: [{ actor: A, kind: 'human' as const, bytes }],
  };
  const encoded = encodeSourceCapsule(capsule);
  expect(same(decodeSourceCapsule(encoded, route).sources[0]!.bytes, bytes)).toBe(true);
  const wire = JSON.parse(new TextDecoder().decode(encoded));
  for (const [name, value] of malformed(hex(bytes))) {
    wire[8][0][2] = value;
    expect(
      () => decodeSourceCapsule(new TextEncoder().encode(JSON.stringify(wire)), route),
      name,
    ).toThrow('unreadable');
  }
}, 60000);

it('a local baseline with a snapshot field past the WebKit limit encodes, self-decodes and authenticates', () => {
  emulateWebKit();
  const released = JSON.parse(
    readFileSync(
      new URL('./local-baseline/released-baseline-vector.json', import.meta.url),
      'utf8',
    ),
  );
  const b = decodeLocalBaseline(new Uint8Array(Buffer.from(released.v5.payload, 'hex')));
  const snapshot = new Uint8Array(PAST_WEBKIT / 2).fill(0x5a);
  const payload = encodeLocalBaseline({ ...b, snapshot });
  expect(same(decodeLocalBaseline(payload).snapshot, snapshot)).toBe(true);
  expect(baselineAuthenticationPayload(payload).length).toBeGreaterThan(payload.length);
  // The same field, malformed, is still an integrity refusal, never capacity.
  const text = new TextDecoder().decode(payload),
    field = hex(snapshot);
  for (const [name, value] of malformed(field).filter(([n]) => n !== 'empty'))
    expect(
      () => decodeLocalBaseline(new TextEncoder().encode(text.replace(field, value))),
      name,
    ).toThrow('Invalid inbound frame');
}, 60000);
