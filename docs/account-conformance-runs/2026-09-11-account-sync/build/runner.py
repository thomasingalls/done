from pathlib import Path
import json,subprocess,hashlib,datetime
root=Path.cwd();assert root == Path('/private/tmp/done-account-sync-83eed0b'), 'Build must run in the isolated checkout';out=root/'test-results/account-sync-build';out.mkdir(parents=True,exist_ok=True)
files=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z']).decode().split('\0')
sources=[{'path':f,'sha256':hashlib.sha256((root/f).read_bytes()).hexdigest()} for f in sorted(set(files)) if f and f!='node_modules']
(out/'sources.json').write_text(json.dumps(sources,indent=2)+'\n')
summary={'head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'started':datetime.datetime.now(datetime.timezone.utc).isoformat(),'stages':[],'status':'running'}
commands=[
 ['node','scripts/check-yjs-patch.mjs'],['node','node_modules/typescript/bin/tsc','-b'],
 ['node','node_modules/vite/bin/vite.js','build'],['node','scripts/check-budget.mjs'],['node','scripts/check-origin-isolation.mjs'],
 ['node','scripts/check-debts.mjs','--check'],['node','scripts/check-retention.mjs'],
 ['node','scripts/check-selection-status.mjs'],['node','scripts/check-update-limit.mjs'],
 ['node','scripts/check-wasm-seal.mjs'],['node','scripts/check-traceability.mjs','--check']]
for i,command in enumerate(commands):
 print('Running',command,flush=True)
 with (out/f'{i:02}.log').open('w') as log:
  r=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT,timeout=120)
 summary['stages'].append({'command':command,'code':r.returncode,'log':f'{i:02}.log'})
 if r.returncode:summary['status']='failed'
 (out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
 if r.returncode:break
if summary['status']=='running':summary['status']='passed'
summary['finished']=datetime.datetime.now(datetime.timezone.utc).isoformat()
(out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary));raise SystemExit(0 if summary['status']=='passed' else 1)
