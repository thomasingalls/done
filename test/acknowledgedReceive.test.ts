// @vitest-environment node
import { expect, it } from 'vitest';
import { createAcknowledgedReceiveFinish } from '../src/crdt/acknowledgedReceive';
import type { SessionTask } from '../src/crdt/writeSession';
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
function fixture() {
  const stop = new AbortController(),
    entered = deferred();
  let held = false,
    applied = 0,
    failed = 0,
    checks = 0,
    valid = true;
  const live = () => {
    if (!held || stop.signal.aborted) throw Error('expired task');
  };
  const task: SessionTask = {
    signal: stop.signal,
    step: (fn) => {
      live();
      return fn();
    },
    wait: async (fn) => {
      live();
      const v = await fn();
      live();
      return v;
    },
  };
  const finish = createAcknowledgedReceiveFinish(
    async (work) => {
      expect(held).toBe(false);
      held = true;
      entered.resolve();
      try {
        await work(task);
      } finally {
        held = false;
      }
    },
    async (t) => {
      checks++;
      t.step(() => {
        if (!valid) throw Error('authority changed');
      });
    },
    () => {
      if (!valid) throw Error('authority changed');
    },
    () => applied++,
    () => failed++,
  );
  return {
    finish,
    stop,
    entered,
    invalidate: () => (valid = false),
    state: () => ({ held, applied, failed, checks }),
  };
}
it('keeps the actual checking task and pending promotion through asynchronous apply acknowledgment', async () => {
  const f = fixture(),
    ack = deferred(),
    started = deferred();
  const work = f.finish(async () => {
    expect(f.state().held).toBe(true);
    started.resolve();
    await ack.promise;
  });
  await started.promise;
  expect(f.state()).toEqual({ held: true, applied: 0, failed: 0, checks: 1 });
  ack.resolve();
  await work;
  expect(f.state()).toEqual({ held: false, applied: 1, failed: 0, checks: 1 });
});
it('does not apply after the fresh native/context check refuses', async () => {
  const f = fixture();
  f.invalidate();
  let called = false;
  await expect(
    f.finish(async () => {
      called = true;
    }),
  ).rejects.toThrow('authority changed');
  expect(called).toBe(false);
  expect(f.state()).toEqual({ held: false, applied: 0, failed: 1, checks: 1 });
});
it('a cancelled task after Window application never declares the native handoff completed', async () => {
  const f = fixture(),
    ack = deferred(),
    started = deferred();
  let calls = 0;
  const work = f.finish(async () => {
    calls++;
    started.resolve();
    await ack.promise;
  });
  await started.promise;
  f.stop.abort();
  ack.resolve();
  await expect(work).rejects.toThrow('expired task');
  expect(calls).toBe(1);
  expect(f.state()).toEqual({ held: false, applied: 0, failed: 1, checks: 1 });
});
it('lost or refused apply acknowledgment closes without releasing pending-promotion exclusion as success', async () => {
  const f = fixture();
  await expect(
    f.finish(async () => {
      throw Error('reply lost');
    }),
  ).rejects.toThrow('reply lost');
  expect(f.state()).toEqual({ held: false, applied: 0, failed: 1, checks: 1 });
});
it('concurrent and replayed finish calls never apply twice', async () => {
  const f = fixture(),
    ack = deferred(),
    started = deferred();
  let calls = 0;
  const work = f.finish(async () => {
    calls++;
    started.resolve();
    await ack.promise;
  });
  await started.promise;
  await expect(
    f.finish(async () => {
      calls++;
    }),
  ).rejects.toThrow('already consumed');
  ack.resolve();
  await work;
  await expect(
    f.finish(async () => {
      calls++;
    }),
  ).rejects.toThrow('already consumed');
  expect(calls).toBe(1);
  expect(f.state().checks).toBe(1);
});
it('exceptions in synchronous completion are uncertain and fail closed', async () => {
  let failures = 0;
  const task: SessionTask = {
    signal: new AbortController().signal,
    step: (fn) => fn(),
    wait: async (fn) => fn(),
  };
  const finish = createAcknowledgedReceiveFinish(
    async (fn) => fn(task),
    async () => {},
    () => {},
    () => {
      throw Error('completion failed');
    },
    () => failures++,
  );
  await expect(finish(async () => {})).rejects.toThrow('completion failed');
  expect(failures).toBe(1);
});

it('context invalidated while acknowledgment is outstanding cannot clear the pending promotion', async () => {
  const f = fixture(),
    ack = deferred(),
    started = deferred();
  const work = f.finish(async () => {
    started.resolve();
    await ack.promise;
  });
  await started.promise;
  f.invalidate();
  ack.resolve();
  await expect(work).rejects.toThrow('authority changed');
  expect(f.state()).toEqual({ held: false, applied: 0, failed: 1, checks: 1 });
});
it('copies narrow context only after fresh checking and retains its real task until apply acknowledgment', async () => {
  const ack = deferred(),
    started = deferred(),
    stop = new AbortController(),
    key = new Uint8Array(32).fill(7);
  let held = false,
    checked = false,
    applied = 0,
    disposed = 0;
  const task: SessionTask = {
    signal: stop.signal,
    step: (fn) => {
      expect(held).toBe(true);
      return fn();
    },
    wait: async (fn) => {
      expect(held).toBe(true);
      return fn();
    },
  };
  const finish = createAcknowledgedReceiveFinish<{ key: Uint8Array }>(
    async (work) => {
      held = true;
      try {
        await work(task, async () => {
          expect(checked).toBe(true);
          return { key };
        });
      } finally {
        held = false;
      }
    },
    async () => {
      checked = true;
    },
    () => {},
    () => applied++,
    () => {},
    {
      dispose: (v) => {
        v.key.fill(0);
        disposed++;
      },
    },
  );
  const work = finish.withContext(async (context) => {
    expect(Object.keys(context)).toEqual(['key']);
    expect(context.key[0]).toBe(7);
    expect(held).toBe(true);
    started.resolve();
    await ack.promise;
  });
  await started.promise;
  expect(applied).toBe(0);
  expect(disposed).toBe(0);
  ack.resolve();
  await work;
  expect(applied).toBe(1);
  expect(disposed).toBe(1);
  expect(key.every((v) => v === 0)).toBe(true);
  expect(held).toBe(false);
});
it('ordinary and contextual variants consume the same one-shot native handoff', async () => {
  const task: SessionTask = {
    signal: new AbortController().signal,
    step: (fn) => fn(),
    wait: async (fn) => fn(),
  };
  let reads = 0,
    applied = 0;
  const finish = createAcknowledgedReceiveFinish<number>(
    async (work) =>
      work(task, async () => {
        reads++;
        return 3;
      }),
    async () => {},
    () => {},
    () => applied++,
    () => {},
    { dispose: () => {} },
  );
  await finish(async () => {});
  await expect(finish.withContext(async () => {})).rejects.toThrow('already consumed');
  expect(reads).toBe(0);
  expect(applied).toBe(1);
  const next = createAcknowledgedReceiveFinish<number>(
    async (work) => work(task, async () => 3),
    async () => {},
    () => {},
    () => applied++,
    () => {},
    { dispose: () => {} },
  );
  await next.withContext(async () => {});
  await expect(next(async () => {})).rejects.toThrow('already consumed');
  expect(applied).toBe(2);
});
it('missing actual within-task context support cannot dispatch an apply', async () => {
  const task: SessionTask = {
    signal: new AbortController().signal,
    step: (fn) => fn(),
    wait: async (fn) => fn(),
  };
  let applies = 0,
    failures = 0;
  const finish = createAcknowledgedReceiveFinish(
    async (work) => work(task),
    async () => {},
    () => {},
    () => applies++,
    () => failures++,
  );
  await expect(
    finish.withContext(async () => {
      applies++;
    }),
  ).rejects.toThrow('context is unavailable');
  expect(applies).toBe(0);
  expect(failures).toBe(1);
});
it('context copies returned during cancellation are erased before the failed task is released', async () => {
  const read = deferred(),
    started = deferred(),
    stop = new AbortController(),
    key = new Uint8Array(32).fill(9);
  let held = false,
    disposed = 0,
    applied = 0;
  const live = () => {
    if (stop.signal.aborted) throw Error('closed native task');
  };
  const task: SessionTask = {
    signal: stop.signal,
    step: (fn) => {
      live();
      return fn();
    },
    wait: async (fn) => {
      live();
      const v = await fn();
      live();
      return v;
    },
  };
  const finish = createAcknowledgedReceiveFinish<{ key: Uint8Array }>(
    async (work) => {
      held = true;
      try {
        await work(task, async () => {
          started.resolve();
          await read.promise;
          return { key };
        });
      } finally {
        expect(key.every((v) => v === 0)).toBe(true);
        held = false;
      }
    },
    async () => {},
    () => {},
    () => applied++,
    () => {},
    {
      dispose: (v) => {
        expect(held).toBe(true);
        v.key.fill(0);
        disposed++;
      },
    },
  );
  const work = finish.withContext(async () => {
    applied++;
  });
  await started.promise;
  stop.abort();
  read.resolve();
  await expect(work).rejects.toThrow('closed native task');
  expect(applied).toBe(0);
  expect(disposed).toBe(1);
  expect(held).toBe(false);
});
it('context is disposed on a refused Window apply and pending promotion is not cleared', async () => {
  const task: SessionTask = {
      signal: new AbortController().signal,
      step: (fn) => fn(),
      wait: async (fn) => fn(),
    },
    key = new Uint8Array(32).fill(5);
  let applied = 0,
    failed = 0;
  const finish = createAcknowledgedReceiveFinish<{ key: Uint8Array }>(
    async (work) => work(task, async () => ({ key })),
    async () => {},
    () => {},
    () => applied++,
    () => failed++,
    { dispose: (v) => v.key.fill(0) },
  );
  await expect(
    finish.withContext(async () => {
      throw Error('Window closed');
    }),
  ).rejects.toThrow('Window closed');
  expect(applied).toBe(0);
  expect(failed).toBe(1);
  expect(key.every((v) => v === 0)).toBe(true);
});
