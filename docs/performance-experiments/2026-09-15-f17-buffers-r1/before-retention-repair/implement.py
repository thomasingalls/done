from pathlib import Path
home=Path(__file__).parent;root=home/'candidate'
p=root/'src/crdt/workspacePreparation.ts';s=p.read_text()
s=s.replace('  accept(state: PreparedWorkspaceState, revision: number): void;', '  accept(state: PreparedWorkspaceState, revision: number): PreparedWorkspaceState | void;')
s=s.replace('  const knownDocs = new WeakSet<Y.Doc>();','''  const knownDocs = new WeakSet<Y.Doc>();
  const transferred = new WeakSet<PreparedWorkspaceState>();
  const retired = new WeakMap<Y.Doc, PreparedWorkspaceState>();
  let lastAdopted: PreparedWorkspaceState | undefined;''')
s=s.replace("        if (knownDocs.has(state.history.doc)) throw Error('History was already owned');",'''        if (
          knownDocs.has(state.history.doc) &&
          !(slot === entry && !entry.invalid && entry.phase === 'preparing' && !closed &&
            !entry.state && retired.get(state.history.doc) === state && !state.history.doc.isDestroyed)
        ) throw Error('History was already owned');
        retired.delete(state.history.doc);''')
s=s.replace("      entry.phase = 'adopted';\n      return state;", "      entry.phase = 'adopted';\n      transferred.add(state);\n      lastAdopted = state;\n      return state;")
s=s.replace('    adopt,\n    /** Copy', '''    adopt,
    /** Trusted composition returns a previous transferred state after adopting its successor.
     * Registration permits one later acquisition; the workspace still owns spare disposal. */
    retire(state: PreparedWorkspaceState) {
      live();
      if (!slot || slot.phase !== 'adopted' || slot.invalid || state === lastAdopted ||
          !transferred.has(state) || state.history.doc.isDestroyed ||
          retired.has(state.history.doc)) throw Error('History cannot be retired');
      transferred.delete(state);
      retired.set(state.history.doc, state);
    },
    /** Copy''')
p.write_text(s)
p=root/'src/crdt/admissionQueue.ts';s=p.read_text().replace('          local!.accept(candidate, revision);','''          const retired = local!.accept(candidate, revision);
          if (retired) preparation!.retire(retired);''');p.write_text(s)
p=root/'src/crdt/yjs.ts';s=p.read_text()
start=s.index('    const copySet =',s.index('const forkHistory ='))
end=s.index('    return manager;',start)
old=s[start:end]
# Keep one exact stack copier for fresh forks and buffer catch-up.
body=old.replace('    manager.undoStack','    target.undoStack').replace('    manager.redoStack','    target.redoStack').replace('    manager.lastChange','    target.lastChange')
s=s[:start]+'    copyHistoryStacks(source, manager, copyMetadata);\n'+s[end:]
insert=s.index('/** Explicit private Local history mode.')
s=s[:insert]+'''/** Every mutable range and outer metadata map remains detached. */
const copyHistoryStacks = (source: YUndoManager, target: YUndoManager,
  copyMetadata: (meta: HistoryMetadata) => HistoryMetadata) => {
'''+body+'''};

/** Conservative once-per-basis guard for delta catch-up to equal a fresh normalized fork.
 * Reject every surrogate, including complete pairs; extending that domain is separate work. */
export const isTextBufferBasis = (doc: YDoc): boolean => {
  if (hasPendingUpdates(doc) || doc.isDestroyed || doc.gc) return false;
  const cleanString = (s: string) => !/[\\uD800-\\uDFFF]/.test(s);
  const seen = new Set<object>();
  const value = (v: unknown): boolean => {
    if (typeof v === 'string') return cleanString(v);
    if (v === null || typeof v === 'boolean' || typeof v === 'undefined') return true;
    if (typeof v === 'number') return Number.isFinite(v);
    if (!v || typeof v !== 'object' || seen.has(v)) return false;
    if (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype) return false;
    seen.add(v);
    const result = Reflect.ownKeys(v).every((key) => {
      if (typeof key !== 'string' || !cleanString(key)) return false;
      const d = Object.getOwnPropertyDescriptor(v, key)!;
      return 'value' in d && value(d.value);
    });
    seen.delete(v);
    return result;
  };
  if (![...doc.share.keys()].every(cleanString)) return false;
  for (const structs of doc.store.clients.values()) for (const item of structs) {
    if (!(item instanceof Y.Item)) continue;
    if (item.parentSub && !cleanString(item.parentSub)) return false;
    const c = item.content;
    if (c instanceof Y.ContentString) { if (!cleanString(c.str)) return false; }
    else if (c instanceof Y.ContentAny) { if (!value(c.arr)) return false; }
    else if (c instanceof Y.ContentType) {
      if (!(c.type instanceof Y.Text || c.type instanceof Y.Map || c.type instanceof Y.Array)) return false;
    } else if (!(c instanceof Y.ContentDeleted)) return false;
  }
  return true;
};

'''+s[insert:]
needle='''    capture(history: YUndoManager, positions: SelectionPositions): SelectionSnapshot {'''
s=s.replace(needle,'''    /** A retired predecessor catches up only across an owner-proven text transition.
     * Applying a native delta normalizes new content; text does not create redone links. */
    catchUpText(target: YUndoManager, source: YUndoManager, update: Uint8Array): void {
      check(target);
      check(source);
      if (target === source) throw Error('Text buffer aliases accepted history');
      applyUpdate(target.doc, update, 'text-buffer-catch-up');
      copyHistoryStacks(source, target, (meta) => snapshots.fork(meta));
      if (!sameDocState(target.doc, source.doc)) throw Error('Text buffer catch-up mismatch');
    },
'''+needle)
p.write_text(s)
p=root/'src/crdt/admittedWorkspace.ts';s=p.read_text()
s=s.replace('  createSelectionHistory,','  createSelectionHistory,\n  isTextBufferBasis,')
needle='  const archiveProjection = createArchiveProjection();'
s=s.replace(needle,'''  // Private experiment: one retired predecessor, never more than two workspace histories.
  let spare: { state: State; basis: State; update: Bytes } | undefined;
  const stable = new WeakMap<YUndoManager, boolean>();
  const transferred = new WeakSet<PreparedWorkspaceState>();
  const transitions = new WeakMap<PreparedWorkspaceState, { update: Bytes; textOnly: boolean }>();
  const resetSpare = () => {
    if (!spare) return;
    const old = spare;
    spare = undefined;
    try { old.update.fill(0); } finally { dispose(old.state); }
  };
'''+needle)
start=s.index('    const history = selectionHistory\n',s.index('const prepareWorkspace'))
end=s.index('    const selections = state.selections;',start)
s=s[:start]+'''    const basis = accepted;
    const textCommand = intent.command.kind === 'text';
    let reusable = false;
    if (selectionHistory && scope && textCommand) {
      let clean = stable.get(basis.history);
      if (clean === undefined) {
        clean = isTextBufferBasis(basis.history.doc);
        stable.set(basis.history, clean);
      }
      reusable = clean && !(intent.command.kind === 'text' &&
        intent.command.action.name === 'insert' && /[\\uD800-\\uDFFF]/.test(intent.command.action.text));
    }
    if (!reusable || spare?.basis !== basis) resetSpare();
    let state: State;
    if (spare) {
      const old = spare;
      spare = undefined;
      state = old.state;
      try {
        scope!.ownState(state);
        selectionHistory!.catchUpText(state.history, basis.history, old.update);
      } finally { old.update.fill(0); }
      state.selections = new Map();
      state.group = intent.group;
      state.value = false;
    } else {
      const history = selectionHistory
        ? selectionHistory.fork(basis.history, human)
        : forkWorkspaceHistory(basis.history, human);
      state = { history, selections: new Map(), group: intent.group, value: false };
      scope?.ownState(state);
    }
    const history = state.history, doc = history.doc;
    commands.inherit(basis.history, history);
    doc.clientID = writer;
    let textOnly = reusable;
    const changed = (transaction: Y.Transaction) => {
      if (!textOnly) return;
      for (const type of transaction.changed.keys()) {
        const parent = type.parent;
        const id = parent instanceof Y.Map ? parent.get('id') : undefined;
        if (!(type instanceof Y.Text && (type === doc.share.get('master') ||
          (parent instanceof Y.Map && parent.parent === doc.getMap('cards') &&
           typeof id === 'string' && doc.getMap('cards').get(id) === parent && parent.get('text') === type)))) {
          textOnly = false;
          break;
        }
      }
    };
    doc.on('afterTransaction', changed);
'''+s[end:]
needle='      const update = own(new Uint8Array(updates.length ? Y.mergeUpdates(updates) : [0, 0]));'
s=s.replace(needle,needle+'''
      if (selectionHistory && scope) {
        transitions.set(state, { update, textOnly });
        // Unknown/structural transitions rescan later. A conservative negative text fact may persist.
        if (textOnly) stable.set(history, true);
        else if (textCommand && stable.get(basis.history) === false) stable.set(history, false);
      }''')
s=s.replace("      doc.off('update', capture);", "      doc.off('afterTransaction', changed);\n      doc.off('update', capture);")
s=s.replace('''    dispose(previous);
    outcomes.set(state.group, state.value);
  };''','''    const transition = transitions.get(state);
    transitions.delete(state);
    let retired: PreparedWorkspaceState | undefined;
    if (selectionHistory && previous && transferred.has(previous) && transition?.textOnly) {
      spare = { state: previous, basis: state as State, update: transition.update.slice() };
      retired = previous;
    } else dispose(previous);
    transferred.add(state);
    outcomes.set(state.group, state.value);
    return retired;
  };''')
s=s.replace('  const teardown = () => {','  const teardown = () => {\n    resetSpare();')
s=s.replace('''          commands.invalidate(accepted!.history);''','''          resetSpare();
          stable.delete(accepted!.history);
          commands.invalidate(accepted!.history);''')
p.write_text(s)
print('Runtime prototype written in isolated candidate.')
