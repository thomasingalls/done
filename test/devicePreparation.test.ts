// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as genesis from '../src/crdt/localGenesis';
import { preparePendingDevice } from '../src/account/deviceEnrollment';
import type { StartupKind } from '../src/crdt/startupState';

const workspace = 'ab'.repeat(16),
  savedSlot = 'enrollment-' + 'cd'.repeat(16);
beforeEach(() => {
  const values: Record<string, string> = {};
  vi.stubGlobal(
    'localStorage',
    new Proxy(values, {
      get(target, key) {
        if (key === 'getItem') return (name: string) => target[name] ?? null;
        if (key === 'setItem')
          return (name: string, value: string) => {
            target[name] = value;
          };
        return target[key as string];
      },
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const messages: Partial<Record<StartupKind, RegExp>> = {
  'migration-required': /migration.*before.*connect/i,
  'app-update-required': /compatible app/i,
  clearing: /removal.*unfinished/i,
  cleared: /removed/i,
  'repair-required': /needs attention/i,
  'slot-closed': /closed/i,
  'identity-required': /identified/i,
  'unlock-failed': /could not.*unlock/i,
  busy: /another.*tab/i,
  unavailable: /could not read.*storage/i,
  unsupported: /browser.*secure storage/i,
  cancelled: /cancelled/i,
};

it.each([
  'migration-required',
  'app-update-required',
  'clearing',
  'cleared',
  'repair-required',
  'slot-closed',
  'identity-required',
  'unlock-failed',
  'busy',
  'unavailable',
  'unsupported',
  'cancelled',
] as const)(
  'reports the actual %s refusal without inventing a saved attempt or issuing a code',
  async (kind) => {
    const disposition = { kind, reason: 'retained-startup-reason' };
    vi.spyOn(genesis, 'inspectLocalStartup').mockResolvedValue(disposition);
    const begin = vi.spyOn(genesis, 'beginLocalGenesis');
    const error = await preparePendingDevice(workspace, new AbortController().signal).catch(
      (error) => error,
    );
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ disposition });
    expect(error.message).toMatch(messages[kind]!);
    expect(error.message).not.toMatch(/resume.*saved.*attempt/i);
    expect(begin).not.toHaveBeenCalled();
    expect(Object.keys(localStorage)).toEqual([]);
  },
);

it.each(['unlock-required', 'creation-pending'] as const)(
  'retains the real saved %s attempt and its established factor requirement',
  async (kind) => {
    localStorage.setItem('done.pending-device.' + workspace, savedSlot);
    const inspect = vi
      .spyOn(genesis, 'inspectLocalStartup')
      .mockResolvedValue({ kind, reason: 'existing-claim' });
    const begin = vi.spyOn(genesis, 'beginLocalGenesis');
    const error = await preparePendingDevice(workspace, new AbortController().signal).catch(
      (error) => error,
    );
    expect(error).toMatchObject({ disposition: { kind, reason: 'existing-claim' } });
    expect(error.message).toMatch(/saved device setup.*unlock code/i);
    expect(inspect).toHaveBeenCalledWith(savedSlot, { signal: expect.any(AbortSignal) });
    expect(begin).not.toHaveBeenCalled();
    expect(localStorage.getItem('done.pending-device.' + workspace)).toBe(savedSlot);
  },
);

it('issues only a transient code after a fresh inspection and retains the exact resulting route', async () => {
  vi.spyOn(genesis, 'inspectLocalStartup').mockResolvedValue({
    kind: 'fresh',
    reason: 'no-carriers',
  });
  const prepared = await preparePendingDevice(workspace, new AbortController().signal);
  try {
    expect(prepared.slot).toMatch(/^enrollment-[a-f0-9]{32}$/);
    expect(prepared.enrollment.displayCode).toBeTruthy();
    expect(localStorage.getItem('done.pending-device.' + workspace)).toBe(prepared.slot);
    expect(Object.values(localStorage)).not.toContain(prepared.enrollment.displayCode);
  } finally {
    prepared.enrollment.cancel();
  }
});
