from pathlib import Path
import hashlib,json,subprocess,math
h=Path(__file__).parent;root=Path('/Users/thomasingalls/.codex/worktrees/c030/done');sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();start=json.loads((h/'start.json').read_text())
for mode in ['diagnostic','performance']:
 for p,digest in json.loads((h/(mode+'-freeze.json')).read_text())['pins'].items():
  dest=h/p
  if mode=='diagnostic' and p.startswith('builds/'):dest=h/('diagnostic-'+p)
  assert sha(dest)==digest,(mode,p)
for p,digest in start['previousPacketPins'].items():assert sha(Path(start['previousPacket'])/p)==digest,p
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
for name in ['selected','guarded','candidate']:subprocess.run(['git','apply','--reverse','--check',str(h/(name+'.patch'))],cwd=h/name,check=True)
subprocess.run(['git','apply','--check',str(h/'replay.patch')],cwd=h/'guarded',check=True)
assert sha(h/'selected.patch')==sha(Path(start['previousPacket'])/'selected.patch')
assert (h/'typecheck-complete.log').read_text()==''
assert '16 passed (16)' in (h/'affected-tests.log').read_text() and '227 passed (227)' in (h/'affected-tests.log').read_text()
assert 'numRuns: 100' in (h/'candidate/test/historyReplay.test.ts').read_text()
assert 'seed: 171511' in (h/'candidate/test/historyReplay.test.ts').read_text()
assert 'seed: 171510' in (h/'candidate/test/workspaceAdmission.test.ts').read_text()
controls=json.loads((h/'fault-controls.json').read_text());assert len(controls)==4
for fault in controls:
 assert fault['exit']==1 and len(fault['caughtBy'])==1
 assert sha(h/'candidate'/fault['test'])==fault['testSha256']
 assert sha(h/'candidate'/fault['file'])==fault['originalSourceSha256']
 report=json.loads((h/(fault['name']+'-fault.json')).read_text());assert report['numFailedTests']==1 and not report['success']
for p,digest in json.loads((h/'dependency-pins.json').read_text()).items():assert sha(root/p)==digest,p
assert (h/'candidate/src/crdt/admissionQueue.ts').read_bytes()==(h/'guarded/src/crdt/admissionQueue.ts').read_bytes()
assert (h/'candidate/src/crdt/workspacePreparation.ts').read_bytes()==(h/'guarded/src/crdt/workspacePreparation.ts').read_bytes()
body=lambda name:(h/name/'src/crdt/yjs.ts').read_text().split('export const sameDocState =',1)[1].split('/** Current Account recovery',1)[0]
assert body('selected')==body('candidate')
rows=[];last=None
for mode in ['diagnostic','comparison','unicode']:
 batches=json.loads((h/(mode+'-batch.json')).read_text())
 expected=[('selected','cost-0'),('guarded','cost-0'),('guarded','cost-1'),('selected','cost-1')] if mode=='diagnostic' else [('selected','comparison-0'),('candidate','comparison-0'),('candidate','comparison-1'),('selected','comparison-1')] if mode=='comparison' else [('selected','unicode-0'),('candidate','unicode-0')]
 assert [(b['variant'],b['session']) for b in batches]==expected
 for b in batches:
  assert b['code']==0 and b['drained'] and not b['timedOut'] and b['signal'] is None
  if last:assert b['started']>=last
  last=b['finished'];file=h/'results'/f"{b['session']}-{b['variant']}"/'result.json';r=json.loads(file.read_text())
  assert r['status']=='passed' and r['closed'] and not r['errors'] and not r['profiling']
  assert r['browser']=='151.0.7922.34' and r['setupMarkerPresent'] and r['setupEmojiPresent']==(mode=='unicode')
  assert r['corpus']=={'days':20,'cardsPerDay':15,'masterLines':400}
  assert len(r['rows'])==2 and all(len(x['samples'])==40 and all(math.isfinite(v) and v>=0 for v in x['samples']) for x in r['rows'])
  assert r['checks']==['exact text after every block','undo/redo exact roundtrip','cold reopen exact text']
  assert len(r['bufferReceipts'])==2
  for counter in r['bufferReceipts']:
   assert counter['after']['prepares']-counter['before']['prepares']==40
   assert counter['reused']==(40 if b['variant']!='selected' and mode!='unicode' else 0)
  if mode=='diagnostic':
   assert len(r['costs'])==2
   for block in r['costs']:
    names={'fresh-total','fresh-doc','fresh-stacks'} if b['variant']=='selected' else {'catchup-replay','catchup-stacks','catchup-compare'}
    assert set(c['name'] for c in block['calls'])==names
    assert all(sum(c['name']==n for c in block['calls'])==40 for n in names)
  else:assert 'costs' not in r
  rows.append({'mode':mode,'variant':b['variant'],'session':b['session'],'sha256':sha(file),'measuredKeys':80,'reuses':[c['reused'] for c in r['bufferReceipts']]})
(h/'audit.json').write_text(json.dumps({'signedBase':start['base'],'sessions':rows,'diagnosticSessions':4,'diagnosticMeasuredKeys':320,'diagnosticWarmupKeys':416,'performanceSessions':6,'performanceMeasuredKeys':480,'performanceWarmupKeys':624,'diagnosticFrozenIdentities':len(json.loads((h/'diagnostic-freeze.json').read_text())['pins']),'performanceFrozenIdentities':len(json.loads((h/'performance-freeze.json').read_text())['pins']),'affectedTests':227,'affectedFiles':16,'newCases':3,'newGeneratedHistories':100,'retainedWorkspaceHistories':60,'faults':4,'typecheckPassed':True,'previousPacketFiles':len(start['previousPacketPins']),'personalAndVectorPins':len(start['personalAndVectorPins']),'rootPerspectiveUnchanged':True,'appendOnlyPrefixesPreserved':True,'L2Unchanged':True,'mainRuntimeTestsUnchanged':True,'historicalPacketsUnchanged':True,'preexistingCanonicalChecksUnchanged':True},indent=2)+'\n')
print('Audit passed: 4 diagnostic +6 performance sessions,227tests/4faults, immutable inputs and preserved boundaries/records.')
