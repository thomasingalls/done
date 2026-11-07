// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { followWorkerNativeLifetime } from '../src/crdt/workerNativeLifetime';
it('native withdrawal retires the Worker channel synchronously and once', () => {
  const owner = new AbortController(),
    root = new AbortController(),
    events: string[] = [];
  followWorkerNativeLifetime({ signal: owner.signal }, root.signal, () => {
    events.push('retire');
    root.abort();
    owner.abort();
  });
  owner.abort();
  events.push('abort-returned');
  owner.abort();
  expect(events).toEqual(['retire', 'abort-returned']);
});
it('an already-withdrawn native owner cannot publish an active mirror', () => {
  const owner = new AbortController(),
    root = new AbortController(),
    retire = vi.fn();
  owner.abort();
  followWorkerNativeLifetime({ signal: owner.signal }, root.signal, retire);
  expect(retire).toHaveBeenCalledTimes(1);
});
it('ordinary root shutdown removes the native listener before draining its owner', () => {
  const owner = new AbortController(),
    root = new AbortController(),
    retire = vi.fn(),
    remove = vi.spyOn(owner.signal, 'removeEventListener');
  followWorkerNativeLifetime({ signal: owner.signal }, root.signal, retire);
  root.abort();
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  owner.abort();
  expect(retire).not.toHaveBeenCalled();
});
it('an already-closed root installs no native observer', () => {
  const owner = new AbortController(),
    root = new AbortController(),
    retire = vi.fn(),
    add = vi.spyOn(owner.signal, 'addEventListener');
  root.abort();
  followWorkerNativeLifetime({ signal: owner.signal }, root.signal, retire);
  expect(add).not.toHaveBeenCalled();
  owner.abort();
  expect(retire).not.toHaveBeenCalled();
});
it('explicit disposal is idempotent and cannot retain a detached root listener', () => {
  const owner = new AbortController(),
    root = new AbortController(),
    retire = vi.fn(),
    remove = vi.spyOn(root.signal, 'removeEventListener');
  const binding = followWorkerNativeLifetime({ signal: owner.signal }, root.signal, retire);
  binding.close();
  binding.close();
  owner.abort();
  root.abort();
  expect(retire).not.toHaveBeenCalled();
  expect(remove).toHaveBeenCalledTimes(1);
});
it('a refused native signal cannot install listeners or retire the root', () => {
  const root = new AbortController(),
    add = vi.spyOn(root.signal, 'addEventListener'),
    retire = vi.fn();
  expect(() =>
    followWorkerNativeLifetime({ signal: {} as AbortSignal }, root.signal, retire),
  ).toThrow('lifetime');
  expect(add).not.toHaveBeenCalled();
  expect(retire).not.toHaveBeenCalled();
});
