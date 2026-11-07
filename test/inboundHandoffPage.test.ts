// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { replayHandoffStream, type HandoffHistory } from '../src/crdt/handoffHistory';
import { decodeInboundPageRecord } from '../src/crdt/inboundRecord';
import { verifyInboundRange } from '../src/crdt/accountInbound';
import { StorageCompatibilityError } from '../src/crdt/storageCompatibility';
import { Y, sameDocState, type YDoc } from '../src/crdt/yjs';
import { historyPage } from './inbound-page/history-fixtures';
import { referenceBytes } from './inbound-page/fixtures';
import { context, eventWire, hex, live } from './account-inbound-codecs/oracle';
import { entry, A } from './account-inbound/fixtures';
import type { Bytes } from '../src/crdt/custodyCrypto';
const docs: YDoc[] = [];
const doc = () => {
  const d = new Y.Doc({ gc: false });
  docs.push(d);
  return d;
};
afterEach(() => {
  for (const d of docs.splice(0)) d.destroy();
});
const aged = { ...live, now: () => 90000 };
function prefix(f: ReturnType<typeof historyPage>, count: number) {
  const d = doc();
  for (const e of f.entries.slice(0, count)) for (const u of e.updates) Y.applyUpdate(d, u);
  return d;
}
// This helper consumes an already authenticated cut/snapshot; admission verification lives in
// mergeHandoffHistory. Model only that precondition here, without fabricating an admission proof.
const cut = (
  f: ReturnType<typeof historyPage>,
  position: number,
  link = f.entries[position - 1]!.link,
) =>
  ({ checkpoint: { heads: [{ credentialId: A, position, link }] } }) as Pick<
    HandoffHistory,
    'checkpoint'
  > as HandoffHistory;
function erase(records: { record: Bytes; updates: readonly Bytes[] }[]) {
  for (const r of records) {
    r.record.fill(0);
    for (const u of r.updates) u.fill(0);
  }
}
it('an aged full page yields one physical suffix with every distinct verified update', async () => {
  const f = historyPage(),
    d = doc(),
    raw = referenceBytes(f.record),
    out = await replayHandoffStream(d, f.context, [hex(raw)], undefined, aged);
  expect(out.records).toHaveLength(1);
  expect(out.records[0]!.record).toEqual(raw);
  expect(out.records[0]!.updates).toHaveLength(8);
  expect(d.getText('master').toString()).toBe('abcdefgh');
  expect(out.context.prefix.position).toBe(8);
  const expected = doc();
  Y.applyUpdate(expected, f.snapshot);
  expect(sameDocState(d, expected)).toBe(true);
  erase(out.records);
});
it('an interior cut keeps only a self-contained suffix and reopens from it after request expiry', async () => {
  const f = historyPage(),
    d = prefix(f, 3),
    proof = cut(f, 3),
    raw = referenceBytes(f.record),
    out = await replayHandoffStream(d, f.context, [hex(raw)], proof, aged);
  expect(out.records).toHaveLength(1);
  const saved = out.records[0]!,
    parsed = decodeInboundPageRecord(saved.record);
  expect(parsed).toMatchObject({
    firstEntry: 3,
    entryCount: 5,
    firstPosition: 4,
    previous: f.entries[2]!.link,
    lastLink: f.entries[7]!.link,
  });
  expect(parsed.request).toEqual(f.record.request);
  expect(parsed.page).toEqual(f.record.page);
  expect(saved.updates).toHaveLength(5);
  const reopened = prefix(f, 3),
    again = await replayHandoffStream(reopened, f.context, [hex(saved.record)], proof, {
      ...aged,
      now: () => 120000,
    });
  expect(sameDocState(d, reopened)).toBe(true);
  expect(again.context.prefix).toEqual(out.context.prefix);
  expect(again.records[0]!.record).toEqual(saved.record);
  erase(out.records);
  erase(again.records);
});
it('a cut inside an already interior extent preserves original indices and its admitted end', async () => {
  const f = historyPage(2, 3),
    d = prefix(f, 3),
    out = await replayHandoffStream(d, f.context, [hex(referenceBytes(f.record))], cut(f, 3), aged);
  expect(decodeInboundPageRecord(out.records[0]!.record)).toMatchObject({
    firstEntry: 3,
    entryCount: 2,
    firstPosition: 4,
    lastLink: f.entries[4]!.link,
  });
  expect(d.getText('master').toString()).toBe('abcde');
  expect(out.context.prefix.position).toBe(5);
  erase(out.records);
});
it('the covered full snapshot and authenticated cut link remain mandatory', async () => {
  const f = historyPage(),
    raw = hex(referenceBytes(f.record));
  await expect(
    replayHandoffStream(prefix(f, 2), f.context, [raw], cut(f, 3), aged),
  ).rejects.toThrow('omits retained accepted writing');
  await expect(
    replayHandoffStream(prefix(f, 3), f.context, [raw], cut(f, 3, 'ab'.repeat(32)), aged),
  ).rejects.toThrow('cut conflicts');
});
it('only the authenticated cut permits a gap, never a missing suffix position or overlapping extent', async () => {
  const f = historyPage(4, 4),
    raw = hex(referenceBytes(f.record));
  await expect(
    replayHandoffStream(prefix(f, 3), f.context, [raw], cut(f, 3), aged),
  ).rejects.toThrow();
  const all = historyPage(),
    wire = hex(referenceBytes(all.record));
  await expect(
    replayHandoffStream(doc(), all.context, [wire, wire], undefined, aged),
  ).rejects.toThrow('order changed');
});
it('a legacy receipt after a dense page uses its own original and remains byte exact', async () => {
  const f = historyPage(),
    last = entry({ publisher: A, updates: [new Uint8Array([0, 0])] }, 9, f.record.lastLink),
    legacy = eventWire(last),
    d = doc();
  const out = await replayHandoffStream(
    d,
    f.context,
    [hex(referenceBytes(f.record)), hex(legacy)],
    undefined,
    aged,
  );
  expect(out.context.prefix.position).toBe(9);
  expect(out.records).toHaveLength(2);
  expect(out.records[1]!.record).toEqual(legacy);
  expect(d.getText('master').toString()).toBe('abcdefgh');
  erase(out.records);
});
it('its own encoding floor is required, and stored expiry cannot relax the live path', async () => {
  const f = historyPage(),
    raw = referenceBytes(f.record);
  await expect(
    replayHandoffStream(doc(), context(), [hex(raw)], undefined, aged),
  ).rejects.toBeInstanceOf(StorageCompatibilityError);
  await expect(
    verifyInboundRange(f.context, f.record.request, f.record.page, aged),
  ).rejects.toMatchObject({ reason: 'expired' });
});
it('remote suffix application does not enter the actor-scoped human undo history', async () => {
  const f = historyPage(),
    d = prefix(f, 3),
    origin = {},
    undo = new Y.UndoManager(d.getText('master'), { trackedOrigins: new Set([origin]) });
  try {
    d.transact(() => d.getText('master').insert(0, 'local '), origin);
    const out = await replayHandoffStream(
      d,
      f.context,
      [hex(referenceBytes(f.record))],
      cut(f, 3),
      aged,
    );
    expect(undo.undoStack).toHaveLength(1);
    undo.undo();
    expect(d.getText('master').toString()).toBe('abcdefgh');
    erase(out.records);
  } finally {
    undo.destroy();
  }
});
