import pathlib,json,hashlib,subprocess
repo=pathlib.Path.cwd(); root=pathlib.Path('/tmp/done-authority-reuse-20261012'); out=repo/'docs/performance-experiments/2026-10-12-authority-reuse'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
paths=['src/crdt/accountAuthority.ts','src/crdt/accountAuthorityInventory.ts','src/crdt/accountCapture.ts','src/crdt/accountReceive.ts','src/crdt/accountLedgerMetrics.ts','src/crdt/joinedAccount.ts','src/crdt/promotionRecord.ts']
old=json.loads((repo/'docs/performance-experiments/2026-10-12-owned-reservations/source-identity.json').read_text())
fixturePaths=[pathlib.Path('/tmp/done-online-typing-20261012/seed-matched-12000/fixture.json'),pathlib.Path('/tmp/done-client-receive/fixture.json')]
x={'base':subprocess.check_output(['git','rev-parse','9bf9f3c6'],text=True).strip(),'reference':'Same source with VITE_ACCOUNT_AUTHORITY_REUSE=0; shared full-reader factoring and numeric instrumentation. Not a byte-identical base rebuild.','candidate':'Default unchanged-authority reuse','source':{p:sha(repo/p) for p in paths},'probeBuild':{arm:{str(p.relative_to(root/arm)):sha(p) for p in sorted((root/arm).rglob('*')) if p.is_file()} for arm in ['reference','candidate']},'fixtures':{str(p):sha(p) for p in fixturePaths},'probe':{str(p.relative_to(repo)):sha(p) for p in sorted((out/'probe').iterdir()) if p.is_file()},'environment':old.get('environment',{}),'sharedHelpers':{p:sha(repo/p) for p in old['sharedHelpers']},'buildEnvironment':{'VITE_ACCOUNT_LEDGER_PROFILE':'1','referenceOnly':'VITE_ACCOUNT_AUTHORITY_REUSE=0'},'serviceSource':{str(p):sha(p) for p in [pathlib.Path('scripts/serve-account-service.mjs'),pathlib.Path('scripts/serve-account.mjs'),pathlib.Path('pnpm-lock.yaml')]}}
(out/'source-identity.json').write_text(json.dumps(x,indent=2)+'\n')
p=subprocess.run(['git','diff','9bf9f3c6','--',*paths,'test/accountAuthority.test.ts','test/account-sync/native.test.mjs','test/account-sync/fixtures.mjs','test/packaged-account/membership-custody.spec.ts'],capture_output=True,text=True)
patch=p.stdout
for f in ['src/crdt/accountAuthority.ts','src/crdt/accountAuthorityInventory.ts','test/accountAuthority.test.ts']:
 if subprocess.run(['git','ls-files','--error-unmatch',f],capture_output=True).returncode:
  patch+=subprocess.run(['git','diff','--no-index','--','/dev/null',f],capture_output=True,text=True).stdout
(root/'candidate.patch').write_text(patch)
