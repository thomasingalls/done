"""Retain numeric/check evidence only; synthetic custody snapshots stay in /tmp."""
import hashlib,json,pathlib,subprocess,tarfile
repo=pathlib.Path.cwd();root=pathlib.Path('/tmp/done-immediate-authority-20261013')
out=repo/'docs/performance-experiments/2026-10-13-immediate-authority'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
measured=json.loads((root/'measured-source.json').read_text())
for p,h in measured.items():assert sha(repo/p)==h,('Runtime changed after measurement',p)
summary=json.loads((out/'summary.json').read_text());assert len(summary['sessions'])==12
runtime=subprocess.check_output(['git','diff','--name-only','5c7ba18a','--','src'],text=True).splitlines()
assert set(runtime)==set(measured)-{'src/crdt/finalApplyGate.ts'}
helpers=[f'docs/performance-experiments/{phase}/probe/build.config.ts' for phase in ['2026-10-12-authority-read','2026-10-12-final-apply','2026-10-12-prepared-receive','2026-10-12-online-typing','2026-10-12-owned-verification','2026-10-12-warm-ledger','2026-10-12-text-admission']]
helpers+=['docs/performance-experiments/2026-10-12-receive-attribution/probe/runtime.mjs','docs/performance-experiments/2026-10-12-status-subscriptions/probe/typing.spec.ts','docs/performance-experiments/2026-10-12-status-subscriptions/probe/input.ts']
source=[p for base in ['src','account-protocol','account-service'] for p in (repo/base).rglob('*') if p.suffix in ['.ts','.tsx','.mjs']]
identity={'reference':subprocess.check_output(['git','rev-parse','5c7ba18a'],text=True).strip(),'design':subprocess.check_output(['git','rev-parse','742e1c14'],text=True).strip(),
 'runtimeDiff':runtime+['src/crdt/finalApplyGate.ts'],'measuredRuntimeHashes':measured,
 'sourceAndHelpers':{str(p.relative_to(repo)):sha(p) for p in source+[repo/p for p in helpers+['package.json','pnpm-lock.yaml','vite.config.ts','test/packaged-account/devices.ts']]},
 'probes':{str(p.relative_to(repo)):sha(p) for p in (out/'probe').iterdir() if p.is_file()},
 'builds':{arm:{str(p.relative_to(root/arm)):sha(p) for p in (root/arm).rglob('*') if p.is_file()} for arm in ['reference','candidate']},
 'fixtures':{str(p):sha(p) for p in [pathlib.Path('/tmp/done-client-receive/fixture.json'),pathlib.Path('/tmp/done-online-typing-20261012/seed-matched-12000/fixture.json')]},
 'environment':{'node':subprocess.check_output(['node','--version'],text=True).strip(),'platform':subprocess.check_output(['uname','-sm'],text=True).strip(),'playwright':json.loads((repo/'node_modules/@playwright/test/package.json').read_text())['version'],'cpuThrottle':4,'requestDelayMs':75},
 'privacy':'No fixture contents, writing, browser/service snapshots, credentials or host process list. Hashes identify synthetic fixtures without publishing their reusable credential material.'}
(out/'source-identity.json').write_text(json.dumps(identity,indent=2)+'\n')
files=[]
for name in ['build-reference.log','build-candidate.log','ordinary-build.log','focused.log','native-results.json','checks.json','final-checks.log','runs.log','measured-runtime.patch','measured-source.json','measured-new-gate.ts']:
 if (root/name).exists():files.append(root/name)
for s in summary['sessions']:
 name=s['session']
 for file in ['result.json','analysis.json']:
  files.append(root/name/file)
 files.append(root/(name+'.log'))
 env=json.loads((root/(name+'.environment.json')).read_text());env.pop('processes',None)
 clean=root/name/'environment.json';clean.write_text(json.dumps(env,indent=2)+'\n');files.append(clean)
with tarfile.open(out/'evidence.tar.gz','w:gz') as tar:
 for p in files:tar.add(p,arcname=str(p.relative_to(root)))
manifest={'archive':'evidence.tar.gz','bytes':(out/'evidence.tar.gz').stat().st_size,'sha256':sha(out/'evidence.tar.gz'),'files':[{'path':str(p.relative_to(root)),'bytes':p.stat().st_size,'sha256':sha(p)} for p in files]}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
with tarfile.open(out/'evidence.tar.gz') as tar:
 for p in manifest['files']:
  data=tar.extractfile(p['path']).read();assert len(data)==p['bytes'] and hashlib.sha256(data).hexdigest()==p['sha256']
print('Verified',len(files),'evidence files;',manifest['bytes'],'compressed bytes')
