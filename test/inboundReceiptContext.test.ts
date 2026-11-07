// @vitest-environment node
import { expect, it } from 'vitest';
import * as codec from '../src/crdt/inboundRecord';
import * as floor from '../src/crdt/inboundReceiptVersion';
import { StorageCompatibilityError } from '../src/crdt/storageCompatibility';
import { verifyStoredInbound } from '../src/crdt/accountInbound';
import { heldInboundContext } from '../src/crdt/inboundLedger';
import { context, eventWire, live } from './account-inbound-codecs/oracle';
import { sources } from './account-inbound/fixtures';
import { pageFixture, referenceBytes } from './inbound-page/fixtures';
// @ts-expect-error Existing independent Node/OpenSSL carrier oracle.
import { fixture, bytes } from './account-ledger-contract/oracle.mjs';
it('binary syntax requires this authenticated scope floor; legacy syntax does not', () => {
  const dense = referenceBytes(pageFixture().record);
  expect(() => codec.captureScopedInboundReceiptSyntax(dense, {})).toThrow(
    StorageCompatibilityError,
  );
  expect(
    codec.captureScopedInboundReceiptSyntax(dense, { inboundReceiptVersion: 1 })!.receipt.kind,
  ).toBe('page');
  const legacy = eventWire(sources().entries[0]!);
  expect(codec.captureScopedInboundReceiptSyntax(legacy, {})!.receipt.kind).toBe('legacy');
  expect(
    codec.captureScopedInboundReceiptSyntax(legacy, { inboundReceiptVersion: 1 })!.receipt.kind,
  ).toBe('legacy');
});
it('retained reading uses its own floor and cannot borrow a marked native parent', () => {
  const parent = { ...context(), inboundReceiptVersion: 1 as const };
  const old = floor.withInboundReceiptScope(parent, {});
  expect(Object.hasOwn(old, 'inboundReceiptVersion')).toBe(false);
  expect(old.generationKey).toBe(parent.generationKey);
  expect(parent.inboundReceiptVersion).toBe(1);
  const marked = floor.withInboundReceiptScope(context(), { inboundReceiptVersion: 1 });
  expect(marked.inboundReceiptVersion).toBe(1);
  const dense = referenceBytes(pageFixture().record);
  expect(() => codec.captureScopedInboundReceiptSyntax(dense, old)).toThrow(
    StorageCompatibilityError,
  );
  expect(codec.captureScopedInboundReceiptSyntax(dense, marked)!.receipt.kind).toBe('page');
});
it('unknown floors are refused by verifier capture even for a valid legacy receipt', async () => {
  const raw = eventWire(sources().entries[0]!);
  for (const value of [undefined, 0, 2, '1', null]) {
    const c = { ...context(), inboundReceiptVersion: value };
    await expect(verifyStoredInbound(c as never, raw, live)).rejects.toBeInstanceOf(
      StorageCompatibilityError,
    );
  }
});
it('floor capture never invokes an accessor or accepts an inherited floor', async () => {
  let reads = 0;
  const inherited = Object.create({ inboundReceiptVersion: 1 });
  const accessor = Object.defineProperty({}, 'inboundReceiptVersion', {
    enumerable: true,
    get() {
      reads++;
      return 1;
    },
  });
  for (const scope of [inherited, accessor]) {
    expect(() => floor.withInboundReceiptScope(context(), scope)).toThrow(
      StorageCompatibilityError,
    );
    expect(() =>
      codec.captureScopedInboundReceiptSyntax(referenceBytes(pageFixture().record), scope),
    ).toThrow(StorageCompatibilityError);
  }
  expect(reads).toBe(0);
});
it('native original context takes the floor from its real authenticated marker input', async () => {
  const f = fixture(),
    marker = structuredClone(f.promotion);
  marker.credentials[1].publicKey = bytes(marker.credentials[1].publicKey);
  const old = await heldInboundContext(marker, bytes(f.kg), crypto.subtle);
  expect(Object.hasOwn(old, 'inboundReceiptVersion')).toBe(false);
  const marked = await heldInboundContext(
    { ...marker, inboundReceiptVersion: 1 },
    bytes(f.kg),
    crypto.subtle,
  );
  expect(marked.inboundReceiptVersion).toBe(1);
  expect(marked.baseline).toEqual(old.baseline);
  old.generationKey.fill(0);
  marked.generationKey.fill(0);
});
it('marked and legacy verifier contexts preserve exact legacy stored bytes and plaintext', async () => {
  const raw = eventWire(sources().entries[0]!);
  const old = await verifyStoredInbound(context(), raw, live);
  const marked = await verifyStoredInbound({ ...context(), inboundReceiptVersion: 1 }, raw, live);
  expect(old).toEqual(marked);
  expect(old.kind).toBe('received');
  for (const r of [old, marked]) {
    if ('record' in r) {
      expect(r.record).toEqual(raw);
      r.record.fill(0);
    }
    if (r.kind === 'received') for (const u of r.updates) u.fill(0);
  }
});
