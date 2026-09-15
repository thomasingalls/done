import { createHash } from 'node:crypto';
// @vitest-environment node
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import {
  decodeInboundRequest,
  encodeInboundRequest,
  decodeInboundPage,
  encodeInboundPage,
  checkInboundExtent,
} from '../account-protocol/inboundTransport';
import {
  decodeReadRequest,
  decodeReadPage,
  READ_PAGE_LIMIT,
  READ_REQUEST_LIMIT,
} from '../account-protocol/deliveryTransport';
import {
  decodeInboundRecord,
  encodeInboundRecord,
  INBOUND_RECORD_LIMIT,
} from '../src/crdt/inboundRecord';
import { verifyInboundPage, verifyStoredInbound } from '../src/crdt/accountInbound';
import { Y, hasPendingUpdates } from '../src/crdt/yjs';
import { A, B, entry, packet, sources, ZERO } from './account-inbound/fixtures';
import {
  context,
  eventWire,
  hex,
  json,
  live,
  prior,
  reframe,
} from './account-inbound-codecs/oracle';
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function refusal(op: Promise<unknown>) {
  let reason: string | undefined;
  try {
    await op;
  } catch (e) {
    reason = String(e);
  }
  expect(reason).toBeDefined();
  return reason!;
}
const f = sources(),
  first = f.entries[0]!,
  p = packet(first);
const verify = (q = p, c = context()) => verifyInboundPage(c, q.request, q.page, live);
const save = (name: string, data: unknown) => {
  if (process.env['ACCOUNT_REPORT_DIR'])
    writeFileSync(
      join(process.env['ACCOUNT_REPORT_DIR'], name + '.json'),
      JSON.stringify(data, null, 2) + '\n',
    );
};
afterEach(() => vi.restoreAllMocks());
describe('closed inbound v2 transport and local record codecs', () => {
  it('matches independent request, page and event bytes without changing v1 interpretation', async () => {
    expect(encodeInboundRequest(decodeInboundRequest(p.request))).toEqual(p.request);
    expect(encodeInboundPage(decodeInboundPage(p.page))).toEqual(p.page);
    const wire = eventWire(first);
    expect(encodeInboundRecord(decodeInboundRecord(wire))).toEqual(wire);
    expect(() => decodeReadRequest(p.request)).toThrow();
    expect(() => decodeReadPage(p.page)).toThrow();
    const result = await verify();
    expect(result.kind).toBe('received');
    if (result.kind !== 'received') throw Error();
    expect(result.record).toEqual(wire);
    expect(result.updates).toEqual(first.updates);
    expect(Object.isFrozen(result)).toBe(true);
    save('independent-bytes', {
      request: hex(p.request),
      page: hex(p.page),
      record: hex(wire),
      updates: first.updates.map(hex),
      observedRecord: hex(result.record),
      observedUpdates: result.updates.map(hex),
    });
  });
  it.each(['request', 'page', 'record'] as const)(
    'rejects malformed, noncanonical and oversized %s frames',
    (kind) => {
      const wire = kind === 'request' ? p.request : kind === 'page' ? p.page : eventWire(first),
        decode =
          kind === 'request'
            ? decodeInboundRequest
            : kind === 'page'
              ? decodeInboundPage
              : decodeInboundRecord;
      const text = Buffer.from(wire).toString(),
        values = JSON.parse(text) as unknown[];
      for (const bad of [
        new Uint8Array(),
        new Uint8Array([255]),
        new Uint8Array([0xef, 0xbb, 0xbf, ...wire]),
        new TextEncoder().encode(text + ' '),
        new TextEncoder().encode(text + '[]'),
        json([...values, 0]),
        json({ ...values }),
        json(['wrong', ...values.slice(1)]),
        json([values[0], 99, ...values.slice(2)]),
        new Uint8Array(
          (kind === 'request'
            ? READ_REQUEST_LIMIT
            : kind === 'page'
              ? READ_PAGE_LIMIT
              : INBOUND_RECORD_LIMIT) + 1,
        ),
      ])
        expect(() => decode(bad)).toThrow();
      const escaped = text.replace('done', '\\u0064one');
      expect(() => decode(new TextEncoder().encode(escaped))).toThrow();
    },
  );
  it('rejects unsafe integers, signed zero, invalid IDs, odd/uppercase hex and malformed page entries', () => {
    const base = JSON.parse(Buffer.from(p.request).toString()) as unknown[];
    for (const [index, value] of [
      [9, 0],
      [10, -1],
      [10, Number.MAX_SAFE_INTEGER + 1],
      [11, 9],
      [11, 0],
      [13, 0],
      [2, 'aa'],
      [5, 'AA'.repeat(16)],
      [12, 'a'],
      [14, 'g'.repeat(128)],
      [3, 'https://fixture.invalid/'],
    ] as const) {
      const v = [...base];
      v[index] = value;
      expect(() => decodeInboundRequest(json(v))).toThrow();
    }
    expect(() =>
      decodeInboundRequest(
        new TextEncoder().encode(Buffer.from(p.request).toString().replace(',1,0,1,', ',1,-0,1,')),
      ),
    ).toThrow();
    const b = JSON.parse(Buffer.from(p.page).toString());
    for (const entries of [
      null,
      {},
      [null],
      [[hex(first.envelope)]],
      [[hex(first.envelope), hex(first.proof), 0]],
      Array(9).fill([hex(first.envelope), hex(first.proof)]),
      [['ab', 'zz']],
    ]) {
      b[5] = entries;
      expect(() => decodeInboundPage(json(b))).toThrow();
    }
  });
  it('rejects outer metadata mismatches and nested carrier substitutions before granting evidence', () => {
    const base = JSON.parse(Buffer.from(eventWire(first)).toString()) as unknown[];
    for (const [index, value] of [
      [3, 'bb'.repeat(32)],
      [4, 'bb'.repeat(32)],
      [5, B],
      [6, B],
      [7, 'accepted'],
      [8, 2],
      [10, 'bb'.repeat(32)],
      [11, 'a'],
      [12, '00'],
    ] as const) {
      const v = [...base];
      v[index] = value;
      expect(() => decodeInboundRecord(json(v))).toThrow();
    }
  });
  it('implements bounded contiguous page extent, including empty end pages and safe-integer exhaustion', () => {
    const r = decodeInboundRequest(p.request),
      page = decodeInboundPage(p.page);
    for (const v of [
      { ...page, next: 2 },
      { ...page, through: 0 },
      { ...page, entries: [] },
      { ...page, entries: [...page.entries, ...page.entries] },
    ])
      expect(() => checkInboundExtent(v, r)).toThrow();
    const empty = { ...page, through: 0, next: 0, entries: [] };
    expect(() => checkInboundExtent(empty, r)).not.toThrow();
    expect(() =>
      checkInboundExtent(
        { ...page, next: Number.MAX_SAFE_INTEGER },
        { ...r, after: Number.MAX_SAFE_INTEGER },
      ),
    ).toThrow();
  });
});
describe('first-epoch inbound evidence under independently held owner context', () => {
  it('verifies original stored wire after expiry and refuses changed baseline, link or record meaning', async () => {
    const result = await verify();
    if (result.kind !== 'received') throw Error();
    await expect(
      verifyInboundPage(context(), p.request, p.page, { ...live, now: () => 30000 }),
    ).rejects.toThrow('expired');
    const cold = await verifyStoredInbound(context(), result.record, {
      ...live,
      now: () => {
        throw Error('Cold replay must not ask the clock');
      },
    });
    expect(cold).toEqual(result);
    const base = JSON.parse(Buffer.from(result.record).toString());
    for (const [index, value] of [
      [2, 'aa'.repeat(32)],
      [9, 'bb'.repeat(32)],
      [7, 'conflict'],
    ] as const) {
      const v = [...base];
      v[index] = value;
      await expect(verifyStoredInbound(context(), json(v), live)).rejects.toThrow('record');
    }
    const bad = decodeInboundRecord(result.record),
      request = JSON.parse(Buffer.from(bad.request).toString());
    request[14] = '00'.repeat(64);
    bad.request = json(request);
    await expect(verifyStoredInbound(context(), encodeInboundRecord(bad), live)).rejects.toThrow();
  });
  it('preserves per-publisher accepted links, exact duplicates and independently proved conflicts', async () => {
    const firstResult = await verify();
    expect(firstResult.kind).toBe('received');
    const c = prior(context(), first);
    expect((await verify(p, c)).kind).toBe('duplicate');
    const second = packet(f.entries[1]!);
    expect((await verify(second, c)).kind).toBe('received');
    await expect(verify(second)).rejects.toThrow('prefix');
    const other = entry(first, 1, ZERO, { nonceByte: 19 }),
      changed = packet(other),
      conflict = await verify(changed, c);
    expect(conflict.kind).toBe('conflict');
    expect('updates' in conflict).toBe(false);
    if (conflict.kind !== 'conflict') throw Error();
    expect(conflict.record).toEqual(eventWire(other, c, changed, 'conflict'));
    expect((await verifyStoredInbound(c, conflict.record, live)).kind).toBe('conflict');
    const missing = structuredClone(c);
    delete missing.retained;
    await expect(verify(p, missing)).rejects.toThrow('prefix');
    const wrong = structuredClone(c);
    wrong.retained!.proof.fill(0);
    await expect(verify(p, wrong)).rejects.toThrow('prefix');
  });
  it('does not learn its prefix from a correctly signed response', async () => {
    const own = { ...context(), prefix: { position: 1, link: first.link, observedThrough: 1 } };
    const forged = entry(f.entries[1]!, 2, 'aa'.repeat(32));
    await expect(verify(packet(forged), own)).rejects.toThrow('unverified');
  });
  it.each([
    'reader',
    'publisher',
    'lineage',
    'head',
    'origin',
    'service',
    'workspace',
    'epoch',
  ] as const)('rejects a signed %s scope substitution', async (field) => {
    const index = {
      reader: 5,
      publisher: 6,
      lineage: 7,
      head: 8,
      origin: 3,
      service: 2,
      workspace: 4,
      epoch: 9,
    }[field];
    const value =
      field === 'epoch'
        ? 2
        : field === 'origin'
          ? 'https://other.invalid'
          : field === 'head' || field === 'lineage'
            ? 'aa'.repeat(32)
            : B;
    await expect(
      verify(
        reframe(p, {
          request: (r) => {
            r[index] = value;
          },
        }),
      ),
    ).rejects.toThrow('scope');
  });
  it('rejects invalid reader/page signatures, wrong nonce binding, missing members and mismatched current authority', async () => {
    for (const kind of ['reader', 'page'] as const) {
      const q = structuredClone(p),
        v = JSON.parse(Buffer.from(q[kind === 'reader' ? 'request' : 'page']).toString());
      v[v.length - 1] = '00'.repeat(64);
      q[kind === 'reader' ? 'request' : 'page'] = json(v);
      await expect(verify(q)).rejects.toThrow();
    }
    const other = packet(first, 1, 2);
    await expect(verify({ request: p.request, page: other.page })).rejects.toThrow('request');
    for (const target of ['reader', 'publisher'] as const) {
      const c = context();
      c[target].active = false;
      await expect(verify(p, c)).rejects.toThrow('authority');
    }
    const c = context();
    c.authority.acceptanceKey = c.reader.publicKey;
    await expect(verify(p, c)).rejects.toThrow('unverified');
    c.authority.tip = 2;
    await expect(verify(p, c)).rejects.toThrow('unsupported');
  });
  it.each(['epoch', 'generation', 'actor', 'agent', 'system', 'final'] as const)(
    'checks %s separately from signature validity',
    async (mode) => {
      const e = entry(
        first,
        1,
        ZERO,
        mode === 'epoch'
          ? { epoch: 2 }
          : mode === 'generation'
            ? { generation: 2 }
            : mode === 'actor'
              ? { actor: B }
              : mode === 'agent'
                ? { actorKind: 'agent' }
                : mode === 'system'
                  ? { actor: 'system', actorKind: 'system' }
                  : { final: true },
      );
      const c = context();
      if (mode === 'system') c.publisher.system = false;
      await expect(verify(packet(e), c)).rejects.toThrow();
    },
  );
  it('returns authenticated pending originals without requiring immediate Yjs integration', async () => {
    const c = context(B),
      q = packet(f.entries[2]!),
      result = await verify(q, c);
    if (result.kind !== 'received') throw Error();
    const doc = new Y.Doc();
    try {
      Y.applyUpdate(doc, f.baseline);
      for (const u of result.updates) Y.applyUpdate(doc, u);
      expect(hasPendingUpdates(doc)).toBe(true);
      Y.applyUpdate(doc, first.updates[0]!);
      expect(doc.getText('master').toString()).toBe('baseXY');
    } finally {
      doc.destroy();
    }
  });
  it('bounds updates before a future 256-record local commit and rejects malformed Yjs plaintext', async () => {
    const valid = entry(
      { publisher: A, updates: Array.from({ length: 255 }, () => new Uint8Array([0, 0])) },
      1,
    );
    const result = await verify(packet(valid));
    expect(result.kind === 'received' && result.updates.length).toBe(255);
    for (const updates of [
      Array.from({ length: 256 }, () => new Uint8Array([0, 0])),
      [new Uint8Array(512 * 1024).fill(1)],
      [new Uint8Array([255])],
    ])
      await expect(verify(packet(entry({ publisher: A, updates }, 1)))).rejects.toThrow();
  });
  it('verifies empty end pages but rejects regressed retained high-water marks and unsupported batch reads', async () => {
    const empty = reframe(p, {
      page: (v) => {
        v[3] = 0;
        v[4] = 0;
        v[5] = [];
      },
    });
    expect(await verify(empty)).toEqual({ kind: 'empty', position: 0, through: 0 });
    const c = context();
    c.prefix.observedThrough = 2;
    await expect(verify(p, c)).rejects.toThrow('prefix');
    await expect(
      verify(
        reframe(p, {
          request: (v) => {
            v[11] = 2;
          },
        }),
      ),
    ).rejects.toThrow('unsupported');
    await expect(
      verify(
        reframe(p, {
          page: (v) => {
            v[3] = 1;
            v[4] = 0;
            v[5] = [];
          },
        }),
      ),
    ).rejects.toThrow();
  });
  it('captures all mutable bytes/context before crypto and returns detached evidence', async () => {
    const q = structuredClone(p),
      c = context(),
      expected = eventWire(first),
      promise = verify(q, c);
    q.request.fill(0);
    q.page.fill(0);
    c.generationKey.fill(0);
    c.authority.head = 'aa'.repeat(32);
    c.publisher.principal = B;
    const result = await promise;
    if (result.kind !== 'received') throw Error();
    expect(result.record).toEqual(expected);
    expect(result.updates).toEqual(first.updates);
    result.updates[0]!.fill(0);
    expect(first.updates[0]).not.toEqual(result.updates[0]);
  });
  it('withholds new, duplicate, empty and stored results after close, including the last crypto completion', async () => {
    const c = prior(context(), first),
      record = eventWire(first),
      empty = reframe(p, {
        page: (v) => {
          v[3] = 0;
          v[4] = 0;
          v[5] = [];
        },
      });
    for (const mode of ['new', 'duplicate', 'empty', 'stored']) {
      let closed = false;
      const life = {
        assertCurrent() {
          if (closed) throw Error('closed');
        },
        now: () => 1000,
      };
      const promise =
        mode === 'stored'
          ? verifyStoredInbound(context(), record, life)
          : verifyInboundPage(
              mode === 'duplicate' ? c : context(),
              mode === 'empty' ? empty.request : p.request,
              mode === 'empty' ? empty.page : p.page,
              life,
            );
      closed = true;
      await expect(promise).rejects.toThrow('closed');
    }
    let closed = false;
    const decrypt = crypto.subtle.decrypt.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'decrypt').mockImplementation(async (...args) => {
      const result = await decrypt(...args);
      closed = true;
      return result;
    });
    await expect(
      verifyInboundPage(context(), p.request, p.page, {
        assertCurrent() {
          if (closed) throw Error('closed');
        },
        now: () => 1000,
      }),
    ).rejects.toThrow('closed');
  });
  it('rechecks expiry at completion and refuses an asynchronous owner assertion', async () => {
    let now = 1000;
    const decrypt = crypto.subtle.decrypt.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'decrypt').mockImplementation(async (...args) => {
      const result = await decrypt(...args);
      now = 30000;
      return result;
    });
    await expect(
      verifyInboundPage(context(), p.request, p.page, { assertCurrent() {}, now: () => now }),
    ).rejects.toThrow('expired');
    await expect(
      verifyInboundPage(context(), p.request, p.page, { assertCurrent: async () => {} }),
    ).rejects.toThrow('authority');
  });
  it('keeps the original lifetime assertion when the caller replaces its callback during crypto', async () => {
    let closed = false;
    const lifetime = {
      assertCurrent() {
        if (closed) throw Error('closed');
      },
      now: () => 1000,
    };
    const pending = verifyInboundPage(context(), p.request, p.page, lifetime);
    closed = true;
    lifetime.assertCurrent = () => {};
    await expect(pending).rejects.toThrow('closed');
  });
  it('400 generated signed updates round-trip, cold-verify and reject independently re-signed actor substitutions', async () => {
    const histories: unknown[] = [];
    await fc.assert(
      fc.asyncProperty(
        fc.string({ maxLength: 80 }),
        fc.integer({ min: 1, max: 250 }),
        async (text, nonce) => {
          const doc = new Y.Doc();
          doc.clientID = 1200;
          try {
            doc.getText('master').insert(0, text);
            const update = new Uint8Array(Y.encodeStateAsUpdate(doc));
            const e = entry({ publisher: A, updates: [update] }, 1, ZERO, { nonceByte: nonce }),
              q = packet(e),
              expected = eventWire(e);
            const result = await verify(q);
            if (result.kind !== 'received') throw Error();
            expect(result.record).toEqual(expected);
            expect(result.updates).toEqual([update]);
            const cold = await verifyStoredInbound(context(), expected, {
              ...live,
              now: () => 999999,
            });
            expect(cold).toEqual(result);
            if (cold.kind !== 'received') throw Error();
            const actorRefusal = await refusal(
              verify(packet(entry(e, 1, ZERO, { actor: B, nonceByte: nonce }))),
            );
            expect(actorRefusal).toContain('actor');
            histories.push({
              text,
              nonce,
              update: hex(update),
              expectedRecord: digest(expected),
              observedRecord: digest(result.record),
              coldRecord: digest(cold.record),
              observedUpdates: result.updates.map(hex),
              coldUpdates: cold.updates.map(hex),
              actorRefusal,
            });
            save('generated', {
              seed: 9152026,
              status: 'running',
              runs: histories.length,
              histories,
            });
          } finally {
            doc.destroy();
          }
        },
      ),
      { seed: 9152026, numRuns: 400 },
    );
    save('generated', { seed: 9152026, status: 'passed', runs: 400, histories });
  }, 30000);
  it('500 arbitrary changed wire bytes never authenticate as the original frame', async () => {
    const mutations: unknown[] = [];
    await fc.assert(
      fc.asyncProperty(
        fc.nat(p.page.length - 1),
        fc.integer({ min: 1, max: 255 }),
        async (index, mask) => {
          const bytes = p.page.slice();
          bytes[index] = bytes[index]! ^ mask;
          const reason = await refusal(verify({ request: p.request, page: bytes }));
          mutations.push({ index, mask, original: p.page[index], changed: bytes[index], reason });
          save('wire-corruptions', {
            seed: 9162026,
            status: 'running',
            page: digest(p.page),
            mutations,
          });
        },
      ),
      { seed: 9162026, numRuns: 500 },
    );
    save('wire-corruptions', { seed: 9162026, status: 'passed', page: digest(p.page), mutations });
  }, 30000);
});
