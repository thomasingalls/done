import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWarmAuditScheduler, type WarmAuditOutcome } from '../src/crdt/warmAuditScheduler';
import { MaintenanceInterrupted } from '../src/crdt/contentMaintenance';

const owners: ReturnType<typeof createWarmAuditScheduler>[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
});
afterEach(() => {
  for (const owner of owners.splice(0)) owner.close();
  vi.clearAllTimers();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);
function fixture(
  initialRows = 256,
  perform?: (ready: () => boolean, complete: () => void) => Promise<WarmAuditOutcome>,
) {
  const state = { rows: initialRows, nextDue: 300_000, effects: 0 };
  const abort = new AbortController();
  const complete = () => {
    state.rows = 0;
    state.nextDue = Date.now() + 300_000;
    state.effects++;
  };
  const run = vi.fn(async (ready: () => boolean): Promise<WarmAuditOutcome> => {
    if (perform) return perform(ready, complete);
    if (!ready()) return 'deferred';
    complete();
    return true;
  });
  const owner = createWarmAuditScheduler({
    signal: abort.signal,
    due: () => state.rows >= 256 || Date.now() >= state.nextDue,
    delay: () => Math.max(0, state.nextDue - Date.now()),
    pendingRows: () => state.rows,
    run,
  });
  owners.push(owner);
  return { owner, state, abort, run };
}

describe('owned warm audit timer', () => {
  it('a due owner with no local input audits once and keeps the old time deadline', async () => {
    const f = fixture();
    await advance(0);
    expect(f.state.effects).toBe(1);
    await advance(299_999);
    expect(f.state.effects).toBe(1);
    await advance(1);
    expect(f.state.effects).toBe(2);
  });

  it('the five-minute rule stays due without new rows or local input', async () => {
    const f = fixture(0);
    await advance(299_999);
    expect(f.run).not.toHaveBeenCalled();
    await advance(1);
    expect(f.state.effects).toBe(1);
  });

  it('repeated input postpones a due start until the newest quiet boundary', async () => {
    const f = fixture();
    f.owner.input();
    await advance(999);
    expect(f.run).not.toHaveBeenCalled();
    f.owner.input();
    await advance(999);
    expect(f.run).not.toHaveBeenCalled();
    await advance(1);
    expect(f.state.effects).toBe(1);
  });

  it('queued foreground work parks the timer until actual settlement', async () => {
    const f = fixture();
    const settle = f.owner.foreground();
    await advance(10_000);
    expect(f.run).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    settle();
    await advance(0);
    expect(f.state.effects).toBe(1);
  });

  it('one settled job cannot release another queued job', async () => {
    const f = fixture();
    const first = f.owner.foreground();
    const second = f.owner.foreground();
    first();
    first();
    await advance(2000);
    expect(f.run).not.toHaveBeenCalled();
    second();
    await advance(0);
    expect(f.state.effects).toBe(1);
  });

  it('the cap forces an attempt while input and foreground work continue', async () => {
    const f = fixture(1023);
    const settle = f.owner.foreground();
    f.owner.input();
    await advance(1000);
    expect(f.run).not.toHaveBeenCalled();
    f.state.rows = 1024;
    f.owner.refresh();
    f.owner.input();
    await advance(0);
    expect(f.state.effects).toBe(1);
    settle();
  });

  it('readiness is rechecked at the actual storage queue head after new input', async () => {
    let head!: () => void;
    const f = fixture(
      256,
      (ready, complete) =>
        new Promise((resolve) => {
          head = () => {
            if (!ready()) return resolve('deferred');
            complete();
            resolve(true);
          };
        }),
    );
    await advance(0);
    expect(f.run).toHaveBeenCalledTimes(1);
    f.owner.input();
    head();
    await advance(999);
    expect(f.state.effects).toBe(0);
    expect(f.run).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(f.run).toHaveBeenCalledTimes(2);
    head();
    await advance(0);
    expect(f.state.effects).toBe(1);
  });

  it('readiness is rechecked at queue head after another foreground job arrives', async () => {
    let head!: () => void;
    const f = fixture(
      256,
      (ready, complete) =>
        new Promise((resolve) => {
          head = () => {
            if (!ready()) return resolve('deferred');
            complete();
            resolve(true);
          };
        }),
    );
    await advance(0);
    const settle = f.owner.foreground();
    head();
    await advance(2000);
    expect(f.state.effects).toBe(0);
    expect(f.run).toHaveBeenCalledTimes(1);
    settle();
    await advance(0);
    head();
    await advance(0);
    expect(f.state.effects).toBe(1);
  });

  it('partial audit slices still wait for input quiet before continuing', async () => {
    let calls = 0;
    const f = fixture(256, async (ready, complete) => {
      if (!ready()) return 'deferred';
      if (++calls === 1) return false;
      complete();
      return true;
    });
    await advance(0);
    expect(f.run).toHaveBeenCalledTimes(1);
    f.owner.input();
    await advance(999);
    expect(f.run).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(f.state.effects).toBe(1);
  });

  it('an existing interruption still wins over the forced cap attempt', async () => {
    let effects = 0;
    const guard = vi.fn(() => {
      throw new MaintenanceInterrupted();
    });
    const f = fixture(1024, async (ready) => {
      if (!ready()) return 'deferred';
      guard();
      effects++;
      return true;
    });
    f.owner.input();
    await advance(0);
    f.owner.close();
    expect(guard).toHaveBeenCalledTimes(1);
    expect(effects).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('close cancels a pending quiet-period timer immediately', async () => {
    const f = fixture();
    f.owner.input();
    expect(vi.getTimerCount()).toBe(1);
    f.owner.close();
    expect(vi.getTimerCount()).toBe(0);
    await advance(10_000);
    expect(f.run).not.toHaveBeenCalled();
  });

  it('close clears the timer and late foreground settlement cannot rearm it', async () => {
    const f = fixture();
    const settle = f.owner.foreground();
    f.owner.input();
    f.owner.close();
    settle();
    f.owner.refresh();
    f.owner.input();
    f.state.rows = 2048;
    f.owner.refresh();
    await advance(600_000);
    expect(f.run).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('close during an enqueued audit invalidates its queue-head start', async () => {
    let head!: () => void;
    const f = fixture(
      256,
      (ready, complete) =>
        new Promise((resolve) => {
          head = () => {
            if (!ready()) return resolve('deferred');
            complete();
            resolve(true);
          };
        }),
    );
    await advance(0);
    f.abort.abort();
    head();
    await advance(600_000);
    expect(f.state.effects).toBe(0);
    expect(f.run).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('an already-aborted owner creates no timer or native work', async () => {
    const abort = new AbortController();
    abort.abort();
    const run = vi.fn();
    const metadata = vi.fn(() => {
      throw Error('Closed metadata must not be read');
    });
    const owner = createWarmAuditScheduler({
      signal: abort.signal,
      due: metadata,
      delay: metadata,
      pendingRows: metadata,
      run,
    });
    owners.push(owner);
    owner.foreground()();
    owner.input();
    owner.refresh();
    await advance(600_000);
    expect(metadata).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
