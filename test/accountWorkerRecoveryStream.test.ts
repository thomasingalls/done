// @vitest-environment node
import { expect, it } from 'vitest';
import {
  createAccountRecoveryStream,
  readAccountRecoveryStream,
  RECOVERY_PAGE_BYTES,
  type RecoveryPage,
} from '../src/crdt/accountWorkerRecoveryStream';
import { workerMessageBytes } from '../src/crdt/workerChannel';
import type { JournalRecovery } from '../src/crdt/custody';
const fixture = (): JournalRecovery => ({
  records: [
    { kind: 'state', gen: 3, seq: 8, bytes: new Uint8Array(400000).fill(7) },
    { kind: 'update', gen: 3, seq: 9, bytes: new Uint8Array([2, 3]) },
  ],
  journal: [{ key: 'scoped-journal-entry', generation: 3, bytes: new Uint8Array([9]) }],
});
it('streams exact original identities and a multi-page record within bounded messages', async () => {
  const source = fixture(),
    original = structuredClone(source),
    stream = createAccountRecoveryStream(source);
  let pages = 0;
  const got = await readAccountRecoveryStream(
    stream.counts,
    async () => {
      const page = stream.next();
      pages++;
      expect(workerMessageBytes(page)).toBeLessThanOrEqual(RECOVERY_PAGE_BYTES);
      return structuredClone(page);
    },
    () => {},
  );
  expect(got).toEqual(original);
  expect(pages).toBeGreaterThan(1);
  expect([...source.records[0]!.bytes].every((v) => v === 0)).toBe(true);
  stream.close();
  expect(source.journal[0]!.bytes[0]).toBe(0);
});
it('rejects missing fragments rather than inventing a complete recovery', async () => {
  const stream = createAccountRecoveryStream(fixture());
  await expect(
    readAccountRecoveryStream(
      stream.counts,
      async () => ({ ...stream.next(), done: true }),
      () => {},
    ),
  ).rejects.toThrow('changed');
  stream.close();
});
it('refuses changed metadata or offsets across fragments', async () => {
  for (const field of ['offset', 'header'] as const) {
    const stream = createAccountRecoveryStream(fixture());
    let n = 0;
    await expect(
      readAccountRecoveryStream(
        stream.counts,
        async () => {
          const page = structuredClone(stream.next());
          if (++n === 2) {
            const part = page.parts[0]!;
            if (field === 'offset') (part as { offset: number }).offset++;
            else
              (part as { header: unknown }).header = {
                kind: 'content',
                recordKind: 'state',
                gen: 3,
                seq: 999,
              };
          }
          return page;
        },
        () => {},
      ),
    ).rejects.toThrow('changed');
    stream.close();
  }
});
it('cancellation after receipt erases the received binary page too', async () => {
  const stream = createAccountRecoveryStream(fixture());
  let page: RecoveryPage | undefined,
    called = false;
  await expect(
    readAccountRecoveryStream(
      stream.counts,
      async () => {
        page = structuredClone(stream.next());
        called = true;
        return page;
      },
      () => {
        if (called) throw Error('closed');
      },
    ),
  ).rejects.toThrow('closed');
  expect(page!.parts.every((p) => p.bytes.every((v) => v === 0))).toBe(true);
  stream.close();
});
it('zero-entry recovery completes without fabricating a state or journal record', async () => {
  const stream = createAccountRecoveryStream({ records: [], journal: [] });
  await expect(
    readAccountRecoveryStream(
      stream.counts,
      async () => stream.next(),
      () => {},
    ),
  ).resolves.toEqual({ records: [], journal: [] });
});
it('closing a partially consumed producer erases remaining plaintext and rejects later pages', () => {
  const source = fixture(),
    stream = createAccountRecoveryStream(source);
  stream.next();
  stream.close();
  expect(source.records.every((r) => r.bytes.every((v) => v === 0))).toBe(true);
  expect(source.journal.every((r) => r.bytes.every((v) => v === 0))).toBe(true);
  expect(() => stream.next()).toThrow('changed');
});
it('rejects unsafe declarations before allocating a received record', async () => {
  const stream = createAccountRecoveryStream(fixture()),
    page = stream.next();
  (page.parts[0] as { total: number }).total = Number.MAX_SAFE_INTEGER + 1;
  await expect(
    readAccountRecoveryStream(
      stream.counts,
      async () => page,
      () => {},
    ),
  ).rejects.toThrow('changed');
  stream.close();
});
it('duplicate or extra records cannot advance the declared recovery cursor', async () => {
  const source: JournalRecovery = {
    records: [{ kind: 'update', gen: 1, seq: 1, bytes: new Uint8Array([1]) }],
    journal: [],
  };
  const stream = createAccountRecoveryStream(source),
    page = stream.next();
  await expect(
    readAccountRecoveryStream(
      { records: 0, journal: 0 },
      async () => page,
      () => {},
    ),
  ).rejects.toThrow('changed');
});

it('reads an authenticated historical state larger than a current append batch without changing its bytes', async () => {
  const source: JournalRecovery = {
      records: [{ kind: 'state', gen: 1, seq: 1, bytes: new Uint8Array(5 * 1024 * 1024).fill(4) }],
      journal: [],
    },
    stream = createAccountRecoveryStream(source);
  const received = await readAccountRecoveryStream(
    stream.counts,
    async () => structuredClone(stream.next()),
    () => {},
  );
  expect(received.records[0]!.bytes.length).toBe(5 * 1024 * 1024);
  expect(received.records[0]!.bytes.every((v) => v === 4)).toBe(true);
  received.records[0]!.bytes.fill(0);
  stream.close();
});
