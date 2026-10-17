// @vitest-environment node
import { createPrivateKey, sign } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { verifyHistoryPage, verifyInboundPage } from '../src/crdt/accountInbound';
import { Y } from '../src/crdt/yjs';
import { INBOUND_ENVELOPE_LIMIT } from '../src/crdt/inboundRecord';
import { decodeInboundRecord } from '../src/crdt/inboundRecord';
import { A, entry, packet, sources, ZERO, type FixtureEntry } from './account-inbound/fixtures';
import { context, json, live, reframe } from './account-inbound-codecs/oracle';
const key = (byte: string) =>
  createPrivateKey({
    key: Buffer.from('302e020100300506032b657004220420' + byte.repeat(32), 'hex'),
    format: 'der',
    type: 'pkcs8',
  });
const frame = (
  entries: readonly FixtureEntry[],
  options: {
    limit?: number;
    through?: number;
    after?: number;
    page?: (value: unknown[]) => void;
    request?: (value: unknown[]) => void;
  } = {},
) => {
  const first = entries[0]!,
    p = packet(first);
  return reframe(p, {
    request(r) {
      r[10] = options.after ?? first.position - 1;
      r[11] = options.limit ?? entries.length;
      options.request?.(r);
    },
    page(v) {
      v[3] = options.through ?? entries.at(-1)!.position;
      v[4] = first.position - 1 + entries.length;
      v[5] = entries.map((e) => [
        Buffer.from(e.envelope).toString('hex'),
        Buffer.from(e.proof).toString('hex'),
      ]);
      options.page?.(v);
    },
  });
};
const history = (count = 8) => {
  const f = sources(),
    rows: FixtureEntry[] = [],
    doc = new Y.Doc();
  Y.applyUpdate(doc, f.baseline);
  doc.clientID = 2010;
  try {
    for (let i = 1; i <= count; i++) {
      const before = Y.encodeStateVector(doc);
      doc.getText('master').insert(doc.getText('master').length, ` edit ${i}`);
      rows.push(
        entry(
          { publisher: A, updates: [new Uint8Array(Y.encodeStateAsUpdate(doc, before))] },
          i,
          rows.at(-1)?.link ?? ZERO,
          { nonceByte: i },
        ),
      );
    }
  } finally {
    doc.destroy();
  }

  return rows;
};
const check = (
  rows: readonly FixtureEntry[],
  options: Parameters<typeof frame>[1] = {},
  cut = rows.at(-1)!,
) => {
  const p = frame(rows, options);
  return verifyHistoryPage(
    context(),
    p.request,
    p.page,
    { position: cut.position, link: cut.link },
    live,
  );
};
afterEach(() => vi.restoreAllMocks());

it('authenticates every entry of an eight-entry transient page without producing a stored record', async () => {
  const rows = history(),
    result = await check(rows);
  expect(result.count).toBe(8);
  expect(result.position).toBe(8);
  expect(result.link).toBe(rows[7]!.link);
  expect(result.updates).toEqual(rows.flatMap((e) => e.updates));
  expect(Object.isFrozen(result)).toBe(true);
  expect('record' in result).toBe(false);
  const p = frame(rows);
  await expect(verifyInboundPage(context(), p.request, p.page, live)).rejects.toThrow(
    'unsupported',
  );
  expect(() => decodeInboundRecord(json(['done/account-inbound/v1', 1]))).toThrow();
});

it.each([0, 3, 7])(
  'refuses a signed page with an unverified proof at entry %i and withholds all updates',
  async (index) => {
    const rows = history(),
      p = frame(rows, {
        page(v) {
          const list = v[5] as string[][];
          const proof = JSON.parse(Buffer.from(list[index]![1]!, 'hex').toString());
          proof[6] = 'ab'.repeat(32);
          list[index]![1] = Buffer.from(json(proof)).toString('hex');
        },
      });
    await expect(verifyHistoryPage(context(), p.request, p.page, rows[7]!, live)).rejects.toThrow();
  },
);

it.each([0, 3, 7])(
  'refuses a wrong actor at entry %i even when envelope, acceptance and page are signed',
  async (index) => {
    const rows = history(),
      changed: FixtureEntry[] = [];
    for (let i = 0; i < rows.length; i++)
      changed.push(
        entry(rows[i]!, i + 1, changed.at(-1)?.link ?? ZERO, {
          actor: i === index ? 'ab'.repeat(16) : A,
        }),
      );
    await expect(check(changed)).rejects.toThrow('actor');
  },
);

it('binds the exact request, both signatures and every scope field', async () => {
  const rows = history(),
    p = frame(rows);
  const different = frame(rows, {
    request(r) {
      r[12] = 'ab'.repeat(32);
    },
  });
  await expect(
    verifyHistoryPage(context(), different.request, p.page, rows[7]!, live),
  ).rejects.toThrow('request');
  for (const offset of [2, 3, 4, 5, 6, 7, 8, 9]) {
    const changed = frame(rows, {
      request(r) {
        r[offset] =
          offset === 3
            ? 'https://wrong.invalid'
            : offset === 9
              ? 2
              : 'ab'.repeat(offset === 7 || offset === 8 ? 32 : 16);
      },
    });
    await expect(
      verifyHistoryPage(context(), changed.request, changed.page, rows[7]!, live),
    ).rejects.toThrow();
  }
  const badPage = JSON.parse(Buffer.from(p.page).toString());
  badPage[6] = '00'.repeat(64);
  await expect(
    verifyHistoryPage(context(), p.request, json(badPage), rows[7]!, live),
  ).rejects.toThrow('unverified');
  const badRequest = JSON.parse(Buffer.from(p.request).toString());
  badRequest[14] = '00'.repeat(64);
  const body = JSON.parse(Buffer.from(p.page).toString());
  const { createHash } = await import('node:crypto');
  body[2] = createHash('sha256').update(json(badRequest)).digest('hex');
  body.pop();
  body.push(sign(null, json(body), key('44')).toString('hex'));
  await expect(
    verifyHistoryPage(context(), json(badRequest), json(body), rows[7]!, live),
  ).rejects.toThrow('unverified');
});

it('refuses gaps, reordering, duplicates, cut overshoot and a changed exact cut link', async () => {
  const rows = history();
  for (const order of [
    [rows[0]!, rows[2]!],
    [rows[1]!, rows[0]!],
    [rows[0]!, rows[0]!],
  ])
    await expect(check(order, { after: 0 })).rejects.toThrow();
  await expect(check(rows, {}, { ...rows[7]!, position: 7 })).rejects.toThrow('prefix');
  await expect(check(rows, {}, { ...rows[7]!, link: 'ab'.repeat(32) })).rejects.toThrow('prefix');
});

it('accepts a shorter nonempty prefix and resumes from its last verified position', async () => {
  const rows = history(),
    first = frame(rows.slice(0, 3), { limit: 8, through: 8 });
  const initial = await verifyHistoryPage(context(), first.request, first.page, rows[7]!, live);
  expect(initial.position).toBe(3);
  expect(initial.count).toBe(3);
  const next = frame(rows.slice(3)),
    c = context();
  c.prefix = { position: initial.position, link: initial.link, observedThrough: initial.through };
  const result = await verifyHistoryPage(c, next.request, next.page, rows[7]!, live);
  expect(result.position).toBe(8);
  expect(result.link).toBe(rows[7]!.link);
});

it('retains monotone observed tips and rejects an empty nonadvancing page', async () => {
  const rows = history(),
    p = frame(rows),
    c = context();
  c.prefix.observedThrough = 9;
  await expect(verifyHistoryPage(c, p.request, p.page, rows[7]!, live)).rejects.toThrow('prefix');
  const empty = frame(rows, {
    page(v) {
      v[4] = 0;
      v[5] = [];
    },
  });
  await expect(
    verifyHistoryPage(context(), empty.request, empty.page, rows[7]!, live),
  ).rejects.toThrow();
});

it('captures lifetime callbacks and refuses expiry or close during asynchronous verification', async () => {
  const rows = history(),
    p = frame(rows);
  let calls = 0,
    closed = false;
  const lifetime = {
    assertCurrent() {
      if (++calls === 12) {
        closed = true;
        lifetime.assertCurrent = () => {};
      }
      if (closed) throw Error('retired');
    },
    now: () => 1000,
  };
  await expect(verifyHistoryPage(context(), p.request, p.page, rows[7]!, lifetime)).rejects.toThrow(
    'retired',
  );
  let ticks = 0;
  await expect(
    verifyHistoryPage(context(), p.request, p.page, rows[7]!, {
      assertCurrent() {},
      now: () => (++ticks > 20 ? 30000 : 1000),
    }),
  ).rejects.toThrow('expired');
});

it('captures request, page, cut, prefix and key bytes before async crypto', async () => {
  const rows = history(),
    p = frame(rows),
    c = context(),
    cut = { position: 8, link: rows[7]!.link };
  const result = verifyHistoryPage(c, p.request, p.page, cut, live);
  p.request.fill(0);
  p.page.fill(0);
  c.generationKey.fill(0);
  c.prefix.link = 'ab'.repeat(32);
  cut.link = 'ab'.repeat(32);
  expect((await result).link).toBe(rows[7]!.link);
});

it.each([0, 3, 7])(
  'checks the envelope signature at entry %i independently of the signed page',
  async (index) => {
    const rows = history(),
      p = frame(rows, {
        page(v) {
          const list = v[5] as string[][];
          const wire = Buffer.from(list[index]![0]!, 'hex');
          wire[wire.length - 1]! ^= 1;
          list[index]![0] = wire.toString('hex');
        },
      });
    await expect(verifyHistoryPage(context(), p.request, p.page, rows[7]!, live)).rejects.toThrow();
  },
);

it('retains the single-envelope byte bound inside a larger signed history page', async () => {
  const rows = history(),
    p = frame(rows, {
      page(v) {
        (v[5] as string[][])[3]![0] = '00'.repeat(INBOUND_ENVELOPE_LIMIT + 1);
      },
    });
  await expect(verifyHistoryPage(context(), p.request, p.page, rows[7]!, live)).rejects.toThrow(
    'size',
  );
});

it('retains each envelope update-count and valid-Yjs constraints', async () => {
  for (const updates of [
    Array.from({ length: 256 }, () => new Uint8Array([0, 0])),
    [new Uint8Array([255])],
  ]) {
    const row = entry({ publisher: A, updates }, 1);
    await expect(check([row])).rejects.toThrow();
  }
});

it('withholds the whole page when the owner retires during its final decrypt', async () => {
  const rows = history(),
    p = frame(rows);
  let calls = 0,
    closed = false;
  const decrypt = crypto.subtle.decrypt.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'decrypt').mockImplementation(async (...args) => {
    const result = await decrypt(...args);
    if (++calls === 8) closed = true;
    return result;
  });
  await expect(
    verifyHistoryPage(context(), p.request, p.page, rows[7]!, {
      assertCurrent() {
        if (closed) throw Error('retired final decrypt');
      },
      now: () => 1000,
    }),
  ).rejects.toThrow('retired final decrypt');
  expect(calls).toBe(8);
});
