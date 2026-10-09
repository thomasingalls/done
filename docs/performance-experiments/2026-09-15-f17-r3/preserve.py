from pathlib import Path
import json,hashlib,shutil,gzip,subprocess
root=Path('/Users/thomasingalls/.codex/worktrees/c030/done');here=Path(__file__).parent
out=root/'docs/performance-experiments/2026-09-15-f17-r3';out.mkdir(parents=True,exist_ok=True)
for f in here.iterdir():
 if f.is_file() and f.suffix in ['.mjs','.md','.json','.log','.patch','.py'] and f.name!='report-draft.md':shutil.copy2(f,out/f.name)
for f in (here/'any-result').rglob('*'):
 if f.is_file():
  target=out/'any-result'/f.relative_to(here/'any-result');target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(f,target)
for f in (here/'results').glob('*/*'):
 if f.is_file() and f.suffix=='.json':
  target=out/'results'/f.parent.name;target.mkdir(parents=True,exist_ok=True)
  if f.name in ['cpu.json','allocation.json','mapped.json']:(target/(f.name+'.gz')).write_bytes(gzip.compress(f.read_bytes(),mtime=0))
  else:shutil.copy2(f,target/f.name)
for f in (here/'builds').glob('*.json'):(out/(f.name+'.gz')).write_bytes(gzip.compress(f.read_bytes(),mtime=0))
start=json.loads((here/'start.json').read_text());packet=Path(start['previousPacket'])
for name,h in start['previousPacketPins'].items():assert hashlib.sha256((packet/name).read_bytes()).hexdigest()==h,name
for row in start['personalAndVectorPins']:
 f=Path(row['path']);f=f if f.is_absolute() else root/f
 assert hashlib.sha256(f.read_bytes()).hexdigest()==row['sha256'],str(f)
suffix=(root/'docs/progress.md').read_text().split('\n---\n\n## Active slice: Stage 4',1)[1]
assert hashlib.sha256(suffix.encode()).hexdigest()==start['L2SuffixSha256']
assert not subprocess.check_output(['git','diff','--name-only','--','src','test','scripts','wasm','vite','package.json','pnpm-lock.yaml'],cwd=root)
for name in ['completed.md','performance.md','decisions.md']:
 assert (root/'docs'/name).read_bytes().startswith(subprocess.check_output(['git','show',start['base']+':docs/'+name],cwd=root))
(out/'preservation.json').write_text(json.dumps({'previousPacketFiles':len(start['previousPacketPins']),'personalAndVectorPins':len(start['personalAndVectorPins']),'L2Unchanged':True,'mainRuntimeTestsUnchanged':True,'appendOnlyPrefixesPreserved':True},indent=2)+'\n')
files={str(f.relative_to(out)):hashlib.sha256(f.read_bytes()).hexdigest() for f in out.rglob('*') if f.is_file() and f.name!='sha256.json'}
(out/'sha256.json').write_text(json.dumps(files,indent=2)+'\n')
print(len(files),'artifacts',sum(f.stat().st_size for f in out.rglob('*') if f.is_file()),'bytes')
