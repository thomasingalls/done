/** Neutral, bounded decoding of whole gzip and single-disk ZIP containers. No extraction to disk. */
import { gunzipSync, inflateRawSync, crc32 } from 'node:zlib';

export function containerParts(bytes, maxBytes) {
  if (bytes[0] === 31 && bytes[1] === 139) {
    return [gunzipSync(bytes, { maxOutputLength: maxBytes })];
  }
  if (!bytes.subarray(0, 2).equals(Buffer.from('PK'))) return null;
  const fail = () => {
    throw Error('unsupported-or-invalid-zip');
  };
  // ZIP64, encryption, split archives and data descriptors are deliberately unqualified.
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (
      bytes.readUInt32LE(i) === 0x06054b50 &&
      i + 22 + bytes.readUInt16LE(i + 20) === bytes.length
    ) {
      end = i;
      break;
    }
  }
  if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) fail();
  const count = bytes.readUInt16LE(end + 10),
    start = bytes.readUInt32LE(end + 16);
  if (
    count === 65535 ||
    count !== bytes.readUInt16LE(end + 8) ||
    start + bytes.readUInt32LE(end + 12) !== end
  )
    fail();
  const parts = [bytes.subarray(end + 22)];
  let offset = start,
    localEnd = 0,
    expanded = 0;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) fail();
    const flags = bytes.readUInt16LE(offset + 8),
      method = bytes.readUInt16LE(offset + 10);
    const crc = bytes.readUInt32LE(offset + 16),
      packed = bytes.readUInt32LE(offset + 20),
      size = bytes.readUInt32LE(offset + 24);
    const names = bytes.readUInt16LE(offset + 28),
      extra = bytes.readUInt16LE(offset + 30),
      comment = bytes.readUInt16LE(offset + 32),
      local = bytes.readUInt32LE(offset + 42);
    const next = offset + 46 + names + extra + comment;
    if (
      flags & ~0x800 ||
      ![0, 8].includes(method) ||
      bytes.readUInt16LE(offset + 34) ||
      next > end ||
      local !== localEnd ||
      local + 30 > start
    )
      fail();
    if (size > maxBytes || (expanded += size) > maxBytes) throw Error('container-byte-budget');
    if (
      bytes.readUInt32LE(local) !== 0x04034b50 ||
      bytes.readUInt16LE(local + 6) !== flags ||
      bytes.readUInt16LE(local + 8) !== method ||
      bytes.readUInt32LE(local + 14) !== crc ||
      bytes.readUInt32LE(local + 18) !== packed ||
      bytes.readUInt32LE(local + 22) !== size
    )
      fail();
    const localNames = bytes.readUInt16LE(local + 26),
      localExtra = bytes.readUInt16LE(local + 28),
      data = local + 30 + localNames + localExtra;
    if (
      data + packed > start ||
      !bytes
        .subarray(local + 30, local + 30 + localNames)
        .equals(bytes.subarray(offset + 46, offset + 46 + names))
    )
      fail();
    const packedBytes = bytes.subarray(data, data + packed);
    const content =
      method === 0
        ? packedBytes
        : inflateRawSync(packedBytes, { maxOutputLength: Math.max(1, size) });
    if (content.length !== size || crc32(content) !== crc) fail();
    parts.push(bytes.subarray(offset + 46, next), bytes.subarray(local + 30, data), content);
    localEnd = data + packed;
    offset = next;
  }
  if (offset !== end || localEnd !== start) fail();
  return parts;
}
