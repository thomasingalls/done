from pathlib import Path
p=Path(__file__).parent/'candidate/src/crdt/admittedWorkspace.ts';s=p.read_text()
s=s.replace("import { createArchiveProjection } from './archiveProjection';", "import { createArchiveProjection } from './archiveProjection';\nimport { createWorkspacePublication, readWorkspaceSnapshot, recordPublicationChanges, type PublicationChanges } from './workspacePublication';")
s=s.replace("  const archiveProjection = createArchiveProjection();", "  const archiveProjection = createArchiveProjection();\n  const preparedReads = new WeakMap<PreparedWorkspaceState, PublicationChanges>();")
s=s.replace("  const identity = structuredClone(options.identity);", "  const identity = structuredClone(options.identity);\n  const publication = selectionHistory ? createWorkspacePublication(identity, archiveProjection) : undefined;")
s=s.replace('    const selections = state.selections;', '''    const selections = state.selections;
    const readChanges: PublicationChanges | undefined = publication
      ? { basis: verifiedRevision, master: false, cards: new Set(), full: false }
      : undefined;
    const trackRead = (transaction: Y.Transaction) => recordPublicationChanges(doc, readChanges!, transaction);
    if (readChanges) doc.on('afterTransaction', trackRead);''')
s=s.replace('      state.value = result.value;', '      state.value = result.value;\n      if (readChanges) preparedReads.set(state, readChanges);')
s=s.replace("      doc.off('update', capture);", "      if (readChanges) doc.off('afterTransaction', trackRead);\n      doc.off('update', capture);")
s=s.replace('  const accept = (state: PreparedWorkspaceState, revision: number) => {', '''  const accept = (state: PreparedWorkspaceState, revision: number) => {
    publication?.advance(state.history, revision, preparedReads.get(state));
    preparedReads.delete(state);''')
s=s.replace('    archiveProjection.clear();', '    archiveProjection.clear();\n    publication?.clear();')
s=s.replace('          commands.invalidate(accepted!.history);', '          publication?.clear();\n          commands.invalidate(accepted!.history);')
a=s.index('  const read = (): WorkspaceSnapshot => {');b=s.index('  const api: AdmittedWorkspace',a)
s=s[:a]+'''  const read = (): WorkspaceSnapshot => {
    live();
    return publication
      ? publication.read(accepted!.history, verifiedRevision)
      : readWorkspaceSnapshot(accepted!.history, identity, archiveProjection);
  };
'''+s[b:]
# Removed full-reader imports; retain types needed by WorkspaceSnapshot.
s=s.replace('type Origin, listActors', 'type Origin, type listActors')
for name in ['  cardAt,\n','  cardBody,\n','  cardAuthor,\n','  cardOrigin,\n','  listDays,\n','  cardsIn,\n','  archiveOf,\n','  dayAt,\n','  collectionOf,\n']:s=s.replace(name,'')
s=s.replace('  cardLocation,','  type cardLocation,')
p.write_text(s)
