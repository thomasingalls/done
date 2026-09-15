from pathlib import Path
import hashlib,json,subprocess,math
home=Path(__file__).parent;root=Path('/Users/thomasingalls/.codex/worktrees/c030/done');sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
start=json.loads((home/'start.json').read_text());frozen=json.loads((home/'frozen-native.json').read_text())
for manifest in [frozen,json.loads((home/'frozen.json').read_text())]:
 for p,h in manifest['pins'].items():assert sha(home/p)==h,p
for p,h in start['previousPacketPins'].items():assert sha(Path(start['previousPacket'])/p)==h,p
for row in start['personalAndVectorPins']:assert sha(Path(row['path']) if Path(row['path']).is_absolute() else root/row['path'])==row['sha256'],row['path']
prior=json.loads((Path(start['previousPacket'])/'start.json').read_text());assert sha(root/'f17-perspective-55ab217e.md')==prior['perspectiveSha256']
for p in ['docs/completed.md','docs/performance.md','docs/decisions.md']:
 old=subprocess.check_output(['git','show',start['base']+':'+p],cwd=root);assert (root/p).read_bytes().startswith(old),p
separator='\n---\n\n## Active slice: Stage 4'
assert (root/'docs/progress.md').read_text().split(separator,1)[1]==subprocess.check_output(['git','show',start['base']+':docs/progress.md'],cwd=root,text=True).split(separator,1)[1]
assert not subprocess.check_output(['git','diff',start['base'],'--name-only','--','src','test','scripts','wasm','vite','public','private','account-protocol','account-service','package.json','pnpm-lock.yaml'],cwd=root)
subprocess.run(['git','verify-commit',start['base']],cwd=root,check=True)
for name,patch in [('selected','selected.patch'),('candidate','candidate.patch')]:subprocess.run(['git','apply','--reverse','--check',str(home/patch)],cwd=home/name,check=True)
subprocess.run(['git','apply','--check',str(home/'membership-eligibility.patch')],cwd=home/'selected',check=True)
assert (home/'typecheck-final.log').read_text()==(home/'typecheck-status.log').read_text()==''
assert '9 passed (9)' in (home/'affected-tests.log').read_text() and '176 passed (176)' in (home/'affected-tests.log').read_text()
assert '18 passed (18)' in (home/'focused-final.log').read_text()
controls=json.loads((home/'fault-controls-final.json').read_text());assert len(controls)==2
for fault in controls:
 assert fault['exit']==1 and len(fault['caughtBy'])==4
 assert sha(home/'candidate/test/membershipEligibility.test.ts')==fault['testSha256']
 file='admittedWorkspace.ts' if fault['fault'].startswith('no-remote') else 'workspaceCommands.ts'
 assert sha(home/'candidate/src/crdt'/file)==fault['originalSourceSha256']
expected=[('selected','native-comparison-0'),('candidate','native-comparison-0'),('candidate','native-comparison-1'),('selected','native-comparison-1'),('selected','native-unicode-0'),('candidate','native-unicode-0')]
batches=sum([json.loads((home/f'native-{mode}-batch.json').read_text()) for mode in ['comparison','unicode']],[])
assert [(b['variant'],b['session']) for b in batches]==expected
last=None;rows=[]
for b in batches:
 assert b['code']==0 and b['drained'] and not b['timedOut']
 if last:assert b['started']>=last
 last=b['finished'];file=home/'results'/f"{b['session']}-{b['variant']}"/'result.json';r=json.loads(file.read_text())
 assert r['status']=='passed' and r['closed'] and not r['errors'] and not r['profiling']
 assert r['browser']=='151.0.7922.34' and r['setupMarkerPresent'] and r['setupEmojiPresent']==('unicode' in b['session'])
 assert len(r['rows'])==2 and all(len(x['samples'])==40 and all(math.isfinite(v) and v>=0 for v in x['samples']) for x in r['rows'])
 assert r['checks']==['exact text after every block','undo/redo exact roundtrip','cold reopen exact text']
 rows.append({'variant':b['variant'],'session':b['session'],'sha256':sha(file),'measuredKeys':80})
original=json.loads((home/'comparison-batch.json').read_text());assert len(original)==1 and original[0]['code']==1 and original[0]['drained']
assert 'listen EPERM' in (home/'comparison-batch.log').read_text() and not (home/'results/comparison-0-selected/result.json').exists()
(home/'audit.json').write_text(json.dumps({'signedBase':start['base'],'sessions':rows,'measuredKeys':480,'warmupKeys':624,'sourceBundleAndHelpersUnchanged':len(frozen['pins']),'focusedTests':18,'generatedHistories':60,'affectedTests':176,'affectedFiles':9,'discriminatingFaults':2,'ownerModesPerFault':4,'typecheckPassed':True,'previousPacketFiles':len(start['previousPacketPins']),'personalAndVectorPins':len(start['personalAndVectorPins']),'rootPerspectiveUnchanged':True,'appendOnlyPrefixesPreserved':True,'L2Unchanged':True,'mainRuntimeTestsUnchanged':True,'originalLaunchFailureRetained':True},indent=2)+'\n')
print('Audit passed: six fixed sessions /480 measured keys; two faults caught in four modes; source/bundle/preservation checks pass.')
