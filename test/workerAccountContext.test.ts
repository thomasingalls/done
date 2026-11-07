// @vitest-environment node
/** Same-realm reference routing; native factor and approval verification remain separate. */
import { afterEach, expect, it, vi } from 'vitest';
import {
  holdWorkerAccountContext,
  type WorkerAccountContext,
} from '../src/crdt/workerAccountContext';
import { createWindowSetupActorBridge } from '../src/crdt/setupActorBridge';
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const stop = new AbortController(),
    input: WorkerAccountContext = {
      slotId: 'fixture',
      pin: {
        v: 1,
        origin: 'http://localhost:53781',
        rpId: 'localhost',
        serviceId: 'ab'.repeat(16),
        authRoot: 'cd'.repeat(32),
      },
      joined: false,
      code: 'fictional factor',
      identity: {
        id: 'actor',
        actor: { kind: 'human', name: 'You', color: '#e0662f' },
        device: { id: 'device', name: 'Fixture' },
      },
      assertPasskey: vi.fn(),
      signal: stop.signal,
      composed: vi.fn(),
      close: vi.fn(),
    };
  const options = {
    slotId: input.slotId,
    pin: structuredClone(input.pin),
    code: input.code,
    identity: structuredClone(input.identity),
    joined: false,
    networkSessions: true,
    composed: true,
  };
  return { input, options, stop };
}
it('captures exact native callback and owned scope, uses one composition and retires once', () => {
  const f = fixture(),
    held = holdWorkerAccountContext(f.input),
    callback = f.input.assertPasskey;
  f.input.pin.authRoot = 'ef'.repeat(32);
  f.input.identity.actor.name = 'Changed';
  expect(held.take(f.options)).toBe(callback);
  expect(() => held.take(f.options)).toThrow('scope changed');
  const value = {} as Parameters<typeof held.composed>[0],
    display = { actorName: vi.fn(), rename: vi.fn() };
  held.composed(value, display);
  expect(f.input.composed).toHaveBeenCalledExactlyOnceWith(value, display);
  expect(() => held.composed(value, display)).toThrow('composition changed');
  held.close();
  held.close();
  expect(f.input.close).toHaveBeenCalledOnce();
});
it('wrong slot, pin, factor, identity, role or mode cannot consume the scoped context', () => {
  const f = fixture(),
    held = holdWorkerAccountContext(f.input);
  for (const wrong of [
    { ...f.options, slotId: 'other' },
    { ...f.options, pin: { ...f.options.pin, authRoot: 'ef'.repeat(32) } },
    { ...f.options, code: 'other' },
    { ...f.options, identity: { ...f.options.identity, id: 'other' } },
    { ...f.options, joined: true },
    { ...f.options, composed: false },
    { ...f.options, networkSessions: false },
  ])
    expect(() => held.take(wrong)).toThrow('scope changed');
  expect(held.take(f.options)).toBe(f.input.assertPasskey);
});
it('closed or aborted context cannot publish a composition or return a callback', () => {
  const f = fixture(),
    held = holdWorkerAccountContext(f.input);
  f.stop.abort();
  expect(() => held.take(f.options)).toThrow();
  expect(f.input.composed).not.toHaveBeenCalled();
  held.close();
  const g = fixture(),
    other = holdWorkerAccountContext(g.input);
  other.close();
  expect(() => other.take(g.options)).toThrow('closed');
});
it('Window and copied login references refuse before callback effects', () => {
  const f = fixture();
  vi.stubGlobal('window', {});
  expect(() => holdWorkerAccountContext(f.input)).toThrow('Native account context required');
  vi.stubGlobal('window', undefined);
  expect(() => holdWorkerAccountContext({ ...f.input, networkLogin: {} as never })).toThrow(
    'changed',
  );
  expect(f.input.assertPasskey).not.toHaveBeenCalled();
});
it('display bridge refuses a forged canonical mirror before invoking any supplied workspace effect', () => {
  const read = vi.fn(),
    command = vi.fn();
  expect(() =>
    createWindowSetupActorBridge({ workspace: { read, command } } as never, {} as never, 'actor'),
  ).toThrow();
  expect(read).not.toHaveBeenCalled();
  expect(command).not.toHaveBeenCalled();
});
