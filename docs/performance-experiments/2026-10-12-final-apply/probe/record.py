"""Retain numeric-only diagnostic evidence and pin its inputs; no private fixture state."""
import pathlib,json,hashlib,subprocess,tarfile
repo=pathlib.Path.cwd();root=pathlib.Path('/tmp/done-final-apply-20261012');out=repo/'docs/performance-experiments/2026-10-12-final-apply'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
paths=subprocess.check_output(['git','ls-files','src','account-protocol','account-service','scripts','pnpm-lock.yaml','package.json','vite.config.ts'],text=True).splitlines()
shared=[
 'docs/performance-experiments/2026-10-12-prepared-receive/probe/build.config.ts',
 'docs/performance-experiments/2026-10-12-prepared-receive/probe/profile.mjs',
 'docs/performance-experiments/2026-10-12-prepared-receive/probe/attribute.mjs',
 'docs/performance-experiments/2026-10-12-online-typing/probe/build.config.ts',
 'docs/performance-experiments/2026-10-12-owned-verification/probe/build.config.ts',
 'docs/performance-experiments/2026-10-12-warm-ledger/probe/build.config.ts',
 'docs/performance-experiments/2026-10-12-text-admission/probe/build.config.ts',
 'docs/performance-experiments/2026-10-12-receive-attribution/probe/runtime.mjs',
 'test/packaged-account/devices.ts']
fixtures=['/tmp/done-client-receive/fixture.json','/tmp/done-online-typing-20261012/seed-matched-12000/fixture.json']
identities={
 'base':subprocess.check_output(['git','rev-parse','02829405'],text=True).strip(),
 'runtimeDiff':subprocess.check_output(['git','diff','02829405','--','src','account-protocol','account-service','scripts'],text=True),
 'source':{p:sha(repo/p) for p in paths if (repo/p).is_file()},
 'probe':{str(p.relative_to(repo)):sha(p) for p in sorted((out/'probe').iterdir()) if p.is_file()},
 'sharedHelpers':{p:sha(repo/p) for p in shared},
 'build':{str(p.relative_to(root/'attributed')):sha(p) for p in sorted((root/'attributed').rglob('*')) if p.is_file()},
 'fixtures':{p:sha(pathlib.Path(p)) for p in fixtures},
 'buildEnvironment':{'VITE_ACCOUNT_LEDGER_PROFILE':'1','preparedHandoff':'default','cpuYield':'default','authorityReuse':'default'},
 'environment':{'node':subprocess.check_output(['node','--version'],text=True).strip(),'platform':subprocess.check_output(['uname','-sm'],text=True).strip()},
 'logs':'Source values and service/browser snapshots excluded; only fixture hashes retained.'}
(out/'source-identity.json').write_text(json.dumps(identities,indent=2)+'\n')
files=[root/'build-api-failure.log',root/'build.log']
for name in ['active-1','backlog-1','backlog-2-profile','active-2-profile']:
 files.append(root/f'{name}.log')
 for leaf in ['result.json','before-verification.json','analysis.json','analysis.log','typing.cpuprofile','profile.json','attribution.json']:
  p=root/name/leaf
  if p.exists():files.append(p)
with tarfile.open(out/'evidence.tar.gz','w:gz') as archive:
 for p in files:archive.add(p,arcname=str(p.relative_to(root)))
manifest={'archive':'evidence.tar.gz','bytes':(out/'evidence.tar.gz').stat().st_size,'sha256':sha(out/'evidence.tar.gz'),'files':[{'path':str(p.relative_to(root)),'bytes':p.stat().st_size,'sha256':sha(p)} for p in files]}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
with tarfile.open(out/'evidence.tar.gz') as archive:
 for entry in manifest['files']:
  data=archive.extractfile(entry['path']).read()
  assert len(data)==entry['bytes'] and hashlib.sha256(data).hexdigest()==entry['sha256']
assert not identities['runtimeDiff']
print('Verified',len(files),'evidence files,',manifest['bytes'],'archive bytes; production source unchanged.')
