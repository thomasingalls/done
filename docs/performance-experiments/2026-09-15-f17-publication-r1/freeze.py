from pathlib import Path
import hashlib,json,subprocess
home=Path(__file__).parent;sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
pins={}
for name in ['selected','candidate']:
 source=json.loads((home/'builds'/f'{name}-source.json').read_text())
 assert source['base']==json.loads((home/'start.json').read_text())['base']
 for f,h in source['hashes'].items(): assert sha(home/name/f)==h
 bundle={str(p.relative_to(home/'builds'/name)):sha(p) for p in (home/'builds'/name).rglob('*') if p.is_file()}
 (home/f'{name}-bundle.json').write_text(json.dumps(bundle,indent=2)+'\n')
 for f in source['hashes']:pins[f'{name}/{f}']=sha(home/name/f)
 for f,h in bundle.items():pins[f'builds/{name}/{f}']=h
 for f in [f'builds/{name}-source.json',f'{name}-bundle.json',f'{name}-activated-admittedWorkspace.ts']:pins[f]=sha(home/f)
# Check the clean selected comparator and the incremental patch apply without touching either.
subprocess.run(['git','apply','--reverse','--check',str(home/'selected.patch')],cwd=home/'selected',check=True)
subprocess.run(['git','apply','--check',str(home/'incremental-publication.patch')],cwd=home/'selected',check=True)
subprocess.run(['git','apply','--reverse','--check',str(home/'candidate.patch')],cwd=home/'candidate',check=True)
for f in ['screen.mjs','measure.mjs','recorder.mjs']:
 assert sha(home/f)==sha(Path('/Users/thomasingalls/.codex/worktrees/c030/done/docs/performance-experiments/2026-09-15-f17-r4')/f)
for f in ['screen.mjs','measure.mjs','recorder.mjs','build.mjs','batch.mjs','protocol.md','candidate.patch','incremental-publication.patch','selected.patch','candidate/test/membershipEligibility.test.ts','candidate/test/workspacePublication.test.ts','candidate/test/workspaceAdmission.test.ts','candidate/test/admittedEditorProjection.test.ts']:
 pins[f]=sha(home/f)
(home/'frozen.json').write_text(json.dumps({'pins':pins},indent=2)+'\n')
print(len(pins),'source/bundle/helper identities frozen; patch application and shared recorder checks pass.')
