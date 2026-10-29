// @vitest-environment node
/** Constructor/data boundary only; native lifetime and mirror paths use real browser checks. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createWindowCeremonyUi, type WindowCeremonyUiOptions } from '../src/ui/windowCeremonyUi';
import type { SetupConfig } from '../src/account/setupProgress';
const config: SetupConfig = {
  networkSessions: true,
  pin: {
    v: 1,
    origin: 'https://ceremony.test',
    rpId: 'ceremony.test',
    serviceId: 'ab'.repeat(16),
    authRoot: 'cd'.repeat(32),
  },
};
beforeEach(() => vi.stubGlobal('location', { origin: config.pin.origin }));
afterEach(() => vi.unstubAllGlobals());
function options(data: unknown): WindowCeremonyUiOptions<{ kind: string }> {
  return {
    initial: { kind: 'initial' },
    closing: { kind: 'closing' },
    failure: () => ({ kind: 'failed' }),
    fields: ['state'],
    capture: () => ({ kind: 'captured' }),
    editing: () => false,
    worker: vi.fn(),
    bootstrapKind: 'fixed-test-bootstrap',
    expectedJoined: false,
    captureCommand: (v) => v,
    data,
  };
}
it('rejects oversized backing allocation before a Worker or Window root can be started', () => {
  const input = options({ bytes: new Uint8Array(new ArrayBuffer(1024 * 1024 + 1), 0, 1) });
  expect(() => createWindowCeremonyUi(config, 'fixture', input)).toThrow();
  expect(input.worker).not.toHaveBeenCalled();
});
it('rejects accessors in untrusted bootstrap data without invoking them', () => {
  const getter = vi.fn(),
    input = options({
      get route() {
        return getter();
      },
    });
  expect(() => createWindowCeremonyUi(config, 'fixture', input)).toThrow();
  expect(getter).not.toHaveBeenCalled();
  expect(input.worker).not.toHaveBeenCalled();
});
it('constructing a valid presentation creates no Worker and closing before first command clears display state', async () => {
  const input = options({ route: 'fictional' }),
    owner = createWindowCeremonyUi(config, 'fixture', input);
  expect(owner.getSnapshot()).toEqual({ kind: 'initial' });
  expect(input.worker).not.toHaveBeenCalled();
  await owner.close();
  expect(owner.getSnapshot()).toEqual({ kind: 'closing' });
  expect(input.worker).not.toHaveBeenCalled();
});
