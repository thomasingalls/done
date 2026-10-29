/** A same-realm transition only after actual ceremony cleanup. No opening capability is serialized. */
import {
  requireCeremonyWorkerLifetime,
  requireClosedCeremonyWorkerLifetime,
  type openCeremonyWorkerLifetime,
} from './ceremonyWorkerLifetime';
import { retireCeremonyEnvironment } from './ceremonyEnvironment';
import { retireProtectionEnvironment } from './protectionEnvironment';
import { startAccountWorkerOwner, type AccountOwnerBootstrap } from './accountWorkerOwner';
import type { WorkerChannel } from './workerChannel';
export function createWorkerAccountHandoff(
  root: Awaited<ReturnType<typeof openCeremonyWorkerLifetime>>,
  channel: WorkerChannel,
) {
  requireCeremonyWorkerLifetime(root);
  root.assertCurrent();
  let requested = false,
    ready = false,
    accepted = false,
    nonce: string | undefined,
    timer: ReturnType<typeof setTimeout> | undefined;
  const fail = () => {
    clearTimeout(timer);
    ready = false;
    channel.close();
    globalThis.close();
  };
  return Object.freeze({
    async prepare(input: unknown) {
      root.assertCurrent();
      if (requested || channel.closed || typeof input !== 'string' || !/^[a-f0-9]{32}$/.test(input))
        throw Error('Worker account handoff refused');
      requested = true;
      nonce = input;
      try {
        await root.close();
        requireClosedCeremonyWorkerLifetime(root);
        retireProtectionEnvironment(root);
        retireCeremonyEnvironment(root);
        if (channel.closed) throw Error('Handoff channel closed');
        ready = true;
        timer = setTimeout(fail, 5000);
        return { nonce };
      } catch (cause) {
        fail();
        throw cause;
      }
    },
    accept(input: unknown) {
      const m = input as AccountOwnerBootstrap & { v: number; kind: string; handoffId: string };
      if (
        !ready ||
        accepted ||
        m?.v !== 1 ||
        m.kind !== 'accountBootstrap' ||
        m.handoffId !== nonce
      )
        return false;
      try {
        requireClosedCeremonyWorkerLifetime(root);
        if (
          m.ticket?.slotId !== root.ticket.slotId ||
          m.ticket.incarnation === root.ticket.incarnation ||
          !(m.port instanceof MessagePort)
        )
          throw Error('Account handoff changed');
        accepted = true;
        ready = false;
        clearTimeout(timer);
        channel.close();
        startAccountWorkerOwner(m);
        return true;
      } catch {
        fail();
        return true;
      }
    },
  });
}
