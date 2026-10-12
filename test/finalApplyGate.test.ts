// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { createFinalApplyGate, type ImmediateReceiveAttempt } from '../src/crdt/finalApplyGate';
import type { SessionTask } from '../src/crdt/writeSession';
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const task: SessionTask = {
  signal: new AbortController().signal,
  step: (effect) => effect(),
  wait: async (start) => await start(),
};
const fixture = () => {
  const gate = createFinalApplyGate();
  const run = (operation: (task: SessionTask) => Promise<void>) => {
    const request = gate.request();
    return Promise.resolve()
      .then(() => operation(request.wrap(task)))
      .finally(() => request.settle());
  };
  const apply = vi.fn(),
    context = vi.fn();
  const attempt: ImmediateReceiveAttempt = (authorize) => authorize(apply);
  return { gate, run, apply, context, attempt };
};
describe('private immediate final authority permission', () => {
  it('requires successful fresh verification and settled task before synchronous effect', async () => {
    const f = fixture(),
      read = deferred();
    let expired = false;
    const check = f.gate.check(
      () =>
        f.run(async () => {
          await read.promise;
          expired = true;
        }),
      (authorize) => {
        expect(expired).toBe(true);
        const result = authorize(f.apply);
        expect(f.apply).toHaveBeenCalledOnce();
        return result;
      },
      f.context,
    );
    expect(f.apply).not.toHaveBeenCalled();
    read.resolve();
    expect(await check).toBe(true);
    expect(f.context).toHaveBeenCalledOnce();
  });
  it.each(['requested', 'settled', 'aborted'] as const)(
    'invalidates at request even when another task is %s',
    async (state) => {
      const f = fixture(),
        read = deferred(),
        other = deferred();
      const check = f.gate.check(() => f.run(async () => read.promise), f.attempt, f.context);
      const work = f.run(async () => {
        if (state === 'requested') await other.promise;
        if (state === 'aborted') throw Error('abort');
      });
      void work.catch(() => {});
      if (state !== 'requested') await work.catch(() => {});
      read.resolve();
      expect(await check).toBe(false);
      expect(f.apply).not.toHaveBeenCalled();
      other.resolve();
      await work.catch(() => {});
    },
  );
  it('does not declare an aborted operation settled while its native work remains', async () => {
    const f = fixture(),
      native = deferred(),
      started = deferred();
    let settled = false;
    const work = f.run(async (scope) => {
      void scope.wait(() => native.promise);
      started.resolve();
      throw Error('aborted operation');
    });
    void work.catch(() => {
      settled = true;
    });
    await started.promise;
    expect(await f.gate.check(() => f.run(async () => {}), f.attempt, f.context)).toBe(false);
    expect(settled).toBe(false);
    native.resolve();
    await expect(work).rejects.toThrow('aborted');
    expect(settled).toBe(true);
  });
  it('lifecycle invalidation cannot be undone by later success', async () => {
    const f = fixture(),
      read = deferred();
    const work = f.gate.check(() => f.run(async () => read.promise), f.attempt, f.context);
    f.gate.invalidate();
    read.resolve();
    expect(await work).toBe(false);
    expect(f.apply).not.toHaveBeenCalled();
    expect(await f.gate.check(() => f.run(async () => {}), f.attempt, f.context)).toBe(true);
  });
  it('verifier errors remain errors even when activity invalidates the permission', async () => {
    const f = fixture();
    await expect(
      f.gate.check(
        () =>
          f.run(async () => {
            f.gate.invalidate();
            throw Error('bad custody');
          }),
        f.attempt,
        f.context,
      ),
    ).rejects.toThrow('bad custody');
    expect(f.context).not.toHaveBeenCalled();
    expect(f.apply).not.toHaveBeenCalled();
  });
  it('refuses changed context or closed owner even when the scheduling stamp also changed', async () => {
    const f = fixture();
    await expect(
      f.gate.check(
        () =>
          f.run(async () => {
            f.gate.invalidate();
          }),
        f.attempt,
        () => {
          throw Error('old owner');
        },
      ),
    ).rejects.toThrow('old owner');
    expect(f.apply).not.toHaveBeenCalled();
  });
  it('cannot reuse or defer permission after the immediate attempt', async () => {
    const f = fixture();
    let saved!: Parameters<ImmediateReceiveAttempt>[0];
    expect(
      await f.gate.check(
        () => f.run(async () => {}),
        (authorize) => {
          saved = authorize;
          expect(authorize(f.apply)).toBe(true);
          expect(() => authorize(f.apply)).toThrow('consumed');
          return true;
        },
        f.context,
      ),
    ).toBe(true);
    expect(() => saved(f.apply)).toThrow('consumed');
    expect(f.apply).toHaveBeenCalledOnce();
    await f.gate.check(
      () => f.run(async () => {}),
      (authorize) => {
        saved = authorize;
        return false;
      },
      f.context,
    );
    expect(() => saved(f.apply)).toThrow('consumed');
  });
});
