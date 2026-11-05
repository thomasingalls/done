// @vitest-environment node
import { beforeAll, afterAll, expect, it } from 'vitest';
import * as receipt from '../src/crdt/inboundRecord';
import { captureMembershipReading } from '../src/crdt/membershipReading';
import { StorageCompatibilityError } from '../src/crdt/storageCompatibility';
import type { InboundReceiptVersion } from '../src/crdt/inboundReceiptVersion';
import { Y, genesisCoverage, genesisCoverageParts } from '../src/crdt/yjs';
import { createContentCheckpoint } from '../src/crdt/contentCheckpoint';
import { verifyMembershipChain } from '../account-protocol/membershipLocator';
import { historyMembership } from '../account-protocol/admissionHistory';
import { A, B, sources } from './account-inbound/fixtures';
import { eventWire, hex } from './account-inbound-codecs/oracle';
import { pageFixture, referenceBytes } from './inbound-page/fixtures';
// @ts-expect-error Shared genuine checkpoint/history oracle; no app authority is stubbed.
import { sourceFixture } from './account-membership/replacement-source-fixture.mjs';
const scope = { inboundReceiptVersion: 1 as const };
const work = (wire: string, floor: InboundReceiptVersion = scope): number => {
  const fn = (
    receipt as typeof receipt & {
      inboundReceiptEventWork?: (wire: string, scope: InboundReceiptVersion) => number;
    }
  ).inboundReceiptEventWork;
  return fn ? fn(wire, floor) : 1; // Existing reading bounds count one physical event.
};
let source: Awaited<ReturnType<typeof sourceFixture>>;
beforeAll(async () => {
  source = await sourceFixture({
    client: {
      Y,
      genesisCoverage,
      genesisCoverageParts,
      createContentCheckpoint,
      verifyMembershipChain,
      historyMembership,
    },
  });
});
afterAll(() => source?.cleanup());
const stream = (events: string[], publisher = A) => ({
  publisher,
  events,
  prefix: { position: 0, link: '00'.repeat(32), observedThrough: 0 },
});
const reading = (streams = [stream([])], floor: InboundReceiptVersion = scope) => ({
  v: 2,
  epoch: source.input.history.current.tip,
  head: source.input.history.current.head,
  checkpoint: source.input.checkpoint,
  admission: null,
  streams,
  ...floor,
});
it('counts all72 admitted extents by their original entry count, while legacy v1 and v2 stay one', () => {
  let cases = 0;
  for (const publisher of [A, B])
    for (let first = 0; first < 8; first++)
      for (let count = 1; first + count <= 8; count++) {
        expect(work(hex(referenceBytes(pageFixture(publisher, 8, first, count).record)))).toBe(
          count,
        );
        cases++;
      }
  expect(cases).toBe(72);
  expect(work(hex(eventWire(sources().entries[0]!)), {})).toBe(1);
  const f = pageFixture(),
    p = JSON.parse(
      Buffer.from(
        eventWire(f.entries[0]!, undefined, { request: f.record.request, page: f.record.page }),
      ).toString(),
    );
  p[0] = 'done/account-inbound/v2';
  p[1] = 2;
  p.push(0);
  expect(work(hex(new Uint8Array(Buffer.from(JSON.stringify(p)))), {})).toBe(1);
});
it('requires this reading floor, refuses future binary versions and never invokes a floor accessor', () => {
  const raw = referenceBytes(pageFixture().record),
    wire = hex(raw);
  expect(() => work(wire, {})).toThrow(StorageCompatibilityError);
  raw[27] = 50;
  expect(() => work(hex(raw))).toThrow(StorageCompatibilityError);
  let calls = 0;
  const getter = Object.defineProperty({}, 'inboundReceiptVersion', {
    enumerable: true,
    get() {
      calls++;
      return 1;
    },
  });
  expect(() => work(wire, getter)).toThrow(StorageCompatibilityError);
  expect(calls).toBe(0);
});
it('bounds the fixed header before any logical expansion, including safe integer and length limits', () => {
  const raw = referenceBytes(pageFixture().record);
  const alter = [
    (b: Uint8Array) => {
      b[230] = 0;
    },
    (b: Uint8Array) => {
      b[230] = 9;
    },
    (b: Uint8Array) => {
      b[229] = 7;
      b[230] = 2;
    },
    (b: Uint8Array) => {
      new DataView(b.buffer).setBigUint64(157, BigInt(Number.MAX_SAFE_INTEGER));
    },
    (b: Uint8Array) => {
      new DataView(b.buffer).setUint32(231, 0);
    },
    (b: Uint8Array) => {
      new DataView(b.buffer).setUint32(235, 0xffffffff);
    },
  ];
  for (const mutate of alter) {
    const b = raw.slice();
    mutate(b);
    expect(() => work(hex(b))).toThrow();
  }
  expect(() => work(hex(raw.slice(0, -1)))).toThrow();
});
it('enforces4096 logical positions at capture although512 page rows fit the physical bound', () => {
  const wire = hex(referenceBytes(pageFixture().record));
  expect(
    captureMembershipReading(reading([stream(Array(512).fill(wire))])).streams[0]!.events,
  ).toHaveLength(512);
  expect(() => captureMembershipReading(reading([stream(Array(513).fill(wire))]))).toThrow(
    'history limit',
  );
});
it('applies the logical ceiling across independent streams, keeping the old physical ceiling too', () => {
  const wire = hex(referenceBytes(pageFixture().record));
  expect(
    captureMembershipReading(
      reading([stream(Array(256).fill(wire)), stream(Array(256).fill(wire), B)]),
    ).streams,
  ).toHaveLength(2);
  expect(() =>
    captureMembershipReading(
      reading([stream(Array(257).fill(wire)), stream(Array(256).fill(wire), B)]),
    ),
  ).toThrow('history limit');
  expect(() => captureMembershipReading(reading([stream(Array(4097).fill('00'))], {}))).toThrow(
    'history limit',
  );
});
it('preserves the64stream limit and legacy opaque capture before its existing full replay', () => {
  const streams = Array.from({ length: 64 }, (_, i) =>
    stream(['00'], i.toString(16).padStart(32, '0')),
  );
  expect(captureMembershipReading(reading(streams, {})).streams).toHaveLength(64);
  expect(() => captureMembershipReading(reading([...streams, stream(['00'])], {}))).toThrow(
    'Invalid later reader state',
  );
  expect(work('00', {})).toBe(1);
  expect(captureMembershipReading(reading([stream(['00'])], {})).streams[0]!.events).toEqual([
    '00',
  ]);
});
it('a work bound grants no content validity: the full codec still refuses a corrupt signed body', () => {
  const raw = referenceBytes(pageFixture().record);
  raw[raw.length - 1]! ^= 1;
  expect(work(hex(raw))).toBe(8);
  expect(() => receipt.decodeInboundPageRecord(raw)).toThrow();
});
