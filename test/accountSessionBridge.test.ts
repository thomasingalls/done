import { idleReceiveInterval } from '../src/crdt/accountSyncDriver';
// @vitest-environment node
/** Controlled ports test dispatch/backpressure, not Account authentication. */
import { expect, it, vi } from 'vitest';
import {
  captureAccountSessionCommand,
  captureAccountSessionState,
  createWindowAccountSession,
  executeAccountSessionCommand,
  publishAccountSession,
  type AccountSessionSource,
} from '../src/crdt/accountSessionBridge';
import type { SyncStatus } from '../src/crdt/accountSyncDriver';
const gate = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { resolve, promise };
};
const tick = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
const lane = {
  phase: 'idle' as const,
  failures: 0,
  nextAttemptAt: null,
  reason: null,
  issueSince: null,
  lastSuccessAt: null,
};
const status = (n = 0): SyncStatus => ({
  send: { ...lane, acceptedThrough: n },
  receive: { ...lane, receivedThrough: n },
});
function fixture() {
  const stop = new AbortController(),
    listeners = new Set<() => void>(),
    calls: unknown[] = [],
    syncRetry = vi.fn(),
    localRetry = vi.fn(() => true);
  let current = status(),
    login = 'remembered' as const;
  const source: AccountSessionSource = {
    login: {
      getSnapshot: () => login,
      subscribe: (fn) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      connect: async () => {
        calls.push('original-connect');
      },
      signOut: async () => {
        calls.push('original-signout');
      },
    },
    sync: {
      get status() {
        return current;
      },
      onStatus: (fn) => {
        const f = () => fn(current);
        listeners.add(f);
        return () => listeners.delete(f);
      },
      retry: syncRetry,
    },
    devices: {
      localHistory: {
        status: { phase: 'waiting', reason: undefined },
        onStatus: () => () => {},
        retry: localRetry,
      },
      automaticHistory: { status: { phase: 'idle', reason: undefined }, onStatus: () => () => {} },
      read: async () => ({
        epoch: 3,
        currentDevice: 'device',
        devices: [{ id: 'device', state: 'certified' }],
      }),
      remove: async (target) => {
        calls.push(target);
        return 'pending';
      },
      history: async (command) => {
        calls.push(command);
        return { sequence: 2, pending: 'none', canDiscard: false };
      },
    },
  };
  return {
    stop,
    source,
    calls,
    syncRetry,
    localRetry,
    listeners,
    update(n: number) {
      current = status(n);
      for (const fn of listeners) fn();
    },
  };
}
it('coalesces original immutable statuses behind one outstanding RPC and no polling', async () => {
  const f = fixture(),
    held = gate(),
    sent: any[] = [],
    failed = vi.fn();
  const p = publishAccountSession(
    f.source,
    f.stop.signal,
    async (h) => {
      sent.push(h);
      await held.promise;
    },
    failed,
  );
  await tick();
  expect(sent).toHaveLength(1);
  for (let n = 1; n <= 100; n++) f.update(n);
  await tick();
  expect(sent).toHaveLength(1);
  expect(sent[0].state.sync.send.acceptedThrough).toBe(0);
  held.resolve();
  await p.ready;
  await tick();
  expect(sent).toHaveLength(2);
  expect(sent[1].sequence).toBe(2);
  expect(sent[1].state.sync.send.acceptedThrough).toBe(100);
  f.stop.abort();
  expect(f.listeners.size).toBe(0);
  f.update(101);
  await tick();
  expect(sent).toHaveLength(2);
  expect(failed).not.toHaveBeenCalled();
});
it('runs only closed original operations and never treats a displayed count as durability', async () => {
  const f = fixture(),
    live = vi.fn();
  for (const command of [
    { kind: 'connect' },
    { kind: 'signOut' },
    { kind: 'syncRetry', lane: 'receive' },
    { kind: 'localRetry' },
    { kind: 'remove', target: 'other' },
    { kind: 'history', command: 'prune' },
    { kind: 'roster' },
  ])
    await executeAccountSessionCommand(f.source, command, live);
  expect(f.calls).toEqual(['original-connect', 'original-signout', 'other', 'prune']);
  expect(f.syncRetry).toHaveBeenCalledExactlyOnceWith('receive');
  expect(f.localRetry).toHaveBeenCalledOnce();
  expect(live).toHaveBeenCalledTimes(14);
  await expect(
    executeAccountSessionCommand(f.source, { kind: 'appendBatch' }, live),
  ).rejects.toThrow();
  await expect(
    executeAccountSessionCommand(
      f.source,
      { kind: 'history', command: 'prune', proof: true },
      live,
    ),
  ).rejects.toThrow();
});
it('captures command input before an await and rejects accessors, extra fields and unknown actions', () => {
  const c = { kind: 'remove' as const, target: 'a' },
    copy = captureAccountSessionCommand(c);
  c.target = 'b';
  expect(copy).toEqual({ kind: 'remove', target: 'a' });
  let reads = 0;
  for (const c of [
    {
      get kind() {
        reads++;
        return 'roster';
      },
    },
    { kind: 'roster', token: 'secret' },
    { kind: 'syncRetry', lane: 'both' },
    { kind: 'remove', target: '' },
    { kind: 'history', command: 'install' },
    Object.create({ kind: 'roster' }),
  ])
    expect(() => captureAccountSessionCommand(c)).toThrow();
  expect(reads).toBe(0);
});
it('keeps React snapshots stable, freezes copies and sends explicit retries without invented results', async () => {
  const f = fixture(),
    failed = vi.fn(),
    rpc = vi.fn(async (_method: string, input: unknown) =>
      executeAccountSessionCommand(f.source, input, () => {}),
    ),
    window = createWindowAccountSession({ request: rpc as any }, f.stop.signal, failed);
  const p = publishAccountSession(f.source, f.stop.signal, async (h) => window.update(h), failed);
  await p.ready;
  const ui = window.ports;
  expect(window.ports.devices).toBe(ui.devices);
  expect(ui.sync!.status).toBe(ui.sync!.status);
  expect(Object.isFrozen(ui.sync!.status.send)).toBe(true);
  const observed: any[] = [];
  ui.sync!.onStatus((s) => observed.push(s));
  f.update(5);
  await tick();
  expect(observed.at(-1).send.acceptedThrough).toBe(5);
  expect(await ui.devices.read()).toEqual(await f.source.devices.read());
  expect(await ui.devices.history!('inspect')).toEqual({
    sequence: 2,
    pending: 'none',
    canDiscard: false,
  });
  expect(await ui.devices.remove!('other')).toBe('pending');
  ui.sync!.retry('send');
  expect(ui.devices.localHistory!.retry()).toBeUndefined();
  await tick();
  expect(f.localRetry).toHaveBeenCalledOnce();
  expect(f.syncRetry).toHaveBeenCalledExactlyOnceWith('send');
  expect(failed).not.toHaveBeenCalled();
});
it('refuses replayed observations and capability changes before replacing cached status', async () => {
  const f = fixture(),
    sent: any[] = [],
    window = createWindowAccountSession({ request: vi.fn() as any }, f.stop.signal, vi.fn()),
    p = publishAccountSession(
      f.source,
      f.stop.signal,
      async (h) => {
        sent.push(h);
        window.update(h);
      },
      vi.fn(),
    );
  await p.ready;
  const before = window.ports.sync!.status;
  expect(() => window.update(sent[0])).toThrow();
  const altered = structuredClone(sent[0]);
  altered.sequence = 2;
  altered.state.devices.remove = false;
  expect(() => window.update(altered)).toThrow();
  expect(window.ports.sync!.status).toBe(before);
  const next = structuredClone(sent[0]);
  next.sequence = 2;
  next.state.sync.send.acceptedThrough = 4;
  window.update(next);
  expect(window.ports.sync!.status.send.acceptedThrough).toBe(4);
});
it('aborts immediately, rejects a late command result and publishes stable closed presentation', async () => {
  const f = fixture(),
    held = gate(),
    rpc = vi.fn(async () => {
      await held.promise;
      return 'pending';
    }),
    failed = vi.fn(),
    window = createWindowAccountSession({ request: rpc as any }, f.stop.signal, failed),
    p = publishAccountSession(f.source, f.stop.signal, async (h) => window.update(h), failed);
  await p.ready;
  const ui = window.ports,
    wait = ui.devices.remove!('other');
  f.stop.abort();
  expect(ui.networkLogin.getSnapshot()).toBe('closed');
  expect(ui.sync!.status.send.phase).toBe('closed');
  expect(ui.sync!.status).toBe(ui.sync!.status);
  expect(ui.devices.localHistory!.status.phase).toBe('closed');
  expect(() => ui.sync!.retry('send')).toThrow();
  held.resolve();
  await expect(wait).rejects.toThrow();
  expect(failed).not.toHaveBeenCalled();
});
it('never serializes private source fields, diagnostic events or arbitrary error payloads', async () => {
  const f = fixture(),
    sent: any[] = [];
  (f.source as any).secret = 'not-exported';
  (f.source.devices.localHistory as any).diagnostics = { events: ['not-exported'] };
  const p = publishAccountSession(
    f.source,
    f.stop.signal,
    async (h) => {
      sent.push(h);
    },
    vi.fn(),
  );
  await p.ready;
  expect(JSON.stringify(sent)).not.toContain('not-exported');
  const x = structuredClone(sent[0].state);
  x.devices.token = 'opaque';
  expect(() => captureAccountSessionState(x)).toThrow();
  x.devices = sent[0].state.devices;
  x.sync.send.acceptedThrough = -1;
  expect(() => captureAccountSessionState(x)).toThrow();
});
it('closes failed status delivery once and does not accumulate a subscription or retry loop', async () => {
  const f = fixture(),
    failed = vi.fn(),
    send = vi.fn(async () => {
      throw Error('lost reply');
    });
  const p = publishAccountSession(f.source, f.stop.signal, send, failed);
  await expect(p.ready).rejects.toThrow();
  await tick();
  expect(failed).toHaveBeenCalledOnce();
  expect(send).toHaveBeenCalledOnce();
  expect(f.listeners.size).toBe(0);
  f.update(4);
  await tick();
  expect(send).toHaveBeenCalledOnce();
});
it('preserves original refusal and reruns liveness after operation settlement', async () => {
  const f = fixture(),
    held = gate();
  let live = true;
  f.source.devices.history = async () => {
    await held.promise;
    return { sequence: 1, pending: 'none', canDiscard: false };
  };
  const call = executeAccountSessionCommand(
    f.source,
    { kind: 'history', command: 'inspect' },
    () => {
      if (!live) throw Error('retired');
    },
  );
  live = false;
  held.resolve();
  await expect(call).rejects.toThrow('retired');
  f.source.devices.history = async () => {
    throw Error('original refusal');
  };
  await expect(
    executeAccountSessionCommand(f.source, { kind: 'history', command: 'inspect' }, () => {}),
  ).rejects.toThrow('original refusal');
});

it('retains the original fractional idle-recheck deadline while counters remain integers', () => {
  const random = vi.spyOn(Math, 'random').mockReturnValue(0.123456);
  try {
    const due = Date.now() + idleReceiveInterval(true),
      s = status();
    expect(Number.isInteger(due)).toBe(false);
    const value = {
      login: 'remembered',
      sync: { ...s, receive: { ...s.receive, nextAttemptAt: due } },
      local: null,
      automatic: null,
      devices: { remove: false, history: false, detached: false },
    };
    expect(() => captureAccountSessionState(value)).not.toThrow();
    value.sync.receive.receivedThrough = 0.5;
    expect(() => captureAccountSessionState(value)).toThrow();
  } finally {
    random.mockRestore();
  }
});
it('carries a known capacity cause to the page and drops an unknown or misplaced one (phase 543)', () => {
  const state = (local: unknown) => ({
    login: 'remembered',
    sync: null,
    local,
    automatic: null,
    devices: { remove: false, history: false, detached: false },
  });
  const detail = { cause: 'snapshot-size', needed: 9437184, allowed: 8388608 };
  const kept = captureAccountSessionState(
    state({ phase: 'idle', reason: 'capacity', detail }),
  ).local!;
  expect(kept).toEqual({ phase: 'idle', reason: 'capacity', detail });
  expect(Object.isFrozen(kept.detail)).toBe(true);
  expect(
    captureAccountSessionState(
      state({ phase: 'idle', reason: 'capacity', detail: { cause: 'interrupted' } }),
    ).local,
  ).toEqual({ phase: 'idle', reason: 'capacity', detail: { cause: 'interrupted' } });
  // An older owner sends no detail; the status is unchanged.
  expect(captureAccountSessionState(state({ phase: 'idle', reason: 'capacity' })).local).toEqual({
    phase: 'idle',
    reason: 'capacity',
  });
  // Unknown causes, sizes on an interruption, extra keys, bad numbers or a detail beside another
  // reason are dropped: the page falls back to its general sentence instead of failing.
  for (const [reason, bad] of [
    ['capacity', { cause: 'new-limit', needed: 1, allowed: 2 }],
    ['capacity', { cause: 'interrupted', needed: 1 }],
    ['capacity', { cause: 'snapshot-size', needed: -1, allowed: 2 }],
    ['capacity', { cause: 'snapshot-size', needed: 1.5, allowed: 2 }],
    ['capacity', { cause: 'snapshot-size', needed: 1, allowed: 2, text: 'x' }],
    ['capacity', 'snapshot-size'],
    ['ineligible', detail],
  ] as const)
    expect(captureAccountSessionState(state({ phase: 'idle', reason, detail: bad })).local).toEqual(
      { phase: 'idle', reason },
    );
  // The closed status itself still refuses unknown top-level fields.
  expect(() =>
    captureAccountSessionState(state({ phase: 'idle', reason: 'capacity', cause: 'x' })),
  ).toThrow();
});
it('carries a snapshot too large to install and a named receive size halt, refusing or dropping malformed ones (phase 544)', () => {
  const state = (sync: unknown, history?: unknown) => ({
    login: 'remembered',
    sync,
    local: null,
    automatic: history ? { phase: 'idle', reason: 'peer', history } : null,
    devices: { remove: false, history: true, detached: false },
  });
  const tooLarge = { snapshot: 'latest', needed: 4_400_000, allowed: 4_194_304 };
  const history = { sequence: 2, pending: 'none', canDiscard: false, tooLarge };
  const kept = captureAccountSessionState(state(null, history)).automatic!.history!;
  expect(kept).toEqual(history);
  expect(Object.isFrozen(kept.tooLarge)).toBe(true);
  // A history status is a command result: unlike a presentation detail, a malformed one refuses.
  for (const bad of [
    { ...tooLarge, snapshot: 'other' },
    { ...tooLarge, needed: -1 },
    { ...tooLarge, allowed: 1.5 },
    { ...tooLarge, extra: 1 },
    { snapshot: 'new', needed: 1 },
    'latest',
  ])
    expect(() => captureAccountSessionState(state(null, { ...history, tooLarge: bad }))).toThrow();
  const detail = { cause: 'history-snapshot', needed: 4_400_000, allowed: 4_194_304 };
  const blocked = {
    ...status(7),
    receive: {
      ...lane,
      phase: 'blocked' as const,
      reason: 'inbound-size' as const,
      issueSince: 1,
      receivedThrough: 7,
    },
  };
  const named = captureAccountSessionState(
    state({ ...blocked, receive: { ...blocked.receive, detail } }),
  ).sync!;
  expect(named.receive).toEqual({ ...blocked.receive, detail });
  expect(Object.isFrozen(named.receive.detail)).toBe(true);
  // Status without a detail, as from an older owner, is unchanged.
  expect(captureAccountSessionState(state(blocked)).sync).toEqual(blocked);
  // A malformed detail, or one beside another reason or on the send lane, is dropped.
  for (const sync of [
    { ...blocked, receive: { ...blocked.receive, detail: { ...detail, cause: 'page' } } },
    { ...blocked, receive: { ...blocked.receive, detail: { ...detail, needed: -1 } } },
    { ...blocked, receive: { ...blocked.receive, detail: { ...detail, more: 1 } } },
    { ...blocked, receive: { ...blocked.receive, reason: 'integrity', detail } },
    { ...blocked, send: { ...blocked.send, detail } },
  ]) {
    const { detail: _r, ...receive } = sync.receive as typeof sync.receive & { detail?: unknown };
    const { detail: _s, ...send } = sync.send as typeof sync.send & { detail?: unknown };
    expect(captureAccountSessionState(state(sync)).sync).toEqual({ send, receive });
  }
});
it('carries where a saved snapshot stands, positions since the last one and a replay-bound refusal, refusing malformed ones (phase 547)', () => {
  const state = (history: unknown) => ({
    login: 'remembered',
    sync: null,
    local: null,
    automatic: { phase: 'idle', reason: 'peer', history },
    devices: { remove: false, history: true, detached: false },
  });
  const positions = { since: 3073, allowed: 4096 };
  const replay = { snapshot: 'pending', needed: 4097, allowed: 4096 };
  const history = {
    sequence: 1,
    pending: 'resume',
    canDiscard: true,
    saved: 'blocked',
    positions,
    replay,
    raced: true,
  };
  const kept = captureAccountSessionState(state(history)).automatic!.history!;
  expect(kept).toEqual(history);
  expect(Object.isFrozen(kept.positions)).toBe(true);
  expect(Object.isFrozen(kept.replay)).toBe(true);
  for (const saved of ['sendable', 'waiting', 'blocked', 'superseded', 'stale', 'cancelling'])
    expect(captureAccountSessionState(state({ ...history, saved })).automatic!.history!.saved).toBe(
      saved,
    );
  for (const bad of [
    { ...history, saved: 'other' },
    { ...history, raced: false },
    { ...history, positions: { ...positions, since: -1 } },
    { ...history, positions: { ...positions, extra: 1 } },
    { ...history, positions: { since: 1 } },
    { ...history, replay: { ...replay, snapshot: 'latest' } },
    { ...history, replay: { ...replay, needed: 1.5 } },
    { ...history, replay: { ...replay, more: 1 } },
    { ...history, unknown: 1 },
  ])
    expect(() => captureAccountSessionState(state(bad))).toThrow();
});
