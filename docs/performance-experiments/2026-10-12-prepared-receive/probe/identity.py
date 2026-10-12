import pathlib,json,hashlib,subprocess
repo=pathlib.Path.cwd(); root=pathlib.Path('/tmp/done-prepared-receive-20261012'); out=repo/'docs/performance-experiments/2026-10-12-prepared-receive'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
paths=['src/crdt/accountCapture.ts','src/crdt/accountReceive.ts','src/crdt/admissionQueue.ts','src/crdt/verifiedRecords.ts','src/crdt/cpuBudget.ts']
old=json.loads((repo/'docs/performance-experiments/2026-10-12-authority-reuse/source-identity.json').read_text())
fixturePaths=[pathlib.Path('/tmp/done-online-typing-20261012/seed-matched-12000/fixture.json'),pathlib.Path('/tmp/done-client-receive/fixture.json')]
x={'base':subprocess.check_output(['git','rev-parse','08a82089'],text=True).strip(),'reference':'Same source with VITE_ACCOUNT_PREPARED_RECEIVE=0 and VITE_ACCOUNT_CPU_YIELD=0; not a byte-identical base rebuild.','candidate':'Default prepared content handoff and cooperative Account tasks','source':{p:sha(repo/p) for p in paths},'probeBuild':{arm:{str(p.relative_to(root/arm)):sha(p) for p in sorted((root/arm).rglob('*')) if p.is_file()} for arm in ['reference','candidate']},'fixtures':{str(p):sha(p) for p in fixturePaths},'probe':{str(p.relative_to(repo)):sha(p) for p in sorted((out/'probe').iterdir()) if p.is_file()},'environment':old.get('environment',{}),'sharedHelpers':{p:sha(repo/p) for p in old['sharedHelpers']},'buildEnvironment':{'VITE_ACCOUNT_LEDGER_PROFILE':'1','referenceOnly':{'VITE_ACCOUNT_PREPARED_RECEIVE':'0','VITE_ACCOUNT_CPU_YIELD':'0'}},'serviceSource':{str(p):sha(p) for p in [pathlib.Path('scripts/serve-account-service.mjs'),pathlib.Path('scripts/serve-account.mjs'),pathlib.Path('pnpm-lock.yaml')]}}
(out/'source-identity.json').write_text(json.dumps(x,indent=2)+'\n')
paths+=['test/admissionQueue.test.ts','test/cpuBudget.test.ts','test/workspaceAdmission.test.ts','test/account-receive-editor/fixtures.mjs','test/account-receive-editor/native.test.mjs','test/account-receive-editor/prepared.test.mjs']
patch=subprocess.run(['git','diff','08a82089','--',*paths],capture_output=True,text=True).stdout
for f in paths:
 if subprocess.run(['git','ls-files','--error-unmatch',f],capture_output=True).returncode:
  patch+=subprocess.run(['git','diff','--no-index','--','/dev/null',f],capture_output=True,text=True).stdout
(root/'candidate.patch').write_text(patch)
