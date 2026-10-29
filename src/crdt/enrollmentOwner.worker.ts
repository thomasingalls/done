/** Original device connection coordinator in a dedicated Worker; provider UI and canonical admission stay Window. */
import { startWorkerEnrollment } from './workerEnrollment';
import { eraseWorkerMessage } from './workerChannel';
let started = false,
  accept: ((input: unknown) => boolean) | undefined;
self.addEventListener('message', (event) => {
  if (started) {
    if (!accept?.(event.data)) eraseWorkerMessage(event.data);
    return;
  }
  const m = event.data;
  if (
    m?.v !== 1 ||
    m.kind !== 'enrollmentBootstrap' ||
    !(m.port instanceof MessagePort) ||
    !(m.controlPort instanceof MessagePort)
  )
    return;
  started = true;
  void startWorkerEnrollment(m).then(
    (value) => {
      accept = value.accept;
    },
    () => {
      self.postMessage({ v: 1, kind: 'setupClosed', owner: m.ticket?.incarnation, ok: false });
      globalThis.close();
    },
  );
});
