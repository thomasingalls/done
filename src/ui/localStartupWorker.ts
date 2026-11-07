/** Window UI adapter. Every native startup/storage owner is a real dedicated Worker. */
import { openLocalStartupWorker } from '../crdt/localStartupClient';
import { openLocalWorkerSession } from '../crdt/localWorkerClient';
import { createWindowLocalMirror } from '../crdt/windowLocalMirror';
import type { LocalStartupRuntime, LocalStartupRuntimeFactory } from './localStartupPort';
export const createWorkerLocalStartupRuntime: LocalStartupRuntimeFactory = (slotId, options) => {
  let startup: ReturnType<typeof openLocalStartupWorker> | undefined,
    closed = false,
    closing: Promise<void> | undefined;
  const live = () => {
    options.signal.throwIfAborted();
    if (closed) throw Error('Local startup adapter closed');
  };
  const get = async () => {
    live();
    const session = await (startup ??= openLocalStartupWorker(slotId, options.signal));
    live();
    return session;
  };
  const release = async () => {
    const owned = startup;
    startup = undefined;
    await (await owned)?.close();
  };
  return Object.freeze<LocalStartupRuntime>({
    inspect: async () => (await get()).inspect(),
    begin: async (automatic = false) => (await get()).beginGenesis(automatic),
    list: async (code) => (await get()).list(code),
    automaticCode: async () => (await get()).automaticCode(),
    resume: async (code) => (await get()).resumeGenesis(code),
    protect: async (code) => (await get()).protect(code),
    async open(code, identity) {
      live();
      await release();
      live();
      const session = await openLocalWorkerSession({
        slotId,
        code,
        identity,
        signal: options.signal,
      });
      try {
        live();
        const workspace = await createWindowLocalMirror(
          session.cohort,
          session.opening,
          session.worker,
          { identity },
        );
        await session.ready();
        live();
        return { kind: 'ready' as const, workspace };
      } catch (cause) {
        await session.cohort.close();
        throw cause;
      }
    },
    close() {
      if (closing) return closing;
      closed = true;
      return (closing = release());
    },
  });
};
