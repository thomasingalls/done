// Phase 544: the history maintenance view says plainly when a snapshot is too large to install.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { AccountHistory, historyTooLargeMessage } from '../src/ui/AccountHistory';
import type {
  HistoryMaintenanceCommand,
  HistoryMaintenanceStatus,
} from '../src/account/historyMaintenance';

const allowed = 4 * 1024 * 1024;
it('says which snapshot is too large to install, with sizes, for each role', () => {
  const needed = 4_800_000;
  expect(historyTooLargeMessage({ snapshot: 'new', needed, allowed }, false)).toBe(
    'This workspace is too large for a history snapshot. Installing one on your other devices would take 4.6 MiB, and this version installs snapshots of up to 4.0 MiB. Nothing was saved or sent. Your writing is unchanged.',
  );
  expect(historyTooLargeMessage({ snapshot: 'saved', needed, allowed }, true)).toBe(
    'The saved snapshot is too large for your other devices to install (4.6 MiB; this version installs snapshots of up to 4.0 MiB), so it was not sent. Discard it. Your writing is unchanged.',
  );
  expect(historyTooLargeMessage({ snapshot: 'pending', needed, allowed }, true)).toBe(
    'The snapshot waiting for verification is too large for devices to install (4.6 MiB; this version installs snapshots of up to 4.0 MiB), so it was not verified. Discard it. Your writing is unchanged.',
  );
  expect(historyTooLargeMessage({ snapshot: 'pending', needed, allowed }, false)).toBe(
    'The snapshot waiting for verification is too large for devices to install (4.6 MiB; this version installs snapshots of up to 4.0 MiB), so it was not verified. It can be discarded from the device that made it. Your writing is unchanged.',
  );
  expect(historyTooLargeMessage({ snapshot: 'latest', needed, allowed }, false)).toBe(
    'The latest verified snapshot is too large for devices to install (4.6 MiB; this version installs snapshots of up to 4.0 MiB). Covered service history cannot be removed while it is the latest snapshot. Your writing is unchanged.',
  );
  // Sizes that round alike still read as more than the limit.
  expect(
    historyTooLargeMessage({ snapshot: 'new', needed: allowed + 3, allowed }, false),
  ).toContain('would take just over 4.0 MiB, and this version installs snapshots of up to 4.0 MiB');
});

it('offers no action that the too-large snapshot would refuse, and keeps discard where it helps', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let next: HistoryMaintenanceStatus = { sequence: 0, pending: 'none', canDiscard: false };
  const run = vi.fn(async (_command: HistoryMaintenanceCommand) => next);
  const buttons = () => [...host.querySelectorAll('button')].map((b) => b.textContent);
  const show = async (status: HistoryMaintenanceStatus) => {
    next = status;
    const check = [...host.querySelectorAll('button')].find(
      (b) => b.textContent === 'Check history',
    )!;
    await act(async () => check.click());
  };
  try {
    await act(async () => root.render(<AccountHistory run={run} />));
    await act(async () => host.querySelector('button')!.click());
    const needed = 4_800_000;
    await show({ sequence: 2, pending: 'none', canDiscard: false });
    expect(buttons()).toEqual([
      'History maintenance',
      'Check history',
      'Create history snapshot',
      'Prune covered history',
    ]);
    await show({
      sequence: 2,
      pending: 'none',
      canDiscard: false,
      tooLarge: { snapshot: 'latest', needed, allowed },
    });
    expect(host.textContent).toContain('The latest verified snapshot is too large');
    expect(buttons()).toEqual(['History maintenance', 'Check history']);
    await show({
      sequence: 0,
      pending: 'none',
      canDiscard: false,
      tooLarge: { snapshot: 'new', needed, allowed },
    });
    expect(host.textContent).toContain('This workspace is too large for a history snapshot.');
    expect(buttons()).toEqual(['History maintenance', 'Check history']);
    await show({
      sequence: 0,
      pending: 'resume',
      canDiscard: true,
      tooLarge: { snapshot: 'saved', needed, allowed },
    });
    expect(buttons()).toEqual([
      'History maintenance',
      'Check history',
      'Discard unfinished snapshot',
    ]);
    await show({
      sequence: 0,
      pending: 'verify',
      canDiscard: false,
      tooLarge: { snapshot: 'pending', needed, allowed },
    });
    expect(host.textContent).toContain('It can be discarded from the device that made it.');
    expect(buttons()).toEqual(['History maintenance', 'Check history']);
    expect(run.mock.calls.every(([command]) => command === 'inspect')).toBe(true);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
