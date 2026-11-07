/** Fixed dedicated Worker bootstrap. Handoff composition remains inside this same Worker realm. */
import { startAccountWorkerOwner, type AccountOwnerBootstrap } from './accountWorkerOwner';
import { eraseWorkerMessage } from './workerChannel';
let initialized = false;
self.addEventListener('message', (event: MessageEvent) => {
  if (initialized) {
    eraseWorkerMessage(event.data);
    return;
  }
  const m = event.data as AccountOwnerBootstrap & { v: number; kind: string };
  if (m?.v !== 1 || m.kind !== 'accountBootstrap' || !(m.port instanceof MessagePort)) return;
  initialized = true;
  startAccountWorkerOwner(m);
});
