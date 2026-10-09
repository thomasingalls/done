from pathlib import Path
import hashlib,json,subprocess,math
home=Path(__file__).parent;root=Path('/Users/thomasingalls/.codex/worktrees/c030/done');sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
start=json.loads((home/'start.json').read_text())
for folder,manifest in [(home,'frozen-final.json'),(home/'before-retention-repair','frozen.json')]:
 pins=json.loads((folder/manifest).read_text())['pins']
 for p,h in pins.items():assert sha(folder/p)==h,p
for p,h in start['previousPacketPins'].items():assert sha(Path(start['previousPacket'])/p)==h,p
for row in start['personalAndVectorPins']:
 p=Path(row['path']);assert sha(p if p.is_absolute() else root/p)==row['sha256'],p
assert sha(root/'f17-perspective-55ab217e.md')==start['perspectiveSha256']
for p in ['docs/completed.md','docs/performance.md','docs/decisions.md']:
 old=subprocess.check_output(['git','show',start['base']+':'+p],cwd=root);assert (root/p).read_bytes().startswith(old),p
sep='\n---\n\n## Active slice: Stage 4'
assert (root/'docs/progress.md').read_text().split(sep,1)[1]==subprocess.check_output(['git','show',start['base']+':docs/progress.md'],cwd=root,text=True).split(sep,1)[1]
protected=['src','test','scripts','wasm','vite','public','private','account-protocol','account-service','relay','package.json','pnpm-lock.yaml','vite.config.ts','index.html','local.html']
assert not subprocess.check_output(['git','diff',start['base'],'--name-only','--',*protected],cwd=root)
assert not subprocess.check_output(['git','ls-files','--others','--exclude-standard','--',*protected],cwd=root)
assert not subprocess.check_output(['git','diff',start['base'],'--name-only','--','docs/performance-experiments'],cwd=root)
subprocess.run(['git','verify-commit',start['base']],cwd=root,check=True)
for name,patch in [('selected','selected.patch'),('candidate','candidate.patch')]:subprocess.run(['git','apply','--reverse','--check',str(home/patch)],cwd=home/name,check=True)
subprocess.run(['git','apply','--check',str(home/'persistent-buffers.patch')],cwd=home/'selected',check=True)
assert sha(home/'selected.patch')==sha(Path(start['previousPacket'])/'selected.patch')
assert (home/'typecheck-retention-final.log').read_text()==''
assert '14 passed (14)' in (home/'affected-tests.log').read_text() and '213 passed (213)' in (home/'affected-tests.log').read_text()
assert '11 passed (11)' in (home/'editor-tests.log').read_text()
assert '121 passed (121)' in (home/'retention-repair-tests.log').read_text()
assert 'numRuns: 60' in (home/'candidate/test/workspaceAdmission.test.ts').read_text()
assert 'seed: 171510' in (home/'candidate/test/workspaceAdmission.test.ts').read_text()
assert 'lastAdopted' not in (home/'candidate/src/crdt/workspacePreparation.ts').read_text()
assert 'lastAdopted' in (home/'before-retention-repair/candidate/src/crdt/workspacePreparation.ts').read_text()
controls=json.loads((home/'fault-controls.json').read_text());assert len(controls)==3
for fault in controls:
 assert fault['exit']==1 and len(fault['caughtBy'])==1
 assert sha(home/'candidate'/fault['test'])==fault['testSha256']
 assert sha(home/'candidate'/fault['file'])==fault['originalSourceSha256']
 report=json.loads((home/(fault['name']+'-fault.json')).read_text());assert report['numFailedTests']==1 and not report['success']
values=json.loads((home/'normalization-values.json').read_text());assert values[0]['sourceNegativeZero'] and values[0]['forkNegativeZero']
assert all(v['sourceKeys']!=v['forkKeys'] for v in values[1:])
assert ',value: expected true to be false' in (home/'normalization-shape-before.log').read_text()
rows=[]
for phase,prefix in [('before-repair',''),('final','final-')]:
 expected=[('selected',prefix+'comparison-0'),('candidate',prefix+'comparison-0'),('candidate',prefix+'comparison-1'),('selected',prefix+'comparison-1')]
 batches=json.loads((home/(prefix+'comparison-batch.json')).read_text())
 if phase=='final':
  expected += [('selected','final-unicode-0'),('candidate','final-unicode-0')]
  batches+=json.loads((home/'final-unicode-batch.json').read_text())
 assert [(b['variant'],b['session']) for b in batches]==expected
 last=None
 for b in batches:
  assert b['code']==0 and b['drained'] and not b['timedOut'] and b['signal'] is None
  if last:assert b['started']>=last
  last=b['finished'];file=home/'results'/f"{b['session']}-{b['variant']}"/'result.json';r=json.loads(file.read_text())
  assert r['status']=='passed' and r['closed'] and not r['errors'] and not r['profiling']
  assert r['browser']=='151.0.7922.34' and r['setupMarkerPresent'] and r['setupEmojiPresent']==('unicode' in b['session'])
  assert r['corpus']=={'days':20,'cardsPerDay':15,'masterLines':400}
  assert len(r['rows'])==2 and all(len(x['samples'])==40 and all(math.isfinite(v) and v>=0 for v in x['samples']) for x in r['rows'])
  assert r['checks']==['exact text after every block','undo/redo exact roundtrip','cold reopen exact text']
  assert len(r['bufferReceipts'])==2
  for counter in r['bufferReceipts']:
   assert counter['after']['prepares']-counter['before']['prepares']>=40
   if b['variant']=='candidate' and not r['unicode']:assert counter['reused']>=40
   else:assert counter['reused']==0
  if phase=='before-repair':assert sha(file)==sha(home/'before-retention-repair'/file.relative_to(home))
  rows.append({'phase':phase,'variant':b['variant'],'session':b['session'],'sha256':sha(file),'measuredKeys':80,'reuses':[c['reused'] for c in r['bufferReceipts']]})
(home/'audit.json').write_text(json.dumps({'signedBase':start['base'],'sessions':rows,'finalSessions':6,'finalMeasuredKeys':480,'finalWarmupKeys':624,'beforeRepairSessions':4,'beforeRepairMeasuredKeys':320,'beforeRepairWarmupKeys':416,'finalFrozenIdentities':len(json.loads((home/'frozen-final.json').read_text())['pins']),'affectedTests':224,'affectedFiles':15,'newTests':14,'newGeneratedHistories':60,'generatedSeed':171510,'retentionRepairRepeatTests':121,'faults':3,'typecheckPassed':True,'previousPacketFiles':len(start['previousPacketPins']),'personalAndVectorPins':len(start['personalAndVectorPins']),'rootPerspectiveUnchanged':True,'appendOnlyPrefixesPreserved':True,'L2Unchanged':True,'mainRuntimeTestsUnchanged':True,'historicalPacketsUnchanged':True},indent=2)+'\n')
print('Audit passed: final6 + original4 sessions, actual reuse/fallback receipts,224 tests,3 faults and all preservation checks.')
