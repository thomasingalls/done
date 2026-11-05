/** Distinct real Yjs edits and independently signed frames; no application receipt encoder. */
import { Y } from '../../src/crdt/yjs';
import { context, reframe, hex } from '../account-inbound-codecs/oracle';
import { A, entry, packet, ZERO } from '../account-inbound/fixtures';
import type { InboundPageRecord } from '../../src/crdt/inboundRecord';
export function historyPage(first = 0, count = 8 - first) {
  const doc = new Y.Doc({ gc: false });
  doc.clientID = 4701;
  let previous = ZERO;
  try {
    const entries = Array.from({ length: 8 }, (_, index) => {
      const vector = Y.encodeStateVector(doc);
      doc.getText('master').insert(index, 'abcdefgh'[index]!);
      const updates = [new Uint8Array(Y.encodeStateAsUpdate(doc, vector))],
        e = entry({ publisher: A, updates }, index + 1, previous);
      previous = e.link;
      return e;
    });
    const c = context(),
      wire = reframe(packet(entries[0]!), {
        request: (r) => {
          r[11] = 8;
        },
        page: (p) => {
          p[3] = 8;
          p[4] = 8;
          p[5] = entries.map((e) => [hex(e.envelope), hex(e.proof)]);
        },
      }),
      record: InboundPageRecord = {
        baseline: c.baseline.id,
        lineage: c.authority.lineage,
        head: c.authority.head,
        reader: c.reader.id,
        publisher: A,
        firstPosition: first + 1,
        previous: entries[first]!.previous,
        lastLink: entries[first + count - 1]!.link,
        firstEntry: first,
        entryCount: count,
        ...wire,
      };
    return {
      entries,
      record,
      context: { ...c, inboundReceiptVersion: 1 as const },
      snapshot: new Uint8Array(Y.encodeStateAsUpdate(doc)),
    };
  } finally {
    doc.destroy();
  }
}
