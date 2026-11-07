/** Own one asynchronous native recovery load and its bounded plaintext stream until explicit finish. */
import { createAccountRecoveryStream } from './accountWorkerRecoveryStream';
import { copyAccountMirrorRecovery } from './accountMirrorRecovery';
import type { JournalRecovery } from './custody';

export function createWorkerRecoveryOwner(load: () => Promise<JournalRecovery>, live: () => void) {
  let loading = false,
    closed = false,
    sequence = 0,
    stream: ReturnType<typeof createAccountRecoveryStream> | undefined;
  const check = () => {
    live();
    if (closed) throw Error('Worker recovery closed');
  };
  const id = (input: unknown) => {
    if (
      !input ||
      typeof input !== 'object' ||
      Object.keys(input).join() !== 'id' ||
      !Number.isSafeInteger((input as { id: number }).id) ||
      (input as { id: number }).id !== sequence
    )
      throw Error('Worker recovery changed');
  };
  return Object.freeze({
    async begin() {
      check();
      if (loading || stream || sequence === Number.MAX_SAFE_INTEGER)
        throw Error('Worker recovery busy');
      loading = true;
      let recovery: JournalRecovery | undefined;
      try {
        recovery = await load();
        check();
        stream = createAccountRecoveryStream(copyAccountMirrorRecovery(recovery));
        return { id: ++sequence, ...stream.counts };
      } finally {
        loading = false;
        if (recovery) for (const r of [...recovery.records, ...recovery.journal]) r.bytes.fill(0);
      }
    },
    page(input: unknown) {
      check();
      id(input);
      if (!stream) throw Error('Worker recovery unavailable');
      return stream.next();
    },
    finish(input: unknown) {
      check();
      id(input);
      stream?.close();
      stream = undefined;
    },
    close() {
      closed = true;
      stream?.close();
      stream = undefined;
    },
  });
}
