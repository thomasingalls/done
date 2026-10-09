from pathlib import Path
import hashlib,json,shutil
home=Path(__file__).parent;root=Path('/Users/thomasingalls/.codex/worktrees/c030/done');out=root/'docs/performance-experiments/2026-09-15-f17-repair-r1';out.mkdir(parents=True,exist_ok=True)
for p in home.iterdir():
 if p.is_file() and p.suffix in ['.mjs','.py','.md','.json','.log','.patch','.ts']:shutil.copy2(p,out/p.name)
for folder in ['results']:
 for p in (home/folder).rglob('*'):
  if p.is_file():
   dest=out/p.relative_to(home);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest)
for name in ['selected','candidate']:
 dest=out/'builds'/f'{name}-source.json';dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(home/'builds'/dest.name,dest)
for f in ['src/crdt/workspaceCommands.ts','src/crdt/admittedWorkspace.ts','test/membershipEligibility.test.ts']:
 dest=out/'implementation'/f;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(home/'candidate'/f,dest)
files={str(p.relative_to(out)):hashlib.sha256(p.read_bytes()).hexdigest() for p in out.rglob('*') if p.is_file() and p.name!='sha256.json'}
(out/'sha256.json').write_text(json.dumps(files,indent=2)+'\n');print(len(files),'artifacts preserved;',sum(p.stat().st_size for p in out.rglob('*') if p.is_file()),'bytes')
