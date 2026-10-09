from pathlib import Path
import json,hashlib,subprocess,math
root=Path('/Users/thomasingalls/.codex/worktrees/c030/done');here=Path(__file__).parent
sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
start=json.loads((here/'start.json').read_text());freeze=json.loads((here/'frozen-v2.json').read_text())
for f,h in freeze['files'].items():assert sha(here/f)==h,f
assert sha(here/'source.json')==freeze['sourceManifestSha256'];assert sha(here/'bundle.json')==freeze['bundleManifestSha256']
source=json.loads((here/'source.json').read_text());assert source['base']==start['base']
for f,h in source['hashes'].items():assert sha(here/'selected'/f)==h,f
for f,h in json.loads((here/'bundle.json').read_text()).items():assert sha(here/'builds/selected'/f)==h,f
for name in ['measure.mjs','recorder.mjs']:assert sha(here/name)==sha(Path(start['previousPacket'])/name)
for f,h in start['previousPacketPins'].items():assert sha(Path(start['previousPacket'])/f)==h,f
for row in start['personalAndVectorPins']:assert sha(Path(row['path']) if Path(row['path']).is_absolute() else root/row['path'])==row['sha256'],row['path']
assert sha(root/'f17-perspective-55ab217e.md')==sha(here/'perspective.md')==start['perspectiveSha256']
assert sha(here/'selected.patch')==start['selectedPatchSha256']
for name in ['completed.md','performance.md','decisions.md']:assert (root/'docs'/name).read_bytes().startswith(subprocess.check_output(['git','show',start['base']+':docs/'+name],cwd=root))
suffix=(root/'docs/progress.md').read_text().split('\n---\n\n## Active slice: Stage 4',1)[1];assert hashlib.sha256(suffix.encode()).hexdigest()==start['L2SuffixSha256']
assert not subprocess.check_output(['git','diff','--name-only',start['base'],'--','src','test','scripts','wasm','vite','package.json','pnpm-lock.yaml'],cwd=root)
subprocess.run(['git','verify-commit',start['base']],cwd=root,check=True)
subprocess.run(['git','apply','--reverse','--check',str(here/'selected.patch')],cwd=here/'selected',check=True)
expected=[(20,'retain',0),(20,'clear',0),(40,'clear',0),(40,'retain',0),(40,'retain',1),(40,'clear',1),(20,'clear',1),(20,'retain',1)]
batch=json.loads((here/'campaign-v2-batch.json').read_text());assert [(b['days'],b['condition'],b['block']) for b in batch]==expected
last=None;rows=[]
for b in batch:
 assert b['code']==0 and b['drained'] and not b['timedOut']
 if last:assert b['started']>=last
 last=b['finished'];p=here/'results'/b['session']/'result.json';r=json.loads(p.read_text())
 assert r['status']=='passed' and r['closed'] and not r['errors'] and not r['smoke']
 assert r['growthKeys']==1088 and r['browser']=='151.0.7922.34' and r['marker'] and r['emoji']
 assert r['protocol']=={'warm':8,'samplesPerBlock':80,'growth':1000,'cpu':4,'gapMs':50}
 assert len(r['rows'])==2 and all(len(x['samples'])==80 and all(math.isfinite(v) and v>=0 for v in x['samples']) for x in r['rows'])
 facts=r['facts'];assert facts['initial']['cards']==b['days']*15+1 and facts['initial']['days']==b['days']
 assert facts['grown']['undo']-facts['initial']['undo']==1000 and facts['earlyEnd']['undo']-facts['initial']['undo']==88
 assert facts['earlyEnd']['undo']-facts['earlyStart']['undo']==80 and facts['deepEnd']['undo']-facts['deepStart']['undo']==80
 assert facts['deepStart']['undo']==(8 if b['condition']=='clear' else facts['grown']['undo']+8)
 assert facts['reopened']['undo']==0
 if b['condition']=='clear':
  a,c=r['intervention']['before'],r['intervention']['after'];assert c['undo']==c['redo']==c['historyRanges']==0
  assert all(a[k]==c[k] for k in a if k not in ['undo','redo','historyRanges'])
 else:assert r['retained']==facts['grown']
 assert len(r['checks'])==5 and r['checks'][-2:]==['exact one-key undo/redo','cold reopen exact text']
 rows.append({'session':b['session'],'sha256':sha(p),'undo':[facts['deepStart']['undo'],facts['deepEnd']['undo']],'measuredKeys':160})
assert len(rows)==8
smoke=json.loads((here/'smoke-batch.json').read_text());assert len(smoke)==2 and all(b['code']==0 and b['drained'] for b in smoke)
for b in smoke:
 r=json.loads((here/'results'/b['session']/'result.json').read_text());assert r['status']=='passed' and r['closed'] and r['smoke']
original=json.loads((here/'campaign-batch.json').read_text());assert len(original)==1 and original[0]['code']==1 and original[0]['drained']
for f,h in json.loads((here/'attempt-1/result-pins.json').read_text()).items():assert sha(here/f)==h,f
repro=json.loads((here/'results/growth-setup-repro/result.json').read_text());assert repro['status']=='passed' and repro['closed'] and repro['facts']['grown']['undo']==1002
(here/'audit.json').write_text(json.dumps({'signedBase':start['base'],'campaignSessions':rows,'measuredKeys':1280,'untimedSetupAndWarmupKeys':7424,'smokeSessions':2,'standaloneReproductionPassed':True,'originalFailedSessionRetained':True,'sourceAndBundleUnchanged':True,'previousPacketFiles':len(start['previousPacketPins']),'personalAndVectorPins':len(start['personalAndVectorPins']),'rootPerspectiveUnchanged':True,'appendOnlyPrefixesPreserved':True,'L2Unchanged':True,'mainRuntimeTestsUnchanged':True},indent=2)+'\n')
print('Audit passed:8 fixed sessions,1280 measured keys; both smoke branches and original failure/reproduction retained; source/bundle/preservation checks pass.')
