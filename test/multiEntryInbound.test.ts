// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import * as inbound from '../src/crdt/accountInbound';
import { decodeInboundRecord, encodeInboundRecord } from '../src/crdt/inboundRecord';
import { decodeInboundPage, decodeInboundRequest } from '../account-protocol/inboundTransport';
import { Y, sameDocState } from '../src/crdt/yjs';
import { A, B, entry, packet, sources, ZERO, type FixtureEntry } from './account-inbound/fixtures';
import {
  context,
  eventWire,
  hex,
  json,
  live,
  prior,
  reframe,
} from './account-inbound-codecs/oracle';
// The red checkpoint exercises the existing verifier rather than failing at a missing export.
const range = async (
  ...args: Parameters<typeof inbound.verifyInboundPage>
): Promise<readonly inbound.InboundResult[]> => {
  const verify = (
    inbound as typeof inbound & {
      verifyInboundRange?: (
        ...args: Parameters<typeof inbound.verifyInboundPage>
      ) => Promise<readonly inbound.InboundResult[]>;
    }
  ).verifyInboundRange;
  return verify ? verify(...args) : [await inbound.verifyInboundPage(...args)];
};
afterEach(() => vi.restoreAllMocks());
function fixture(entries = sources().entries.slice(0, 2), limit = 2) {
  const first = entries[0]!;
  const p = reframe(packet(first), {
    request: (r) => {
      r[11] = limit;
    },
    page: (p) => {
      p[3] = first.position - 1 + entries.length;
      p[4] = p[3];
      p[5] = entries.map((e) => [hex(e.envelope), hex(e.proof)]);
    },
  });
  return { ...p, entries, context: context(first.publisher) };
}
function expectedRecord(x: ReturnType<typeof fixture>, index = 0) {
  const e = x.entries[index]!;
  return json([
    'done/account-inbound/v2',
    2,
    x.context.baseline.id,
    x.context.authority.lineage,
    x.context.authority.head,
    x.context.reader.id,
    e.publisher,
    'received',
    e.position,
    e.previous,
    e.link,
    hex(x.request),
    hex(x.page),
    index,
  ]);
}
it('multi-entry verification binds every original and cold-replays indexed v2 receipts after expiry', async () => {
  const x = fixture(),
    results = await range(x.context, x.request, x.page, live);
  expect(results).toHaveLength(2);
  let c = x.context;
  const f = sources(),
    a = new Y.Doc(),
    b = new Y.Doc();
  try {
    Y.applyUpdate(a, f.baseline);
    Y.applyUpdate(b, f.baseline);
    for (const [index, r] of results.entries()) {
      expect(r.kind).toBe('received');
      if (r.kind !== 'received') throw Error();
      expect(r.position).toBe(index + 1);
      expect(r.link).toBe(x.entries[index]!.link);
      expect(r.updates).toEqual(x.entries[index]!.updates);
      expect(r.record).toEqual(expectedRecord(x, index));
      expect(encodeInboundRecord(decodeInboundRecord(r.record))).toEqual(r.record);
      expect(await inbound.verifyStoredInbound(c, r.record, { ...live, now: () => 90000 })).toEqual(
        r,
      );
      c = prior(c, x.entries[index]!);
      for (const u of r.updates) Y.applyUpdate(b, u);
    }
    for (const e of x.entries) for (const u of e.updates) Y.applyUpdate(a, u);
    expect(sameDocState(a, b)).toBe(true);
  } finally {
    a.destroy();
    b.destroy();
  }
  const request = x.request.slice(),
    page = x.page.slice(),
    bytes = x.entries[0]!.updates[0]!.slice();
  for (const r of results)
    if (r.kind === 'received') {
      r.record.fill(0);
      for (const u of r.updates) u.fill(0);
    }
  expect(x.request).toEqual(request);
  expect(x.page).toEqual(page);
  expect(x.entries[0]!.updates[0]).toEqual(bytes);
});
it('a cut inside a network range retains independently verifiable per-position receipts', async () => {
  const x = fixture(),
    c = prior(x.context, x.entries[0]!);
  const r = await inbound.verifyStoredInbound(c, expectedRecord(x, 1), {
    ...live,
    now: () => 90000,
  });
  expect(r.kind).toBe('received');
  expect(r.position).toBe(2);
});
it('a valid short page retains the original wider signed request without inventing missing entries', async () => {
  const x = fixture(sources().entries.slice(0, 1));
  const results = await range(x.context, x.request, x.page, live);
  expect(results).toHaveLength(1);
  const r = results[0]!;
  expect(r.kind).toBe('received');
  if (r.kind !== 'received') throw Error();
  expect(r.position).toBe(1);
  expect(r.updates).toHaveLength(1);
  expect(r.record).toEqual(expectedRecord(x));
  expect(decodeInboundRequest(decodeInboundRecord(r.record).request).limit).toBe(2);
});
it('an authenticated empty wider request produces no record or cursor advancement', async () => {
  const x = fixture();
  const p = reframe(x, {
    page: (p) => {
      p[3] = 0;
      p[4] = 0;
      p[5] = [];
    },
  });
  expect(await range(x.context, p.request, p.page, live)).toEqual([
    { kind: 'empty', through: 0, position: 0 },
  ]);
});
it('the original one-entry API still refuses a wider request and old v1 bytes remain exact', async () => {
  const x = fixture();
  await expect(inbound.verifyInboundPage(x.context, x.request, x.page, live)).rejects.toThrow(
    'unsupported',
  );
  const e = x.entries[0]!,
    p = packet(e),
    r = await inbound.verifyInboundPage(x.context, p.request, p.page, live);
  expect(r.kind).toBe('received');
  if (r.kind !== 'received') throw Error();
  expect(r.record).toEqual(eventWire(e));
});
it('a v1 receipt cannot be relabeled to contain a multi-entry page', () => {
  const x = fixture(),
    v = JSON.parse(new TextDecoder().decode(expectedRecord(x)));
  v[0] = 'done/account-inbound/v1';
  v[1] = 1;
  expect(() => decodeInboundRecord(json(v))).toThrow();
});
it('v2 receipt framing rejects single-request, conflict and wrong final position/link', () => {
  const x = fixture(),
    v = JSON.parse(new TextDecoder().decode(expectedRecord(x)));
  for (const [n, value] of [
    [1, 1],
    [7, 'conflict'],
    [8, 2],
    [10, ZERO],
    [13, -1],
    [13, 2],
  ] as const) {
    const bad = [...v];
    bad[n] = value;
    expect(() => decodeInboundRecord(json(bad))).toThrow();
  }
  const e = x.entries[0]!,
    p = packet(e),
    old = JSON.parse(new TextDecoder().decode(eventWire(e, context(), p)));
  old[0] = 'done/account-inbound/v2';
  old[1] = 2;
  expect(() => decodeInboundRecord(json(old))).toThrow();
});
for (const fault of [
  'bad-envelope',
  'bad-proof',
  'wrong-publisher',
  'wrong-position',
  'wrong-parent',
  'wrong-actor',
  'final-leaf',
] as const)
  it(`the entire range refuses a ${fault} in the second entry`, async () => {
    const f = sources(),
      first = f.entries[0]!,
      second = f.entries[1]!;
    let bad: FixtureEntry = {
      ...second,
      envelope: second.envelope.slice(),
      proof: second.proof.slice(),
    };
    if (fault === 'bad-envelope')
      bad.envelope[bad.envelope.length - 1] = bad.envelope[bad.envelope.length - 1]! ^ 1;
    else if (fault === 'bad-proof')
      bad.proof[bad.proof.length - 4] = bad.proof[bad.proof.length - 4]! ^ 1;
    else
      bad = entry(
        { publisher: fault === 'wrong-publisher' ? B : A, updates: second.updates },
        fault === 'wrong-position' ? 3 : 2,
        fault === 'wrong-parent' ? ZERO : first.link,
        { actor: fault === 'wrong-actor' ? B : A, final: fault === 'final-leaf' },
      );
    const x = fixture([first, bad]);
    await expect(range(x.context, x.request, x.page, live)).rejects.toThrow();
  });
for (const fault of [
  'reordered',
  'duplicated',
  'missing-first',
  'bad-page-signature',
  'bad-request-signature',
  'different-request',
  'expired',
] as const)
  it(`range request/page binding refuses ${fault} without returning a prefix`, async () => {
    const x = fixture();
    let p = { request: x.request.slice(), page: x.page.slice() };
    if (fault === 'reordered') p = fixture([...x.entries].reverse());
    if (fault === 'duplicated') p = fixture([x.entries[0]!, x.entries[0]!]);
    if (fault === 'missing-first') p = fixture([x.entries[1]!]);
    if (fault === 'bad-page-signature') p.page[p.page.length - 4] = p.page[p.page.length - 4]! ^ 1;
    if (fault === 'bad-request-signature')
      p.request[p.request.length - 4] = p.request[p.request.length - 4]! ^ 1;
    if (fault === 'different-request')
      p = {
        ...p,
        request: reframe(x, {
          request: (r) => {
            r[12] = 'ab'.repeat(32);
          },
        }).request,
      };
    await expect(
      range(
        x.context,
        p.request,
        p.page,
        fault === 'expired' ? { ...live, now: () => 40000 } : live,
      ),
    ).rejects.toThrow();
  });
it('range reads cannot borrow a retained old position as a new forward prefix', async () => {
  const x = fixture(),
    c = prior(x.context, x.entries[0]!);
  await expect(range(c, x.request, x.page, live)).rejects.toThrow('prefix');
});
it('late lifetime invalidation after the last signature cannot return an authenticated partial result', async () => {
  const x = fixture();
  let current = true;
  const original = crypto.subtle.verify.bind(crypto.subtle);
  let count = 0;
  const observed = vi
    .spyOn(crypto.subtle, 'verify')
    .mockImplementation(async (...args: Parameters<SubtleCrypto['verify']>) => {
      const valid = await original(...args);
      if (++count === 6) current = false;
      return valid;
    });
  await expect(
    range(x.context, x.request, x.page, {
      ...live,
      assertCurrent() {
        if (!current) throw Error('range expired owner');
      },
    }),
  ).rejects.toThrow('range expired owner');
  expect(observed.mock.calls.length).toBeGreaterThanOrEqual(6);
});
it('v2 stored evidence rechecks the selected original rather than trusting its prefix fields', async () => {
  const x = fixture(),
    v = JSON.parse(new TextDecoder().decode(expectedRecord(x))),
    p = decodeInboundPage(x.page);
  p.entries[0]!.envelope[p.entries[0]!.envelope.length - 1] =
    p.entries[0]!.envelope[p.entries[0]!.envelope.length - 1]! ^ 1;
  const bad = reframe(x, {
    page: (page) => {
      page[5] = p.entries.map((e) => [hex(e.envelope), hex(e.proof)]);
    },
  });
  v[12] = hex(bad.page);
  await expect(
    inbound.verifyStoredInbound(x.context, json(v), { ...live, now: () => 90000 }),
  ).rejects.toThrow();
});

it('a range exceeding the existing atomic record count refuses rather than returning a prefix', async () => {
  const f = sources(),
    updates = Array.from({ length: 128 }, () => f.entries[0]!.updates[0]!);
  const a = entry({ publisher: A, updates }, 1),
    b = entry({ publisher: A, updates }, 2, a.link),
    x = fixture([a, b]);
  await expect(range(x.context, x.request, x.page, live)).rejects.toThrow('size');
});

for (const size of [4, 8])
  it(`range size ${size} checks every linked entry and independently replays every selected receipt`, async () => {
    const doc = new Y.Doc(),
      entries: FixtureEntry[] = [];
    doc.clientID = 7654;
    try {
      let previous = ZERO;
      for (let position = 1; position <= size; position++) {
        const state = Y.encodeStateVector(doc);
        doc.getText('master').insert(doc.getText('master').length, String(position));
        const e = entry(
          { publisher: A, updates: [new Uint8Array(Y.encodeStateAsUpdate(doc, state))] },
          position,
          previous,
        );
        entries.push(e);
        previous = e.link;
      }
      const checks = vi.spyOn(crypto.subtle, 'verify');
      const x = fixture(entries, size),
        results = await range(x.context, x.request, x.page, live);
      expect(checks).toHaveBeenCalledTimes(2 + 2 * size);
      expect(results).toHaveLength(size);
      let c = x.context;
      for (const [index, r] of results.entries()) {
        expect(r.kind).toBe('received');
        if (r.kind !== 'received') throw Error();
        expect(r.record).toEqual(expectedRecord(x, index));
        expect(
          await inbound.verifyStoredInbound(c, r.record, { ...live, now: () => 90000 }),
        ).toEqual(r);
        c = prior(c, entries[index]!);
      }
      expect(c.prefix.position).toBe(size);
      expect(c.prefix.link).toBe(previous);
    } finally {
      doc.destroy();
    }
  });

it('range verification owns its caller bytes and authority fields before its first await', async () => {
  const x = fixture(),
    expected = x.entries.map((e) => e.updates.map((b) => b.slice()));
  const pending = range(x.context, x.request, x.page, live);
  x.request.fill(0);
  x.page.fill(0);
  x.context.generationKey.fill(0);
  x.context.reader.id = 'ff'.repeat(16);
  x.context.prefix.position = 99;
  const results = await pending;
  expect(results).toHaveLength(2);
  for (const [i, r] of results.entries()) {
    expect(r.kind).toBe('received');
    if (r.kind === 'received') expect(r.updates).toEqual(expected[i]);
  }
});

it('stored v2 receipts authenticate their original service page after expiry', async () => {
  const x = fixture(),
    v = JSON.parse(new TextDecoder().decode(expectedRecord(x))),
    p = JSON.parse(new TextDecoder().decode(x.page));
  p[6] = (p[6].startsWith('00') ? '01' : '00') + p[6].slice(2);
  v[12] = hex(json(p));
  await expect(
    inbound.verifyStoredInbound(x.context, json(v), { ...live, now: () => 90000 }),
  ).rejects.toThrow('unverified');
});
