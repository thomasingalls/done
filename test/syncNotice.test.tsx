import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { SyncNotice, receiveHaltMessage } from '../src/ui/SyncNotice';
import type { SyncRuntime, SyncStatus } from '../src/crdt/accountSyncDriver';
import type { LoginStatus, NetworkLogin } from '../src/account/networkLogin';

it('offers a passkey reconnect instead of ineffective lane retries, without hiding another halt', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(30000);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const common = {
    phase: 'blocked' as const,
    failures: 0,
    nextAttemptAt: null,
    issueSince: 0,
    lastSuccessAt: null,
  };
  let status: SyncStatus = {
    send: { ...common, reason: 'sign-in-required', acceptedThrough: 12 },
    receive: { ...common, reason: 'integrity', receivedThrough: 53 },
  };
  let loginStatus: LoginStatus = 'reconnect';
  const listeners = new Set<() => void>();
  const subscribe = (f: () => void) => {
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  };
  const notify = () => {
    for (const f of listeners) f();
  };
  const retry = vi.fn();
  const sync: SyncRuntime = {
    get status() {
      return status;
    },
    retry,
    onStatus: (f) => subscribe(() => f(status)),
  };
  let finish!: () => void;
  const connect = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const login = { subscribe, getSnapshot: () => loginStatus, connect } as unknown as NetworkLogin;
  try {
    await act(async () => root.render(<SyncNotice sync={sync} login={login} />));
    expect(host.textContent).toContain('send:sign-in-required');
    expect(host.textContent).toContain('account passkey check');
    expect(host.textContent).not.toContain('network-unavailable');
    const buttons = () => [...host.querySelectorAll('button')];
    expect(buttons().map((b) => b.textContent)).toEqual(['Retry receiving', 'Reconnect sync']);
    await act(async () => buttons()[1]!.click());
    expect(connect).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
    expect(buttons()[1]!.disabled).toBe(true);
    loginStatus = 'remembered';
    status = { ...status, send: { ...status.send, phase: 'idle', reason: null, issueSince: null } };
    await act(async () => {
      finish();
      notify();
    });
    expect(host.textContent).not.toContain('Reconnect sync');
    expect(host.textContent).toContain('receive:integrity');
    await act(async () => buttons()[0]!.click());
    expect(retry).toHaveBeenCalledExactlyOnceWith('receive');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
  }
});
it('delays online failure notice, shows lane details, retries only that lane and clears on success', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let status: SyncStatus = {
    send: {
      phase: 'idle',
      failures: 0,
      nextAttemptAt: null,
      reason: null,
      issueSince: null,
      lastSuccessAt: null,
      acceptedThrough: 12,
    },
    receive: {
      phase: 'retrying',
      failures: 1,
      nextAttemptAt: 1000,
      reason: 'operation-failed',
      issueSince: 0,
      lastSuccessAt: null,
      receivedThrough: 53,
    },
  };
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const f of listeners) f();
  };
  const retry = vi.fn();
  const sync: SyncRuntime = {
    get status() {
      return status;
    },
    retry,
    onStatus(f) {
      const listener = () => f(status);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  try {
    await act(async () =>
      root.render(
        <>
          <SyncNotice sync={sync} />
          <SyncNotice sync={sync} details />
        </>,
      ),
    );
    expect(host.querySelector('.sync-notice')).toBeNull();
    expect(host.textContent).toContain('Received positions: 53');
    await act(() => vi.advanceTimersByTimeAsync(29999));
    expect(host.querySelector('.sync-notice')).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(host.querySelector('.sync-notice')?.textContent).toContain(
      'Changes from your other devices are not arriving here.',
    );
    await act(async () => (host.querySelector('.sync-notice button') as HTMLButtonElement).click());
    expect(retry).toHaveBeenCalledExactlyOnceWith('receive');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await act(async () => dispatchEvent(new Event('offline')));
    expect(host.querySelector('.sync-notice')).toBeNull();
    vi.restoreAllMocks();
    await act(async () => dispatchEvent(new Event('online')));
    expect(host.querySelector('.sync-notice')).not.toBeNull();
    status = {
      ...status,
      receive: {
        ...status.receive,
        phase: 'idle',
        reason: null,
        issueSince: null,
        lastSuccessAt: 30000,
        failures: 0,
      },
    };
    await act(async () => notify());
    expect(host.querySelector('.sync-notice')).toBeNull();
    // A later status arrives after its deadline (for example after background suspension).
    // The earlier lane's timer must not leave the notice using an old rendering time.
    vi.setSystemTime(62000);
    status = {
      ...status,
      send: { ...status.send, phase: 'retrying', reason: 'operation-failed', issueSince: 31000 },
    };
    await act(async () => notify());
    expect(host.querySelector('.sync-notice')?.textContent).toContain('send:operation-failed');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  }
});

it('names a receive halt caused by a history snapshot too large to install, with sizes (phase 544)', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(30000);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const lane = {
    phase: 'blocked' as const,
    failures: 0,
    nextAttemptAt: null,
    issueSince: 0,
    lastSuccessAt: null,
  };
  const detail = { cause: 'history-snapshot' as const, needed: 4_400_000, allowed: 4_194_304 };
  const named =
    'Changes from your other devices are not arriving here, because a history snapshot saved on the service needs 4.2 MiB to install and this version installs snapshots of up to 4.0 MiB. Your writing on this device is kept.';
  const status: SyncStatus = {
    send: { ...lane, phase: 'idle', reason: null, issueSince: null, acceptedThrough: 1 },
    receive: { ...lane, reason: 'inbound-size', detail, receivedThrough: 2 },
  };
  expect(receiveHaltMessage(status.receive)).toBe(named);
  // Sizes that round alike still read as more than the limit.
  expect(receiveHaltMessage({ ...status.receive, detail: { ...detail, needed: 4_194_400 } })).toBe(
    named.replace('needs 4.2 MiB', 'needs just over 4.0 MiB'),
  );
  // Another size halt, or none named, keeps the general sentence.
  const { detail: _, ...plain } = status.receive;
  expect(receiveHaltMessage(plain)).toBeUndefined();
  expect(receiveHaltMessage({ ...status.receive, reason: 'response-too-large' })).toBeUndefined();
  const retry = vi.fn();
  const sync: SyncRuntime = { status, retry, onStatus: () => () => {} };
  try {
    await act(async () =>
      root.render(
        <>
          <SyncNotice sync={sync} />
          <SyncNotice sync={sync} details />
        </>,
      ),
    );
    expect(host.querySelector('.sync-notice')?.textContent).toContain(named);
    expect(host.querySelector('.sync-notice')?.textContent).not.toContain(
      'Changes from your other devices are not arriving here.Last',
    );
    expect(host.querySelector('.sync-details')?.textContent).toContain(named);
    expect(host.textContent).toContain('receive:inbound-size');
    await act(async () => host.querySelector('button')!.click());
    expect(retry).toHaveBeenCalledExactlyOnceWith('receive');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
  }
});
