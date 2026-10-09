from pathlib import Path
import shutil,json,hashlib
h=Path(__file__).parent;r=Path('/Users/thomasingalls/.codex/worktrees/c030/done');out=r/'docs/performance-experiments/2026-09-15-f17-replay-r1';out.mkdir(exist_ok=True)
for p in h.iterdir():
 if p.is_file():shutil.copy2(p,out/p.name)
for mode in ['diagnostic-builds','builds']:
 dest=out/mode;dest.mkdir(exist_ok=True)
 for p in (h/mode).glob('*-source.json'):shutil.copy2(p,dest/p.name)
shutil.copytree(h/'results',out/'results',dirs_exist_ok=True)
pins={str(p.relative_to(out)):hashlib.sha256(p.read_bytes()).hexdigest() for p in out.rglob('*') if p.is_file() and p.name!='sha256.json'}
(out/'sha256.json').write_text(json.dumps(pins,indent=2)+'\n');print('Preserved',len(pins),'payloads;',sum(p.stat().st_size for p in out.rglob('*') if p.is_file()),'bytes')
