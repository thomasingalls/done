/** Private adapter for the non-deleting Account experiment. Never persist the semantic v2 view:
 * allocation consumers use it, but every disk write/MAC retains the authenticated v3 pointer. */
import {
  corrupt,
  parseCounter,
  counterPayload,
  type ContentCounter,
  type ContentIdentity,
} from './contentRecord';
import {
  parseBaselineCounter,
  baselineCounterPayload,
  type BaselinePointer,
} from './localBaselineAnchor';

export function createBaselineMetadata(scope: ContentIdentity) {
  let pointer: BaselinePointer | undefined;
  const stored = (counter: ContentCounter) => {
    if (!pointer) return counter;
    if (counter.v !== 2) return corrupt('Baseline requires Account allocation metadata.');
    return { ...counter, v: 3 as const, baseline: structuredClone(pointer) };
  };
  return {
    active: () => !!pointer,
    parse(value: unknown, intent: string): ContentCounter {
      if ((value as { v?: unknown } | null)?.v !== 3) {
        if (pointer) return corrupt('Baseline metadata was downgraded.');
        return parseCounter(value, scope, intent);
      }
      const parsed = parseBaselineCounter(value, scope, intent);
      if (pointer && JSON.stringify(pointer) !== JSON.stringify(parsed.baseline))
        return corrupt('Baseline anchor changed during ownership.');
      pointer = structuredClone(parsed.baseline);
      const { baseline: _baseline, ...allocation } = parsed;
      return { ...allocation, v: 2 };
    },
    stored,
    payload(counter: ContentCounter) {
      const value = stored(counter);
      return value.v === 3 ? baselineCounterPayload(scope, value) : counterPayload(scope, value);
    },
    metadataKeys(keys: IDBValidKey[]) {
      const expected: IDBValidKey[] = ['counter'];
      if (pointer) for (let i = 0; i < pointer.chunks; i++) expected.push(['local-baseline', i]);
      if (
        keys.length !== expected.length ||
        expected.some((key) => !keys.some((k) => indexedDB.cmp(key, k) === 0))
      )
        return corrupt('Baseline metadata keys differ.');
    },
    reservedSequence(seq: number) {
      return (
        !!pointer && seq >= pointer.firstSequence && seq < pointer.firstSequence + pointer.chunks
      );
    },
  };
}
