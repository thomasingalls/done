import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type {
  LocalRetentionRuntime,
  LocalRetentionStatus,
} from '../src/crdt/automaticLocalRetention';
import {
  LocalHistoryMaintenance,
  localHistoryNeedsAttention,
  useLocalHistoryStatus,
} from '../src/ui/LocalHistoryMaintenance';
import { MenuSection } from '../src/ui/MenuSection';
async function fixture() {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let status: LocalRetentionStatus = Object.freeze({ phase: 'idle', reason: undefined });
  const observers = new Set<() => void>();
  const retry = vi.fn(() => true);
  const runtime: LocalRetentionRuntime = {
    get status() {
      return status;
    },
    retry,
    onStatus: (cb) => {
      observers.add(cb);
      return () => {
        observers.delete(cb);
      };
    },
  };
  function Panel() {
    const value = useLocalHistoryStatus(runtime)!;
    return (
      <MenuSection
        title="Data"
        notice={localHistoryNeedsAttention(value) ? 'Maintenance paused' : undefined}
      >
        <LocalHistoryMaintenance runtime={runtime} status={value} />
      </MenuSection>
    );
  }
  await act(async () => root.render(<Panel />));
  return {
    host,
    retry,
    observers,
    update: (next: LocalRetentionStatus) =>
      act(async () => {
        status = Object.freeze(next);
        for (const cb of observers) cb();
      }),
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
it('keeps ordinary deferrals quiet and preserves native collapsed Data', async () => {
  const f = await fixture();
  try {
    const data = f.host.querySelector('details')!;
    expect(data.open).toBe(false);
    for (const reason of [
      undefined,
      'activity-or-journal',
      'pending-promotion',
      'durable-attempt',
      'already-preparing',
    ]) {
      await f.update({ phase: 'idle', reason });
      expect(f.host.querySelector('summary')!.textContent).toBe('Data');
      expect(f.host.querySelector('[role=status]')).toBeNull();
      expect(f.host.querySelector('button')).toBeNull();
    }
  } finally {
    await f.close();
  }
});
for (const [reason, text] of [
  ['capacity', 'preparation or snapshot size limit'],
  ['history-required', 'history needed'],
  ['ineligible', 'not ready for a safe reduction'],
] as const)
  it(`shows actionable ${reason} without claiming removal or forcing the section open`, async () => {
    const f = await fixture();
    try {
      await f.update({ phase: 'idle', reason });
      expect(f.host.querySelector('summary')!.textContent).toContain('Maintenance paused');
      expect(f.host.textContent).toContain(text);
      expect(f.host.querySelector('details')!.open).toBe(false);
      await act(async () => f.host.querySelector('button')!.click());
      expect(f.retry).toHaveBeenCalledOnce();
      await f.update({ phase: 'waiting', reason });
      expect(f.host.querySelector('button')!.disabled).toBe(true);
      expect(f.host.textContent).toContain('retry delay');
      await f.update({ phase: 'running', reason });
      expect(f.host.textContent).toContain('Checking and reducing');
      await f.update({ phase: 'idle', reason: undefined });
      expect(f.host.querySelector('summary')!.textContent).toBe('Data');
    } finally {
      await f.close();
    }
  });
it('asks for reopen on unexpected failure and offers no retry or data-erasure action', async () => {
  const f = await fixture();
  try {
    await f.update({ phase: 'halted', reason: 'owner-error' });
    expect(f.host.textContent).toContain('Lock and reopen');
    expect(f.host.textContent).not.toContain('writing is safe');
    expect(f.host.querySelector('button')).toBeNull();
    await f.update({ phase: 'closed', reason: 'owner-error' });
    expect(f.host.querySelector('section')).toBeNull();
  } finally {
    await f.close();
  }
  expect(f.observers.size).toBe(0);
});
