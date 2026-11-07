// @vitest-environment node
/** These are reference/lifetime routing checks; actual approval verification is exercised in browser. */
import { afterEach, expect, it, vi } from 'vitest';
import {
  holdWorkerCeremonyOpening,
  type WorkerCeremonyOpening,
} from '../src/crdt/workerCeremonyOpening';
import type { AuthorityPin } from '../account-protocol/authority';
const pin = (): AuthorityPin => ({
  v: 1,
  serviceId: 'ab'.repeat(16),
  origin: 'http://localhost:53781',
  rpId: 'localhost',
  authRoot: 'cd'.repeat(32),
});
const promotion = () => Object.freeze({ kind: 'fresh-promotion-opening' as const });
const fixture = () => ({
  slotId: 'fictional',
  pin: pin(),
  promotionOpening: promotion(),
  close: vi.fn(),
});
afterEach(() => vi.unstubAllGlobals());
it('refuses Window execution without reading an alleged approval', () => {
  vi.stubGlobal('window', {});
  const read = vi.fn();
  expect(() =>
    holdWorkerCeremonyOpening({
      get slotId() {
        read();
        return 'fictional';
      },
    } as never),
  ).toThrow('Native ceremony opening required');
  expect(read).not.toHaveBeenCalled();
});
it('captures original approval references and pin synchronously without serializing a permission', async () => {
  const input = fixture(),
    original = input.promotionOpening,
    p = pin(),
    held = holdWorkerCeremonyOpening(input);
  input.pin.authRoot = 'ef'.repeat(32);
  input.slotId = 'changed';
  input.promotionOpening = promotion();
  const opened = held.take({ slotId: 'fictional', pin: p, joined: false });
  expect(opened.promotionOpening).toBe(original);
  expect(opened.promotionOpening).not.toBe(input.promotionOpening);
  await held.close();
  expect(input.close).toHaveBeenCalledOnce();
});
it('wrong slot, authority or joined mode cannot consume an approval', async () => {
  const input = fixture(),
    held = holdWorkerCeremonyOpening(input),
    options = { slotId: 'fictional', pin: pin(), joined: false };
  for (const wrong of [
    { ...options, slotId: 'other' },
    { ...options, pin: { ...pin(), authRoot: 'ef'.repeat(32) } },
    { ...options, joined: true },
  ])
    expect(() => held.take(wrong)).toThrow('scope changed');
  expect(held.take(options).promotionOpening).toBe(input.promotionOpening);
  expect(() => held.take(options)).toThrow('scope changed');
  await held.close();
});
it('recovery references retain their joined-only destination rule', async () => {
  const opening = { kind: 'fresh-recovery-opening' as const },
    held = holdWorkerCeremonyOpening({
      slotId: 'fictional',
      pin: pin(),
      recoveryOpening: opening,
      close: vi.fn(),
    });
  expect(() => held.take({ slotId: 'fictional', pin: pin(), joined: false })).toThrow();
  expect(held.take({ slotId: 'fictional', pin: pin(), joined: true }).recoveryOpening).toBe(
    opening,
  );
  await held.close();
});
it('absent or ambiguous approval and serialized login copies refuse before native opening', () => {
  const input = fixture();
  expect(() =>
    holdWorkerCeremonyOpening({ ...input, promotionOpening: undefined } as never),
  ).toThrow();
  expect(() =>
    holdWorkerCeremonyOpening({
      ...input,
      recoveryOpening: { kind: 'fresh-recovery-opening' },
    } as WorkerCeremonyOpening),
  ).toThrow();
  expect(() =>
    holdWorkerCeremonyOpening({ ...input, networkLogin: { initialize: () => {} } } as never),
  ).toThrow();
});
it('memoized retirement drains the original owner and prevents further consumption', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    input = { ...fixture(), close: vi.fn(() => gate) },
    held = holdWorkerCeremonyOpening(input),
    first = held.close(),
    second = held.close();
  expect(second).toBe(first);
  expect(input.close).toHaveBeenCalledOnce();
  expect(() => held.take({ slotId: 'fictional', pin: pin(), joined: false })).toThrow();
  let done = false;
  void first.then(() => (done = true));
  await Promise.resolve();
  expect(done).toBe(false);
  release();
  await first;
  expect(done).toBe(true);
});
it('retirement errors remain failures rather than reusable approval', async () => {
  const held = holdWorkerCeremonyOpening({
    ...fixture(),
    close: () => {
      throw Error('native retirement failed');
    },
  });
  await expect(held.close()).rejects.toThrow('native retirement failed');
  expect(() => held.take({ slotId: 'fictional', pin: pin(), joined: false })).toThrow();
});
