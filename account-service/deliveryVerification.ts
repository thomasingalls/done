/** Bounded, core-owned reuse of cryptographic evidence only. No keys or commit authority. */
const MAX_ENTRIES = 512,
  MAX_BYTES = 16 * 1024 * 1024;
function size(value: unknown): number {
  if (value instanceof Uint8Array) return value.byteLength;
  if (typeof value === 'string') return value.length * 2;
  if (value && typeof value === 'object')
    return 32 + Object.entries(value).reduce((n, [k, v]) => n + k.length * 2 + size(v), 0);
  return 8;
}
function erase(value: unknown): void {
  if (value instanceof Uint8Array) value.fill(0);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) erase(v);
}
export function createDeliveryVerification() {
  const entries = new Map<
    string,
    { context: string; inputs: Uint8Array[]; value: unknown; size: number }
  >();
  let bytes = 0,
    revision = 0;
  const remove = (slot: string) => {
    const entry = entries.get(slot);
    if (entry) {
      bytes -= entry.size;
      erase(entry);
      entries.delete(slot);
    }
  };
  return {
    clear() {
      revision++;
      for (const slot of entries.keys()) remove(slot);
    },
    async check<T>(
      slot: string,
      context: string,
      inputs: readonly Uint8Array[],
      verify: () => Promise<T>,
    ): Promise<T> {
      const old = entries.get(slot);
      if (
        old?.context === context &&
        old.inputs.length === inputs.length &&
        inputs.every(
          (b, i) =>
            b.length === old.inputs[i]!.length && b.every((v, j) => v === old.inputs[i]![j]),
        )
      ) {
        entries.delete(slot);
        entries.set(slot, old);
        return structuredClone(old.value) as T;
      }
      remove(slot);
      const at = revision,
        copy = inputs.map((b) => b.slice());
      let value: T | undefined;
      try {
        value = await verify();
        // An overlapping close can finish verification, but cannot repopulate the closed core cache.
        const charge = size([slot, context, copy, value]);
        if (revision === at && charge <= MAX_BYTES) {
          while (entries.size >= MAX_ENTRIES || bytes + charge > MAX_BYTES)
            remove(entries.keys().next().value!);
          remove(slot); // Another concurrent request may have filled this slot while we awaited crypto.
          entries.set(slot, {
            context,
            inputs: copy.map((b) => b.slice()),
            value: structuredClone(value),
            size: charge,
          });
          bytes += charge;
        }
        return structuredClone(value);
      } finally {
        erase(copy);
        erase(value);
      }
    },
  };
}
export type DeliveryVerification = ReturnType<typeof createDeliveryVerification>;
