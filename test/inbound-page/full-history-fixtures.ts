/** Genuine gen1 membership, publication and independently signed multi-entry receive history. */
import { sign } from 'node:crypto';
import { partitionSignedPage, hex, type Mix } from './mixed-fixtures';
import type { InboundPageRecord } from '../../src/crdt/inboundRecord';
import type { OpenedRecord, ContentCounter } from '../../src/crdt/contentRecord';
import { emptySpoolWitness } from '../../src/crdt/contentRecord';
import { extendSpoolWitness } from '../../src/crdt/spoolRecord';
import type { LocalBaselineContext } from '../../src/crdt/localBaselineReplay';
// @ts-expect-error Existing real membership fixture/independent signing oracle.
import { memberFixture } from '../local-baseline/fixtures.mjs';
import { hash } from '../account-inbound/fixtures';
const json = (v: unknown) => new Uint8Array(Buffer.from(JSON.stringify(v)));
export async function fullHistoryPageFixture(plan: Mix = [1, 2, 9, 1, 2, 9, 1, 2]) {
  const f = await memberFixture();
  try {
    const own = await f.appendOwn();
    const received: {
      update: Uint8Array<ArrayBuffer>;
      record: Uint8Array<ArrayBuffer>;
      envelope: Uint8Array<ArrayBuffer>;
      proof: Uint8Array<ArrayBuffer>;
    }[] = [];
    for (let i = 0; i < 8; i++) received.push(await f.appendPeer());
    const first = JSON.parse(Buffer.from(received[0]!.record).toString()) as (string | number)[],
      r = JSON.parse(Buffer.from(first[11] as string, 'hex').toString()) as unknown[];
    r.pop();
    r[11] = 8;
    const request = json([...r, sign(null, json(r), f.f.keys.existing).toString('hex')]);
    const p = JSON.parse(Buffer.from(first[12] as string, 'hex').toString()) as unknown[];
    p.pop();
    p[2] = hash(request);
    p[3] = 8;
    p[4] = 8;
    p[5] = received.map((e) => [hex(e.envelope), hex(e.proof)]);
    const page = json([...p, sign(null, json(p), f.f.f.keys.acceptance).toString('hex')]);
    const entries = received.map((e) => {
      const v = JSON.parse(Buffer.from(e.record).toString());
      return { position: v[8] as number, link: v[10] as string };
    });
    const record: InboundPageRecord = {
      baseline: first[2] as string,
      lineage: first[3] as string,
      head: first[4] as string,
      reader: first[5] as string,
      publisher: first[6] as string,
      firstPosition: 1,
      previous: first[9] as string,
      lastLink: entries[7]!.link,
      firstEntry: 0,
      entryCount: 8,
      request,
      page,
    };
    const chunks = partitionSignedPage(
      record,
      entries,
      received.map((e) => e.update),
      plan,
      (index) => {
        const v = JSON.parse(Buffer.from(received[index]!.record).toString());
        const request = new Uint8Array(Buffer.from(v[11], 'hex'));
        const page = JSON.parse(Buffer.from(v[12], 'hex').toString()) as unknown[];
        page.pop();
        // This read happens after the wide page advertised8; a later proof cannot regress it.
        page[3] = 8;
        return {
          request,
          page: json([...page, sign(null, json(page), f.f.f.keys.acceptance).toString('hex')]),
        };
      },
    );
    const old = new Set(received.map((e) => e.record));
    const rows: OpenedRecord[] = (f.rows as OpenedRecord[]).filter((row) => !old.has(row.bytes));
    rows.push(...chunks.map((c) => ({ seq: 0, gen: 1, kind: 'heads' as const, bytes: c.raw })));
    const records = rows.map((row, i) => ({ ...row, seq: i + 1 }));
    const context: LocalBaselineContext = {
      ...f.ctx,
      inbound: { ...f.ctx.inbound, inboundReceiptVersion: 1 },
      now: () => 90000,
    };
    const counter = async (): Promise<ContentCounter> => {
      let spool = emptySpoolWitness();
      for (const row of records)
        if (
          row.kind === 'heads' ||
          (row.kind === 'outbound' &&
            !Buffer.from(row.bytes).toString().startsWith('["done/source-capture/v1"'))
        )
          spool = await extendSpoolWitness(spool, row.bytes, crypto.subtle);
      const next = records.at(-1)!.seq + 4;
      return {
        v: 2,
        store_id: context.identity.storeId,
        intent: '04'.repeat(16),
        active_gen: 1,
        next_seq: next,
        reserved: { 1: next - 1 },
        spool,
        mac: new Uint8Array(32),
      };
    };
    return {
      f,
      own,
      received,
      chunks,
      records,
      context,
      publisher: record.publisher,
      counter,
      cleanup() {
        f.clear();
        for (const c of chunks) {
          c.raw.fill(0);
          for (const u of c.updates) u.fill(0);
        }
        for (const e of received) {
          e.update.fill(0);
          e.record.fill(0);
          e.envelope.fill(0);
          e.proof.fill(0);
        }
        for (const row of records) row.bytes.fill(0);
      },
    };
  } catch (cause) {
    f.clear();
    throw cause;
  }
}
