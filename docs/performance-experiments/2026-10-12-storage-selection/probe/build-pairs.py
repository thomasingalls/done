import os,subprocess,pathlib,json,hashlib
root=pathlib.Path('/tmp/done-storage-selection-20261012')
for arm,flag in [('reference','0'),('selected','1')]:
 env=dict(os.environ,VITE_ACCOUNT_SELECTIVE_LOADS=flag,VITE_ACCOUNT_LEDGER_PROFILE='1')
 with (root/f'{arm}-build-compared.log').open('w') as log:
  result=subprocess.run(['node','node_modules/vite/bin/vite.js','build','--config','docs/performance-experiments/2026-10-12-storage-selection/probe/build.config.ts','--outDir',str(root/f'{arm}-dist')],env=env,stdout=log,stderr=subprocess.STDOUT)
 print(arm,'build exit',result.returncode,flush=True)
 if result.returncode:raise SystemExit(result.returncode)
files=subprocess.check_output(['git','diff','--name-only'],text=True).splitlines()+['src/crdt/contentSelection.ts']
identity={'base':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'comparisonRuntime':{p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest() for p in files if p.startswith('src/')}, 'bundles':{str(root/f'{arm}-dist'):{str(p.relative_to(root/f'{arm}-dist')):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((root/f'{arm}-dist').rglob('*')) if p.is_file()} for arm in ['reference','selected']}}
fixture=pathlib.Path('/tmp/done-foreground-stall-20261012/diagnostic-before-2/deep-received-fixture.json')
identity['fixture']={'path':str(fixture),'sha256':hashlib.sha256(fixture.read_bytes()).hexdigest()}
pathlib.Path('docs/performance-experiments/2026-10-12-storage-selection/source-identity.json').write_text(json.dumps(identity,indent=2)+'\n')
