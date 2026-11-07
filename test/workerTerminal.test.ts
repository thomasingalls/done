// @vitest-environment node
/** Terminal presentation and ordering only; native cleanup permission is independently fenced. */
import { afterEach, expect, it, vi } from 'vitest';
import {
  accountWorkerClosed,
  captureAccountWorkerClosed,
  createAccountWorkerTerminalReceiver,
} from '../src/crdt/workerTerminal';
import {
  rememberAccountTransition,
  dismissAccountTransitionNotice,
  getAccountTransitionNotice,
  type AccountTransition,
} from '../src/account/accountTransitionNotice';
const owner = '11'.repeat(16),
  account = 'A'.repeat(43),
  other = 'B'.repeat(42) + 'A';
afterEach(dismissAccountTransitionNotice);
it('forwards only the existing transition catalogue for the actual native account', () => {
  for (const kind of [
    'changed',
    'removed',
    'removal-pending',
    'removal-committed',
    'removal-incomplete',
  ] as AccountTransition[]) {
    const text = rememberAccountTransition(account, kind),
      message = accountWorkerClosed(owner, true, account);
    expect(message.notice).toEqual({ accountId: account, kind });
    dismissAccountTransitionNotice();
    const received = captureAccountWorkerClosed(message, owner, account);
    rememberAccountTransition(received.notice!.accountId, received.notice!.kind);
    expect(getAccountTransitionNotice()).toEqual({ accountId: account, message: text });
  }
});
it('does not forward another account or manufacture a notice when no native account opened', () => {
  rememberAccountTransition(other, 'removed');
  expect(accountWorkerClosed(owner, true, account).notice).toBeNull();
  expect(accountWorkerClosed(owner, true, undefined).notice).toBeNull();
});
it('retains legacy v1 cleanup acknowledgments without interpreting missing notice as a result', () => {
  const message = captureAccountWorkerClosed(
    { v: 1, kind: 'accountClosed', owner, ok: true },
    owner,
  );
  expect(message.ok).toBe(true);
  expect(message.notice).toBeNull();
});
it('refuses malformed native acknowledgment fields and extra authority claims', () => {
  const original = { v: 1, kind: 'accountClosed', owner, ok: true, notice: null };
  for (const value of [
    { ...original, ok: 'yes' },
    { ...original, v: 2 },
    { ...original, owner: '22'.repeat(16) },
    { ...original, proof: true },
  ])
    expect(() => captureAccountWorkerClosed(value, owner)).toThrow();
});
it('drops invalid presentation without changing actual acknowledgment or accepting another account', () => {
  for (const notice of [
    { accountId: 'invalid', kind: 'removed' },
    { accountId: other, kind: 'removed' },
    { accountId: account, kind: 'invented-success' },
    { accountId: account, kind: 'removed', key: 'not-allowed' },
  ]) {
    const message = captureAccountWorkerClosed(
      { v: 1, kind: 'accountClosed', owner, ok: true, notice },
      owner,
      account,
    );
    expect(message.ok).toBe(true);
    expect(message.notice).toBeNull();
  }
});
it('never invokes payload accessors and retains separate acknowledgment and presentation refusal', () => {
  let reads = 0;
  expect(() =>
    captureAccountWorkerClosed(
      {
        v: 1,
        kind: 'accountClosed',
        owner,
        get ok() {
          reads++;
          return true;
        },
      },
      owner,
    ),
  ).toThrow();
  const m = captureAccountWorkerClosed(
    {
      v: 1,
      kind: 'accountClosed',
      owner,
      ok: true,
      notice: {
        accountId: account,
        get kind() {
          reads++;
          return 'removed';
        },
      },
    },
    owner,
  );
  expect(m.notice).toBeNull();
  expect(reads).toBe(0);
});
it('copies and freezes the bounded terminal notice rather than lending a mutable object', () => {
  const raw = {
      v: 1,
      kind: 'accountClosed',
      owner,
      ok: false,
      notice: { accountId: account, kind: 'removal-incomplete' },
    },
    copy = captureAccountWorkerClosed(raw, owner, account);
  raw.notice.kind = 'removed';
  expect(copy.notice!.kind).toBe('removal-incomplete');
  expect(copy.ok).toBe(false);
  expect(Object.isFrozen(copy.notice)).toBe(true);
});
it('withdraws input before presentation even when the independent port-close notification is delayed', () => {
  const events: unknown[] = [],
    receive = createAccountWorkerTerminalReceiver({
      owner,
      accountId: () => account,
      complete: (ok) => events.push(['actual-ack', ok]),
      retire: () => events.push('retire-now'),
      present: (n) => events.push(['present', n.kind]),
    });
  expect(
    receive({
      v: 1,
      kind: 'accountClosed',
      owner,
      ok: true,
      notice: { accountId: account, kind: 'removed' },
    }),
  ).toBe(true);
  expect(events).toEqual([['actual-ack', true], 'retire-now', ['present', 'removed']]);
});
it('ignores stale owners and replays without inventing a result for a missing acknowledgment', () => {
  const complete = vi.fn(),
    retire = vi.fn(),
    present = vi.fn(),
    receive = createAccountWorkerTerminalReceiver({
      owner,
      accountId: () => account,
      complete,
      retire,
      present,
    });
  expect(receive(undefined)).toBe(false);
  expect(receive({ v: 1, kind: 'accountClosed', owner: '22'.repeat(16), ok: true })).toBe(false);
  expect(complete).not.toHaveBeenCalled();
  const current = { v: 1, kind: 'accountClosed', owner, ok: false, notice: null };
  expect(receive(current)).toBe(true);
  expect(receive({ ...current, ok: true })).toBe(false);
  expect(complete).toHaveBeenCalledExactlyOnceWith(false);
  expect(retire).toHaveBeenCalledOnce();
  expect(present).not.toHaveBeenCalled();
});
it('fails a malformed current native acknowledgment closed before any presentation', () => {
  const events: unknown[] = [],
    receive = createAccountWorkerTerminalReceiver({
      owner,
      accountId: () => account,
      complete: (ok) => events.push(ok),
      retire: () => events.push('retire'),
      present: () => events.push('wrong'),
    });
  receive({ v: 1, kind: 'accountClosed', owner, ok: 'invented' });
  expect(events).toEqual([false, 'retire']);
});
