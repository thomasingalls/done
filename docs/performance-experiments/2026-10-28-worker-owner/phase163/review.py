"""Independently check native observations, declared transforms and unchanged shipping inputs."""
from pathlib import Path
from copy import deepcopy
import gzip, hashlib, json, re, subprocess, os
packet=Path(__file__).resolve().parent
repo=packet.parents[3]
sha=lambda b:hashlib.sha256(b).hexdigest()
def load(path):
 b=path.read_bytes();return json.loads(gzip.decompress(b) if path.suffix=='.gz' else b)
def log(path):return gzip.decompress(path.read_bytes()).decode()
id=load(packet/'identities.json')
expected_guards={'exactStoredArchive','actualWindowJournalBeforeReply','undoRedo','independentNativeInput','keysClearedAndPermitReleased','shippingReaderReopenExact'}
def positive(v):
 assert v['outcome']=='passed' and set(v['guards'])==expected_guards and all(v['guards'].values())
 assert v['permit']==2
 assert v['closed']['rawKeyBuffers']>0 and v['closed']['nonzeroAfterCleanup']==0
 assert v['probe']['loads']==16
 assert v['input']['value']=='The page can keep taking independent native input.'
 for entry in v['open']['entries']:
  expected=id['expectedArchive'][entry['path']]
  assert sha(entry['content'].encode())==expected['sha256']
 assert {e['path'] for e in v['open']['entries']}==set(id['expectedArchive'])
 assert v['append']['master']==v['flushed']['master']==v['open']['master']+'\nWorker ownership feasibility sample.'
 assert {e['path']:e['content'] for e in v['append']['entries']}=={**{e['path']:e['content'] for e in v['open']['entries']},'master.md':v['append']['master']}
 assert v['flushed']['entries']==v['append']['entries']
 rows=v['trace']['instances'][0]
 writes=[r for r in rows['storage'][v['open']['metrics']['storageCalls']:v['append']['metrics']['storageCalls']] if r.get('written')]
 reply=next(r for r in rows['replies'] if r['operation']=='append')
 assert len(writes)==1 and reply['kind']=='result' and max(r['end'] for r in writes)<=reply['at']
 ordered=sorted(((e['path'],e['content']) for e in v['flushed']['entries']),key=lambda p:p[0])
 # Native reader archiveIdentity uses compact JS JSON of ASCII paths/content in this fixture.
 assert sha(json.dumps(ordered,ensure_ascii=False,separators=(',',':')).encode())==v['archive']['sha256']
 assert v['archive']['files']==[{'name':name,'bytes':len(content.encode()),'characters':len(content)} for name,content in [(e['path'],e['content'])for e in v['flushed']['entries']]]
 return True
final=packet/'reports/final-controls-10'
v=load(final/'result.json.gz');positive(v)
case_guards={
 'bad-passkey':{'refusedAndPermitReleased','freshValidPasskeyReopensExact'},
 'wrong-code':{'factorRefusedAndPermitReleased'},
 'initialization-cancel':{'noLateReadyAndPermitReleased'},
 'before-write':{'recoveryMatchesActualJournalBoundaryExactlyOnce'},
 'after-write':{'recoveryMatchesActualJournalBoundaryExactlyOnce'},
 'hard-loss':{'noGracefulCleanupCredit','recoveryMatchesActualJournalBoundaryExactlyOnce'},
 'quota':{'quotaPreservesWritingAndNeverAcknowledges'},
 'retirement':{'retirementClosesWithoutNewEffects'},
 'duplicate-open':{'duplicateCannotLeakAReservation'},
 'reservation-cancel':{'cancelingQueuedSupervisorPreservesCurrentOwner'},
 'orphan-barrier':{'oldWorkerMustExitBeforeNewInitialization'},
 'page-navigation':{'newIncarnationAfterRealNavigationPreservesJournal'},
 'old-exclusive-interleaving':{'sharedJoinRefusesRatherThanWaits'},
}
for name,guards in case_guards.items():
 x=load(final/name/'result.json.gz')
 assert x['outcome']=='passed' and set(x['guards'])==guards and all(x['guards'].values()),name
 if 'closed'in x:assert x['closed']['nonzeroAfterCleanup']==0,name
lost=load(final/'hard-loss/result.json.gz')
assert lost['trace']['instances'][0]['disposed'] is None,'Forced kill earned graceful cleanup credit'
for name in ['before-write','after-write','hard-loss']:
 x=load(final/name/'result.json.gz')
 assert len(x['trace']['instances'])==2
 fault=next(f for f in x['trace']['instances'][0]['faults'] if f['kind']in ['before-write','after-write'])
 actual=[r for r in x['trace']['instances'][0]['storage'] if r.get('written')]
 assert bool(actual)==(name!='before-write')
 if actual:assert actual[-1]['end']<=fault['at']

def interleaving(before,after):
 old=before['nativeInterleaving'];new=after['nativeInterleaving']
 names={r['name'] for r in old['held'] if r['name'].startswith('done/slot-writer/')};assert len(names)==1
 name=next(iter(names))
 assert [r['mode']for r in old['held']if r['name']==name]==['shared']
 assert [r['mode']for r in old['pending']if r['name']==name]==['exclusive','shared']
 # Cases have copied slot identities; native instance/client identities may differ.
 assert [r['mode']for r in new['held']if r['name'].startswith('done/slot-writer/')]==['shared']
 assert [r['mode']for r in new['pending']if r['name'].startswith('done/slot-writer/')]==['exclusive']
 assert after['guards']['sharedJoinRefusesRatherThanWaits'] is True
before=load(packet/'reports/join-before-09/old-exclusive-interleaving/result.json.gz')
after=load(final/'old-exclusive-interleaving/result.json.gz');interleaving(before,after)
assert load(final/'receipt.json.gz')['exit']==0
assert '14 passed' in log(final/'console.log.gz')
assert re.search(r'pass 14\s',log(packet/'reports/channel-tests-final.log.gz'))
assert re.search(r'fail 0\s',log(packet/'reports/channel-tests-final.log.gz'))
for run,code in [('native-owner-01',1),('native-owner-02',1),('native-owner-03',0),('bounded-controls-04',1),('bounded-controls-05',130),('bounded-controls-06',1),('bounded-controls-07',0),('bounded-controls-08',0),('join-before-09',0)]:
 assert load(packet/'reports'/run/'receipt.json.gz')['exit']==code,run
assert '3 failed' in log(packet/'reports/bounded-controls-04/console.log.gz')
assert '9 failed' in log(packet/'reports/bounded-controls-06/console.log.gz')
cleanup=load(packet/'cleanup.json');assert cleanup=={'ownedContainersChecked':65,'running':[],'removed':65,'stoppedPresent':0}
# Construct the declared transforms independently; never trust generator/output agreement alone.
root='/private/tmp/done-worker-owner-20261028'
original={p:(repo/p).read_text() for p in ['src/crdt/accountCapture.ts','src/crdt/writeSession.ts','src/crdt/custody.ts']}
changed=dict(original)
changed['src/crdt/accountCapture.ts']=f"import {{pageDocument as document,pageWindow as window}} from '{root}/lab/env.mjs';\n"+original['src/crdt/accountCapture.ts']
w=original['src/crdt/writeSession.ts']
assert w.count("acquire(slotId, 'exclusive', options")==4
w=w.replace('    locks = globalThis.navigator.locks;','    locks = (globalThis as any).__workerLocks ?? globalThis.navigator.locks;',1)
w=w.replace('  const assertLive = (initializing = false): void => {','  const assertLive = (initializing = false): void => {\n    (globalThis as any).__workerCurrent?.();',1)
for factory in ['openAccountWriteSession','openJoinedWriteSession']:
 start=w.index('export const '+factory+' =')
 stop=w.find('\nexport ',start+1)
 if stop<0:stop=len(w)
 section=w[start:stop]
 assert section.count("acquire(slotId, 'exclusive', options,")==1
 w=w[:start]+section.replace("acquire(slotId, 'exclusive', options,","acquire(slotId, 'shared', options,")+w[stop:]
assert w.count("acquire(slotId, 'exclusive', options")==2
changed['src/crdt/writeSession.ts']=w
c=original['src/crdt/custody.ts']
c=c.replace('const clearKeys = (keys: OwnedKeys) => {','const clearKeys = (keys: OwnedKeys) => {\n  const observedRaw = [keys.journal,...(keys.previousJournals?.values() ?? [])].filter((b): b is Uint8Array => !!b);',1)
c=c.replace('  keys.signing = null;','  keys.signing = null;\n  (globalThis as any).__workerKeyCleanup?.({buffers:observedRaw.length,nonzero:observedRaw.filter(b=>b.some(v=>v!==0)).length});',1)
changed['src/crdt/custody.ts']=c
build=id['finalBuild'];assert build['hits']=={'activity':1,'liveness':1,'cleanup':1,'leaseMode':2,'lockPort':1}
assert len(build['transforms'])==len(changed)==3
for row in build['transforms']:
 name=str(Path(row['path']).relative_to(repo))
 assert sha(original[name].encode())==row['beforeSha256'],name
 assert sha(changed[name].encode())==row['afterSha256'],name
for path,expected in id['sourceFiles'].items():assert sha((repo/path).read_bytes())==expected,path
for name,expected in build['labInputs'].items():assert sha((packet/id['reproduction']['lab/'+name]).read_bytes())==expected,name
receipt=load(final/'receipt.json.gz')
for path,expected in receipt['inputs'].items():
 if path=='build-identity.json':assert sha((json.dumps(build,indent=2)+'\n').encode())==expected
 else:assert sha((packet/id['reproduction'][path]).read_bytes())==expected,path
prior=load(repo/'docs/performance-experiments/2026-10-28-goals-stalls/phase162/input-identities.json')
shipping={n:h for n,h in build['files'].items() if not n.startswith('worker-lab/')}
assert shipping==prior['frontendSha256'] and len(shipping)==86
frontend=Path(os.environ.get('STALL_FRONTEND','/private/tmp/done-resumable-release-20261028/frontend'))
assert {str(p.relative_to(frontend)):sha(p.read_bytes()) for p in frontend.rglob('*') if p.is_file()}==shipping
combined=Path(os.environ.get('WORKER_LAB_FRONTEND','/private/tmp/done-worker-owner-20261028/combined-dist'))
assert {str(p.relative_to(combined)):sha(p.read_bytes()) for p in combined.rglob('*') if p.is_file()}==build['files']
map_owners=set()
for path in (combined/'worker-lab/assets').glob('*.map'):
 m=json.loads(path.read_text())
 for source,body in zip(m.get('sources',[]),m.get('sourcesContent',[])):
  for name in original:
   if source.endswith('/'+name):
    assert body==original[name],name
    map_owners.add(name)
assert map_owners==set(original)
names=subprocess.check_output(['git','diff','--name-only'],cwd=repo,text=True).splitlines()
assert all(n.startswith('docs/')for n in names),names
assert subprocess.check_output(['git','diff','--cached','--name-only'],cwd=repo,text=True)==''
controls=[]
for fault in ['missing-guard','early-acknowledgment','altered-writing','queued-shared-join']:
 try:
  if fault=='queued-shared-join':
   a=deepcopy(after);a['nativeInterleaving']['pending'].append({'name':next(v['name']for v in a['nativeInterleaving']['pending']if v['name'].startswith('done/slot-writer/')),'mode':'shared'});interleaving(before,a)
  else:
   a=deepcopy(v)
   if fault=='missing-guard':a['guards'].pop('shippingReaderReopenExact')
   if fault=='early-acknowledgment':next(r for r in a['trace']['instances'][0]['replies']if r['operation']=='append')['at']=0
   if fault=='altered-writing':a['flushed']['master']+=' lost'
   positive(a)
 except AssertionError:controls.append({'fault':fault,'rejected':True})
 else:raise AssertionError('Accepted corrupt evidence: '+fault)
if (packet/'MANIFEST.json').exists():
 manifest=load(packet/'MANIFEST.json')['files']
 assert {str(p.relative_to(packet)):sha(p.read_bytes())for p in packet.rglob('*')if p.is_file()and p.name!='MANIFEST.json'}==manifest
result={'nativeCases':14,'protocolCases':14,'declaredTransformedModulesIndependentlyReconstructed':3,'unchangedSourceFiles':len(id['sourceFiles']),'unchangedShippingFrontendFiles':len(shipping),'lostAckBeforeAfterAndNativeMixedOwnerOrderChecked':True,'negativeControls':controls,'oldTestsAndRuntimeUnchanged':True,'qualification':'Feasibility only; no actual Goals/threaded-client repair, phone claim,16ms/2.5s/30s acceptance or aggregate credit.'}
(packet/'review.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
