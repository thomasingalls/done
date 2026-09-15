from pathlib import Path
h=Path(__file__).parent;s=Path('/private/tmp/done-f17-buffers-r1/fault-controls.py').read_text()
s=s.replace("faults=[", "faults=[\n ('idle-transaction-fence','src/crdt/admittedWorkspace.ts',\"        if (!old.untouched()) throw Error('Retired text buffer changed while idle');\\n\",'', 'test/workspaceAdmission.test.ts','idle no-op transactions refuse'),")
s=s.replace("Three deliberately broken variants", "Four deliberately broken variants")
(h/'fault-controls.py').write_text(s)
