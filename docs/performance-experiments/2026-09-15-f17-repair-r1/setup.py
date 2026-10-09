from pathlib import Path
import subprocess,json,hashlib,shutil
root=Path('/Users/thomasingalls/.codex/worktrees/c030/done');home=Path(__file__).parent
base=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
old=root/'docs/performance-experiments/2026-09-15-f17-growth-r1'
hash=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
prior=json.loads((old/'start.json').read_text())
start={'base':base,'previousPacket':str(old),'previousPacketPins':{str(p.relative_to(old)):hash(p) for p in old.rglob('*') if p.is_file()},'personalAndVectorPins':prior['personalAndVectorPins'],'records':{p:hash(root/p) for p in ['docs/completed.md','docs/decisions.md','docs/performance.md','docs/progress.md','docs/release-validation-execution.md']}}
(home/'start.json').write_text(json.dumps(start,indent=2)+'\n')
shutil.copy2(old/'selected.patch',home/'selected.patch')
for name in ['selected','candidate']:
 out=home/name
 subprocess.run(['git','clone','--shared','--no-checkout',str(root),str(out)],check=True)
 subprocess.run(['git','sparse-checkout','set','src','test','scripts','public','vite','patches'],cwd=out,check=True)
 subprocess.run(['git','checkout','--detach',base],cwd=out,check=True)
 subprocess.run(['git','apply',str(home/'selected.patch')],cwd=out,check=True)
 (out/'node_modules').symlink_to(root/'node_modules',target_is_directory=True)
(home/'node_modules').symlink_to(root/'node_modules',target_is_directory=True)
for f in ['build.mjs','screen.mjs','measure.mjs','recorder.mjs']:
 shutil.copy2(root/'docs/performance-experiments/2026-09-15-f17-r4'/f,home/f)
print('Prepared two disposable clones above',base)
