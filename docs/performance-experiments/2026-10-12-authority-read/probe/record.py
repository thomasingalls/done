"""Retain diagnostic evidence only; exclude disposable state and fixture contents."""
import hashlib,json,pathlib,subprocess,tarfile
repo=pathlib.Path.cwd();root=pathlib.Path('/tmp/done-authority-read-20261012')
out=repo/'docs/performance-experiments/2026-10-12-authority-read'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
subprocess.run(['git','diff','--exit-code','b60d535d','--','src','account-protocol'],check=True)
source=[
 'src/crdt/accountReceive.ts','src/crdt/accountAuthority.ts','src/crdt/localGenesisRecord.ts',
 'src/crdt/startupStorage.ts','src/crdt/contentDatabase.ts','src/crdt/cpuBudget.ts','src/crdt/writeSession.ts',
 'src/crdt/accountCapture.ts','src/crdt/admissionQueue.ts','src/crdt/admittedWorkspace.ts',
 'src/ui/workspaceUi.tsx','src/ui/Card.tsx','src/ui/Goals.tsx','src/ui/Collection.tsx','src/ui/Menu.tsx',
 'docs/performance-experiments/2026-10-12-final-apply/probe/build.config.ts',
 'docs/performance-experiments/2026-10-12-prepared-receive/probe/build.config.ts',
 'docs/performance-experiments/2026-10-12-online-typing/probe/build.config.ts',
 'docs/performance-experiments/2026-10-12-owned-verification/probe/build.config.ts',
 'docs/performance-experiments/2026-10-12-warm-ledger/probe/build.config.ts',
 'docs/performance-experiments/2026-10-12-text-admission/probe/build.config.ts',
 'docs/performance-experiments/2026-10-12-receive-attribution/probe/runtime.mjs',
 'test/packaged-account/devices.ts','package.json','pnpm-lock.yaml','vite.config.ts',
]
fixtures=[pathlib.Path('/tmp/done-client-receive/fixture.json'),pathlib.Path('/tmp/done-online-typing-20261012/seed-matched-12000/fixture.json')]
identity={
 'base':subprocess.check_output(['git','rev-parse','b60d535d'],text=True).strip(),
 'runtimeDiff':'None. Diagnostic instrumentation exists only in the Vite probe transform.',
 'sourceAndHelpers':{p:sha(repo/p) for p in source},
 'probes':{str(p.relative_to(repo)):sha(p) for p in sorted((out/'probe').iterdir()) if p.is_file()},
 'build':{str(p.relative_to(root/'diagnostic')):sha(p) for p in sorted((root/'diagnostic').rglob('*')) if p.is_file()},
 'fixtureHashes':{str(p):sha(p) for p in fixtures},
 'environment':{'node':subprocess.check_output(['node','--version'],text=True).strip(),
  'platform':subprocess.check_output(['uname','-sm'],text=True).strip(),
  'playwright':json.loads((repo/'node_modules/@playwright/test/package.json').read_text())['version'],
  'buildFlags':{'VITE_ACCOUNT_LEDGER_PROFILE':'1','VITE_ACCOUNT_MEMBERSHIP_WORK':'unset (enabled)','VITE_ACCOUNT_BULK_CUSTODY':'unset (cursor)'},
  'receiverCpu':4,'artificialRequestDelayMs':75},
 'privacy':'No fixture contents, credentials, browser/service snapshots or writing retained.'}
(out/'source-identity.json').write_text(json.dumps(identity,indent=2)+'\n')
files=[root/n for n in ['build.log','build-final.log','probe-checks.log','profile-summary.log']]
for name in ['active-timing','backlog-timing','active-sampled','backlog-sampled']:
 files.append(root/f'{name}.log')
 files += [root/name/n for n in ['result.json','before-verification.json','analysis.json']]
 if name.endswith('sampled'):files += [root/name/n for n in ['typing.cpuprofile','profile-analysis.json']]
with tarfile.open(out/'evidence.tar.gz','w:gz') as archive:
 for p in files:archive.add(p,arcname=str(p.relative_to(root)))
manifest={'archive':'evidence.tar.gz','bytes':(out/'evidence.tar.gz').stat().st_size,'sha256':sha(out/'evidence.tar.gz'),
 'files':[{'path':str(p.relative_to(root)),'bytes':p.stat().st_size,'sha256':sha(p)} for p in files]}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
with tarfile.open(out/'evidence.tar.gz') as archive:
 for entry in manifest['files']:
  data=archive.extractfile(entry['path']).read()
  assert len(data)==entry['bytes'] and hashlib.sha256(data).hexdigest()==entry['sha256']
print('Verified',len(files),'evidence files;',manifest['bytes'],'archive bytes.')
