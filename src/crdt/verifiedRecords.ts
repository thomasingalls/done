import { countLedgerWork, ledgerWorkStart, measureLedgerWork } from './accountLedgerMetrics';
/** Owner-local verification reuse. Identity includes every opened record, never only ledger events. */
import type { OpenedRecord } from './contentRecord';
export const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  if (!a.length) {
    // A detached left-hand view must still fail, as the original typed-array every did.
    a.subarray(0, 0);
    return true;
  }
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};
export const copyRecords = (rows: readonly OpenedRecord[]): OpenedRecord[] => {
  const at = ledgerWorkStart();
  const result = rows.map((r) => {
    countLedgerWork('recordCopies');
    countLedgerWork('recordCopyBytes', r.bytes.length);
    return { ...r, bytes: r.bytes.slice() };
  });
  measureLedgerWork('copyRecords', at);
  return result;
};
export const sameRecords = (a: readonly OpenedRecord[], b: readonly OpenedRecord[]): boolean =>
  a.length === b.length &&
  a.every((r, i) => {
    const s = b[i]!;
    return r.kind === s.kind && r.gen === s.gen && r.seq === s.seq && sameBytes(r.bytes, s.bytes);
  });
/** Only detached plain verification data enters here: no keys, tasks or application objects. */
export function eraseVerified(value: unknown): void {
  if (value instanceof Uint8Array) value.fill(0);
  else if (value instanceof Map) for (const v of value.values()) eraseVerified(v);
  else if (value && typeof value === 'object')
    for (const v of Object.values(value)) eraseVerified(v);
}
export function createVerifiedRecords<T>() {
  let retained: OpenedRecord[] | undefined,
    value: T | undefined,
    identity: unknown,
    revision = 0;
  const clear = () => {
    revision++;
    eraseVerified(retained);
    eraseVerified(value);
    retained = undefined;
    value = undefined;
    identity = undefined;
  };
  return {
    clear,
    matches: (records: readonly OpenedRecord[]) => !!retained && sameRecords(retained, records),
    /** A single exact-match pass; the projection is detached before leaving this call. */
    readIfMatches<R>(
      records: readonly OpenedRecord[],
      select: (value: Readonly<T>) => R,
    ): { value: R } | undefined {
      if (!retained || !sameRecords(retained, records)) return;
      const at = ledgerWorkStart();
      const result = { value: structuredClone(select(value!)) };
      measureLedgerWork('readProjection', at);
      return result;
    },
    /** Internal read-only projection; only the selected result is copied to the caller. */
    read<R = T>(
      records: readonly OpenedRecord[],
      select: (value: Readonly<T>) => R = (v) => v as R,
    ): R {
      if (!retained || !sameRecords(retained, records))
        throw Error('No verified view for these records');
      const at = ledgerWorkStart();
      const result = structuredClone(select(value!));
      measureLedgerWork('readProjection', at);
      return result;
    },
    async verify(
      records: readonly OpenedRecord[],
      token: unknown,
      check: (copy: OpenedRecord[]) => Promise<T>,
      current: () => void,
      extend?: (
        previous: Readonly<T>,
        before: readonly OpenedRecord[],
        candidate: OpenedRecord[],
      ) => Promise<T | undefined>,
    ): Promise<void> {
      try {
        current();
      } catch (e) {
        clear();
        throw e;
      }
      if (retained && identity === token && sameRecords(retained, records)) return;
      const previous = value,
        before = retained;
      // A candidate may borrow the previous result only until it has been detached below.
      // Neither a speculative append nor a late verification may publish into this view.
      const at = ++revision,
        candidate = copyRecords(records);
      let result: T | undefined;
      try {
        result =
          previous !== undefined && before && extend
            ? await extend(previous, before, candidate)
            : undefined;
        result ??= await check(candidate);
        current();
        if (at !== revision) throw Error('Verification view was invalidated');
        // Results may reference candidate input buffers. Own both before exposing any readback.
        const atClone = ledgerWorkStart();
        const nextValue = structuredClone(result);
        measureLedgerWork('installClone', atClone);
        const nextRecords = copyRecords(candidate);
        eraseVerified(value);
        eraseVerified(retained);
        value = nextValue;
        retained = nextRecords;
        identity = token;
      } catch (e) {
        eraseVerified(candidate);
        if (at === revision) clear();
        throw e;
      } finally {
        eraseVerified(result);
        eraseVerified(candidate);
      }
    },
  };
}
