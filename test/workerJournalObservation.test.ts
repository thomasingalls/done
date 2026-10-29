// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { createWorkerJournalReader } from '../src/crdt/workerJournalRead';
import type { WorkerChannel } from '../src/crdt/workerChannel';
import type { RawJournalPage } from '../src/crdt/workerJournalProtocol';
function fixture(pages: RawJournalPage[]) {
  const events: string[] = [];
  let index = 0,
    closed = false;
  const request = vi.fn(async (method: string) => {
    events.push(method);
    if (method === 'journalBegin' || method === 'journalObservationBegin') return 7;
    if (method === 'journalPage') return pages[index++];
    return undefined;
  });
  const port = {
    get closed() {
      return closed;
    },
    request,
  } as unknown as Pick<WorkerChannel, 'closed' | 'request'>;
  const observed = vi.fn(() => events.push('observed'));
  const reader = createWorkerJournalReader(
    port,
    () => {
      if (closed) throw Error('retired');
    },
    observed,
  );
  return {
    events,
    reader,
    observed,
    request,
    close() {
      closed = true;
    },
  };
}
it('ordinary reads retain observation-before-finish ordering from the native runtime', async () => {
  const f = fixture([{ entries: [['prefix.key', 'ciphertext']], characters: 100, done: true }]);
  expect(await f.reader.read('prefix.')).toEqual({
    entries: [['prefix.key', 'ciphertext']],
    characters: 100,
  });
  expect(f.events).toEqual(['journalBegin', 'journalPage', 'observed', 'journalFinish']);
});
it('retained read invokes no pinned-view callback and owns finish through async consumer settlement', async () => {
  const f = fixture([{ entries: [['prefix.key', 'ciphertext']], characters: 100, done: true }]);
  const result = await f.reader.observe('prefix.', async (snapshot, id) => {
    expect(id).toBe(7);
    expect(snapshot.entries).toEqual([['prefix.key', 'ciphertext']]);
    expect(f.events).toEqual(['journalObservationBegin', 'journalPage']);
    await Promise.resolve();
    return 9;
  });
  expect(result).toBe(9);
  expect(f.observed).not.toHaveBeenCalled();
  expect(f.events.at(-1)).toBe('journalFinish');
});
it('malformed and cross-prefix pages refuse before consumer and finish their own observation', async () => {
  for (const page of [
    { entries: [['other.key', 'ciphertext']], characters: 1, done: true },
    { entries: [], characters: -1, done: true },
    { entries: [], characters: 1, done: 'yes' },
  ]) {
    const f = fixture([page as unknown as RawJournalPage]),
      consumer = vi.fn();
    await expect(f.reader.observe('prefix.', consumer)).rejects.toThrow('could not finish');
    expect(consumer).not.toHaveBeenCalled();
    expect(f.observed).not.toHaveBeenCalled();
    expect(f.events.at(-1)).toBe('journalFinish');
  }
});
it('consumer refusal expires its observation; retired Root cannot publish a successful result', async () => {
  const page: RawJournalPage = { entries: [], characters: 0, done: true },
    f = fixture([page]);
  await expect(
    f.reader.observe('prefix.', async () => {
      throw Error('coverage refused');
    }),
  ).rejects.toThrow('coverage refused');
  expect(f.events.at(-1)).toBe('journalFinish');
  const retired = fixture([page]);
  await expect(
    retired.reader.observe('prefix.', async () => {
      retired.close();
      return 3;
    }),
  ).rejects.toThrow('retired');
  expect(retired.observed).not.toHaveBeenCalled();
});
it('existing recovery entry and character limits apply equally to retained observations', async () => {
  for (const entries of [
    Array.from({ length: 65537 }, () => ['prefix.key', 'x'] as [string, string]),
    [['prefix.key', 'x'.repeat(16 * 1024 * 1024)]] as [string, string][],
  ]) {
    const f = fixture([{ entries, characters: 1, done: true }]),
      consumer = vi.fn();
    await expect(f.reader.observe('prefix.', consumer)).rejects.toThrow('could not finish');
    expect(consumer).not.toHaveBeenCalled();
    expect(f.events.at(-1)).toBe('journalFinish');
  }
});
