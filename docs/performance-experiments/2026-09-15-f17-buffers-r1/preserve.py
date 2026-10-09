from pathlib import Path
import hashlib,json,shutil
home=Path(__file__).parent;root=Path('/Users/thomasingalls/.codex/worktrees/c030/done');out=root/'docs/performance-experiments/2026-09-15-f17-buffers-r1';out.mkdir(parents=True,exist_ok=True)
def copy(p,q):q.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,q)
for p in home.iterdir():
 if p.is_file() and p.suffix in ['.mjs','.py','.md','.json','.log','.patch','.ts']:copy(p,out/p.name)
for p in (home/'results').rglob('*'):
 if p.is_file():copy(p,out/p.relative_to(home))
for name in ['selected','candidate']:copy(home/'builds'/f'{name}-source.json',out/'builds'/f'{name}-source.json')
files=['src/crdt/admittedWorkspace.ts','src/crdt/workspacePreparation.ts','src/crdt/admissionQueue.ts','src/crdt/yjs.ts','test/workspaceAdmission.test.ts','test/historyRetirement.test.ts','test/textBufferBasis.test.ts','test/textBufferNormalizationProbe.test.ts','test/admittedEditorProjection.test.ts']
for f in files:copy(home/'candidate'/f,out/'implementation'/f)
prior=home/'before-retention-repair'
for p in prior.iterdir():
 if p.is_file():copy(p,out/'before-retention-repair'/p.name)
for p in (prior/'results').rglob('*'):
 if p.is_file():copy(p,out/'before-retention-repair'/p.relative_to(prior))
for name in ['selected','candidate']:copy(prior/'builds'/f'{name}-source.json',out/'before-retention-repair/builds'/f'{name}-source.json')
copy(prior/'candidate/src/crdt/workspacePreparation.ts',out/'before-retention-repair/workspacePreparation.ts')
pins={str(p.relative_to(out)):hashlib.sha256(p.read_bytes()).hexdigest() for p in out.rglob('*') if p.is_file() and p.name!='sha256.json'}
(out/'sha256.json').write_text(json.dumps(pins,indent=2)+'\n');print(len(pins),'artifacts preserved;',sum(p.stat().st_size for p in out.rglob('*') if p.is_file()),'bytes')
