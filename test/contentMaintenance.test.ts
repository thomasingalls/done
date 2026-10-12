// @vitest-environment node
import { expect, it, vi } from 'vitest';
import {
  maintenanceTask,
  MaintenanceInterrupted,
  isMaintenanceTask,
} from '../src/crdt/contentMaintenance';
import type { SessionTask } from '../src/crdt/writeSession';

it('yields before async work, fences the next effect, and retains an in-flight output for cleanup', async () => {
  vi.useFakeTimers();
  const lifetime = new AbortController(),
    input = new AbortController();
  const parent: SessionTask = {
    signal: lifetime.signal,
    step(f) {
      lifetime.signal.throwIfAborted();
      return f();
    },
    async wait(f) {
      lifetime.signal.throwIfAborted();
      const result = await f();
      lifetime.signal.throwIfAborted();
      return result;
    },
  };
  const task = maintenanceTask(parent, input.signal);
  expect(isMaintenanceTask(parent)).toBe(false);
  expect(isMaintenanceTask(task)).toBe(true);
  expect(maintenanceTask(parent)).toBe(parent);
  let release!: (v: Uint8Array) => void;
  try {
    const held = task.wait(
      () =>
        new Promise<Uint8Array>((r) => {
          release = r;
        }),
    );
    input.abort();
    // A cancellation cannot abandon native work or prevent its owner from erasing its output.
    let done = false;
    void held.then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    const output = new Uint8Array([1, 2]);
    release(output);
    expect(await held).toBe(output);
    output.fill(0);
    const effect = vi.fn();
    expect(() => task.step(effect)).toThrow(MaintenanceInterrupted);
    await expect(task.wait(effect)).rejects.toBeInstanceOf(MaintenanceInterrupted);
    expect(effect).not.toHaveBeenCalled();
    expect(task.signal).toBe(lifetime.signal);
    expect(lifetime.signal.aborted).toBe(false);

    const next = maintenanceTask(parent, new AbortController().signal);
    vi.spyOn(performance, 'now').mockReturnValueOnce(100);
    const work = next.wait(effect);
    expect(effect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await work;
    expect(effect).toHaveBeenCalledOnce();
    lifetime.abort(new Error('writer closed'));
    expect(() => task.step(effect)).toThrow('writer closed');
  } finally {
    vi.restoreAllMocks();
    vi.useRealTimers();
  }
});
