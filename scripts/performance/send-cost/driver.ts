/** Send-cost measurement entry (phase 554). Never imported by either ordinary application entry.
 * It opens the real composed Worker owner with sync on, exactly as the continuation driver does,
 * and types into the master text so each insert becomes one sent position. */
import { openAccountWorkerSession } from '../../../src/crdt/accountWorkerClient';
import { assertSlotPasskey } from '../../../src/account/assertSlotPasskey';
import type { AdmittedWorkspace } from '../../../src/crdt/admittedWorkspace';
import type { AccountWorkspaceOptions } from '../../../src/crdt/accountWorkspace';

let owner: Awaited<ReturnType<typeof openAccountWorkerSession>> | undefined;
let workspace: AdmittedWorkspace | undefined;
const stop = new AbortController();
async function savedOptions(code: string) {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('done.slots');
    request.onupgradeneeded = () => {
      request.transaction!.abort();
      reject(Error('Expected saved slots'));
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const saved = await new Promise<Record<string, any>[]>((resolve, reject) => {
      const transaction = database.transaction('slots', 'readonly');
      const request = transaction.objectStore('slots').getAll();
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error);
    });
    const active = saved.filter((s) => s['status'] === 'active' && s['account']);
    if (active.length !== 1) throw Error('Expected one active native Account');
    const slot = active[0]!;
    return {
      slotId: slot['id'] as string,
      code,
      membershipContinuation: true,
      pin: JSON.parse(localStorage.getItem('done.account-service.pin.v1')!),
      identity: {
        id: slot['unlockBinding'].binding.principalId as string,
        actor: { kind: 'human' as const, name: 'You', color: '#e0662f' },
        device: { id: slot['id'] as string, name: 'Send cost' },
      },
      signal: stop.signal,
      assertPasskey: assertSlotPasskey(stop.signal),
    } satisfies AccountWorkspaceOptions;
  } finally {
    database.close();
  }
}
const api = {
  async open(code: string, joined: boolean) {
    if (owner) throw Error('Measurement owner already open');
    owner = await openAccountWorkerSession(await savedOptions(code), joined, {
      networkSessions: true,
      composed: true,
    });
    workspace = owner.composedWorkspace;
    if (!workspace || !owner.session?.sync) throw Error('Expected composed Worker and sync ports');
    await owner.ready();
    return { deviceId: owner.deviceId };
  },
  /** Appends at the end of the master text: one Yjs update, so one source per position. */
  insert(text: string) {
    if (!workspace) throw Error('Owner absent');
    window.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: text }));
    const surface = workspace.text({ kind: 'master' }),
      at = surface.read().text.length;
    surface.input({ name: 'insert', text }, { ranges: [{ anchor: at, head: at }], main: 0 });
    return at + text.length;
  },
  status() {
    if (!owner) throw Error('Owner absent');
    return owner.session!.sync!.status;
  },
  admission() {
    if (!workspace) throw Error('Owner absent');
    return workspace.status;
  },
  localHistory() {
    if (!owner) throw Error('Owner absent');
    return owner.session?.devices.localHistory?.status ?? null;
  },
  async reduce(expectedRevision: number) {
    if (!owner) throw Error('Owner absent');
    await workspace!.whenDurable();
    return owner.compositionRemoveLocalHistory(expectedRevision);
  },
  async durable() {
    if (!workspace) throw Error('Owner absent');
    await workspace.whenDurable();
  },
  async close() {
    if (!owner) throw Error('Owner absent');
    await owner.close();
    workspace = undefined;
    owner = undefined;
  },
};
Object.assign(globalThis, { sendCost: api });
export type SendCostDriver = typeof api;
declare global {
  var sendCost: SendCostDriver;
}
