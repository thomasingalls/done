/** Private positive authentication memo. It never grants authority or lends stored values. */
import type { SessionTask } from './writeSession';
import { sameBytes } from './verifiedRecords';
import { countLedgerWork } from './accountLedgerMetrics';

// Only the structured values used by custody records are reusable. Unsupported values or
// excessive nesting fall back to authentication, rather than acquiring a new interpretation.
const equal = (a: unknown, b: unknown, depth = 0): boolean => {
  if (depth > 64) return false;
  if (a === null || typeof a !== 'object') return Object.is(a, b);
  if (b === null || typeof b !== 'object') return false;
  if (a instanceof Uint8Array) return b instanceof Uint8Array && sameBytes(a, b);
  if (Array.isArray(a))
    return (
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, i) => Object.hasOwn(b, i) && equal(value, b[i], depth + 1)) &&
      Object.keys(a).length === a.length &&
      Object.keys(b).length === b.length
    );
  if (
    Object.getPrototypeOf(a) !== Object.prototype ||
    Object.getPrototypeOf(b) !== Object.prototype
  )
    return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every(
      (key) =>
        Object.hasOwn(b, key) &&
        equal((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], depth + 1),
    )
  );
};
const erase = (value: unknown, seen = new Set<object>()): void => {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (value instanceof Uint8Array) value.fill(0);
  else for (const child of Object.values(value)) erase(child, seen);
};

export const createAuthorityAuthentication = <T>(options: {
  /** Fresh, detached, complete inventory from the slot under this owner's permit. */
  read(task: SessionTask): Promise<T>;
  /** Fully authenticate these exact values AND match the owner's expected authority. */
  authenticate(task: SessionTask, inventory: T): Promise<void>;
}) => {
  let retained: T | undefined,
    revision = 0,
    busy = false,
    disposed = false;
  const invalidate = () => {
    revision++;
    erase(retained);
    retained = undefined;
  };
  return {
    invalidate,
    dispose() {
      disposed = true;
      invalidate();
    },
    async check(task: SessionTask): Promise<void> {
      task.step(() => {
        if (disposed || busy) throw Error('Account authority verification is not available');
        busy = true;
      });
      const started = revision;
      const live = () =>
        task.step(() => {
          if (disposed || revision !== started)
            throw Error('Account authority verification was invalidated');
        });
      let inventory: T | undefined, snapshot: T | undefined;
      try {
        inventory = await task.wait(() => options.read(task));
        live();
        if (retained !== undefined && equal(retained, inventory)) {
          countLedgerWork('authorityReuses');
          return;
        }
        // Capture BEFORE authenticating. Never install a reread that wasn't authenticated.
        snapshot = structuredClone(inventory);
        countLedgerWork('authorityAuthentications');
        await task.wait(() => options.authenticate(task, inventory!));
        live();
        // A verifier must not mutate its input; callers cannot poison the retained copy.
        if (equal(snapshot, inventory)) {
          erase(retained);
          retained = snapshot;
          snapshot = undefined;
        } else {
          erase(retained);
          retained = undefined;
        }
      } catch (cause) {
        invalidate();
        throw cause;
      } finally {
        erase(inventory);
        erase(snapshot);
        busy = false;
      }
    },
  };
};
