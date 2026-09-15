from pathlib import Path
import hashlib,json,subprocess,math
home=Path(__file__).parent
root=Path('/Users/thomasingalls/.codex/worktrees/c030/done')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
start=json.loads((home/'start.json').read_text())
frozen=json.loads((home/'frozen.json').read_text())
for p,h in frozen['pins'].items():assert sha(home/p)==h,p
for p,h in start['previousPacketPins'].items():assert sha(Path(start['previousPacket'])/p)==h,p
for row in start['personalAndVectorPins']:
 p=Path(row['path']);assert sha(p if p.is_absolute() else root/p)==row['sha256'],p
assert sha(root/'f17-perspective-55ab217e.md')==start['perspectiveSha256']
for p,h in json.loads((home/'control-inputs.json').read_text()).items():assert sha(root/p)==h,p
for p in ['docs/completed.md','docs/performance.md','docs/decisions.md']:
 old=subprocess.check_output(['git','show',start['base']+':'+p],cwd=root)
 assert (root/p).read_bytes().startswith(old),p
separator='\n---\n\n## Active slice: Stage 4'
assert (root/'docs/progress.md').read_text().split(separator,1)[1]==subprocess.check_output(['git','show',start['base']+':docs/progress.md'],cwd=root,text=True).split(separator,1)[1]
protected=['src','test','scripts','wasm','vite','public','private','account-protocol','account-service','relay','package.json','pnpm-lock.yaml','vite.config.ts','index.html','local.html']
assert not subprocess.check_output(['git','diff',start['base'],'--name-only','--',*protected],cwd=root)
assert not subprocess.check_output(['git','ls-files','--others','--exclude-standard','--',*protected],cwd=root)
assert not subprocess.check_output(['git','diff',start['base'],'--name-only','--','docs/performance-experiments'],cwd=root)
subprocess.run(['git','verify-commit',start['base']],cwd=root,check=True)
for name,patch in [('selected','selected.patch'),('candidate','candidate.patch')]:
 subprocess.run(['git','apply','--reverse','--check',str(home/patch)],cwd=home/name,check=True)
subprocess.run(['git','apply','--check',str(home/'incremental-publication.patch')],cwd=home/'selected',check=True)
assert sha(home/'selected.patch')==sha(Path(start['previousPacket'])/'candidate.patch')
assert (home/'typecheck-complete.log').read_text()==''
assert '12 passed (12)' in (home/'affected-tests.log').read_text() and '207 passed (207)' in (home/'affected-tests.log').read_text()
assert '1 passed (1)' in (home/'editor-final.log').read_text() and '11 passed (11)' in (home/'editor-final.log').read_text()
assert '123 passed (124)' in (home/'focused-initial.log').read_text()
assert 'undo' in (home/'history-count-repro.log').read_text()
assert sha(home/'before-count-repair-workspacePublication.ts')!=sha(home/'candidate/src/crdt/workspacePublication.ts')
test=(home/'candidate/test/workspacePublication.test.ts').read_text()
assert 'seed: 171509, numRuns: 60' in test
controls=json.loads((home/'fault-controls.json').read_text());assert len(controls)==3
for fault in controls:
 assert fault['exit']==1 and fault['caughtBy']
 assert sha(home/'candidate/test/workspacePublication.test.ts')==fault['testSha256']
 assert sha(home/'candidate/src/crdt/workspacePublication.ts')==fault['originalSourceSha256']
 r=json.loads((home/(fault['name']+'-fault.json')).read_text())
 assert r['numFailedTests']==1 and r['success']==False
 assert sha(home/(fault['name']+'-fault.ts'))!=fault['originalSourceSha256']
expected=[('selected','comparison-0'),('candidate','comparison-0'),('candidate','comparison-1'),('selected','comparison-1'),('selected','unicode-0'),('candidate','unicode-0')]
batches=sum([json.loads((home/f'{mode}-batch.json').read_text()) for mode in ['comparison','unicode']],[])
assert [(b['variant'],b['session']) for b in batches]==expected
last=None;rows=[]
for b in batches:
 assert b['code']==0 and b['drained'] and not b['timedOut'] and b['signal'] is None
 if last:assert b['started']>=last
 last=b['finished'];file=home/'results'/f"{b['session']}-{b['variant']}"/'result.json';r=json.loads(file.read_text())
 assert r['status']=='passed' and r['closed'] and not r['errors'] and not r['profiling']
 assert r['browser']=='151.0.7922.34' and r['setupMarkerPresent'] and r['setupEmojiPresent']==('unicode' in b['session'])
 assert r['corpus']=={'days':20,'cardsPerDay':15,'masterLines':400}
 assert len(r['rows'])==2 and all(len(x['samples'])==40 and all(math.isfinite(v) and v>=0 for v in x['samples']) for x in r['rows'])
 assert r['checks']==['exact text after every block','undo/redo exact roundtrip','cold reopen exact text']
 rows.append({'variant':b['variant'],'session':b['session'],'sha256':sha(file),'measuredKeys':80})
analysis=json.loads((home/'analysis.json').read_text())
assert analysis['sessions']==6 and analysis['measuredKeys']==480 and analysis['warmupKeys']==624
(home/'audit.json').write_text(json.dumps({'signedBase':start['base'],'sessions':rows,'measuredKeys':480,'warmupKeys':624,'sourceBundleAndHelpersUnchanged':len(frozen['pins']),'newTests':9,'newGeneratedHistories':60,'generatedSeed':171509,'affectedTests':218,'affectedFiles':13,'discriminatingFaults':3,'typecheckPassed':True,'previousPacketFiles':len(start['previousPacketPins']),'personalAndVectorPins':len(start['personalAndVectorPins']),'rootPerspectiveUnchanged':True,'appendOnlyPrefixesPreserved':True,'L2Unchanged':True,'mainRuntimeTestsUnchanged':True,'historicalPerformancePacketsUnchanged':True,'fixtureSetupFailureRetained':True,'historyCounterDefectAndRepairRetained':True,'selectedCombination':'R3 plus membership-repair eligibility; publication parked'},indent=2)+'\n')
print('Audit passed: six fixed sessions /480 keys; 218 tests; three discriminating faults; source/bundle/preservation checks pass.')
