// @ts-expect-error The uniquely anchored test Vite transform exports this seam only in this fixture.
import { openFormatTaskTestSession } from '../../src/crdt/writeSession';
import {
  openWriteSession,
  requireAccountFormatSessionTask,
  type SessionTask,
  type WriteSession,
} from '../../src/crdt/writeSession';
import { installAccountWorkerRuntime } from '../../src/crdt/accountWorkerRuntime';
import { createWorkerChannel } from '../../src/crdt/workerChannel';
let session: WriteSession, runtime: ReturnType<typeof installAccountWorkerRuntime>;
let heldTask: SessionTask | undefined,
  release: (() => void) | undefined,
  held: Promise<unknown> | undefined;
const result = (task: SessionTask, slot: string) => {
  try {
    requireAccountFormatSessionTask(task, slot);
    return 'allowed';
  } catch (e) {
    return (e as { code: string }).code;
  }
};
let slot: string;
self.addEventListener('message', async (event) => {
  const m = event.data;
  try {
    if (m.kind === 'start') {
      slot = m.ticket.slotId;
      const channel = createWorkerChannel(m.port, m.ticket.incarnation, {}, () => runtime?.close());
      runtime = installAccountWorkerRuntime(m.ticket, channel, {
        visibility: 'visible',
        online: true,
      });
      session = await openFormatTaskTestSession(slot);
      self.postMessage({ kind: 'active' });
      return;
    }
    let value: unknown;
    if (m.kind === 'checks')
      value = await session.run((task) => ({
        original: result(task, slot),
        copy: result({ ...task }, slot),
      }));
    else if (m.kind === 'shared') {
      const other = await openWriteSession(slot);
      try {
        value = await other.run((task) => result(task, slot));
      } finally {
        await other.close();
      }
    } else if (m.kind === 'hold') {
      let entered!: () => void;
      const ready = new Promise<void>((resolve) => {
        entered = resolve;
      });
      held = session.run(async (task) => {
        heldTask = task;
        entered();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      });
      void held.catch(() => {});
      await ready;
      value = true;
    } else if (m.kind === 'check-held') value = result(heldTask!, slot);
    else if (m.kind === 'release') {
      release?.();
      await held?.catch(() => {});
      value = true;
    } else if (m.kind === 'stop') {
      runtime.close();
      void session.close().then(() => self.postMessage({ kind: 'closed' }));
      return;
    } else throw Error('Unknown native fixture command');
    self.postMessage({ kind: 'reply', id: m.id, value });
  } catch (e) {
    self.postMessage({ kind: 'error', id: m.id, message: String(e) });
  }
});
