/** Private, owner-scoped crypto reuse. Semantic reducers and commit guards always run again. */
import { READ_COUNT_LIMIT } from '../../account-protocol/deliveryTransport';
import { eraseVerified, sameBytes } from './verifiedRecords';
/** Count retained buffer capacity, including subview backing storage, once per owned graph.
 * Object/string overhead and process RAM are outside this byte-budget observation. */
function bufferCapacity(value: unknown): number {
  const objects = new Set<object>(),
    buffers = new Set<ArrayBufferLike>();
  const charge = (buffer: ArrayBufferLike) => {
    if (buffers.has(buffer)) return 0;
    buffers.add(buffer);
    return buffer.byteLength;
  };
  const visit = (v: unknown): number => {
    if (!v || typeof v !== 'object' || objects.has(v)) return 0;
    objects.add(v);
    if (ArrayBuffer.isView(v)) return charge(v.buffer);
    if (
      v instanceof ArrayBuffer ||
      (typeof SharedArrayBuffer !== 'undefined' && v instanceof SharedArrayBuffer)
    )
      return charge(v);
    if (v instanceof Map) return [...v].reduce((n, [key, item]) => n + visit(key) + visit(item), 0);
    if (v instanceof Set) return [...v].reduce((n, item) => n + visit(item), 0);
    return Object.values(v).reduce<number>((n, item) => n + visit(item), 0);
  };
  return visit(value);
}
export function createVerificationMemo() {
  const entries = new Map<
    string,
    {
      context: string;
      inputs: Uint8Array[];
      value: unknown;
      slots: readonly string[];
      bytes: number;
    }
  >();
  let revision = 0,
    ownedBytes = 0;
  const drop = (key: string) => {
    const previous = entries.get(key);
    if (previous) ownedBytes -= previous.bytes;
    eraseVerified(previous);
    entries.delete(key);
  };
  const clear = () => {
    revision++;
    for (const entry of entries.values()) eraseVerified(entry);
    entries.clear();
    ownedBytes = 0;
  };
  const check = async <T>(
    key: string,
    slots: readonly string[],
    context: string,
    inputs: readonly Uint8Array[],
    verify: () => Promise<T>,
    current: () => void,
  ): Promise<T> => {
    current();
    const previous = entries.get(key);
    if (
      previous?.context === context &&
      previous.inputs.length === inputs.length &&
      inputs.every((b, i) => sameBytes(b, previous.inputs[i]!))
    )
      return structuredClone(previous.value) as T;
    drop(key);
    const at = revision,
      copy = inputs.map((b) => b.slice());
    let value: T | undefined;
    try {
      value = await verify();
      current();
      if (at !== revision) throw Error('Verification owner changed');
      const retained = { context, inputs: copy, value: structuredClone(value), slots };
      const bytes = bufferCapacity([retained.inputs, retained.value]);
      entries.set(key, { ...retained, bytes });
      ownedBytes += bytes;
      return structuredClone(value);
    } catch (e) {
      eraseVerified(copy);
      throw e;
    } finally {
      eraseVerified(value);
    }
  };
  return {
    clear,
    /** Capacity of actual independently owned buffers; not an estimate from logical positions. */
    ownedBytes: () => ownedBytes,
    retain(slots: ReadonlySet<string>) {
      for (const [key, entry] of entries)
        if (entry.slots.some((slot) => !slots.has(slot))) drop(key);
    },
    check<T>(
      slot: string,
      context: string,
      inputs: readonly Uint8Array[],
      verify: () => Promise<T>,
      current: () => void,
    ): Promise<T> {
      return check(JSON.stringify(['single', slot]), [slot], context, inputs, verify, current);
    },
    /** One self-contained receipt, addressed by every ordered original entry index. Inputs and
     * proof are copied once as one graph; no page registry or cross-record alias is introduced. */
    async checkReceipt<T>(
      slots: readonly string[],
      context: string,
      inputs: readonly Uint8Array[],
      verify: () => Promise<T>,
      current: () => void,
    ): Promise<T> {
      current();
      if (!Array.isArray(slots)) return Promise.reject(Error('Invalid receipt memo address'));
      const length = slots.length;
      if (!Number.isSafeInteger(length) || length < 1 || length > READ_COUNT_LIMIT)
        return Promise.reject(Error('Invalid receipt memo address'));
      const addresses: string[] = [];
      // Indexed capture also validates holes; Array.some skips them. Read each address once.
      for (let index = 0; index < length; index++) {
        const slot = slots[index];
        if (typeof slot !== 'string' || !slot.length)
          return Promise.reject(Error('Invalid receipt memo address'));
        addresses.push(slot);
      }
      if (new Set(addresses).size !== length)
        return Promise.reject(Error('Invalid receipt memo address'));
      const captured = Object.freeze(addresses);
      return check(
        JSON.stringify(['receipt', captured]),
        captured,
        context,
        inputs,
        verify,
        current,
      );
    },
  };
}
/** Existing portable verifier port, also implemented by authenticated preparation journals. */
export type VerificationMemo = Pick<
  ReturnType<typeof createVerificationMemo>,
  'clear' | 'retain' | 'check'
>;
/** Native process-local extension. A journal adapter must be hardened separately before a
 * receipt consumer can require this port; a base memo is never asserted to implement it. */
export type ReceiptVerificationMemo = ReturnType<typeof createVerificationMemo>;
