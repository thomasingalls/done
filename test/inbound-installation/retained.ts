/** Test-only fixture construction after normal live verification; no guard is replaced. */
import type { ContentReaderState } from '../../src/account/contentReader';
import type { InboundContext, InboundResult } from '../../src/crdt/accountInbound';
import { encodeInboundPageRecord } from '../../src/crdt/inboundRecord';
import { hex, type Bytes } from '../../src/crdt/custodyCrypto';
export function retainBinaryFixture(
  state: ContentReaderState,
  base: InboundContext,
  request: Bytes,
  page: Bytes,
  result: Extract<InboundResult, { kind: 'received' }>,
) {
  if (result.position !== base.prefix.position + 1) throw Error('Expected verified next position');
  const record = encodeInboundPageRecord({
    baseline: base.baseline.id,
    lineage: base.authority.lineage,
    head: base.authority.head,
    reader: base.reader.id,
    publisher: base.publisher.id,
    firstPosition: result.position,
    previous: base.prefix.link,
    lastLink: result.link,
    firstEntry: 0,
    entryCount: 1,
    request,
    page,
  });
  try {
    // The ordinary encrypted save authenticates this exact retained tuple.
    state.inboundReceiptVersion = 1;
    base.inboundReceiptVersion = 1;
    return hex(record);
  } finally {
    record.fill(0);
  }
}
