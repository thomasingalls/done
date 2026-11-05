/** Repartition genuine signed two-publisher histories; original frames use an independent oracle. */
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
export function mixedPublisher(f: Fixture, source: Fixture['producer'], choices: Mix) {
  const original = decodeInboundPageRecord(source.raw),
    start = original.firstEntry,
    chunks: {
      raw: Uint8Array<ArrayBuffer>;
      updates: Uint8Array<ArrayBuffer>[];
      first: number;
      count: number;
    }[] = [];
  const legacy = (index: number, single: boolean) => {
    const entry = source.entries[index]!,
      previous = index === start ? original.previous : source.entries[index - 1]!.link;
    let { request, page } = original;
    if (single) {
      const r = JSON.parse(Buffer.from(request).toString()) as unknown[];
      r.pop();
      r[10] = entry.position - 1;
      r[11] = 1;
      request = json([...r, signed(f.d.keys.new, json(r))]);
      const p = JSON.parse(Buffer.from(page).toString()) as unknown[];
      p.pop();
      p[2] = hash(request);
      p[4] = entry.position;
      p[5] = [[hex(entry.envelope), hex(entry.proof)]];
      page = json([...p, signed(f.f.x.f.f.keys.acceptance, json(p))]);
    }
    return json([
      single ? 'done/account-inbound/v1' : 'done/account-inbound/v2',
      single ? 1 : 2,
      original.baseline,
      original.lineage,
      original.head,
      original.reader,
      original.publisher,
      'received',
      entry.position,
      previous,
      entry.link,
      hex(request),
      hex(page),
      ...(single ? [] : [index]),
    ]);
  };
  let index = start;
  while (index < 8) {
    const choice = choices[index] ?? 0,
      kind = choice % 3,
      count = kind === 0 ? Math.min(1 + Math.floor(choice / 3), 8 - index) : 1;
    let raw: Uint8Array<ArrayBuffer>;
    if (kind === 0) {
      const page: InboundPageRecord = {
        ...original,
        firstEntry: index,
        entryCount: count,
        firstPosition: source.entries[index]!.position,
        previous: index === start ? original.previous : source.entries[index - 1]!.link,
        lastLink: source.entries[index + count - 1]!.link,
      };
      raw = referenceBytes(page);
    } else raw = legacy(index, kind === 2);
    chunks.push({
      raw,
      updates: source.updates.slice(index - start, index - start + count).map((u) => u.slice()),
      first: index,
      count,
    });
    index += count;
  }
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
