import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type {
  LocalRetentionRuntime,
  LocalRetentionStatus,
} from '../src/crdt/automaticLocalRetention';
import {
  LocalHistoryMaintenance,
  localHistoryCapacityMessage,
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
it('says which limit or condition parked maintenance, and falls back without a known cause (phase 543)', async () => {
  const kept = 'Your existing history is still in place.',
    recheck = 'It will check again after new writing or sync changes this device’s history.';
  const general = `History maintenance reached a preparation or snapshot size limit. ${kept} ${recheck}`;
  const cases: [LocalRetentionStatus['detail'] | Record<string, unknown> | undefined, string][] = [
    [undefined, general],
    [{ cause: 'a-later-cause', needed: 1, allowed: 2 }, general],
    [
      { cause: 'snapshot-size', needed: 9856614, allowed: 8388608 },
      `The smaller history snapshot would need 9.4 MiB, and this version saves snapshots of up to 8.0 MiB. ${kept} ${recheck}`,
    ],
    [
      { cause: 'snapshot-size' },
      `The smaller history snapshot is larger than this version saves. ${kept} ${recheck}`,
    ],
    [
      { cause: 'snapshot-sources', needed: 4100, allowed: 4096 },
      `More writing is waiting to be sent from this device than a smaller history snapshot can hold (4100 batches; up to 4096). ${kept} ${recheck}`,
    ],
    [
      { cause: 'snapshot-publishers', needed: 130, allowed: 128 },
      `This workspace has more writing devices than a smaller history snapshot can record (130; up to 128). ${kept} ${recheck}`,
    ],
    [
      { cause: 'resume-progress', needed: 34603008, allowed: 33554432 },
      `The progress this device saves to resume history maintenance is full (33.0 MiB; up to 32.0 MiB). ${kept} ${recheck}`,
    ],
    [
      { cause: 'resume-progress' },
      `The progress this device saves to resume history maintenance is full. ${kept} ${recheck}`,
    ],
    [
      { cause: 'resume-index', needed: 314572, allowed: 262128 },
      `The list of saved history maintenance progress is full (0.3 MiB; up to 0.2 MiB). ${kept} ${recheck}`,
    ],
    [
      { cause: 'resume-history', needed: 67108900, allowed: 67108864 },
      `Saved history on this device is too large to mark a point where maintenance can resume (more than 64.0 MiB). ${kept} ${recheck}`,
    ],
    [
      { cause: 'interrupted' },
      `History maintenance was interrupted by other work on this device and had no saved progress to resume from. ${kept} It will try again after new writing or sync changes this device’s history, or when you choose Check again.`,
    ],
  ];
  const f = await fixture();
  try {
    for (const [detail, text] of cases) {
      await f.update({
        phase: 'idle',
        reason: 'capacity',
        ...(detail ? { detail: detail as LocalRetentionStatus['detail'] } : {}),
      } as LocalRetentionStatus);
      expect(f.host.querySelector('p')!.textContent).toBe(text);
      // Every cause keeps the existing attention notice and the Check again action.
      expect(f.host.querySelector('summary')!.textContent).toContain('Maintenance paused');
      expect(f.host.querySelector('button')!.textContent).toBe('Check again');
    }
    expect(cases.at(-1)![1]).not.toContain('limit');
  } finally {
    await f.close();
  }
});
it('names an installed service snapshot that no longer fits on re-check (phase 544)', () => {
  expect(
    localHistoryCapacityMessage({
      cause: 'installed-snapshot',
      needed: 4_300_000,
      allowed: 4_194_304,
    }),
  ).toBe(
    'A service history snapshot installed on this device needs 4.1 MiB to check, and this version checks snapshots of up to 4.0 MiB. Your existing history is still in place. It will check again after new writing or sync changes this device’s history.',
  );
  expect(localHistoryCapacityMessage({ cause: 'installed-snapshot' })).toBe(
    'A service history snapshot installed on this device is larger than this version checks. Your existing history is still in place. It will check again after new writing or sync changes this device’s history.',
  );
});
it('says a saved account step blocks reduction, keeps writing safe and offers Check again (phase 546)', async () => {
  const f = await fixture();
  try {
    await f.update({ phase: 'idle', reason: 'durable-attempt' });
    expect(f.host.querySelector('p')!.textContent).toBe(
      'An unfinished account step saved on this device, such as a service history snapshot, a device approval or a device removal, has to finish before history here can be reduced. Your existing history is still in place. It will check again after new writing or sync changes this device’s history, or when you choose Check again.',
    );
    expect(f.host.querySelector('summary')!.textContent).toContain('Maintenance paused');
    expect(f.host.querySelector('details')!.open).toBe(false);
    await act(async () => f.host.querySelector('button')!.click());
    expect(f.retry).toHaveBeenCalledOnce();
    await f.update({ phase: 'waiting', reason: 'durable-attempt' });
    expect(f.host.querySelector('button')!.disabled).toBe(true);
  } finally {
    await f.close();
  }
});
