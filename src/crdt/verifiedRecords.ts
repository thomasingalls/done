/** Owner-local verification reuse. Identity includes every opened record, never only ledger events. */
import type { OpenedRecord } from './contentRecord';
export const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);
export const copyRecords = (rows: readonly OpenedRecord[]): OpenedRecord[] =>
  rows.map((r) => ({ ...r, bytes: r.bytes.slice() }));
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
    /** Internal read-only projection; only the selected result is copied to the caller. */
    read<R = T>(
      records: readonly OpenedRecord[],
      select: (value: Readonly<T>) => R = (v) => v as R,
    ): R {
      if (!retained || !sameRecords(retained, records))
        throw Error('No verified view for these records');
      return structuredClone(select(value!));
    },
    async verify(
      records: readonly OpenedRecord[],
      token: unknown,
      check: (copy: OpenedRecord[]) => Promise<T>,
      current: () => void,
    ): Promise<void> {
      try {
        current();
      } catch (e) {
        clear();
        throw e;
      }
      if (retained && identity === token && sameRecords(retained, records)) return;
      clear();
      const at = revision,
        candidate = copyRecords(records);
      let result: T | undefined;
      try {
        result = await check(candidate);
        current();
        if (at !== revision) throw Error('Verification view was invalidated');
        // Results may reference candidate input buffers. Own both before exposing any readback.
        value = structuredClone(result);
        retained = copyRecords(candidate);
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
