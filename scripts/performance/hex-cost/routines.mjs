/** Phase 559 probe: time and peak RSS of one bytes-to-hex or hex-to-bytes routine at one size.
 * Run one routine and size per process so the peak belongs to that cell:
 *   node scripts/performance/hex-cost/routines.mjs <routine> <bytes> [reps]
 * Prints one JSON line. `reference-hex` is the base text of both `hex` routines (tree 4ef09a61);
 * `custody-hex` and `protocol-hex` import the current sources. The `option-` routines are
 * alternatives measured for the record, and `floor-` ones use the engine's own Uint8Array hex
 * methods, which the es2022 build target cannot rely on and which accept upper case. `none`
 * builds the input only, so its peak is the harness and input. Never part of `pnpm test`. */
import { hex as custodyHex } from '../../../src/crdt/custodyCrypto.ts';
import { hex as protocolHex, lowerHexBytes, unhex } from '../../../account-protocol/recovery.ts';

const [routine, sizeArg, repsArg] = process.argv.slice(2);
const SIZE = Number(sizeArg),
  REPS = Number(repsArg ?? 5);

const referenceByte = Array.from({ length: 256 }, (_, n) => n.toString(16).padStart(2, '0'));
const referenceHex = (b) => {
  if (!b.length) {
    b.subarray(0, 0);
    return '';
  }
  // oxlint-disable-next-line unicorn/no-new-array -- The base text, kept as the reference.
  const parts = new Array(b.length);
  for (let i = 0; i < b.length; i++) parts[i] = referenceByte[b[i]];
  return parts.join('');
};
/** The base text of src/crdt/legacySource.ts's own `hex` (tree 4ef09a61). */
const legacySourceHex = (bytes) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const digits = '0123456789abcdef';
const high = Uint8Array.from({ length: 256 }, (_, n) => digits.charCodeAt(n >> 4));
const low = Uint8Array.from({ length: 256 }, (_, n) => digits.charCodeAt(n & 15));
const decoder = new TextDecoder();
/** Two byte-table writes per input byte into a Uint8Array, then one decode. */
const byteTextDecoder = (b) => {
  if (!b.length) {
    b.subarray(0, 0);
    return '';
  }
  const ascii = new Uint8Array(2 * b.length);
  for (let i = 0, j = 0; i < b.length; i++, j += 2) {
    ascii[j] = high[b[i]];
    ascii[j + 1] = low[b[i]];
  }
  return decoder.decode(ascii);
};
/** String.fromCharCode over 8,192 code units at a time (4,096 bytes), far below phase 558's
 * smallest measured argument limit (about 50,000 in a WebKit Worker), joined once. */
const CHUNK = 4096;
const codes = new Uint16Array(2 * CHUNK);
const chunkedFromCharCode = (b) => {
  if (!b.length) {
    b.subarray(0, 0);
    return '';
  }
  const parts = [];
  for (let start = 0; start < b.length; start += CHUNK) {
    const end = Math.min(start + CHUNK, b.length);
    for (let i = start, j = 0; i < end; i++, j += 2) {
      codes[j] = high[b[i]];
      codes[j + 1] = low[b[i]];
    }
    parts.push(String.fromCharCode.apply(null, codes.subarray(0, 2 * (end - start))));
  }
  return parts.join('');
};
const nibble = new Int8Array(256).fill(-1);
for (let n = 0; n < 16; n++) nibble[digits.charCodeAt(n)] = n;
const encoder = new TextEncoder();
/** lowerHexBytes's contract, reading ASCII bytes from encodeInto instead of charCodeAt. */
const encodeIntoLowerHex = (value) => {
  if (!value.length || value.length % 2) return undefined;
  const ascii = new Uint8Array(value.length);
  const { read, written } = encoder.encodeInto(value, ascii);
  if (read !== value.length || written !== value.length) return undefined;
  const out = new Uint8Array(value.length / 2);
  for (let i = 0, j = 0; i < out.length; i++, j += 2) {
    const h = nibble[ascii[j]],
      l = nibble[ascii[j + 1]];
    if (h < 0 || l < 0) {
      out.fill(0);
      return undefined;
    }
    out[i] = (h << 4) | l;
  }
  return out;
};

const encoders = {
  'reference-hex': referenceHex,
  'custody-hex': custodyHex,
  'protocol-hex': protocolHex,
  'legacy-source-hex': legacySourceHex,
  'option-byte-textdecoder': byteTextDecoder,
  'option-chunked-fromcharcode': chunkedFromCharCode,
  'floor-tohex': (b) => b.toHex(),
};
const decoders = {
  lowerhexbytes: lowerHexBytes,
  unhex: (v) => unhex(v, v.length / 2),
  'option-encodeinto-lowerhexbytes': encodeIntoLowerHex,
  'floor-fromhex': (v) => Uint8Array.fromHex(v),
};
const fn = encoders[routine] ?? decoders[routine];
if (!fn && routine !== 'none') throw Error('Unknown routine ' + routine);
const decoding = routine in decoders;

const bytes = new Uint8Array(SIZE);
for (let i = 0; i < SIZE; i++) bytes[i] = (i * 131 + (i >>> 8)) & 255;
const text = Buffer.from(bytes.buffer).toString('hex');
const input = decoding ? text : bytes;
const check = (r) => {
  if (decoding ? !Buffer.from(r).equals(Buffer.from(bytes.buffer)) : r !== text)
    throw Error('Wrong output from ' + routine);
};
const mib = (n) => Math.round((n / 1048576) * 10) / 10;
const peak = () => mib(process.resourceUsage().maxRSS * 1024);
const round = (ms) => Math.round(ms * 1e6) / 1e6;
// Small inputs repeat inside each timed rep so a rep lasts long enough to time.
const inner = Math.max(1, Math.floor((1 << 20) / Math.max(SIZE, 1)));
const out = { routine, bytes: SIZE, node: process.version, inner, peakBeforeMiB: peak() };
if (fn) {
  let t = performance.now();
  const first = fn(input);
  out.firstMs = round(performance.now() - t);
  out.peakAfterFirstMiB = peak();
  out.firstPeakDeltaMiB = Math.round((out.peakAfterFirstMiB - out.peakBeforeMiB) * 10) / 10;
  check(first);
  const reps = [];
  for (let k = 0; k < REPS; k++) {
    t = performance.now();
    for (let j = 0; j < inner; j++) fn(input);
    reps.push(round((performance.now() - t) / inner));
  }
  reps.sort((a, b) => a - b);
  out.repMs = reps;
  out.medianMs = reps[reps.length >> 1];
}
out.peakMiB = peak();
console.log(JSON.stringify(out));
