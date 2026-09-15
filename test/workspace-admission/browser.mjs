import '../journal/browser.mjs';
import '@styles';
import { createAdmittedWorkspace } from '@workspace';
import { openAdmissionSession } from '@admission';
import { createAdmittedEditor } from '@editor';
import { connectWorkspaceChannel } from '@channel';
import { createDoc, applyUpdate, Y } from '@yjs';
const scope = {
  slotId: 'content-slot',
  principalId: 'content-principal',
  workspaceId: 'content-workspace',
};
let workspace,
  channel,
  commits = 0,
  date = '2026-09-08';
const editors = {},
  entries = {},
  outgoing = [],
  errors = [],
  publications = [];
const txs = new WeakSet(),
  nativeTx = IDBDatabase.prototype.transaction,
  nativeAdd = IDBObjectStore.prototype.add;
IDBDatabase.prototype.transaction = function (...args) {
  const tx = nativeTx.apply(this, args);
  tx.addEventListener('complete', () => {
    if (txs.has(tx)) commits++;
  });
  return tx;
};
IDBObjectStore.prototype.add = function (value, ...args) {
  const result = nativeAdd.call(this, value, ...args);
  if (this.name === 'content') txs.add(this.transaction);
  return result;
};
const track = (id, fn) => {
  entries[id] = { status: 'pending' };
  try {
    Promise.resolve(fn()).then(
      (value) => {
        entries[id] = { status: 'resolved', value };
      },
      (error) => {
        entries[id] = { status: 'rejected', error: { code: error.code, message: error.message } };
      },
    );
  } catch (error) {
    entries[id] = { status: 'rejected', error: { code: error.code, message: error.message } };
  }
};
const mount = (surface, target) => {
  editors[surface]?.destroy();
  window.document.querySelector('#' + surface).replaceChildren();
  editors[surface] = createAdmittedEditor({
    parent: window.document.querySelector('#' + surface),
    document: workspace.text(target),
  });
};
window.integration = {
  open: (code, actor = 'human-one', connect = false) =>
    track('open', async () => {
      workspace = await createAdmittedWorkspace(
        (options) =>
          openAdmissionSession(
            { ...scope, resolvePrincipal: () => scope.principalId },
            code,
            options,
          ),
        {
          identity: {
            id: actor,
            actor: { kind: 'human', name: actor, color: '#3f8fd6' },
            device: { id: actor + '-device', name: 'fixture' },
          },
          validateReceive: () => {},
          today: () => date,
        },
        'local-handoff',
      );
      workspace.outgoing((b) => outgoing.push(Array.from(b)));
      workspace.subscribe(() => {
        try {
          publications.push({ state: workspace.read(), commits });
        } catch {}
      });
      mount('goals', { kind: 'master' });
      if (connect)
        channel = connectWorkspaceChannel(workspace, scope, (e) => errors.push(e.message));
      editors.goals.view.focus();
    }),
  mount: (id) => mount('card', { kind: 'card', id }),
  snapshot: () => {
    let accepted, exported;
    try {
      accepted = workspace?.read();
      exported = workspace?.exportEntries();
    } catch (e) {
      accepted = { error: e.message };
    }
    return {
      entries,
      accepted,
      exported,
      status: workspace?.status,
      outgoing,
      errors,
      publications,
      commits,
      views: Object.fromEntries(
        Object.entries(editors).map(([key, e]) => [
          key,
          {
            text: e.view.state.doc.toString(),
            dom: e.view.contentDOM.textContent,
            editable: e.view.contentDOM.contentEditable,
          },
        ]),
      ),
    };
  },
  command: (id, command) => track(id, () => workspace.command(command).accepted),
  input: (id, target, text, at) =>
    track(
      id,
      () =>
        workspace
          .text(target)
          .input(
            { name: 'insert', text },
            at === undefined ? undefined : { ranges: [{ anchor: at, head: at }], main: 0 },
          ).accepted,
    ),
  receive: (id, bytes) => track(id, () => workspace.receive(new Uint8Array(bytes)).accepted),
  wire: () => Array.from(workspace.snapshot()),
  retry: () => workspace.retry(),
  discard: () => workspace.discardPending(),
  durable: (id) => track(id, () => workspace.whenDurable()),
  close: () =>
    track('close', () => {
      channel?.close();
      return workspace.close();
    }),
  setDate: (value) => {
    date = value;
  },
  select: (surface, from, to = from) =>
    editors[surface].view.dispatch({ selection: { anchor: from, head: to } }),
  corruptMembership: (id) => {
    const doc = createDoc();
    applyUpdate(doc, workspace.snapshot());
    let update;
    doc.on('update', (b) => {
      update = Array.from(b);
    });
    doc.transact(() => {
      const day = doc.getMap('days').get(date);
      day.get('next').push([id]);
    });
    doc.destroy();
    return update;
  },
  remoteText: (value) => {
    const doc = createDoc();
    applyUpdate(doc, workspace.snapshot());
    let update;
    doc.on('update', (b) => {
      update = Array.from(b);
    });
    doc.getText('master').insert(doc.getText('master').length, value);
    doc.destroy();
    return update;
  },
  futureSchema: () => {
    const doc = createDoc();
    doc.getMap('meta').set('schemaVersion', 999);
    const bytes = Array.from(Y.encodeStateAsUpdate(doc));
    doc.destroy();
    return bytes;
  },
};
