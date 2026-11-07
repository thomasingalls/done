/** Repartition independently signed pages; syntax generation never grants verification trust. */
import type { InboundPageRecord } from '../../src/crdt/inboundRecord';
import { decodeInboundPageRecord } from '../../src/crdt/inboundRecord';
import { referenceBytes } from './fixtures';
import type { membershipPageFixture } from './membership-fixtures';
// @ts-expect-error Independent Node signature and hash oracle.
import { signed, hash } from '../account-membership/fixtures.mjs';
type Fixture = Awaited<ReturnType<typeof membershipPageFixture>>;
export type Mix = readonly number[];
export const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const json = (v: unknown) => new Uint8Array(Buffer.from(JSON.stringify(v)));
export function partitionSignedPage(
  original: InboundPageRecord,
  entries: readonly { position: number; link: string }[],
  updates: readonly Uint8Array[],
  choices: Mix,
  single: (index: number) => { request: Uint8Array<ArrayBuffer>; page: Uint8Array<ArrayBuffer> },
) {
  const start = original.firstEntry,
    end = start + original.entryCount,
    chunks: {
      raw: Uint8Array<ArrayBuffer>;
      updates: Uint8Array<ArrayBuffer>[];
      first: number;
      count: number;
    }[] = [];
  let index = start;
  while (index < end) {
    const choice = choices[index] ?? 0,
      kind = choice % 3,
      count = kind === 0 ? Math.min(1 + Math.floor(choice / 3), end - index) : 1,
      previous = index === start ? original.previous : entries[index - 1]!.link;
    let raw: Uint8Array<ArrayBuffer>;
    if (kind === 0)
      raw = referenceBytes({
        ...original,
        firstEntry: index,
        entryCount: count,
        firstPosition: entries[index]!.position,
        previous,
        lastLink: entries[index + count - 1]!.link,
      });
    else {
      const wire = kind === 2 ? single(index) : original;
      raw = json([
        kind === 2 ? 'done/account-inbound/v1' : 'done/account-inbound/v2',
        kind === 2 ? 1 : 2,
        original.baseline,
        original.lineage,
        original.head,
        original.reader,
        original.publisher,
        'received',
        entries[index]!.position,
        previous,
        entries[index]!.link,
        hex(wire.request),
        hex(wire.page),
        ...(kind === 2 ? [] : [index]),
      ]);
    }
    chunks.push({
      raw,
      updates: updates.slice(index - start, index - start + count).map((u) => u.slice()),
      first: index,
      count,
    });
    index += count;
  }
  return chunks;
}
export function mixedPublisher(f: Fixture, source: Fixture['producer'], choices: Mix) {
  const original = decodeInboundPageRecord(source.raw);
  const chunks = partitionSignedPage(original, source.entries, source.updates, choices, (index) => {
    const entry = source.entries[index]!;
    const r = JSON.parse(Buffer.from(original.request).toString()) as unknown[];
    r.pop();
    r[10] = entry.position - 1;
    r[11] = 1;
    const request = json([...r, signed(f.d.keys.new, json(r))]);
    const p = JSON.parse(Buffer.from(original.page).toString()) as unknown[];
    p.pop();
    p[2] = hash(request);
    p[4] = entry.position;
    p[5] = [[hex(entry.envelope), hex(entry.proof)]];
    return { request, page: json([...p, signed(f.f.x.f.f.keys.acceptance, json(p))]) };
  });
  chunks.push({
    raw: source.legacy.slice(),
    updates: source.updates.slice(-1).map((u) => u.slice()),
    first: 8,
    count: 1,
  });
  return chunks;
}
export function interleave<T>(a: readonly T[], b: readonly T[], order: readonly boolean[]) {
  const left = [...a],
    right = [...b],
    out: T[] = [];
  let i = 0;
  while (left.length || right.length) {
    const chosen = order[i++] ? left : right;
    out.push((chosen.length ? chosen : chosen === left ? right : left).shift()!);
  }
  return out;
}
