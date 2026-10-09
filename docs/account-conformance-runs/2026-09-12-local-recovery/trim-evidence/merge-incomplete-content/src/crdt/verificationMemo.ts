/** Private, owner-scoped crypto reuse. Semantic reducers and commit guards always run again. */
import { eraseVerified, sameBytes } from './verifiedRecords';
export function createVerificationMemo() {
  const entries = new Map<string, { context: string; inputs: Uint8Array[]; value: unknown }>();
  let revision = 0;
  const clear = () => {
    revision++;
    for (const entry of entries.values()) eraseVerified(entry);
    entries.clear();
  };
  return {
    clear,
    retain(slots: ReadonlySet<string>) {
      for (const [slot, entry] of entries)
        if (!slots.has(slot)) {
          eraseVerified(entry);
          entries.delete(slot);
        }
    },
    async check<T>(
      slot: string,
      context: string,
      inputs: readonly Uint8Array[],
      verify: () => Promise<T>,
      current: () => void,
    ): Promise<T> {
      current();
      const previous = entries.get(slot);
      if (
        previous?.context === context &&
        previous.inputs.length === inputs.length &&
        inputs.every((b, i) => sameBytes(b, previous.inputs[i]!))
      )
        return structuredClone(previous.value) as T;
      eraseVerified(previous);
      entries.delete(slot);
      const at = revision,
        copy = inputs.map((b) => b.slice());
      let value: T | undefined;
      try {
        value = await verify();
        current();
        if (at !== revision) throw Error('Verification owner changed');
        entries.set(slot, { context, inputs: copy, value: structuredClone(value) });
        return structuredClone(value);
      } catch (e) {
        eraseVerified(copy);
        throw e;
      } finally {
        eraseVerified(value);
      }
    },
  };
}
export type VerificationMemo = ReturnType<typeof createVerificationMemo>;
