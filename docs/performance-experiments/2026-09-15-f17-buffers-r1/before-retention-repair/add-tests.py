from pathlib import Path
root=Path(__file__).parent/'candidate'
p=root/'test/workspaceAdmission.test.ts';s=p.read_text()
s=s.replace("  type PreparedWorkspaceState,", "  type PreparedWorkspaceState,\n  type PreparationScope,")
s=s.replace('  const preparations: number[] = [],','''  const owned: { state: PreparedWorkspaceState; scope: PreparationScope }[] = [],
    retired: PreparedWorkspaceState[] = [];
  const preparations: number[] = [],''')
s=s.replace('''                    ownState(state) {
                      scope.ownState(state);''','''                    ownState(state) {
                      scope.ownState(state);
                      owned.push({ state, scope });''')
s=s.replace('''                ...local,
                command(context''','''                ...local,
                accept(state, revision) {
                  const previous = local.accept(state, revision);
                  if (previous) retired.push(previous);
                  return previous;
                },
                command(context''')
s=s.replace('''    doc,
    preparations,''','''    doc,
    owned,
    retired,
    preparations,''')
p.write_text(s)
