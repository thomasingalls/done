/** Bounded ciphertext data reads only. An observation ID is not a verification or native permit. */
import type { WorkerChannel } from './workerChannel';
import { WorkerChannelError } from './workerChannel';
import type { RawJournalSnapshot, RawJournalPage } from './workerJournalProtocol';

type Port = Pick<WorkerChannel, 'closed' | 'request'>;
const refused = () => new WorkerChannelError('worker-lifetime');
async function pages(
  channel: Port,
  live: () => void,
  prefix: string,
  id: number,
  observed?: (snapshot: RawJournalSnapshot) => void,
): Promise<RawJournalSnapshot> {
  const entries: [string, string][] = [];
  let characters = 0,
    retainedCharacters = 0;
  for (;;) {
    live();
    const page = await channel.request<RawJournalPage>('journalPage', { id });
    live();
    if (
      !Array.isArray(page.entries) ||
      typeof page.done !== 'boolean' ||
      !Number.isSafeInteger(page.characters) ||
      page.characters < 0
    )
      throw refused();
    for (const pair of page.entries) {
      if (
        !Array.isArray(pair) ||
        pair.length !== 2 ||
        typeof pair[0] !== 'string' ||
        !pair[0].startsWith(prefix) ||
        typeof pair[1] !== 'string'
      )
        throw refused();
      entries.push([pair[0], pair[1]]);
      retainedCharacters += pair[0].length + pair[1].length;
    }
    if (entries.length > 65536 || retainedCharacters > 16 * 1024 * 1024) throw refused();
    characters = page.characters;
    if (page.done) break;
  }
  const value = { entries, characters };
  observed?.(value);
  return value;
}
const finish = async (channel: Port, id: number) => {
  if (!channel.closed) await channel.request('journalFinish', { id }).catch(() => {});
};
export function createWorkerJournalReader(
  channel: Port,
  live: () => void,
  observed?: (prefix: string, snapshot: RawJournalSnapshot) => void,
) {
  return Object.freeze({
    async read(prefix: string) {
      live();
      const id = await channel.request<number>('journalBegin', { prefix });
      try {
        return await pages(channel, live, prefix, id, (value) => observed?.(prefix, value));
      } finally {
        await finish(channel, id);
      }
    },
    async observe<T>(
      prefix: string,
      operation: (snapshot: RawJournalSnapshot, id: number) => Promise<T>,
    ): Promise<T> {
      live();
      const id = await channel.request<number>('journalObservationBegin', { prefix });
      try {
        const snapshot = await pages(channel, live, prefix, id);
        live();
        const result = await operation(snapshot, id);
        live();
        return result;
      } finally {
        await finish(channel, id);
      }
    },
  });
}
