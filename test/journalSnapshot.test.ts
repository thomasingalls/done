// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fc from 'fast-check';
import { createJournalOwner, eraseJournalSnapshot } from '../src/crdt/journalStore';
import { JournalError, createJournalCodec } from '../src/crdt/journalCodec';
import { startupRefusal } from '../src/crdt/ownedStartup';
import type { SessionTask } from '../src/crdt/writeSession';

const scope = {
  slotId: 'slot',
  principalId: 'principal',
  workspaceId: 'workspace',
  storeId: '11'.repeat(16),
  rootId: '22'.repeat(16),
};
const taskFor = (controller: AbortController): SessionTask => ({
  signal: controller.signal,
  step: (fn) => {
    controller.signal.throwIfAborted();
    return fn();
  },
  wait: async (fn) => {
    controller.signal.throwIfAborted();
    const result = await fn();
    controller.signal.throwIfAborted();
    return result;
  },
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
  vi.unstubAllGlobals();
});

// The shared Node-26 identity-test double does not enumerate stored keys. This carrier double does.
class EnumeratedStorage implements Storage {
  [name: string]: unknown;
  get length(): number {
    return Reflect.ownKeys(this).length;
  }
  key(index: number): string | null {
    return (Reflect.ownKeys(this)[index] as string) ?? null;
  }
  getItem(key: string): string | null {
    return Object.hasOwn(this, key) ? (this[key] as string) : null;
  }
  setItem(key: string, value: string): void {
    Object.defineProperty(this, key, {
      value: String(value),
      enumerable: true,
      configurable: true,
    });
  }
  removeItem(key: string): void {
    Reflect.deleteProperty(this, key);
  }
  clear(): void {
    for (const key of Reflect.ownKeys(this)) Reflect.deleteProperty(this, key);
  }
}

function fixture(changes: number) {
  vi.stubGlobal('localStorage', new EnumeratedStorage());
  const key = new Uint8Array(32),
    owner = createJournalOwner(scope, 'test', 1, key),
    peer = createJournalOwner(scope, 'test', 1, key);
  const controller = new AbortController(),
    task = taskFor(controller);
  expect(owner.append(Uint8Array.from([0, 0])).status).toBe('journalled');
  let first = true,
    attempts = 0,
    remaining = changes;
  const keys = Object.keys;
  vi.spyOn(Object, 'keys').mockImplementation((value) => {
    const result = keys(value);
    if (value === localStorage) {
      if (first) {
        attempts++;
        if (remaining-- > 0) peer.append(Uint8Array.from([0, 0]));
      }
      first = !first;
    }
    return result;
  });
  return {
    owner,
    peer,
    controller,
    task,
    attempts: () => attempts,
    dispose: () => {
      owner.dispose();
      peer.dispose();
      vi.restoreAllMocks();
      localStorage.clear();
    },
  };
}

describe('bounded read-only journal acquisition', () => {
  it('preserves every immutable entry across generated transient/sustained append schedules', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 7 }), async (changes) => {
        const f = fixture(changes);
        try {
          if (changes < 3) {
            const entries = await f.owner.readSnapshot(f.task);
            expect(entries).toHaveLength(changes + 1);
            expect(entries.every((e) => e.bytes[0] === 0 && e.bytes[1] === 0)).toBe(true);
            eraseJournalSnapshot(entries);
          } else
            await expect(f.owner.readSnapshot(f.task)).rejects.toMatchObject({
              code: 'journal-busy',
            });
          expect(f.attempts()).toBe(Math.min(changes + 1, 3));
          expect(localStorage.length).toBe(1 + Math.min(changes, 3));
        } finally {
          f.dispose();
        }
      }),
      { seed: 8941, numRuns: 100 },
    );
  });
  it('counts a failed synchronous invocation capture inside the same three-attempt budget', async () => {
    const f = fixture(4);
    try {
      let failure: JournalError | undefined;
      try {
        f.owner.snapshot();
      } catch (e) {
        failure = e as JournalError;
      }
      expect(failure?.code).toBe('journal-changed');
      await expect(f.owner.readSnapshot(f.task, failure)).rejects.toMatchObject({
        code: 'journal-busy',
      });
      expect(f.attempts()).toBe(3);
    } finally {
      f.dispose();
    }
  });
  it('cancels an outstanding retry timer without another read', async () => {
    vi.useFakeTimers();
    const f = fixture(1);
    try {
      const result = f.owner.readSnapshot(f.task);
      const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
      expect(f.attempts()).toBe(1);
      expect(vi.getTimerCount()).toBe(1);
      f.controller.abort();
      await rejected;
      expect(vi.getTimerCount()).toBe(0);
      await vi.runAllTimersAsync();
      expect(f.attempts()).toBe(1);
    } finally {
      f.dispose();
    }
  });
  it('does not retry an unavailable read or a damaged entry', async () => {
    const f = fixture(0);
    try {
      vi.spyOn(EnumeratedStorage.prototype, 'getItem').mockImplementationOnce(() => {
        throw new DOMException('unavailable', 'SecurityError');
      });
      await expect(f.owner.readSnapshot(f.task)).rejects.toMatchObject({ code: 'unavailable' });
      expect(f.attempts()).toBe(1);
    } finally {
      f.dispose();
    }
    const g = fixture(0);
    try {
      const key = localStorage.key(0)!;
      localStorage.setItem(key, '1:unsupported');
      await expect(g.owner.readSnapshot(g.task)).rejects.toMatchObject({ code: 'repair-required' });
      expect(g.attempts()).toBe(1);
      expect(localStorage.getItem(key)).toBe('1:unsupported');
    } finally {
      g.dispose();
    }
  });
  it('does not mistake another failure for a retryable first capture', async () => {
    const f = fixture(0);
    try {
      const cause = new JournalError('repair-required', 'damaged');
      await expect(f.owner.readSnapshot(f.task, cause)).rejects.toBe(cause);
      expect(f.attempts()).toBe(0);
    } finally {
      f.dispose();
    }
  });
  it('refuses a detected immutable-value replacement rather than retrying it as churn', async () => {
    const f = fixture(0),
      codec = createJournalCodec(scope.workspaceId, 1, new Uint8Array(32));
    try {
      const key = localStorage.key(0)!;
      const replacement = codec.seal(key, new Uint8Array(24).fill(5), Uint8Array.from([0, 0]));
      vi.restoreAllMocks();
      const keys = Object.keys;
      let enumerations = 0;
      vi.spyOn(Object, 'keys').mockImplementation((value) => {
        const captured = keys(value);
        if (value === localStorage && ++enumerations === 2) localStorage.setItem(key, replacement);
        return captured;
      });
      await expect(f.owner.readSnapshot(f.task)).rejects.toMatchObject({ code: 'repair-required' });
      expect(enumerations).toBe(2);
      expect(localStorage.getItem(key)).toBe(replacement);
      await expect(f.owner.readSnapshot(f.task)).rejects.toMatchObject({ code: 'repair-required' });
      expect(enumerations).toBe(2);
    } finally {
      codec.dispose();
      f.dispose();
    }
  });
  it('distinguishes exhausted contention at startup and gives cancellation precedence', () => {
    const busy = new JournalError('journal-busy', 'busy');
    expect(startupRefusal(busy)).toEqual({ kind: 'busy', reason: 'journal-read-contention' });
    expect(startupRefusal(busy, AbortSignal.abort())).toMatchObject({ kind: 'cancelled' });
    expect(startupRefusal(new JournalError('repair-required', 'damaged'))).toMatchObject({
      kind: 'repair-required',
    });
  });
});
