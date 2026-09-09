import '../workspace-admission/browser.mjs';
import { cloneDocument } from '@document';
import { Y, createHistoryDoc, workspaceUndo, forkWorkspaceHistory } from '@yjs';
import { openAdmittedWorkspace } from '@workspace';
import { startupRefusal } from '@startup';

const scope = {
  slotId: 'content-slot',
  principalId: 'content-principal',
  workspaceId: 'content-workspace',
};
const plain = (doc, names) => ({
  text: names.map((name) => doc.getText(name).toString()),
  pendingStructs: Boolean(doc.store.pendingStructs),
  pendingDs: Boolean(doc.store.pendingDs),
  missing: [...(doc.store.pendingStructs?.missing ?? [])].sort(([a], [b]) => a - b),
  vector: [...Y.decodeStateVector(Y.encodeStateVector(doc))].sort(([a], [b]) => a - b),
});
let armed, sibling, intercepted;
const keys = Object.keys;
Object.keys = function (object) {
  const captured = keys(object);
  if (object === localStorage && armed) {
    const mode = armed;
    armed = undefined;
    intercepted = {
      mode,
      before: captured.filter((key) => key.startsWith('done.pending-update.')),
    };
    if (mode === 'same-task-peer-append') {
      const ticket = sibling.text({ kind: 'master' }).input({ name: 'insert', text: 'B' });
      void ticket.accepted.catch(() => {});
    } else if (mode === 'spin-after-enumeration') {
      intercepted.started = Date.now();
      void window.snapshotEntered();
      const end = performance.now() + 500;
      while (performance.now() < end) {
        /* keep the native synchronous task running */
      }
      intercepted.finished = Date.now();
    } else {
      // eslint-disable-next-line no-debugger -- Controlled native cross-tab snapshot scheduling boundary.
      debugger;
    }
    intercepted.after = keys(localStorage).filter((key) => key.startsWith('done.pending-update.'));
  }
  return captured;
};

window.reproductions = {
  clones(source) {
    const original = createHistoryDoc(),
      origin = 'probe-human';
    for (const id of [3, 1, 5]) Y.applyUpdate(original, Uint8Array.from(source.updates[id]));
    const history = workspaceUndo(original, origin);
    const draft = cloneDocument(original),
      fork = forkWorkspaceHistory(history, origin);
    const initialAccepted = createHistoryDoc();
    Y.applyUpdate(initialAccepted, Y.encodeStateAsUpdate(original));
    const docs = { original, draft, historyFork: fork.doc, initialAccepted };
    try {
      const before = Object.fromEntries(
        Object.entries(docs).map(([key, doc]) => [key, plain(doc, source.names)]),
      );
      for (const id of [0, 2, 4, 6])
        for (const doc of Object.values(docs))
          Y.applyUpdate(doc, Uint8Array.from(source.updates[id]));
      const after = Object.fromEntries(
        Object.entries(docs).map(([key, doc]) => [key, plain(doc, source.names)]),
      );
      return { before, after };
    } finally {
      history.destroy();
      fork.destroy();
      for (const doc of Object.values(docs)) doc.destroy();
    }
  },
  canonical() {
    const doc = new Y.Doc();
    try {
      Y.applyUpdate(doc, Uint8Array.from(window.integration.wire()));
      return plain(doc, ['master']);
    } finally {
      doc.destroy();
    }
  },
  async sibling(code) {
    sibling = await openAdmittedWorkspace(
      { ...scope, resolvePrincipal: () => scope.principalId },
      code,
      {
        identity: {
          id: 'sibling',
          actor: { kind: 'human', name: 'sibling', color: '#3f8fd6' },
          device: { id: 'sibling-device', name: 'fixture' },
        },
        validateReceive: () => {},
        today: () => '2026-09-08',
      },
    );
  },
  async closeSibling() {
    await sibling?.close();
    sibling = undefined;
  },
  arm(mode) {
    armed = mode;
    intercepted = undefined;
  },
  intercepted: () => intercepted,
  startupDisposition: (code) => startupRefusal({ code }),
};
