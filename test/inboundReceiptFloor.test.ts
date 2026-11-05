// @vitest-environment node
import { expect, it } from 'vitest';
import fc from 'fast-check';
import {
  captureInboundReceiptVersion,
  inboundReceiptVersionFields,
  inboundReceiptMacTail,
  requireMonotonicInboundReceiptVersion,
} from '../src/crdt/inboundReceiptVersion';
import {
  parsePromotion,
  parseStoredPromotion,
  promotionPayload,
  signPromotion,
  storePromotion,
  writePromotion,
  type PromotionRecord,
} from '../src/crdt/promotionRecord';
import { StorageCompatibilityError } from '../src/crdt/storageCompatibility';
// @ts-expect-error Shared independent Node/OpenSSL contract oracle, not a runtime codec.
import * as oracle from './account-promotion-contract/oracle.mjs';
const { fixture, record, stages, message, key, mac, bytes, hex } = oracle;
const f = fixture();
const original = (v = 9, stage = 'account-receiving') => record(f, v, stage) as PromotionRecord;
const marked = () => ({ ...original(), inboundReceiptVersion: 1 as const });

it('legacy promotion MAC bytes and authentication remain exact at every original stage', async () => {
  for (const [v, stage] of stages) {
    const r = original(v, stage),
      signed = await signPromotion(bytes(f.root), r, crypto.subtle);
    expect(promotionPayload(signed)).toEqual(new Uint8Array(message(r)));
    expect(hex(signed.mac)).toBe(mac(key(f.root, r), message(r)));
    expect(Object.hasOwn(parsePromotion(signed), 'inboundReceiptVersion')).toBe(false);
    expect(parseStoredPromotion(storePromotion(signed))).toEqual(signed);
  }
});
it('the approved tagged floor extends, and is authenticated after, the exact old tuple', async () => {
  const r = original(),
    old = JSON.parse(Buffer.from(message(r)).toString()),
    expected = Buffer.from(JSON.stringify([...old, ['inboundReceiptVersion', 1]])),
    signed = await signPromotion(bytes(f.root), marked(), crypto.subtle);
  expect(promotionPayload(signed)).toEqual(new Uint8Array(expected));
  expect(hex(signed.mac)).toBe(mac(key(f.root, r), expected));
  expect(hex(signed.mac)).not.toBe(mac(key(f.root, r), message(r)));
  expect(parseStoredPromotion(storePromotion(signed)).inboundReceiptVersion).toBe(1);
});
it('the extension cannot be confused with any old optional promotion tail', () => {
  for (const [v, stage] of stages) {
    const old = JSON.parse(Buffer.from(message(original(v, stage))).toString()),
      extension = inboundReceiptMacTail(marked())[0];
    expect(old.at(-1)).not.toEqual(extension);
    expect(old.some((field: unknown) => JSON.stringify(field) === JSON.stringify(extension))).toBe(
      false,
    );
  }
  // The only old explicitly tagged optional tail has a different closed tag/value type.
  const bootstrap = { ...original(6, 'account-capturing'), captureBootstrap: 'ab'.repeat(32) };
  expect(JSON.parse(new TextDecoder().decode(promotionPayload(bootstrap))).at(-1)).toEqual([
    'capture-bootstrap',
    'ab'.repeat(32),
  ]);
  expect(
    JSON.parse(
      new TextDecoder().decode(promotionPayload({ ...bootstrap, inboundReceiptVersion: 1 })),
    ).slice(-2),
  ).toEqual([
    ['capture-bootstrap', 'ab'.repeat(32)],
    ['inboundReceiptVersion', 1],
  ]);
});
it('unknown, undefined, nonnumeric and inherited floors refuse as update-required', () => {
  fc.assert(
    fc.property(fc.anything(), (value) => {
      if (value === 1) return;
      expect(() => captureInboundReceiptVersion({ inboundReceiptVersion: value })).toThrow(
        StorageCompatibilityError,
      );
      expect(() => parsePromotion({ ...original(), inboundReceiptVersion: value })).toThrow(
        StorageCompatibilityError,
      );
    }),
    { seed: 376, numRuns: 160 },
  );
  for (const value of [undefined, null, false, '1', -0, 0, 2, NaN, Infinity])
    expect(() => inboundReceiptVersionFields({ inboundReceiptVersion: value })).toThrow(
      StorageCompatibilityError,
    );
  expect(() => captureInboundReceiptVersion(Object.create({ inboundReceiptVersion: 1 }))).toThrow(
    StorageCompatibilityError,
  );
});
it('a floor accessor is refused without invoking it or dropping the field', () => {
  let calls = 0;
  const r = original();
  Object.defineProperty(r, 'inboundReceiptVersion', {
    enumerable: true,
    get() {
      calls++;
      return 1;
    },
  });
  expect(() => parsePromotion(r)).toThrow(StorageCompatibilityError);
  expect(() => promotionPayload(r)).toThrow(StorageCompatibilityError);
  expect(calls).toBe(0);
});
it('absence stays absent, upgrades and same-version rewrites work, and removal/downgrade refuses', () => {
  expect(captureInboundReceiptVersion(original())).toEqual({});
  expect(inboundReceiptMacTail(original())).toEqual([]);
  expect(inboundReceiptVersionFields(marked())).toEqual(['inboundReceiptVersion']);
  for (const [before, after] of [
    [null, original()],
    [original(), original()],
    [original(), marked()],
    [marked(), marked()],
  ])
    expect(() => requireMonotonicInboundReceiptVersion(before, after)).not.toThrow();
  for (const after of [null, {}, original()])
    expect(() => requireMonotonicInboundReceiptVersion(marked(), after)).toThrow(
      StorageCompatibilityError,
    );
});
it('the native promotion writer refuses floor loss before touching a task or custody storage', async () => {
  let touched = 0;
  const task = {
    step() {
      touched++;
      throw Error('must not reach storage');
    },
  };
  await expect(
    writePromotion(task as never, {} as never, {} as never, {} as never, marked(), original()),
  ).rejects.toThrow(StorageCompatibilityError);
  expect(touched).toBe(0);
});
