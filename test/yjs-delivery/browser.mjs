import '../journal/browser.mjs';
import '@styles';
import { Y } from '@yjs';
import { createAdmittedWorkspace } from '@workspace';
import { openAdmissionSession } from '@admission';
import { openJournalSession } from '@custody';
import { createAdmittedEditor } from '@editor';
import { connectWorkspaceChannel } from '@channel';
const scope = {
    slotId: 'content-slot',
    principalId: 'content-principal',
    workspaceId: 'content-workspace',
  },
  authority = { ...scope, resolvePrincipal: () => scope.principalId };
let workspace, session, editor, channel;
let hellos = 0;
const NativeChannel = globalThis.BroadcastChannel;
globalThis.BroadcastChannel = class extends NativeChannel {
  constructor(...args) {
    super(...args);
    this.addEventListener('message', (event) => {
      if (event.data?.kind === 'hello') queueMicrotask(() => hellos++);
    });
  }
};
const mismatches = [];
const entries = {},
  received = [],
  errors = [],
  outgoing = [];
const plain = (doc) => ({
  text: ['master', 'lane1', 'lane2'].map((n) => doc.getText(n).toString()),
  pendingStructs: Boolean(doc.store.pendingStructs),
  pendingDs: Boolean(doc.store.pendingDs),
});
const track = (id, fn) => {
  entries[id] = { status: 'pending' };
  Promise.resolve()
    .then(fn)
    .then(
      (value) => {
        entries[id] = { status: 'resolved', value };
      },
      (error) => {
        entries[id] = { status: 'rejected', error: { code: error.code, message: error.message } };
      },
    );
};
window.delivery = {
  open: (code, actor = 'human') =>
    track('open', async () => {
      workspace = await createAdmittedWorkspace(
        async (options) => {
          session = await openAdmissionSession(authority, code, options);
          return {
            ...session,
            get status() {
              return session.status;
            },
            matches(doc) {
              const match = session.matches(doc);
              if (!match) {
                const canonical = session.fork();
                try {
                  mismatches.push(
                    [canonical, doc].map((d) => ({
                      view: plain(d),
                      pending: d.store.pendingStructs
                        ? {
                            missing: [...d.store.pendingStructs.missing],
                            update: [...d.store.pendingStructs.update],
                          }
                        : null,
                      ds: d.store.pendingDs ? [...d.store.pendingDs] : null,
                      wire: [...Y.encodeStateAsUpdate(d)],
                    })),
                  );
                } finally {
                  canonical.destroy();
                }
              }
              return match;
            },
          };
        },
        {
          identity: {
            id: actor,
            actor: { kind: 'human', name: actor, color: '#3f8fd6' },
            device: { id: actor + '-device', name: 'fixture' },
          },
          validateReceive: () => {},
          today: () => '2026-09-09',
        },
      );
      workspace.outgoing((bytes) => outgoing.push([...bytes]));
      editor = createAdmittedEditor({
        parent: document.querySelector('#goals'),
        document: workspace.text({ kind: 'master' }),
      });
    }),
  connect: () => {
    channel = connectWorkspaceChannel(
      {
        ...workspace,
        get status() {
          return workspace.status;
        },
        receive(bytes) {
          const wire = [...bytes],
            ticket = workspace.receive(bytes);
          ticket.accepted.then(
            () => received.push(wire),
            () => {},
          );
          return ticket;
        },
      },
      scope,
      (error) => errors.push({ code: error.code, message: error.message }),
    );
  },
  snapshot: () => {
    let doc, read, exported, canonical;
    try {
      doc = session?.fork();
      canonical = doc ? plain(doc) : null;
    } catch (error) {
      canonical = { error: error.code };
    } finally {
      doc?.destroy();
    }
    try {
      read = workspace?.read();
      exported = workspace?.exportEntries();
    } catch (error) {
      read = { error: error.code };
    }
    return {
      hellos,
      mismatches,
      entries,
      received: received.length,
      errors,
      outgoing,
      read,
      exported,
      status: workspace?.status,
      canonical,
      editor: editor?.view.state.doc.toString(),
    };
  },
  received: () => received,
  wire: () => [...workspace.snapshot()],
  receive: (id, bytes) => track(id, () => workspace.receive(Uint8Array.from(bytes)).accepted),
  input: (id, text) =>
    track(
      id,
      () =>
        workspace
          .text({ kind: 'master' })
          .input({ name: 'insert', text }, { ranges: [{ anchor: 0, head: 0 }], main: 0 }).accepted,
    ),
  command: (id, command) => track(id, () => workspace.command(command).accepted),
  durable: (id) => track(id, () => workspace.whenDurable()),
  retry: () => workspace.retry(),
  close: () =>
    track('close', async () => {
      channel?.close();
      await workspace?.close();
      editor?.destroy();
    }),
  recover: (code) =>
    track('recover', async () => {
      const owner = await openJournalSession(authority, code),
        doc = new Y.Doc();
      try {
        const recovery = await owner.loadRecovery();
        try {
          for (const r of [...recovery.records, ...recovery.journal]) Y.applyUpdate(doc, r.bytes);
          return {
            ...plain(doc),
            records: recovery.records.map((r) => [...r.bytes]),
            journal: recovery.journal.map((r) => [...r.bytes]),
          };
        } finally {
          for (const r of [...recovery.records, ...recovery.journal]) r.bytes.fill(0);
        }
      } finally {
        doc.destroy();
        await owner.close();
      }
    }),
};
