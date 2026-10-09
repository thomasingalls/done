from pathlib import Path
import shutil,json,hashlib
root=Path('/Users/thomasingalls/.codex/worktrees/c030/done');here=Path(__file__).parent;out=root/'docs/performance-experiments/2026-09-15-f17-growth-r1';out.mkdir(parents=True,exist_ok=True)
for f in here.iterdir():
 if f.is_file() and f.suffix in ['.mjs','.md','.json','.log','.patch','.py','.ts'] and f.name!='report-draft.md':shutil.copy2(f,out/f.name)
for folder in ['results','attempt-1']:
 for f in (here/folder).rglob('*'):
  if f.is_file():
   target=out/f.relative_to(here);target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(f,target)
files={str(f.relative_to(out)):hashlib.sha256(f.read_bytes()).hexdigest() for f in out.rglob('*') if f.is_file() and f.name!='sha256.json'}
(out/'sha256.json').write_text(json.dumps(files,indent=2)+'\n');print(len(files),'artifacts',sum(f.stat().st_size for f in out.rglob('*') if f.is_file()),'bytes')
