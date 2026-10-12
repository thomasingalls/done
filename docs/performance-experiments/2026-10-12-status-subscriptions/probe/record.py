"""Explicit numeric/check evidence allowlist; never retain fixture/custody contents."""
import hashlib,json,pathlib,subprocess,tarfile
repo=pathlib.Path.cwd();root=pathlib.Path('/tmp/done-status-subscriptions-20261012')
out=repo/'docs/performance-experiments/2026-10-12-status-subscriptions'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
base=subprocess.check_output(['git','rev-parse','e730ac57'],text=True).strip()
changed=subprocess.check_output(['git','diff','--name-only',base,'--','src','account-protocol'],text=True).splitlines()
assert set(changed)=={'src/ui/workspaceUi.tsx','src/ui/Goals.tsx'},changed
measured=json.loads((root/'measured-source.json').read_text())
for p,h in measured.items():
 current=(repo/p).read_bytes()
 if hashlib.sha256(current).hexdigest()!=h:
  assert p=='src/ui/workspaceUi.tsx'
  comments=b'  // Reset cancellation on owner replacement, not on revision changes.\n  // eslint-disable-next-line react-hooks/exhaustive-deps\n'
  assert current.count(comments)==1
  assert hashlib.sha256(current.replace(comments,b'')).hexdigest()==h,'Executable source changed after measurement'
cosmetic=json.loads((root/'cosmetic-build-check.json').read_text())
assert cosmetic['identicalExecutableAssets'] and cosmetic['measured']==cosmetic['final']
phoneCopies={}
for arm in ['reference','candidate']:
 for p in (root/arm).rglob('*'):
  if p.is_file():assert sha(p)==sha(root/('phone-'+arm+'-dist')/p.relative_to(root/arm))
 phoneCopies[arm]='All reference/candidate files identical; only an additional blank setup HTML file.'
source=['test/workspaceUiStatus.test.tsx','test/syncNotice.test.tsx','test/admittedEditorProjection.test.ts','src/crdt/accountReceive.ts','src/crdt/accountAuthority.ts','src/crdt/admissionQueue.ts','src/crdt/admittedWorkspace.ts','src/crdt/startupStorage.ts','src/ui/workspaceUi.tsx','src/ui/Goals.tsx','src/ui/Card.tsx','src/ui/Menu.tsx','src/ui/Collection.tsx','vite.config.ts','package.json','pnpm-lock.yaml','test/packaged-account/devices.ts']
helpers=[f'docs/performance-experiments/{phase}/probe/build.config.ts' for phase in ['2026-10-12-authority-read','2026-10-12-final-apply','2026-10-12-prepared-receive','2026-10-12-online-typing','2026-10-12-owned-verification','2026-10-12-warm-ledger','2026-10-12-text-admission']]+['docs/performance-experiments/2026-10-12-receive-attribution/probe/runtime.mjs']
identity={'base':base,'runtimeDiff':changed,'measuredRuntimeHashes':measured,'postMeasurementChange':'Two lint comments only; rebuilt executable assets are byte-identical.','sourceAndHelpers':{p:sha(repo/p) for p in source+helpers},'probes':{str(p.relative_to(repo)):sha(p) for p in sorted((out/'probe').iterdir()) if p.is_file()},'builds':{arm:{str(p.relative_to(root/arm)):sha(p) for p in sorted((root/arm).rglob('*')) if p.is_file()} for arm in ['reference','candidate','history-authority','history-handoff']},'fixtureHashes':{str(p):sha(p) for p in [pathlib.Path('/tmp/done-client-receive/fixture.json'),pathlib.Path('/tmp/done-online-typing-20261012/seed-matched-12000/fixture.json')]},'environment':{'node':subprocess.check_output(['node','--version'],text=True).strip(),'platform':subprocess.check_output(['uname','-sm'],text=True).strip(),'playwright':json.loads((repo/'node_modules/@playwright/test/package.json').read_text())['version'],'buildFlags':{'VITE_ACCOUNT_LEDGER_PROFILE':'1','STATUS_ARM':'reference/candidate'},'receiverCpu':4,'artificialRequestDelayMs':75},'phoneBuildCopies':phoneCopies,'phone':{'model':'Pixel 9a','android':'17','comparison':'pending: desktop virtual passkey unavailable on phone; no account typing samples','calibration':'passed'},'historyReferences':{r:subprocess.check_output(['git','rev-parse',r],text=True).strip() for r in ['08a82089','02829405']},'privacy':'Only numeric timings, aggregate protocol counters, synthetic-test hashes and check logs. No browser/service snapshots, writing, credentials or fixture contents.'}
(out/'source-identity.json').write_text(json.dumps(identity,indent=2)+'\n')
files=[];redactions=[]
for name in ['build-reference.log','build-candidate.log','typecheck.log','units.log','focused.log','lint.log','format.log','ordinary-build.log','budget.log','calibration.log','calibration-native.log','runs.log','measured-runtime.patch','measured-source.json','phone-runs.log','history-runs.log','history-build-inputs.log','build-history-authority.log','build-history-handoff.log','lint-final.log','build-candidate-final.log','cosmetic-build-check.json','check-storage-codec-sanitized.log']:
 if (root/name).exists():files.append(root/name)
for p in sorted(root.glob('*/result.json')):
 if p.parent.name in ['reference','candidate']:continue
 evidence=p
 data=json.loads(p.read_text())
 if 'setupDiagnostic' in data:
  original=data['setupDiagnostic'] or {}
  data['setupDiagnostic']={k:v for k,v in original.items() if k not in ['buttons','messages']}
  data['setupDiagnostic']['buttonCount']=len(original.get('buttons',[]))
  data['setupDiagnostic']['messageCount']=len(original.get('messages',[]))
  evidence=p.parent/'result.evidence.json';evidence.write_text(json.dumps(data,indent=2)+'\n')
  redactions.append({'source':str(p.relative_to(root)),'sourceSha256':sha(p),'retained':str(evidence.relative_to(root)),'omitted':'Synthetic setup button/message text; includes fixture workspace ID.'})
 files.append(evidence)
 for name in ['analysis.json','calibration.json']:
  if (p.parent/name).exists():files.append(p.parent/name)
 if (root/(p.parent.name+'.log')).exists():files.append(root/(p.parent.name+'.log'))
 # Host process metadata stays local. Retain only load/thermal/clock data.
 env=root/(p.parent.name+'.environment.json')
 if env.exists():
  data=json.loads(env.read_text());data.pop('processes',None)
  clean=p.parent/'environment.json';clean.write_text(json.dumps(data,indent=2)+'\n');files.append(clean)
for p in root.glob('*/calibration.json'):
 if p not in files:files.append(p)
for p in root.glob('phone-*.log'):
 if p not in files:files.append(p)
with tarfile.open(out/'evidence.tar.gz','w:gz') as archive:
 for p in files:archive.add(p,arcname=str(p.relative_to(root)))
manifest={'archive':'evidence.tar.gz','bytes':(out/'evidence.tar.gz').stat().st_size,'sha256':sha(out/'evidence.tar.gz'),'redactions':redactions,'files':[{'path':str(p.relative_to(root)),'bytes':p.stat().st_size,'sha256':sha(p)} for p in files]}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
with tarfile.open(out/'evidence.tar.gz') as archive:
 for entry in manifest['files']:
  data=archive.extractfile(entry['path']).read();assert len(data)==entry['bytes'] and hashlib.sha256(data).hexdigest()==entry['sha256']
print('Verified',len(files),'evidence files;',manifest['bytes'],'archive bytes.')
