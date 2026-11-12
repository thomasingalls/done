// Phase 544: the history maintenance view says plainly when a snapshot is too large to install.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import {
  AccountHistory,
  HISTORY_DISCARD_EFFECT,
  historyPositionsMessage,
  historyReplayMessage,
  historyStatusMessage,
  historyTooLargeMessage,
} from '../src/ui/AccountHistory';
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

// Phase 547: positions since the last verified snapshot, the replay bound, and Discard.
const bound = 4096;
it('says how many positions were accepted, warns past three quarters of the bound and says plainly past it', () => {
  const since = (n: number, verified = true) =>
    historyPositionsMessage({ since: n, allowed: bound }, verified);
  expect(since(3072)).toBe(
    'The service has accepted 3,072 positions (uploads from your devices) since the last verified snapshot.',
  );
  const warning =
    'A snapshot can cover at most 4,096, so make one soon: past that, no snapshot can be made and older service history can never be removed.';
  expect(since(3073)).toBe(
    `The service has accepted 3,073 positions (uploads from your devices) since the last verified snapshot. ${warning}`,
  );
  expect(since(4096, false)).toBe(
    `The service has accepted 4,096 positions (uploads from your devices) since this account began. ${warning}`,
  );
  expect(since(4097)).toBe(
    'The service has accepted 4,097 positions (uploads from your devices) since the last verified snapshot, more than the 4,096 a snapshot can cover. No snapshot can be made, so older service history cannot be removed. Your writing is unchanged.',
  );
});

it('names a replay past the bound, with both numbers, for creating and for verifying', () => {
  expect(historyReplayMessage({ snapshot: 'new', needed: 4097, allowed: bound }, false)).toBe(
    'Making a snapshot on this device would replay 4,097 positions, and a snapshot can replay at most 4,096. Nothing was saved or sent. Your writing is unchanged.',
  );
  expect(historyReplayMessage({ snapshot: 'pending', needed: 5000, allowed: bound }, false)).toBe(
    'Verifying this snapshot on this device would replay 5,000 positions, and a snapshot can replay at most 4,096, so it was not verified. It can be discarded from the device that made it. Your writing is unchanged.',
  );
  expect(
    historyReplayMessage({ snapshot: 'pending', needed: 5000, allowed: bound }, true),
  ).toContain('so it was not verified. Discard it. Your writing is unchanged.');
});

it('says where this device’s saved snapshot stands and what discarding affects', () => {
  const say = (status: Partial<HistoryMaintenanceStatus>) =>
    historyStatusMessage({ sequence: 1, pending: 'resume', canDiscard: true, ...status });
  const effect = HISTORY_DISCARD_EFFECT;
  expect(effect).toBe(
    'Discarding removes only this unfinished snapshot. Your writing, verified snapshots and other devices’ snapshots are not affected.',
  );
  expect(say({ saved: 'sendable' })).toBe(
    `This device has a saved snapshot that is not on the service. Resume to send it, or discard it. ${effect}`,
  );
  // Waiting for verification keeps the earlier sentences, which browser specs read.
  expect(say({ saved: 'waiting' })).toBe(`Saved snapshot progress is ready to resume. ${effect}`);
  expect(say({ saved: 'waiting', pending: 'waiting' })).toBe(
    `Snapshot saved. Verify it from another approved device. ${effect}`,
  );
  expect(say({ saved: 'blocked' })).toBe(
    `This device has a saved snapshot it cannot send, because another device’s snapshot is waiting for verification. Discard it here, then verify the other snapshot. ${effect}`,
  );
  expect(say({ saved: 'superseded' })).toBe(
    `This device has a saved snapshot that can no longer be sent, because the service has verified another snapshot since it was made. Discard it. ${effect}`,
  );
  expect(say({ saved: 'stale' })).toBe(
    `This device has a saved snapshot that can no longer be sent, because the account changed after it was made. Discard it. ${effect}`,
  );
  expect(say({ saved: 'cancelling' })).toBe(
    'A snapshot discarded on this device still has to be cancelled on the service. Finish discarding. Your writing is unchanged.',
  );
  expect(say({ saved: 'cancelling', pending: 'verify', canDiscard: false })).toBe(
    'A snapshot is ready for this device to verify. A snapshot discarded on this device will be cancelled on the service once the other device’s snapshot is verified or discarded.',
  );
  expect(say({ raced: true, pending: 'verify', canDiscard: false })).toBe(
    'Another device made a snapshot while this one was being prepared, so this one was not saved or sent. Your writing is unchanged. A snapshot is ready for this device to verify.',
  );
  // A stale proposal of another device's that this device may discard says the same.
  expect(say({ pending: 'stale' })).toBe(
    `The account changed. Discard this unfinished snapshot before preparing another. ${effect}`,
  );
  expect(
    say({ pending: 'none', canDiscard: false, positions: { since: 12, allowed: bound } }),
  ).toBe(
    'Verified snapshot 1 is saved. The service has accepted 12 positions (uploads from your devices) since the last verified snapshot.',
  );
});

it('offers Discard for every saved snapshot of this device that is not admitted, and only actions that can help', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let next: HistoryMaintenanceStatus = { sequence: 0, pending: 'none', canDiscard: false };
  const run = vi.fn(async (_command: HistoryMaintenanceCommand) => next);
  const buttons = () => [...host.querySelectorAll('button')].map((b) => b.textContent).slice(2);
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
    const discard = 'Discard unfinished snapshot';
    for (const [saved, expected] of [
      ['sendable', ['Resume history snapshot', discard]],
      ['waiting', ['Resume history snapshot', discard]],
      ['blocked', [discard]],
      ['superseded', [discard]],
      ['stale', [discard]],
      ['cancelling', ['Finish discarding']],
    ] as const) {
      await show({ sequence: 1, pending: 'resume', canDiscard: true, saved });
      expect(buttons(), saved).toEqual(expected);
    }
    // A saved admission of another device's snapshot, or this device's own admitted snapshot
    // whose reply was lost: resuming reconciles it, and nothing is offered for discarding.
    await show({ sequence: 1, pending: 'resume', canDiscard: false });
    expect(buttons()).toEqual(['Resume history snapshot']);
    // Another device's current snapshot: verify only.
    await show({ sequence: 0, pending: 'verify', canDiscard: false });
    expect(buttons()).toEqual(['Verify history snapshot']);
    // A cancellation kept while another device's snapshot waits never blocks verifying it.
    await show({ sequence: 0, pending: 'verify', canDiscard: false, saved: 'cancelling' });
    expect(buttons()).toEqual(['Verify history snapshot']);
    // Past the bound, neither creating nor verifying is offered.
    await show({
      sequence: 1,
      pending: 'none',
      canDiscard: false,
      positions: { since: 4097, allowed: bound },
    });
    expect(buttons()).toEqual([]);
    await show({
      sequence: 1,
      pending: 'none',
      canDiscard: false,
      positions: { since: 4096, allowed: bound },
    });
    expect(buttons()).toEqual(['Create history snapshot']);
    await show({
      sequence: 0,
      pending: 'none',
      canDiscard: false,
      replay: { snapshot: 'new', needed: 4097, allowed: bound },
    });
    expect(buttons()).toEqual([]);
    expect(host.textContent).toContain('Nothing was saved or sent.');
    await show({
      sequence: 0,
      pending: 'verify',
      canDiscard: false,
      replay: { snapshot: 'pending', needed: 4097, allowed: bound },
    });
    expect(buttons()).toEqual([]);
    expect(run.mock.calls.every(([command]) => command === 'inspect')).toBe(true);
    // Discard and Finish discarding both send the discard command.
    await show({ sequence: 1, pending: 'resume', canDiscard: true, saved: 'blocked' });
    const press = async (label: string) => {
      const b = [...host.querySelectorAll('button')].find((x) => x.textContent === label)!;
      await act(async () => b.click());
    };
    next = { sequence: 0, pending: 'verify', canDiscard: false, saved: 'cancelling' };
    await press(discard);
    expect(run.mock.calls.at(-1)![0]).toBe('discard');
    await show({ sequence: 1, pending: 'resume', canDiscard: true, saved: 'cancelling' });
    await press('Finish discarding');
    expect(run.mock.calls.at(-1)![0]).toBe('discard');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
