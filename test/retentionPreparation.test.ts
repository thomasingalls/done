// @vitest-environment node
import { expect, it, vi } from 'vitest';
import {
  encodePreparationValue as encode,
  decodePreparationValue as decode,
} from '../src/crdt/preparationValue';
import {
  createPreparationJournal,
  authenticatePreparationReceipts,
  disposePreparationReceipts,
  PreparationPause,
  type PreparationReceipts,
} from '../src/crdt/retentionPreparation';
import type { Bytes } from '../src/crdt/custodyCrypto';

const context = '01'.repeat(32),
  current = () => {};
async function auth() {
  const key = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
  return {
    sign: async (b: Bytes) => new Uint8Array(await crypto.subtle.sign('HMAC', key, b)),
    verify: (b: Bytes, m: Bytes) => crypto.subtle.verify('HMAC', key, m, b),
  };
}
it('canonical result codec owns bytes, orders fields and refuses trailing/noncanonical encodings', () => {
  const source = {
    z: undefined,
    bytes: new Uint8Array([1, 2, 3]),
    a: [null, true, false, 17, 'text'],
  };
  const bytes = encode(source);
  source.bytes.fill(0);
  expect(decode(bytes)).toEqual({ ...source, bytes: new Uint8Array([1, 2, 3]) });
  expect(encode({ b: 2, a: 1 })).toEqual(encode({ a: 1, b: 2 }));
  expect(() => decode(new Uint8Array([...bytes, 0]))).toThrow();
  for (const input of [
    new Uint8Array([255]),
    new Uint8Array([7, 255, 255, 255, 255, 15]),
    bytes.slice(0, -1),
  ])
    expect(() => decode(input)).toThrow();
});
it('codec refuses getters, symbols, cycles, custom prototypes, sparse arrays and dangerous keys', () => {
  let calls = 0;
  const getter = {
      get x() {
        calls++;
        return 1;
      },
    },
    cycle: unknown[] = [];
  cycle.push(cycle);
  for (const value of [
    getter,
    { [Symbol()]: 1 },
    cycle,
    new Map(),
    new Date(),
    Array(2),
    NaN,
    Infinity,
    1.5,
    -0,
    JSON.parse('{"__proto__":1}'),
  ])
    expect(() => encode(value)).toThrow();
  expect(calls).toBe(0);
});
it('only authenticated exact-context deltas can seed a fresh owner', async () => {
  const a = await auth(),
    old = createPreparationJournal({ context, current });
  const check = vi.fn(async () => new Uint8Array([7, 8]));
  const value = await old.memo.check('opened:1', 'row', [new Uint8Array([4])], check, current);
  value.fill(0);
  const delta = await old.delta(a);
  old.dispose();
  const proof = await authenticatePreparationReceipts(
    context,
    delta.payload,
    delta.mac,
    a,
    current,
  );
  const next = createPreparationJournal({ context, current });
  next.import(proof);
  disposePreparationReceipts(proof);
  expect(await next.memo.check('opened:1', 'row', [new Uint8Array([4])], check, current)).toEqual(
    new Uint8Array([7, 8]),
  );
  expect(check).toHaveBeenCalledTimes(1);
  expect(next.statistics.hits).toBe(1);
  next.dispose();
});
it('every input, role, slot and authority context remains a cache boundary', async () => {
  const a = await auth(),
    j = createPreparationJournal({ context, current });
  let checks = 0;
  const check = async () => {
    checks++;
  };
  await j.memo.check('spool:1', 'actor', [new Uint8Array([1])], check, current);
  const delta = await j.delta(a),
    proof = await authenticatePreparationReceipts(context, delta.payload, delta.mac, a, current);
  const next = createPreparationJournal({ context, current });
  next.import(proof);
  await next.memo.check('spool:1', 'actor', [new Uint8Array([2])], check, current);
  await next.memo.check('spool:1', 'other actor', [new Uint8Array([1])], check, current);
  await next.memo.check('spool:2', 'actor', [new Uint8Array([1])], check, current);
  expect(checks).toBe(4);
  expect(() =>
    createPreparationJournal({ context: '02'.repeat(32), current }).import(proof),
  ).toThrow();
  disposePreparationReceipts(proof);
  next.dispose();
  j.dispose();
});
it('altered MAC, payload, owner key and context cannot manufacture imported verification', async () => {
  const a = await auth(),
    other = await auth(),
    j = createPreparationJournal({ context, current });
  await j.memo.check('spool:1', 'route', [], async () => {}, current);
  const d = await j.delta(a);
  const payload = d.payload.slice();
  payload[0]! ^= 1;
  const mac = d.mac.slice();
  mac[0]! ^= 1;
  for (const [c, p, m, owner] of [
    [context, payload, d.mac, a],
    [context, d.payload, mac, a],
    [context, d.payload, d.mac, other],
    ['ff'.repeat(32), d.payload, d.mac, a],
  ] as const)
    await expect(authenticatePreparationReceipts(c, p, m, owner, current)).rejects.toThrow();
  expect(() =>
    j.import({ kind: 'authenticated-preparation-receipts' } as PreparationReceipts),
  ).toThrow();
  j.dispose();
});
it('a failed or late callback never becomes a resumable success', async () => {
  const j = createPreparationJournal({ context, current });
  await expect(
    j.memo.check(
      'spool:1',
      'route',
      [],
      async () => {
        throw Error('signature');
      },
      current,
    ),
  ).rejects.toThrow('signature');
  expect(j.statistics.pending).toBe(0);
  let done!: () => void;
  const pending = j.memo.check(
    'spool:2',
    'route',
    [],
    () =>
      new Promise<void>((r) => {
        done = r;
      }),
    current,
  );
  await vi.waitFor(() => expect(done).toBeTypeOf('function'));
  j.memo.clear();
  done();
  await expect(pending).rejects.toThrow('changed');
  expect(j.statistics.pending).toBe(0);
  j.dispose();
});
it('late hash/verification results cannot revive a disposed journal', async () => {
  const j = createPreparationJournal({ context, current });
  let done!: (b: Uint8Array<ArrayBuffer>) => void;
  const pending = j.memo.check(
    'opened:1',
    'route',
    [],
    () =>
      new Promise<Uint8Array<ArrayBuffer>>((r) => {
        done = r;
      }),
    current,
  );
  await vi.waitFor(() => expect(done).toBeTypeOf('function'));
  j.dispose();
  done(new Uint8Array([1]));
  await expect(pending).rejects.toThrow('closed');
  expect(j.statistics.pending).toBe(0);
});
it('imports are restricted to the fresh owner and expired capabilities cannot be reused', async () => {
  const a = await auth(),
    first = createPreparationJournal({ context, current });
  await first.memo.check('spool:1', 'r', [], async () => {}, current);
  const d = await first.delta(a),
    p = await authenticatePreparationReceipts(context, d.payload, d.mac, a, current);
  const next = createPreparationJournal({ context, current });
  await next.memo.check('spool:2', 'r', [], async () => {}, current);
  expect(() => next.import(p)).toThrow('began');
  disposePreparationReceipts(p);
  expect(() => createPreparationJournal({ context, current }).import(p)).toThrow();
  first.dispose();
  next.dispose();
});
it('a two-second slice keeps completed checks and pauses only before new unchecked work', async () => {
  let now = 0;
  const a = await auth(),
    j = createPreparationJournal({ context, current, now: () => now });
  await j.memo.check(
    'spool:1',
    'r',
    [],
    async () => {
      now = 2100;
    },
    current,
  );
  await expect(j.memo.check('spool:2', 'r', [], async () => {}, current)).rejects.toBeInstanceOf(
    PreparationPause,
  );
  await j.memo.check(
    'spool:1',
    'r',
    [],
    async () => {
      throw Error('must reuse');
    },
    current,
  );
  const d = await j.delta(a);
  j.dispose();
  const p = await authenticatePreparationReceipts(context, d.payload, d.mac, a, current);
  const next = createPreparationJournal({ context, current, now: () => now });
  next.import(p);
  disposePreparationReceipts(p);
  await next.memo.check(
    'spool:1',
    'r',
    [],
    async () => {
      throw Error('must reuse after reopen');
    },
    current,
  );
  await next.memo.check('spool:2', 'r', [], async () => {}, current);
  expect(next.statistics).toMatchObject({ hits: 1, misses: 1 });
  next.dispose();
});
it('result families reject a bare generic pass bit, arbitrary slots and invalid witness state', async () => {
  const j = createPreparationJournal({ context, current });
  for (const [slot, value] of [
    ['ledger', true],
    ['spool:1', true],
    ['opened:1', true],
    ['witness:0', { events: -1, hash: context }],
    ['link:1', 'bad'],
    ['spool:9999999999999999999999', undefined],
  ] as const)
    await expect(j.memo.check(slot, 'r', [], async () => value, current)).rejects.toThrow();
  expect(j.statistics.entries).toBe(0);
  j.dispose();
});
it('a signing interruption cannot expose a delta or retain caller-owned result buffers', async () => {
  let live = true;
  const j = createPreparationJournal({
      context,
      current: () => {
        if (!live) throw Error('retired');
      },
    }),
    a = await auth();
  await j.memo.check('opened:1', 'r', [], async () => new Uint8Array([1, 2]), current);
  await expect(
    j.delta({
      sign: async (b) => {
        const m = await a.sign(b);
        live = false;
        return m;
      },
    }),
  ).rejects.toThrow('retired');
  j.dispose();
});

it('persisted families cannot be exchanged for a generic object or an unverified observation', async () => {
  const j = createPreparationJournal({ context, current });
  for (const [slot, value] of [
    ['delivery:1', { passed: true }],
    ['delivery:1', { kind: 'unknown' }],
    ['inbound:1', { kind: 'duplicate', position: 1, through: 1 }],
    [
      'history:1',
      { update: new Uint8Array([1]), installed: { sequence: 1, hash: context }, heads: null },
    ],
  ] as const)
    await expect(j.memo.check(slot, 'r', [], async () => value, current)).rejects.toThrow();
  expect(j.statistics.pending).toBe(0);
  j.dispose();
});
it('a clear during signing cannot return a delta from the retired revision', async () => {
  const a = await auth(),
    j = createPreparationJournal({ context, current });
  await j.memo.check('spool:1', 'r', [], async () => {}, current);
  await expect(
    j.delta({
      sign: async (b) => {
        const mac = await a.sign(b);
        j.memo.clear();
        return mac;
      },
    }),
  ).rejects.toThrow('changed');
  expect(j.statistics.pending).toBe(0);
  j.dispose();
});
