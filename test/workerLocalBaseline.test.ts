// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { captureWorkerLocalBaselineCommand } from '../src/crdt/workerLocalBaseline';
it('captures only closed command data and detached revision before asynchronous work', () => {
  const input = { kind: 'advance', expectedRevision: 3 };
  const captured = captureWorkerLocalBaselineCommand(input);
  input.kind = 'install';
  input.expectedRevision = 9;
  expect(captured).toEqual({ kind: 'advance', expectedRevision: 3 });
  expect(captureWorkerLocalBaselineCommand({ kind: 'install' })).toEqual({ kind: 'install' });
});
it('rejects unknown operations and authority-looking extensions', () => {
  for (const input of [
    null,
    [],
    {},
    { kind: 'prune-server' },
    { kind: 'advance', verified: true },
    { kind: 'install', rootKey: new Uint8Array(32) },
    Object.assign(Object.create({}), { kind: 'advance' }),
  ])
    expect(() => captureWorkerLocalBaselineCommand(input)).toThrow('invalid');
});
it('rejects getters without evaluating them', () => {
  const get = vi.fn(() => 'advance'),
    input = {};
  Object.defineProperty(input, 'kind', { enumerable: true, get });
  expect(() => captureWorkerLocalBaselineCommand(input)).toThrow('invalid');
  expect(get).not.toHaveBeenCalled();
});
it('requires an exact positive safe revision when supplied', () => {
  for (const value of [undefined, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1'])
    expect(() =>
      captureWorkerLocalBaselineCommand({ kind: 'advance', expectedRevision: value }),
    ).toThrow('invalid');
});
