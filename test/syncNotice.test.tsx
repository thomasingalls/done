import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { SyncNotice, receiveHaltMessage } from '../src/ui/SyncNotice';
import type { SyncRuntime, SyncStatus } from '../src/crdt/accountSyncDriver';
import type { LoginProblem, LoginStatus, NetworkLogin } from '../src/account/networkLogin';
import {
  LOGIN_PROBLEM_MESSAGES,
  NetworkLoginNotice,
  loginMessage,
} from '../src/ui/NetworkLoginNotice';
import { SYNC_REFUSAL_MESSAGES, syncRefusalMessage } from '../src/ui/syncRefusalMessages';
import type { DeliveryRefusal, SyncRefusal } from '../src/account/syncRefusal';

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
it('names an unverified history snapshot, says what resolves it, and offers no ineffective retry', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(30000);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const lane = { failures: 0, nextAttemptAt: 35000, issueSince: 0, lastSuccessAt: 29000 };
  const named =
    'Changes from your other devices may stop arriving here, because a history snapshot saved on the service could not be checked against the history this device kept. This clears when your other devices save and check a newer snapshot. Your writing on this device is kept.';
  const status: SyncStatus = {
    send: { ...lane, phase: 'idle', reason: null, issueSince: null, acceptedThrough: 1 },
    // Receiving otherwise continues: the lane is idle, not blocked.
    receive: { ...lane, phase: 'idle', reason: 'history-unverified', receivedThrough: 9 },
  };
  expect(receiveHaltMessage(status.receive)).toBe(named);
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
    expect(host.querySelector('.sync-details')?.textContent).toContain(named);
    expect(host.textContent).toContain('receive:history-unverified');
    expect(host.querySelector('button')).toBeNull();
    // Checked but held until a reduction can carry it: its own sentence, still no retry.
    const waiting: SyncStatus = {
      ...status,
      receive: { ...status.receive, reason: 'history-waiting' },
    };
    expect(receiveHaltMessage(waiting.receive)).toBe(
      'Changes from your other devices may stop arriving here until this device can finish history maintenance. A history snapshot saved on the service is checked and installs then. Your writing on this device is kept.',
    );
    await act(async () =>
      root.render(<SyncNotice sync={{ status: waiting, retry, onStatus: () => () => {} }} />),
    );
    expect(host.textContent).toContain('receive:history-waiting');
    expect(host.querySelector('button')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
  }
});

// Phase 551: why the last sign-in attempt failed, in the sync notice and the account menu's
// login notice. Only a service that gave no usable answer says to check the connection.
it('says why a reconnect did not finish, and only no answer says to check the connection', async () => {
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
  const status: SyncStatus = {
    send: { ...common, reason: 'sign-in-required', acceptedThrough: 1 },
    receive: { ...common, reason: 'sign-in-required', receivedThrough: 1 },
  };
  let loginStatus: LoginStatus = 'reconnect',
    problem: LoginProblem | undefined;
  const listeners = new Set<() => void>();
  const subscribe = (f: () => void) => {
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  };
  const sync: SyncRuntime = { status, retry: vi.fn(), onStatus: (f) => subscribe(() => f(status)) };
  const login = {
    subscribe,
    getSnapshot: () => loginStatus,
    getProblem: () => problem,
    connect: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
  } as unknown as NetworkLogin;
  const show = async (next: LoginStatus, why: LoginProblem | undefined) => {
    loginStatus = next;
    problem = why;
    await act(async () => {
      for (const f of listeners) f();
    });
  };
  try {
    await act(async () =>
      root.render(
        <>
          <SyncNotice sync={sync} login={login} />
          <NetworkLoginNotice login={login} close={() => {}} />
        </>,
      ),
    );
    const sentences = (): string[] => [...host.querySelectorAll('p')].map((p) => p.textContent!);
    expect(sentences()).toContain(
      'Reconnect sync with your account’s passkey. Your writing is available offline.',
    );
    for (const [why, sentence] of Object.entries(LOGIN_PROBLEM_MESSAGES) as [
      LoginProblem,
      string,
    ][]) {
      await show('reconnect', why);
      expect(sentences(), why).toContain(sentence);
      expect(sentences(), why).toContain(`${sentence} Your writing remains available offline.`);
      expect(sentence.includes('Check your connection'), why).toBe(why === 'unreachable');
      expect(sentence.includes('This is not a problem with your connection.'), why).toBe(
        why === 'busy' || why === 'unavailable' || why === 'refused',
      );
    }
    expect(LOGIN_PROBLEM_MESSAGES).toEqual({
      unreachable:
        'Sync could not reach the account service. Check your connection, then reconnect sync.',
      busy: 'The account service is busy, so sync could not connect. This is not a problem with your connection. Try Reconnect sync again in a minute.',
      unavailable:
        'The account service cannot save sign-ins right now, so sync could not connect. This is not a problem with your connection. Try again later.',
      outdated:
        'The account service could not use the sign-in request from this version of the app. Updating the app may fix it.',
      refused:
        'The account service did not accept this sign-in. This is not a problem with your connection. Try again later.',
    });
    // A disconnected login with no known reason names the action, not the connection.
    await show('disconnected', undefined);
    expect(sentences()).toContain(
      'Sync is not connected. Reconnect sync to try again. Your writing remains available offline.',
    );
    expect(loginMessage('disconnected', 'busy')).toBe(
      `${LOGIN_PROBLEM_MESSAGES.busy} Your writing remains available offline.`,
    );
    // A reason never replaces a status that is not offering to connect.
    expect(loginMessage('remembered', 'busy')).toBe('Account login remembered on this device.');
    await show('reconnect', undefined);
    expect(sentences().some((s) => Object.values(LOGIN_PROBLEM_MESSAGES).includes(s))).toBe(false);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
  }
});

// Phase 552: why a lane's last attempt got no result. Only no usable answer says to check the
// connection; the service answering says it is not the connection, and what to do, if anything.
const LANE_SHIPPED: Record<DeliveryRefusal, string> = {
  unreachable:
    'This device could not reach the account service. Check your connection. This device will try again by itself.',
  timeout:
    'The account service did not answer in time. Check your connection. This device will try again by itself.',
  'removal-pending':
    'This device is being removed from the account, so the account service no longer accepts its changes. This is not a problem with your connection. Your writing on this device is kept.',
  'ledger-integrity':
    'The account service found a problem with its stored history and has paused changes until it is checked. This is not a problem with your connection. Nothing you do on this device will fix it. Your writing on this device is kept.',
  'storage-unavailable':
    'The account service cannot save changes right now. This is not a problem with your connection. This device will try again by itself.',
  'invalid-request':
    'The account service could not use a request from this version of the app. Updating the app may fix it. Your writing on this device is kept.',
  'envelope-size':
    'The account service could not use a request from this version of the app. Updating the app may fix it. Your writing on this device is kept.',
  'unsupported-epoch':
    'The account service did not accept the last attempt. This is not a problem with your connection. This device will try again by itself.',
  'out-of-order':
    'The account service did not accept the last attempt. This is not a problem with your connection. This device will try again by itself.',
  'parent-required':
    'The account service did not accept the last attempt. This is not a problem with your connection. This device will try again by itself.',
  'unissued-parent':
    'The account service did not accept the last attempt. This is not a problem with your connection. This device will try again by itself.',
  unavailable:
    'The account service did not accept the last attempt. This is not a problem with your connection. This device will try again by itself.',
  'state-changed':
    'The account service did not accept the last attempt. This is not a problem with your connection. This device will try again by itself.',
  refused:
    'The account service did not accept the last attempt, for a reason this version of the app does not know. This is not a problem with your connection. This device will try again by itself.',
  unusable:
    'The account service’s answer could not be used. This is not a problem with your connection. This device will try again by itself.',
  capacity:
    'The account service is busy. This is not a problem with your connection. This device will try again by itself.',
  'access-refused':
    'The account service did not accept this device’s sign-in. Lock and reopen this workspace, then try again.',
  'authority-changed': 'Your account’s devices changed. This device will catch up by itself.',
  'login-disconnected': 'Sync is not connected. Reconnect sync under Account in the menu.',
};
it('says why a lane got no result, beside the unchanged reason, and names it in the reason line (phase 552)', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(60000);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  expect({ ...SYNC_REFUSAL_MESSAGES }).toEqual(LANE_SHIPPED);
  for (const [code, sentence] of Object.entries(LANE_SHIPPED))
    expect(sentence.includes('Check your connection'), code).toBe(
      code === 'unreachable' || code === 'timeout',
    );
  // Receive-path history failures keep their phase 551 code and take the same meaning's sentence.
  expect(syncRefusalMessage('history-unreachable')).toBe(LANE_SHIPPED.unreachable);
  expect(syncRefusalMessage('history-capacity')).toBe(LANE_SHIPPED.capacity);
  expect(syncRefusalMessage('history-ledger-integrity')).toBe(LANE_SHIPPED['ledger-integrity']);
  expect(syncRefusalMessage('history-checkpoint-busy')).toBe(LANE_SHIPPED.unavailable);
  expect(syncRefusalMessage('history-stopped')).toBeUndefined();
  expect(syncRefusalMessage('history-sign-in-required')).toBeUndefined();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const lane = {
    phase: 'retrying' as const,
    failures: 2,
    nextAttemptAt: 63000,
    reason: 'network-unavailable' as const,
    issueSince: 0,
    lastSuccessAt: null,
  };
  let status: SyncStatus = {
    send: { ...lane, acceptedThrough: 4 },
    receive: { ...lane, receivedThrough: 9 },
  };
  const listeners = new Set<() => void>();
  const sync: SyncRuntime = {
    get status() {
      return status;
    },
    retry: vi.fn(),
    onStatus(f) {
      const listener = () => f(status);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const show = async (send?: SyncRefusal, receive?: SyncRefusal) => {
    status = {
      send: { ...lane, acceptedThrough: 4, ...(send ? { refusal: send } : {}) },
      receive: { ...lane, receivedThrough: 9, ...(receive ? { refusal: receive } : {}) },
    };
    await act(async () => {
      for (const f of listeners) f();
    });
  };
  const notes = () =>
    [...host.querySelectorAll('.sync-notice .menu-note')].map((p) => p.textContent);
  try {
    await act(async () => root.render(<SyncNotice sync={sync} />));
    // No explanation: as before, no sentence and the unchanged reason.
    expect(host.textContent).toContain('send:network-unavailable');
    expect(notes().some((n) => Object.values(LANE_SHIPPED).includes(n!))).toBe(false);
    for (const [code, sentence] of Object.entries(LANE_SHIPPED) as [DeliveryRefusal, string][]) {
      await show(code, 'history-capacity');
      expect(notes(), code).toContain(sentence);
      expect(host.textContent).toContain(`send:${code}`);
      expect(notes()).toContain(LANE_SHIPPED.capacity);
      expect(host.textContent).toContain('receive:history-capacity');
    }
    // A retry is still offered: the lane retries as before.
    expect([...host.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
      'Retry sending',
      'Retry receiving',
    ]);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
  }
});
