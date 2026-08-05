/**
 * A minimal zip writer, stored (uncompressed) entries only.
 *
 * TRD §9 asks for "a zip of markdown, no server involved". A dependency for
 * this would be a compression library the app otherwise has no use for, against
 * a §12 budget on the initial bundle; store-only zips are a short, completely
 * specified format that every unzipper reads, and markdown of this size gains
 * little from deflate anyway.
 *
 * Written to the 1989 APPNOTE structure: a local header per file, then the
 * central directory, then the end-of-central-directory record.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

export const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

export interface ZipEntry {
  path: string;
  content: string;
}

/** MS-DOS date and time, which is what the format stores. */
const dosStamp = (date: Date): { time: number; date: number } => ({
  time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
  date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
});

class Writer {
  private parts: Uint8Array[] = [];
  length = 0;

  push(bytes: Uint8Array): void {
    this.parts.push(bytes);
    this.length += bytes.length;
  }

  record(values: [size: 2 | 4, value: number][]): void {
    const total = values.reduce((sum, [size]) => sum + size, 0);
    const buffer = new DataView(new ArrayBuffer(total));
    let offset = 0;
    for (const [size, value] of values) {
      if (size === 2) buffer.setUint16(offset, value, true);
      else buffer.setUint32(offset, value, true);
      offset += size;
    }
    this.push(new Uint8Array(buffer.buffer));
  }

  concat(): Uint8Array {
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const part of this.parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }
}

export const zip = (entries: readonly ZipEntry[], now = new Date()): Uint8Array => {
  const encoder = new TextEncoder();
  const stamp = dosStamp(now);
  const out = new Writer();

  const directory: { name: Uint8Array; crc: number; size: number; offset: number }[] = [];

  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const content = encoder.encode(entry.content);
    const crc = crc32(content);

    directory.push({ name, crc, size: content.length, offset: out.length });

    out.record([
      [4, 0x04034b50],
      [2, 20], // version needed
      [2, 0],
      [2, 0], // stored
      [2, stamp.time],
      [2, stamp.date],
      [4, crc],
      [4, content.length],
      [4, content.length],
      [2, name.length],
      [2, 0],
    ]);
    out.push(name);
    out.push(content);
  }

  const directoryOffset = out.length;

  for (const file of directory) {
    out.record([
      [4, 0x02014b50],
      [2, 20], // version made by
      [2, 20], // version needed
      [2, 0],
      [2, 0],
      [2, stamp.time],
      [2, stamp.date],
      [4, file.crc],
      [4, file.size],
      [4, file.size],
      [2, file.name.length],
      [2, 0],
      [2, 0],
      [2, 0],
      [2, 0],
      [4, 0],
      [4, file.offset],
    ]);
    out.push(file.name);
  }

  out.record([
    [4, 0x06054b50],
    [2, 0],
    [2, 0],
    [2, directory.length],
    [2, directory.length],
    [4, out.length - directoryOffset],
    [4, directoryOffset],
    [2, 0],
  ]);

  return out.concat();
};
