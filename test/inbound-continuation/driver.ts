/** Native functional test entry. Never imported by either ordinary application entry. */
import { openAccountWorkerSession } from '../../src/crdt/accountWorkerClient';
import { assertSlotPasskey } from '../../src/account/assertSlotPasskey';
import type { AdmittedWorkspace } from '../../src/crdt/admittedWorkspace';
import type { AccountWorkspaceOptions } from '../../src/crdt/accountWorkspace';

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
        device: { id: slot['id'] as string, name: 'Native functional' },
      },
      signal: stop.signal,
      assertPasskey: assertSlotPasskey(stop.signal),
    } satisfies AccountWorkspaceOptions;
  } finally {
    database.close();
  }
}
function readMaster() {
  if (!workspace) throw Error('Owner absent');
  return workspace.text({ kind: 'master' }).read().text;
}
const api = {
  async open(code: string, joined: boolean) {
    if (owner) throw Error('Test owner already open');
    owner = await openAccountWorkerSession(await savedOptions(code), joined, {
      networkSessions: true,
      composed: true,
    });
    workspace = owner.composedWorkspace;
    if (!workspace || !owner.session?.sync)
      throw Error('Expected actual composed Worker and sync ports');
    await owner.ready();
    return { master: readMaster(), deviceId: owner.deviceId };
  },
  read: readMaster,
  insert(role: string, text: string) {
    if (!workspace) throw Error('Owner absent');
    // Exercise the ordinary Window activity forwarder as well as canonical admission.
    window.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: text }));
    const surface = workspace.text({ kind: 'master' }),
      before = surface.read().text;
    const line = before.indexOf(role + ':');
    if (line < 0) throw Error('Expected own marked line');
    const end = before.indexOf('\n', line),
      at = end < 0 ? before.length : end;
    surface.input({ name: 'insert', text }, { ranges: [{ anchor: at, head: at }], main: 0 });
    return readMaster();
  },
  replace(text: string) {
    if (!workspace) throw Error('Owner absent');
    // Exercise the ordinary Window activity forwarder as well as canonical admission.
    window.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: text }));
    const surface = workspace.text({ kind: 'master' }),
      before = surface.read().text;
    surface.input(
      { name: 'insert', text },
      { ranges: [{ anchor: 0, head: before.length }], main: 0 },
    );
    return readMaster();
  },
  undo() {
    if (!workspace) throw Error('Owner absent');
    window.dispatchEvent(new PointerEvent('pointerdown'));
    workspace.command({ kind: 'undo' });
    return readMaster();
  },
  async flush() {
    if (!workspace || !owner) throw Error('Owner absent');
    await workspace.whenDurable();
    owner.session!.sync!.retry('send');
  },
  entries() {
    if (!workspace) throw Error('Owner absent');
    return workspace.exportEntries();
  },
  inbound() {
    if (!owner) throw Error('Owner absent');
    return owner.status();
  },
  status() {
    if (!owner) throw Error('Owner absent');
    return owner.session!.sync!.status;
  },
  async close() {
    if (!owner) throw Error('Owner absent');
    await owner.close();
    workspace = undefined;
    owner = undefined;
  },
};
Object.assign(globalThis, { nativeContinuation: api });

export type NativeContinuation = typeof api;
declare global {
  var nativeContinuation: NativeContinuation;
}
