/** Private plain-data ownership. These graphs contain no keys, tasks, or externally owned buffers. */
function visitBytes(value: unknown, visit: (bytes: Uint8Array) => void, seen = new Set<object>()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (value instanceof Uint8Array) visit(value);
  else if (value instanceof Map) {
    for (const [key, item] of value) {
      visitBytes(key, visit, seen);
      visitBytes(item, visit, seen);
    }
  } else if (value instanceof Set) {
    for (const item of value) visitBytes(item, visit, seen);
  } else for (const item of Object.values(value)) visitBytes(item, visit, seen);
}

/** An adopted result may share entire objects or subarray buffers with its predecessor. */
export function eraseUnretained(previous: unknown, retained?: unknown): void {
  const protectedBuffers = new Set<ArrayBufferLike>();
  visitBytes(retained, (bytes) => protectedBuffers.add(bytes.buffer));
  const erased = new Set<ArrayBufferLike>();
  visitBytes(previous, (bytes) => {
    if (protectedBuffers.has(bytes.buffer) || erased.has(bytes.buffer)) return;
    erased.add(bytes.buffer);
    new Uint8Array(bytes.buffer).fill(0);
  });
}

/** Count retained buffer capacity, including subview backing storage, once per owned graph.
 * Object/string overhead and process RAM are outside this byte-budget observation. */
export function ownedByteCapacity(value: unknown): number {
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
