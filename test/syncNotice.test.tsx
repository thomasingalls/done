import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { SyncNotice } from '../src/ui/SyncNotice';
import type { SyncRuntime, SyncStatus } from '../src/crdt/accountSyncDriver';
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
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  }
});
