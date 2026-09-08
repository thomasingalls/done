// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  openWriteSession,
  slotPermitName,
  type SessionTask,
  type WriteSession,
  type WriteSessionOptions,
} from '../src/crdt/writeSession';

afterEach(() => vi.unstubAllGlobals());

describe('write-session boundary', () => {
  it('binds one stable coordination domain to exact slot identity', () => {
    expect(slotPermitName('slot-1')).toBe('done/slot-writer/"slot-1"');
    const ids = ['a/b', 'a', 'b', 'a|b', '"a"', '\\', '\ud800', '\ufffd', 'é', 'e\u0301'];
    expect(new Set(ids.map(slotPermitName)).size).toBe(ids.length);
    expect(() => slotPermitName('')).toThrow('nonempty slot');
  });

  it('refuses absent Web Locks before initialization', async () => {
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', {});
    const initialize = vi.fn();
    await expect(openWriteSession('slot', { initialize, dispose: () => {} })).rejects.toMatchObject(
      {
        code: 'unsupported',
      },
    );
    expect(initialize).not.toHaveBeenCalled();
  });

  it('refuses an insecure runtime before attempting a lock request', async () => {
    vi.stubGlobal('isSecureContext', false);
    const request = vi.fn();
    vi.stubGlobal('navigator', { locks: { request } });
    await expect(openWriteSession('slot')).rejects.toMatchObject({ code: 'unsupported' });
    expect(request).not.toHaveBeenCalled();
  });

  it('reports a denied LockManager getter as a typed refusal', async () => {
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', {
      get locks() {
        throw new Error('denied');
      },
    });
    await expect(openWriteSession('slot')).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('does not enqueue a request that is already cancelled', async () => {
    vi.stubGlobal('isSecureContext', true);
    const request = vi.fn();
    vi.stubGlobal('navigator', { locks: { request } });
    await expect(openWriteSession('slot', { signal: AbortSignal.abort() })).rejects.toMatchObject({
      code: 'cancelled',
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('requires cleanup before allowing initialization to load capabilities', async () => {
    vi.stubGlobal('isSecureContext', true);
    const request = vi.fn();
    vi.stubGlobal('navigator', { locks: { request } });
    const incomplete = { initialize: vi.fn() } as unknown as WriteSessionOptions;
    await expect(openWriteSession('slot', incomplete)).rejects.toMatchObject({
      code: 'invalid-options',
    });
    expect(request).not.toHaveBeenCalled();
    expect(incomplete.initialize).not.toHaveBeenCalled();
  });

  it('types synchronous effects separately from awaited native work', () => {
    // Compile-time consumer checks; these functions are not invoked at runtime.
    const consumer = (session: WriteSession, task: SessionTask) => {
      // @ts-expect-error loading resources requires their cleanup even if initialization fails
      void openWriteSession('slot', { initialize: () => {} });
      session.write(() => 1);
      task.step(() => 1);
      // @ts-expect-error an async function is not a synchronous journal effect
      session.write(async () => 1);
      // @ts-expect-error continuations must use wait and a subsequent guarded step
      task.step(async () => 1);
      return task.wait(async () => 1);
    };
    expect(typeof consumer).toBe('function');
  });
});
