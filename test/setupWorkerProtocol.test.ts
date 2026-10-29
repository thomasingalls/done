import { expect, it, vi } from 'vitest';
import { captureSetupCommand, setupPresentation } from '../src/account/setupWorkerProtocol';
it('fixed commands reject unknown, extra, missing, accessor and oversized arguments', () => {
  expect(captureSetupCommand({ command: 'unlock', value: 'fictional' })).toEqual({
    command: 'unlock',
    value: 'fictional',
  });
  for (const value of [
    { command: 'arbitrary' },
    { command: 'unlock' },
    { command: 'passkey', value: 'extra' },
    { command: 'inspect', extra: true },
    { command: 'unlock', value: 'x'.repeat(4097) },
  ])
    expect(() => captureSetupCommand(value)).toThrow();
  const getter = vi.fn();
  expect(() =>
    captureSetupCommand({
      command: 'unlock',
      get value() {
        return getter();
      },
    }),
  ).toThrow();
  expect(getter).not.toHaveBeenCalled();
});
it('presentation projects only display fields without touching native workspace or login getters', () => {
  const getter = vi.fn(() => {
    throw Error('native value touched');
  });
  const view = setupPresentation({
    kind: 'ready',
    actorId: 'actor',
    accountId: 'fixture',
    get workspace() {
      return getter();
    },
    get devices() {
      return getter();
    },
    get sync() {
      return getter();
    },
    networkLogin: { private: 'not transported' },
  });
  expect(view).toEqual({ kind: 'ready', actorId: 'actor', accountId: 'fixture' });
  expect(getter).not.toHaveBeenCalled();
});
it('presentation owns nested disposition values and rejects invalid or accessor display fields', () => {
  const state = {
    kind: 'storage-blocked',
    disposition: { kind: 'repair-required', reason: 'fixture' },
  };
  const view = setupPresentation(state);
  state.disposition.reason = 'changed';
  expect(view).toMatchObject({ disposition: { reason: 'fixture' } });
  for (const value of [
    { kind: 'unknown' },
    { kind: 'save-device-code' },
    { kind: 'ready' },
    { kind: 'working', message: () => {} },
    { kind: 'intro', fresh: 'yes' },
  ])
    expect(() => setupPresentation(value)).toThrow();
  const getter = vi.fn();
  expect(() =>
    setupPresentation({
      kind: 'working',
      get message() {
        return getter();
      },
    }),
  ).toThrow();
  expect(getter).not.toHaveBeenCalled();
});
