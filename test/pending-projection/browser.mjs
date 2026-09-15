import '../workspace-admission/browser.mjs';
import { cloneDocument } from '@document';
import { Y, createHistoryDoc, workspaceUndo, forkWorkspaceHistory, sameDocState } from '@yjs';
import { openJournalSession } from '@custody';
import { openAdmissionSession } from '@admission';
import { createAdmittedWorkspace } from '@workspace';
import { createAdmittedText } from '@text';
import { createAdmittedEditor } from '@editor';
import { startupRefusal } from '@startup';

const scope = {
  slotId: 'content-slot',
  principalId: 'content-principal',
  workspaceId: 'content-workspace',
};
const authority = { ...scope, resolvePrincipal: () => scope.principalId };
const identity = {
  id: 'human-one',
  actor: { kind: 'human', name: 'Alice', color: '#3f8fd6' },
  device: { id: 'device-one', name: 'probe' },
};
const plain = (doc, names) => ({
  text: names.map((name) => doc.getText(name).toString()),
  pendingStructs: Boolean(doc.store.pendingStructs),
  pendingDs: Boolean(doc.store.pendingDs),
  missing: [...(doc.store.pendingStructs?.missing ?? [])].sort(([a], [b]) => a - b),
});
const entries = {},
  publications = [],
  outgoing = [];
let workspace,
  session,
  editor,
  kind,
  dropNext = false;
const track = (id, fn) => {
  entries[id] = { status: 'pending' };
  Promise.resolve()
    .then(fn)
    .then(
      (value) => {
        entries[id] = { status: 'resolved', value };
      },
      (error) => {
        entries[id] = {
          status: 'rejected',
          error: { code: error.code, message: error.message, disposition: startupRefusal(error) },
        };
      },
    );
};
window.projection = {
  snapshot: () => {
    let read, canonical;
    try {
      read = workspace?.read();
    } catch (error) {
      read = { error: error.code, message: error.message };
    }
    try {
      const doc = session?.fork();
      if (doc) {
        try {
          canonical = plain(doc, ['master', 'lane1', 'lane2']);
        } finally {
          doc.destroy();
        }
      }
    } catch {}
    return {
      entries,
      read,
      canonical,
      status: workspace?.status,
      publications,
      outgoing,
      editor: editor
        ? {
            text: editor.view.state.doc.toString(),
            editable: editor.view.contentDOM.contentEditable,
          }
        : null,
    };
  },
  forks(source, prefix, suffix) {
    const original = createHistoryDoc(),
      manager = workspaceUndo(original, 'human');
    for (const i of prefix) Y.applyUpdate(original, Uint8Array.from(source.updates[i]));
    const draft = cloneDocument(original),
      history = forkWorkspaceHistory(manager, 'human');
    try {
      const before = [draft, history.doc].map((doc) => sameDocState(original, doc));
      for (const i of suffix)
        for (const doc of [original, draft, history.doc])
          Y.applyUpdate(doc, Uint8Array.from(source.updates[i]));
      return {
        before,
        after: [original, draft, history.doc].map((doc) => plain(doc, source.names)),
      };
    } finally {
      manager.destroy();
      history.destroy();
      original.destroy();
      draft.destroy();
      history.doc.destroy();
    }
  },
  compareContent() {
    const a = createHistoryDoc(),
      b = createHistoryDoc();
    try {
      a.clientID = b.clientID = 101;
      a.getText('master').insert(0, 'AA');
      b.getText('master').insert(0, 'BB');
      return {
        vectorsEqual:
          JSON.stringify([...Y.encodeStateVector(a)]) ===
          JSON.stringify([...Y.encodeStateVector(b)]),
        same: sameDocState(a, b),
      };
    } finally {
      a.destroy();
      b.destroy();
    }
  },
  seed: (code, updates) =>
    track('seed', async () => {
      const owner = await openJournalSession(authority, code);
      try {
        await owner.appendBatch(
          updates.map((bytes) => ({ kind: 'update', bytes: Uint8Array.from(bytes) })),
        );
      } finally {
        await owner.close();
      }
    }),
  open: (code, type = 'workspace') =>
    track('open', async () => {
      kind = type;
      const open = async (options) => {
        session = await openAdmissionSession(authority, code, options);
        return {
          ...session,
          get status() {
            return session.status;
          },
          subscribe(listener) {
            return session.subscribe((event) => {
              if (dropNext) {
                const source = dropNext === 'initialization' ? 'remote' : event.source;
                dropNext = false;
                listener({ ...event, source, update: Uint8Array.from([0, 0]) });
              } else listener(event);
            });
          },
        };
      };
      workspace =
        type === 'workspace'
          ? await createAdmittedWorkspace(
              open,
              {
                identity,
                validateReceive: () => {},
                today: () => '2026-09-08',
              },
              'local-handoff',
            )
          : await createAdmittedText(open, () => {});
      workspace.subscribe(() => {
        try {
          publications.push(workspace.read());
        } catch {}
      });
      workspace.outgoing((bytes) => outgoing.push([...bytes]));
      editor = createAdmittedEditor({
        parent: document.querySelector('#probe'),
        document: type === 'workspace' ? workspace.text({ kind: 'master' }) : workspace,
      });
    }),
  receive: (id, bytes) => track(id, () => workspace.receive(Uint8Array.from(bytes)).accepted),
  command: (id, command) => track(id, () => workspace.command(command).accepted),
  input: (id, text) =>
    track(
      id,
      () =>
        (kind === 'workspace' ? workspace.text({ kind: 'master' }) : workspace).input({
          name: 'insert',
          text,
        }).accepted,
    ),
  dropNext: (mode = 'event') => {
    dropNext = mode;
  },
  durable: (id) => track(id, () => workspace.whenDurable()),
  close: () =>
    track('close', async () => {
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
            ...plain(doc, ['master', 'lane1', 'lane2']),
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
