// @vitest-environment node
import { expect, it } from 'vitest';
import * as inbound from '../src/crdt/accountInbound';
import type { Bytes } from '../src/crdt/custodyCrypto';
import { decodeInboundRecord } from '../src/crdt/inboundRecord';
import { Y } from '../src/crdt/yjs';
import { A, entry, packet, sources, ZERO, type FixtureEntry } from './account-inbound/fixtures';
import { context, hex, live, prior, reframe } from './account-inbound-codecs/oracle';
// Red checkpoint calls the existing full-range verifier if bounded preparation is absent.
const prepare = (
  c: inbound.InboundContext,
  request: Bytes,
  page: Bytes,
  lifetime = live,
  positions = 4,
): Promise<readonly inbound.InboundResult[]> => {
  const fn = (inbound as typeof inbound & { prepareInboundRange?: typeof prepare })
    .prepareInboundRange;
  return fn
    ? fn(c, request, page, lifetime, positions)
    : inbound.verifyInboundRange(c, request, page, lifetime);
};
function forward(c: inbound.InboundContext, e: FixtureEntry) {
  const { retained: _retained, ...next } = prior(c, e);
  return next;
}
function fixture(entries?: FixtureEntry[]) {
  const e: FixtureEntry[] = entries ?? [];
  if (!entries) {
    const doc = new Y.Doc();
    doc.clientID = 5432;
    try {
      let previous = ZERO;
      for (let position = 1; position <= 8; position++) {
        const state = Y.encodeStateVector(doc);
        doc.getText('master').insert(doc.getText('master').length, String(position));
        const next = entry(
          { publisher: A, updates: [new Uint8Array(Y.encodeStateAsUpdate(doc, state))] },
          position,
          previous,
        );
        e.push(next);
        previous = next.link;
      }
    } finally {
      doc.destroy();
    }
  }
  const p = reframe(packet(e[0]!), {
    request: (r) => {
      r[11] = 8;
    },
    page: (p) => {
      p[3] = e.length;
      p[4] = e.length;
      p[5] = e.map((e) => [hex(e.envelope), hex(e.proof)]);
    },
  });
  return { ...p, entries: e, context: context(A) };
}
it('eight downloaded entries prepare at most four verified positions and retain original indexed bytes', async () => {
  const x = fixture(),
    first = await prepare(x.context, x.request, x.page);
  expect(first).toHaveLength(4);
  for (const [index, result] of first.entries()) {
    expect(result.kind).toBe('received');
    if (result.kind !== 'received') throw Error();
    const receipt = decodeInboundRecord(result.record);
    expect(receipt.entry).toBe(index);
    expect(receipt.request).toEqual(x.request);
    expect(receipt.page).toEqual(x.page);
  }
  expect(x.context.prefix.position).toBe(0);
});
it('continuation reauthenticates the same original against a fresh native prefix after rotation', async () => {
  const x = fixture();
  let c = x.context;
  for (const e of x.entries.slice(0, 4)) c = forward(c, e);
  const next = await prepare(c, x.request, x.page);
  expect(next.map((r) => r.position)).toEqual([5, 6, 7, 8]);
  for (const [i, result] of next.entries()) {
    if (result.kind !== 'received') throw Error();
    expect(decodeInboundRecord(result.record).entry).toBe(i + 4);
    expect(
      await inbound.verifyStoredInbound(c, result.record, { ...live, now: () => 90000 }),
    ).toEqual(result);
    c = prior(c, x.entries[i + 4]!);
  }
});
it('partial-turn allowance cannot silently admit the rest of an eight-entry page', async () => {
  const x = fixture();
  expect((await prepare(x.context, x.request, x.page, live, 2)).map((r) => r.position)).toEqual([
    1, 2,
  ]);
  for (const n of [0, 5, 8, -1, NaN, 1.5])
    await expect(prepare(x.context, x.request, x.page, live, n)).rejects.toThrow();
});
it('fresh continuation refuses expiry, changed native link, old retained evidence and a consumed page', async () => {
  const x = fixture();
  let c = x.context;
  for (const e of x.entries.slice(0, 4)) c = forward(c, e);
  await expect(prepare(c, x.request, x.page, { ...live, now: () => 40000 })).rejects.toThrow(
    'expired',
  );
  await expect(
    prepare({ ...c, prefix: { ...c.prefix, link: 'ab'.repeat(32) } }, x.request, x.page),
  ).rejects.toThrow();
  await expect(
    prepare(
      {
        ...c,
        retained: { previous: ZERO, envelope: x.entries[0]!.envelope, proof: x.entries[0]!.proof },
      },
      x.request,
      x.page,
    ),
  ).rejects.toThrow('prefix');
  for (const e of x.entries.slice(4)) c = forward(c, e);
  await expect(prepare(c, x.request, x.page)).rejects.toThrow('prefix');
});
it('an invalid selected entry returns no prefix, while unselected tail grants no verification', async () => {
  const x = fixture();
  const bad = x.entries.map((e) => ({ ...e, envelope: e.envelope.slice() }));
  bad[6]!.envelope[bad[6]!.envelope.length - 1] =
    bad[6]!.envelope[bad[6]!.envelope.length - 1]! ^ 1;
  const p = fixture(bad);
  expect(await prepare(p.context, p.request, p.page)).toHaveLength(4);
  let c = p.context;
  for (const e of p.entries.slice(0, 4)) c = forward(c, e);
  await expect(prepare(c, p.request, p.page)).rejects.toThrow();
});
it('bounded preparation returns a fitting prefix at the existing record cap; full verification still refuses', async () => {
  const updates = Array.from({ length: 128 }, () => sources().entries[0]!.updates[0]!);
  const a = entry({ publisher: A, updates }, 1),
    b = entry({ publisher: A, updates }, 2, a.link),
    x = fixture([a, b]);
  const prepared = await prepare(x.context, x.request, x.page);
  expect(prepared).toHaveLength(1);
  expect(prepared[0]!.position).toBe(1);
  await expect(inbound.verifyInboundRange(x.context, x.request, x.page, live)).rejects.toThrow(
    'size',
  );
  const c = forward(x.context, a),
    second = await prepare(c, x.request, x.page);
  expect(second).toHaveLength(1);
  expect(second[0]!.position).toBe(2);
});
it('a late owner change cannot return even a bounded authenticated prefix', async () => {
  const x = fixture();
  let active = true;
  const work = prepare(x.context, x.request, x.page, {
    ...live,
    assertCurrent() {
      if (!active) throw Error('retired range owner');
    },
  });
  active = false;
  await expect(work).rejects.toThrow('retired range owner');
});
it('an original page too large for one indexed receipt requests narrower work without granting a result', async () => {
  const doc = new Y.Doc();
  doc.clientID = 5432;
  try {
    doc.getText('master').insert(0, 'x'.repeat(400000));
    const update = new Uint8Array(Y.encodeStateAsUpdate(doc)),
      e: FixtureEntry[] = [];
    let previous = ZERO;
    for (let position = 1; position <= 3; position++) {
      const next = entry({ publisher: A, updates: [update] }, position, previous);
      e.push(next);
      previous = next.link;
    }
    const x = fixture(e);
    expect(x.page.length).toBeLessThan(4 * 1024 * 1024);
    expect(await prepare(x.context, x.request, x.page)).toEqual([]);
    expect(x.context.prefix.position).toBe(0);
  } finally {
    doc.destroy();
  }
});
