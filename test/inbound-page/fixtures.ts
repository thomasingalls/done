/** Independent binary oracle: Node byte writers, original signed fixture frames, no runtime codec. */
import { A, entry, packet, sources, ZERO } from '../account-inbound/fixtures';
import { context, hex, reframe } from '../account-inbound-codecs/oracle';
import type { InboundPageRecord } from '../../src/crdt/inboundRecord';
export function pageFixture(publisher = A, length = 8, first = 0, count = length - first) {
  const update = sources().entries[0]!.updates;
  let previous = ZERO;
  const entries = Array.from({ length }, (_, index) => {
    const e = entry({ publisher, updates: update }, index + 1, previous);
    previous = e.link;
    return e;
  });
  const c = context(publisher),
    wire = reframe(packet(entries[0]!), {
      request: (r) => {
        r[11] = length;
      },
      page: (p) => {
        p[3] = length;
        p[4] = length;
        p[5] = entries.map((e) => [hex(e.envelope), hex(e.proof)]);
      },
    }),
    record: InboundPageRecord = {
      baseline: c.baseline.id,
      lineage: c.authority.lineage,
      head: c.authority.head,
      reader: c.reader.id,
      publisher,
      firstPosition: first + 1,
      previous: entries[first]!.previous,
      lastLink: entries[first + count - 1]!.link,
      firstEntry: first,
      entryCount: count,
      ...wire,
    };
  return { record, entries, context: c };
}
export function referenceBytes(e: InboundPageRecord): Uint8Array<ArrayBuffer> {
  const header = Buffer.alloc(239);
  header.write('done/account-inbound/page/v1\0', 0, 'ascii');
  Buffer.from(e.baseline, 'hex').copy(header, 29);
  Buffer.from(e.lineage, 'hex').copy(header, 61);
  Buffer.from(e.head, 'hex').copy(header, 93);
  Buffer.from(e.reader, 'hex').copy(header, 125);
  Buffer.from(e.publisher, 'hex').copy(header, 141);
  header.writeBigUInt64BE(BigInt(e.firstPosition), 157);
  Buffer.from(e.previous, 'hex').copy(header, 165);
  Buffer.from(e.lastLink, 'hex').copy(header, 197);
  header[229] = e.firstEntry;
  header[230] = e.entryCount;
  header.writeUInt32BE(e.request.length, 231);
  header.writeUInt32BE(e.page.length, 235);
  return new Uint8Array(Buffer.concat([header, e.request, e.page]));
}
