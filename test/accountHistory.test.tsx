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
import { HISTORY_FAILURES, type HistoryFailureCode } from '../src/account/historyFailure';
import { HISTORY_FAILURE_MESSAGES } from '../src/ui/historyFailureMessages';
import { WorkerChannelError } from '../src/crdt/workerChannel';

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

// Phase 551: what each failure of a history command says, word for word. The Worker gives the
// failure a code; the code chooses the sentence and nothing else.
const SHIPPED: Record<HistoryFailureCode, string> = {
  'history-unreachable':
    'History maintenance could not reach the account service. Your writing and saved progress are kept. Check your connection, then check history or resume.',
  'history-timeout':
    'The account service did not answer in time. Your writing and saved progress are kept. Check your connection, then check history or resume.',
  'history-stopped':
    'History maintenance stopped on this device before it finished. Your writing and saved progress are kept. Check history to see where it stands.',
  'history-checkpoint-busy':
    'Another device’s snapshot is waiting for verification, so this one was not sent. Your writing and saved progress are kept. Check history to verify that snapshot first.',
  'history-checkpoint-cancelled':
    'This snapshot was discarded earlier, so the service will not take it. Check history, discard it here too, then create a new one. Your writing is unchanged.',
  'history-sources-changed':
    'Your account’s devices changed while this snapshot was made or verified, so the service did not accept it. Your writing and saved progress are kept. Check history to see what to discard or make next.',
  'history-checkpoint-required':
    'The snapshot you were verifying is no longer waiting. Your writing and saved progress are kept. Check history to see where things stand.',
  'history-admission-conflict':
    'Another device verified this snapshot first. Your writing and saved progress are kept. Check history.',
  'history-checkpoint-conflict':
    'A different snapshot is waiting now. Your writing and saved progress are kept. Check history before trying again.',
  'history-retention-boundary-changed':
    'A newer snapshot was verified since you checked, so nothing was removed. Check history, then prune covered history again.',
  'history-source-unavailable':
    'History from a recently added or recovered device is not on the service yet. Your writing and saved progress are kept. Try again after your devices have synced.',
  'history-state-changed':
    'The account changed while history maintenance ran. Your writing and saved progress are kept. Check history, then try again.',
  'history-checkpoint-too-large':
    'The service refused a snapshot too large for your devices to install. Check history to see which one. Your writing is unchanged.',
  'history-ledger-integrity':
    'The account service found a problem with its stored history and has paused changes until it is checked. This is not a problem with your connection. Nothing you do on this device will fix it. Your writing on this device is kept.',
  'history-unavailable':
    'The account service could not finish history maintenance. This is not a problem with your connection. Your writing and saved progress are kept. Try again later.',
  'history-invalid-proof':
    'The account service did not accept this device’s part in history maintenance. This is not a problem with your connection. Nothing you do on this device will fix it. Your writing and saved progress are kept.',
  'history-malformed':
    'The account service could not use this request from this version of the app. Updating the app may fix it. Your writing and saved progress are kept.',
  'history-not-found':
    'This account service does not offer history maintenance. Nothing you do on this device will fix it. Your writing and saved progress are kept.',
  'history-sign-in-required':
    'Sync needs an account passkey check before history maintenance can continue. Choose Reconnect sync under Account in this menu, then try again. Your writing and saved progress are kept.',
  'history-sync-disconnected':
    'Sync is not connected, so history maintenance could not start. Your writing and saved progress are kept. Check Account in this menu, reconnect sync if it is offered, then try again.',
  'history-authority-changed':
    'Your account’s devices changed while history maintenance ran. Your writing and saved progress are kept. Check history again in a moment.',
  'history-capacity':
    'The account service is busy. This is not a problem with your connection. Your writing and saved progress are kept. Try again in a minute.',
  'history-storage-unavailable':
    'The account service cannot save changes right now. This is not a problem with your connection. Your writing and saved progress are kept. Try again later.',
  'history-access-refused':
    'The account service did not accept this device’s sign-in. Your writing and saved progress are kept. Lock and reopen this workspace, then try again.',
  'history-refused':
    'The account service did not accept this request. This is not a problem with your connection. Your writing and saved progress are kept. Check history, then try again.',
  'history-reply-unverified':
    'The account service’s answer could not be checked, so nothing from it was used. This is not a problem with your connection. Your writing and saved progress are kept. Check history to try again; if this keeps happening, nothing you do on this device will fix it.',
  'history-advanced':
    'Another snapshot was saved while this one was being read. Your writing and saved progress are kept. Check history, then try again.',
  'history-finish-saved':
    'This device has a saved snapshot to finish or discard first. Your writing and saved progress are kept. Check history to see it.',
  'history-prune-unchanged':
    'Covered history can be removed once two snapshots are verified and unchanged. Check history to see where things stand.',
  'history-not-producer':
    'Only the device that made this snapshot can discard it. Verify it here, or discard it on that device.',
  'history-receive-pending':
    'Sync is finishing on this device. Your writing and saved progress are kept. Try again in a moment.',
  'history-local-progress':
    'This device could not save its history progress. Your writing is kept. Lock and reopen this workspace, then check history.',
  'history-failed':
    'History maintenance could not finish. Your writing and saved progress are kept. Check history, then try again.',
};

it('says what each failure is and what to do; only no answer says to check the connection (phase 551)', async () => {
  expect(Object.keys(HISTORY_FAILURE_MESSAGES).sort()).toEqual([...HISTORY_FAILURES].sort());
  // Each code fits what the Worker channel passes to the page.
  for (const code of HISTORY_FAILURES) expect(code).toMatch(/^[a-z-]{1,64}$/);
  expect({ ...HISTORY_FAILURE_MESSAGES }).toEqual(SHIPPED);
  for (const code of HISTORY_FAILURES)
    expect(HISTORY_FAILURE_MESSAGES[code].includes('connection'), code).toBe(
      code === 'history-unreachable' ||
        code === 'history-timeout' ||
        HISTORY_FAILURE_MESSAGES[code].includes('This is not a problem with your connection.'),
    );
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let failure: unknown = null;
  const run = vi.fn(async (_command: HistoryMaintenanceCommand) => {
    if (failure) throw failure;
    return { sequence: 1, pending: 'none', canDiscard: false } as HistoryMaintenanceStatus;
  });
  const check = async () =>
    act(async () =>
      [...host.querySelectorAll('button')].find((b) => b.textContent === 'Check history')!.click(),
    );
  const alert = () => host.querySelector('[role="alert"]')?.textContent;
  try {
    await act(async () => root.render(<AccountHistory run={run} />));
    await act(async () => host.querySelector('button')!.click());
    await check();
    const status = host.querySelector('[role="status"]')!.textContent;
    // Through the Worker channel, as the page receives it.
    for (const code of HISTORY_FAILURES) {
      failure = new WorkerChannelError(code);
      await check();
      expect(alert(), code).toBe(SHIPPED[code]);
      // A failure chooses a sentence only: the last status stays as it was.
      expect(host.querySelector('[role="status"]')!.textContent).toBe(status);
    }
    // A code this version does not know, a channel failure and an error with no code.
    for (const other of [
      new WorkerChannelError('history-something-new'),
      new WorkerChannelError('operation-refused'),
      new WorkerChannelError('closed'),
      Error('plain'),
    ]) {
      failure = other;
      await check();
      expect(alert()).toBe(SHIPPED['history-failed']);
    }
    failure = null;
    await check();
    expect(alert()).toBeUndefined();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
