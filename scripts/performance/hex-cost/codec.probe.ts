// @vitest-environment node
/** Phase 559 probe: the phase 542 local-baseline codec (src/crdt/localBaselineRecord.ts) at one
 * encoded size, one operation and one hex arm per process, for time and peak RSS.
 *
 * Environment:
 * - ARM: `reference` puts the base text of `hex` (tree 4ef09a61) in place of the current one in
 *   both src/crdt/custodyCrypto.ts and account-protocol/recovery.ts; `current` runs the sources
 *   as they are; `floor` uses the engine's Uint8Array toHex and fromHex for `hex` and
 *   `lowerHexBytes`, an engine floor for every hex step in the codec, not an equivalent routine.
 * - MIB: the encoded record size, at most the 8 MiB write ceiling for `encode` and the 32 MiB
 *   read bound otherwise.
 * - OP: `encode` (encodeLocalBaseline with its self-decode), `decode` (decodeLocalBaseline) or
 *   `auth` (baselineAuthenticationPayload).
 * - REPS (default 3), OUT (a JSONL file to append to).
 * The record is the released journal-era vector with its snapshot replaced; the payload for
 * decode and auth is built with Node's Buffer, so set-up costs the same in every arm. */
import { it, vi } from 'vitest';
import { appendFileSync, readFileSync } from 'node:fs';

const referenceByte = Array.from({ length: 256 }, (_, n) => n.toString(16).padStart(2, '0'));
const referenceHex = (b: Uint8Array): string => {
  if (!b.length) {
    b.subarray(0, 0);
    return '';
  }
  // oxlint-disable-next-line unicorn/no-new-array -- The base text, kept as the reference.
  const parts = new Array<string>(b.length);
  for (let i = 0; i < b.length; i++) parts[i] = referenceByte[b[i]!]!;
  return parts.join('');
};
const ARM = process.env['ARM'] ?? 'current';
const floorHex = (b: Uint8Array) => (b as Uint8Array & { toHex(): string }).toHex();
const swap = (current: (b: Uint8Array) => string) =>
  ARM === 'reference' ? referenceHex : ARM === 'floor' ? floorHex : current;

vi.mock('../../../src/crdt/custodyCrypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/crdt/custodyCrypto')>();
  return { ...actual, hex: swap(actual.hex) };
});
vi.mock('../../../account-protocol/recovery.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../account-protocol/recovery.ts')>();
  const fromHex = (Uint8Array as unknown as { fromHex(s: string): Uint8Array<ArrayBuffer> })
    .fromHex;
  return {
    ...actual,
    hex: swap(actual.hex),
    ...(ARM === 'floor'
      ? {
          lowerHexBytes: (v: string) => {
            if (!v.length || v.length % 2) return undefined;
            try {
              return fromHex(v);
            } catch {
              return undefined;
            }
          },
        }
      : {}),
  };
});

const MIB = Number(process.env['MIB']),
  OP = process.env['OP'] ?? 'decode',
  REPS = Number(process.env['REPS'] ?? 3);
const mib = (n: number) => Math.round((n / 1048576) * 10) / 10;
const peak = () => mib(process.resourceUsage().maxRSS * 1024);
const ms = (t: number) => Math.round((performance.now() - t) * 10) / 10;

it('measure', async () => {
  const rec = await import('../../../src/crdt/localBaselineRecord');
  const { hex } = await import('../../../src/crdt/custodyCrypto');
  const { lowerHexBytes } = await import('../../../account-protocol/recovery.ts');
  const vector = JSON.parse(
    readFileSync('test/local-baseline/released-baseline-vector.json', 'utf8'),
  ) as { v5: { payload: string } };
  const base = rec.decodeLocalBaseline(new Uint8Array(Buffer.from(vector.v5.payload, 'hex')));
  if (!base.journalEra) throw Error('The vector is not journal-era');
  // The record's bytes without the snapshot, from a one-byte snapshot, located by its hex.
  const small = JSON.parse(
    Buffer.from(rec.encodeLocalBaseline({ ...base, snapshot: new Uint8Array([0xab]) })).toString(
      'utf8',
    ),
  ) as unknown[];
  const at = small.indexOf('ab');
  if (at < 0 || small.lastIndexOf('ab') !== at) throw Error('Snapshot field not found');
  const overhead = Buffer.byteLength(JSON.stringify(small)) - 2;
  const target = MIB * 1024 * 1024;
  const snapshot = new Uint8Array(Math.floor((target - overhead) / 2));
  for (let i = 0; i < snapshot.length; i++) snapshot[i] = (i * 131 + (i >>> 8)) & 255;
  small[at] = Buffer.from(snapshot.buffer).toString('hex');
  const payload = new Uint8Array(Buffer.from(JSON.stringify(small), 'utf8'));
  small[at] = '';
  if (payload.length > target) throw Error('Payload over target');
  const out: Record<string, unknown> = {
    arm: ARM,
    op: OP,
    mib: MIB,
    encodedBytes: payload.length,
    snapshotBytes: snapshot.length,
    // Which hex and lowerHexBytes the codec's modules see, so a mock that did not apply shows.
    // The current routine joins below its threshold too, so look for its decode first.
    hexSeen: String(hex).includes('.decode(')
      ? 'current'
      : String(hex).includes('toHex')
        ? 'toHex'
        : 'array-join',
    lowerHexBytesSeen: String(lowerHexBytes).includes('fromHex') ? 'fromHex' : 'current',
    peakBeforeMiB: peak(),
  };
  const run = (): unknown =>
    OP === 'encode'
      ? rec.encodeLocalBaseline({ ...base, snapshot })
      : OP === 'auth'
        ? rec.baselineAuthenticationPayload(payload)
        : rec.decodeLocalBaseline(payload);
  let t = performance.now();
  const first = run();
  out['firstMs'] = ms(t);
  out['peakAfterFirstMiB'] = peak();
  out['firstPeakDeltaMiB'] =
    Math.round(((out['peakAfterFirstMiB'] as number) - (out['peakBeforeMiB'] as number)) * 10) / 10;
  if (OP === 'encode' && Buffer.compare(first as Uint8Array, payload) !== 0)
    throw Error('Encoding differs from the built payload');
  const reps: number[] = [];
  for (let k = 0; k < REPS; k++) {
    t = performance.now();
    run();
    reps.push(ms(t));
  }
  out['repMs'] = reps.sort((a, b) => a - b);
  out['peakMiB'] = peak();
  appendFileSync(process.env['OUT']!, JSON.stringify(out) + '\n');
}, 600_000);
