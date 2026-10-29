import {
  createAccountWorkerJoin,
  type AccountWorkerTicket,
} from '../../src/crdt/accountWorkerCohort';
const channel = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(value: unknown): void;
};
let finish!: () => void;
channel.onmessage = (e) => {
  if (e.data.kind === 'release') {
    finish?.();
    return;
  }
  if (e.data.kind !== 'join') return;
  void (async () => {
    try {
      const join = createAccountWorkerJoin(e.data.ticket as AccountWorkerTicket);
      await join.request(
        'done/slot-writer/' + JSON.stringify(e.data.ticket.slotId),
        { mode: 'shared' },
        async () => {
          channel.postMessage({ kind: 'active' });
          await new Promise<void>((resolve) => {
            finish = resolve;
          });
        },
      );
      channel.postMessage({ kind: 'closed' });
    } catch (error) {
      channel.postMessage({ kind: 'refused', name: (error as Error).name });
    }
  })();
};
