/** Closed, canonical value grammar for verifier results; never a ledger/authority deserializer. */
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { sameBytes } from './verifiedRecords';
import type { Bytes } from './custodyCrypto';

export const PREPARATION_VALUE_BYTES = 32 * 1024 * 1024;
/** Most values (nodes) one encoded preparation value may contain. */
export const PREPARATION_VALUE_NODES = 131072;
const LIMIT = PREPARATION_VALUE_NODES;
const bad = (): never => {
  throw Error('Invalid preparation result encoding');
};
const forbidden = (key: string) => ['__proto__', 'prototype', 'constructor'].includes(key);
export function encodePreparationValue(input: unknown): Bytes {
  const out = encoding.createEncoder(),
    seen = new Set<object>();
  let nodes = 0,
    bytes = 0;
  const add = (n: number) => {
    bytes += n;
    if (bytes > PREPARATION_VALUE_BYTES) bad();
  };
  const write = (value: unknown, depth: number) => {
    if (++nodes > LIMIT || depth > 64) bad();
    add(1);
    if (value === undefined) encoding.writeUint8(out, 0);
    else if (value === null) encoding.writeUint8(out, 1);
    else if (typeof value === 'boolean') encoding.writeUint8(out, value ? 3 : 2);
    else if (typeof value === 'number') {
      if (!Number.isSafeInteger(value) || Object.is(value, -0)) bad();
      encoding.writeUint8(out, 4);
      encoding.writeFloat64(out, value);
      add(8);
    } else if (typeof value === 'string') {
      add(new TextEncoder().encode(value).length + 5);
      encoding.writeUint8(out, 5);
      encoding.writeVarString(out, value);
    } else if (value instanceof Uint8Array) {
      add(value.length + 5);
      encoding.writeUint8(out, 6);
      encoding.writeVarUint8Array(out, value);
    } else if (value && typeof value === 'object') {
      if (seen.has(value) || Object.getOwnPropertySymbols(value).length) bad();
      seen.add(value);
      if (Array.isArray(value)) {
        if (value.length > LIMIT || Object.keys(value).length !== value.length) bad();
        encoding.writeUint8(out, 7);
        encoding.writeVarUint(out, value.length);
        for (let i = 0; i < value.length; i++) {
          const d = Object.getOwnPropertyDescriptor(value, String(i));
          if (!d || d.get || d.set) return bad();
          write(d.value, depth + 1);
        }
      } else {
        if (Object.getPrototypeOf(value) !== Object.prototype) bad();
        const fields = Object.getOwnPropertyDescriptors(value),
          keys = Object.keys(fields).sort();
        if (keys.length > 128) bad();
        encoding.writeUint8(out, 8);
        encoding.writeVarUint(out, keys.length);
        for (const key of keys) {
          const d = fields[key]!;
          if (forbidden(key) || d.get || d.set || !d.enumerable) bad();
          add(new TextEncoder().encode(key).length + 5);
          encoding.writeVarString(out, key);
          write(d.value, depth + 1);
        }
      }
      seen.delete(value);
    } else bad();
  };
  try {
    write(input, 0);
    const result = new Uint8Array(encoding.toUint8Array(out));
    if (result.length > PREPARATION_VALUE_BYTES) {
      result.fill(0);
      return bad();
    }
    return result;
  } finally {
    out.cbuf.fill(0);
    for (const part of out.bufs) part.fill(0);
  }
}
export function decodePreparationValue(input: Bytes): unknown {
  if (!(input instanceof Uint8Array) || input.length > PREPARATION_VALUE_BYTES) bad();
  const decoder = decoding.createDecoder(input);
  let nodes = 0;
  const owned: Bytes[] = [];
  const read = (depth: number): unknown => {
    if (++nodes > LIMIT || depth > 64) bad();
    const tag = decoding.readUint8(decoder);
    if (tag === 0) return undefined;
    if (tag === 1) return null;
    if (tag === 2 || tag === 3) return tag === 3;
    if (tag === 4) {
      const value = decoding.readFloat64(decoder);
      if (!Number.isSafeInteger(value) || Object.is(value, -0)) bad();
      return value;
    }
    if (tag === 5) return decoding.readVarString(decoder);
    if (tag === 6) {
      const bytes = new Uint8Array(decoding.readVarUint8Array(decoder));
      owned.push(bytes);
      return bytes;
    }
    if (tag !== 7 && tag !== 8) bad();
    const n = decoding.readVarUint(decoder);
    if (n > (tag === 8 ? 128 : LIMIT)) bad();
    if (tag === 7) return Array.from({ length: n }, () => read(depth + 1));
    const value: Record<string, unknown> = {};
    let previous: string | undefined;
    for (let i = 0; i < n; i++) {
      const key = decoding.readVarString(decoder);
      if (forbidden(key) || (previous !== undefined && key <= previous)) bad();
      previous = key;
      value[key] = read(depth + 1);
    }
    return value;
  };
  let encoded: Bytes | undefined,
    delivered = false;
  try {
    const result = read(0);
    encoded = encodePreparationValue(result);
    if (decoding.hasContent(decoder) || !sameBytes(input, encoded)) return bad();
    delivered = true;
    return result;
  } finally {
    encoded?.fill(0);
    if (!delivered) for (const b of owned) b.fill(0);
  }
}
