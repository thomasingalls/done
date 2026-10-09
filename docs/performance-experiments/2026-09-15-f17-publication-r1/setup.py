from pathlib import Path
import subprocess,json,hashlib,shutil
root=Path('/Users/thomasingalls/.codex/worktrees/c030/done');home=Path(__file__).parent;old=root/'docs/performance-experiments/2026-09-15-f17-repair-r1'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
base=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip();prior=json.loads((old/'start.json').read_text())
start={'base':base,'previousPacket':str(old),'previousPacketPins':{str(p.relative_to(old)):sha(p) for p in old.rglob('*') if p.is_file()},'personalAndVectorPins':prior['personalAndVectorPins'],'perspectiveSha256':sha(root/'f17-perspective-55ab217e.md')}
(home/'start.json').write_text(json.dumps(start,indent=2)+'\n');shutil.copy2(old/'candidate.patch',home/'selected.patch')
for name in ['selected','candidate']:
 out=home/name
 subprocess.run(['git','clone','--shared','--no-checkout',str(root),str(out)],check=True)
 subprocess.run(['git','sparse-checkout','set','src','test','scripts','public','vite','patches','wasm','account-protocol','account-service','private','relay'],cwd=out,check=True)
 subprocess.run(['git','checkout','--detach',base],cwd=out,check=True)
 subprocess.run(['git','apply',str(home/'selected.patch')],cwd=out,check=True)
 (out/'node_modules').symlink_to(root/'node_modules',target_is_directory=True)
(home/'node_modules').symlink_to(root/'node_modules',target_is_directory=True)
for f in ['screen.mjs','measure.mjs','recorder.mjs','build.mjs']:shutil.copy2(old/f,home/f)
print('Two isolated variants prepared at',base)
