from pathlib import Path
h=Path(__file__).parent;p=h/'candidate/src/crdt/yjs.ts';s=p.read_text();before="      if (!sameDocState(target.doc, source.doc)) throw Error('Text buffer catch-up mismatch');\n";assert s.count(before)==1;s=s.replace(before,'');s=s.replace('     * Applying a native delta normalizes new content; text does not create redone links. */','     * The workspace must supply its untouched exact predecessor and retained accepted delta.\n     * This is not a general catch-up validator. Native text replay preserves the guarded\n     * normalization domain and inherited redone links; complete stack copying follows.\n     * Existing post-admission canonical verification remains in the preparation owner. */');p.write_text(s)
p=h/'candidate/src/crdt/admittedWorkspace.ts';s=p.read_text().replace('let spare: { state: State; basis: State; update: Bytes } | undefined;', '''let spare:
    | { state: State; basis: State; update: Bytes; untouched(): boolean; unwatch(): void }
    | undefined;
  // Only the owning preparation may mutate a retired buffer. Conservative: even an idle
  // no-op transaction invalidates it. Raw private-field writes remain outside this contract.
  const watchRetired = (state: State) => {
    let untouched = true;
    const changed = () => { untouched = false; };
    state.history.doc.on('beforeTransaction', changed);
    return {
      untouched: () => untouched,
      unwatch: () => state.history.doc.off('beforeTransaction', changed),
    };
  };''');s=s.replace('      old.update.fill(0);\n    } finally {','      old.unwatch();\n      old.update.fill(0);\n    } finally {',1);s=s.replace('        scope!.ownState(state);\n        selectionHistory!', "        scope!.ownState(state);\n        if (!old.untouched()) throw Error('Retired text buffer changed while idle');\n        selectionHistory!",1);s=s.replace('      } finally {\n        old.update.fill(0);','      } finally {\n        old.unwatch();\n        old.update.fill(0);',1)
# Stop observing before the authorized replay, after the idle-state check.
s=s.replace("if (!old.untouched()) throw Error('Retired text buffer changed while idle');\n        selectionHistory!", "if (!old.untouched()) throw Error('Retired text buffer changed while idle');\n        old.unwatch();\n        selectionHistory!")
s=s.replace('spare = { state: previous, basis: state as State, update: transition.update.slice() };', '''spare = {
        state: previous, basis: state as State, update: transition.update.slice(),
        ...watchRetired(previous),
      };''');p.write_text(s)
# Preserve the old test body: same injected transaction still refuses before append.
p=h/'candidate/test/workspaceAdmission.test.ts';s=p.read_text().replace('full catch-up comparison refuses corrupted retired content before another append','idle transaction fence refuses corrupted retired content before another append');p.write_text(s)
p=h/'candidate/test/textBufferNormalizationProbe.test.ts';p.write_text(p.read_text().replace('/private/tmp/done-f17-buffers-r1/normalization-values.json',str(h/'normalization-values.json')))
print('Candidate keeps canonical verification and stack copying; replaces added catch-up comparison with exact replay and idle transaction fence')
