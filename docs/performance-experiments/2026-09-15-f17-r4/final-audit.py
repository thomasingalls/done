from pathlib import Path
import hashlib,json,math,subprocess
root=Path('/Users/thomasingalls/.codex/worktrees/c030/done');here=Path(__file__).parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
start=json.loads((here/'start.json').read_text());base=start['base']
commands=[]
def check(args,cwd=root):
 r=subprocess.run(args,cwd=cwd,text=True,capture_output=True)
 commands.append({'args':args,'cwd':str(cwd),'exitCode':r.returncode,'stdout':r.stdout,'stderr':r.stderr})
 assert r.returncode==0,commands[-1]
 return r.stdout
assert check(['git','rev-parse','HEAD']).strip()==base
check(['git','verify-commit',base]);check(['git','diff','--check'])
check(['git','apply','--check',str(here/'candidate.patch')])
check(['git','apply','--reverse','--check',str(here/'candidate.patch')],here/'candidate')
check(['git','apply','--check',str(here/'ui-index.patch')],here/'selected')
check(['git','apply','--reverse','--check',str(Path(start['previousPacket'])/'candidate.patch')],here/'selected')
assert not check(['git','diff','--name-only',base,'--','src','test','scripts','wasm','vite','package.json','pnpm-lock.yaml'])
for name in ['screen.mjs','measure.mjs','recorder.mjs']:
 assert sha(here/name)==sha(Path(start['previousPacket'])/name),name
for name in ['selected','candidate']:
 source=json.loads((here/'builds'/f'{name}-source.json').read_text())
 assert source['base']==base
 for f,h in source['hashes'].items():assert sha(here/name/f)==h,(name,f)
 for f,h in json.loads((here/'builds'/f'{name}-bundle.json').read_text()).items():assert sha(here/'builds'/name/f)==h,(name,f)
a=json.loads((here/'builds/selected-source.json').read_text())['hashes'];b=json.loads((here/'builds/candidate-source.json').read_text())['hashes']
assert a.keys()==b.keys()
changed=sorted(f for f in a if a[f]!=b[f]);assert changed==['src/ui/Collection.tsx','src/ui/workspaceUi.tsx'],changed
verification=json.loads((here/'candidate-verification.json').read_text())
for f,h in verification['sourceHashes'].items():assert sha(here/'candidate'/f)==h,f
faults=json.loads((here/'fault-controls.json').read_text());assert faults['sourceRestored']
assert len(faults['records'])==2 and all(r['exitCode']==1 for r in faults['records'])
assert sha(here/'candidate/src/ui/workspaceUi.tsx')==faults['sourceSha256']
expected=[('selected','comparison-0'),('candidate','comparison-0'),('candidate','comparison-1'),('selected','comparison-1'),('selected','unicode-0'),('candidate','unicode-0')]
batch=json.loads((here/'comparison-batch.json').read_text())+json.loads((here/'unicode-batch.json').read_text())
assert [(r['variant'],r['session']) for r in batch]==expected
assert len(list((here/'results').iterdir()))==6
last=None;observed=[]
for r in batch:
 assert r['code']==0
 if last:assert r['started']>=last
 last=r['finished']
 f=here/'results'/f"{r['session']}-{r['variant']}"/'result.json';v=json.loads(f.read_text())
 assert v['status']=='passed' and v['closed'] and not v['errors'] and not v['profiling']
 assert (v['name'],v['session'])==(r['variant'],r['session'])
 assert v['corpus']=={'days':20,'cardsPerDay':15,'masterLines':400}
 assert v['setupMarkerPresent'] and v['setupEmojiPresent']==v['unicode']==r['session'].startswith('unicode')
 assert v['browser']=='151.0.7922.34'
 assert v['checks']==['exact text after every block','undo/redo exact roundtrip','cold reopen exact text']
 assert [row['block'] for row in v['rows']]==['shallow','deeper']
 assert all(len(row['samples'])==40 and all(math.isfinite(x) and x>=0 for x in row['samples']) for row in v['rows'])
 observed.append({'path':str(f.relative_to(here)),'sha256':sha(f),'status':v['status'],'closed':v['closed'],'measuredKeys':sum(len(row['samples']) for row in v['rows'])})
assert sum(v['measuredKeys'] for v in observed)==480
# The unchanged helper runs 8 initial and96 additional warmup keys for each completed non-profile session.
screen=(here/'screen.mjs').read_text();assert "await type('w',8)" in screen and "if(block==='deeper')await type('h',96)" in screen
assert not list((here/'results').rglob('timeout.json'))
report={'signedBase':base,'sessions':observed,'measuredKeys':480,'warmupKeysFromCompletedHelper':624,'commonHelpersMatchR3':True,'buildInputsAndOutputsUnchanged':True,'sourceBoundary':changed,'testsAndRuntimeMatchVerification':True,'patchForwardAndReverseChecks':True,'mainRuntimeTestsUnchanged':True,'commands':commands}
(here/'final-audit.json').write_text(json.dumps(report,indent=2)+'\n')
print('Audit passed: signed base,6 closed sessions,480 measured keys,624 warmups,source/bundle and patch identities')
