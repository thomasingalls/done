"""Check native observations against original fixture writing and preserved boundaries."""
from pathlib import Path
from copy import deepcopy
import gzip,hashlib,json,subprocess
p=Path(__file__).resolve().parent;repo=p.parents[3]
sha=lambda b:hashlib.sha256(b).hexdigest()
def load(n):
 f=p/n;b=f.read_bytes();return json.loads(gzip.decompress(b)if f.suffix=='.gz'else b)
def log(n):return gzip.decompress((p/n).read_bytes()).decode()
for name,h in load('inputs.json').items():assert sha((repo/name).read_bytes())==h,name
before=load('phase166-before-census.json.gz');after=json.loads((repo/'docs/account-crypto/census.json').read_text())
old={r['path']:r['sha256']for r in before['sources']};new={r['path']:r['sha256']for r in after['sources']}
assert set(new)-set(old)=={'src/crdt/windowAccountMirror.ts','src/crdt/accountMirrorRecovery.ts'}
assert [k for k in old if old[k]!=new[k]]==['src/crdt/admissionQueue.ts']
assert before['domains']==after['domains'] and len(new)==420
assert load('phase166-source-review.json.gz')['admissionQueueErasedRuntimeIdentical'] is True
emitted=(p/'erased-js/after/admissionQueue.js.txt').read_bytes();assert emitted==(p/'erased-js/before/admissionQueue.js.txt').read_bytes()
assert sha(emitted)==load('phase166-source-review.json.gz')['emittedSha256']
prior=load('phase166-before-release-validation-manifest.json.gz');plan=json.loads((repo/'docs/release-validation-manifest.json').read_text());a={r['id']:r for r in prior['rows']};b={r['id']:r for r in plan['rows']}
added={'test:test/windowAccountMirror.test.ts','test:test/accountMirrorRecovery.test.ts'}
assert set(b)-set(a)==added and all(a[k]==b[k]for k in a)and all(b[k]['blocked']for k in added)
assert len(plan['rows'])==940 and len(plan['unresolved'])==394
assert '2256 passed | 1 skipped'in log('reports/phase166-unit-full.log.gz')
assert '45 passed'in log('reports/phase166-focused-frozen.log.gz')
assert 'pass 98'in log('reports/phase166-metadata.log.gz') and 'fail 0'in log('reports/phase166-metadata.log.gz')
assert 'pass 6'in log('reports/phase166-wire.log.gz') and 'fail 0'in log('reports/phase166-wire.log.gz')
assert all(r['exit']==0 for r in load('phase166-checks.json.gz'))
archive=load('fictional-archive.json');master=archive['master.md']
def archive_hash(files):return sha(json.dumps(sorted(files.items()),ensure_ascii=False,separators=(',',':')).encode())
markers={'mirror-success':'\nActual admitted Window mirror. More writing.','mirror-bad-passkey':'','mirror-wrong-code':'','mirror-stale-opening':'','mirror-loss-worker':'\nDurable despite worker loss.','mirror-loss-window':'\nDurable despite window loss.','mirror-quota':'\nQuota fallback committed once.','mirror-lost-reply':'\nLost committed reply recovered once.'}
rows={k:load('reports/native-mirror-03/'+k+'/result.json.gz')for k in markers}
def check_native(rows):
 for name,suffix in markers.items():
  r=rows[name];assert r['outcome']=='passed'and all(r['guards'].values()),name
  assert r['shippingArchive']['sha256']==archive_hash({**archive,'master.md':master+suffix}),name
  assert r['guards']['unchangedShippingReaderExact']is True
  t=r['mirrorTrace'];assert t is not None
  if name in ['mirror-bad-passkey','mirror-wrong-code']:assert t['keysPackets']==0
  elif name=='mirror-stale-opening':assert t['keysPackets']==1 and t['keyPacketZero']
  if name in ['mirror-loss-worker','mirror-loss-window','mirror-success']:
   assert r['input']['requestsDuringHandler']==0 and r['input']['journals']>0
   assert r['input']['before']==master and r['input']['after'].startswith(master+'\n')
  if name in ['mirror-quota','mirror-lost-reply']:assert r['input']['after']==master and r['input']['journals']==0
  if name in ['mirror-loss-worker','mirror-lost-reply']:assert t['metrics']is None
  if name=='mirror-lost-reply':assert t['committed']is True
 r=rows['mirror-success'];assert set(r['guards'])=={'exactVerifiedStartup','sameHandlerSealedAdmissionWhileWorkerHeld','originalUndoRedo','realVerificationDoesNotOwnInputAdmission','keysAndNativeLifetimesDisposed','unchangedShippingReaderExact'}
 assert r['closed']['worker']['rawKeyBuffers']>0 and r['closed']['worker']['nonzeroAfterCleanup']==0
 assert r['closed']['windowMemoriesZero']and r['closed']['state']=='closed'
 assert r['probeInput']['requestsDuringHandler']==0 and r['probeInput']['after']==master+markers['mirror-success']
 assert r['mirrorTrace']['metrics']['loads']==16
 projection=next(d for d in r['mirrorTrace']['diagnostic']if d['name']=='recovery-projection')
 assert projection['exact'] and projection['raw']['reason']=='bytes' and projection['raw']['bytes']>4*1024*1024
 assert projection['projected']['ok']and projection['projected']['bytes']<4*1024*1024
check_native(rows)
mutations=[]
for name,mutate in [('no-journal',lambda v:v['mirror-success']['input'].__setitem__('journals',0)),('rpc-dependent-admission',lambda v:v['mirror-success']['input'].__setitem__('requestsDuringHandler',1)),('altered-recovery',lambda v:v['mirror-loss-worker']['shippingArchive'].__setitem__('sha256','0'*64)),('false-erasure-credit',lambda v:v['mirror-lost-reply']['mirrorTrace'].__setitem__('metrics',{'nonzeroAfterCleanup':0}))]:
 changed=deepcopy(rows);mutate(changed)
 try:check_native(changed)
 except AssertionError:mutations.append(name)
 else:raise AssertionError('Audit accepted corrupted evidence: '+name)
ids=load('identities.json');build=load('build-identity.json.gz')
# Reconstruct the experimental worker adaptations independently from original source.
original={str(Path(r['path']).relative_to(repo)):(repo/Path(r['path']).relative_to(repo)).read_text()for r in build['transforms']};changed=dict(original)
k='src/crdt/runtimePorts.ts';changed[k]="import {pageDocument as document,pageWindow as window} from '"+ids['labRoot']+"/lab/env.mjs';\n"+original[k].replace('      return globalThis.navigator.locks;','      return (globalThis as any).__workerLocks ?? globalThis.navigator.locks;',1)
k='src/crdt/writeSession.ts';w=original[k].replace('  const assertLive = (initializing = false): void => {','  const assertLive = (initializing = false): void => {\n    (globalThis as any).__workerCurrent?.();',1)
for factory in ['openAccountWriteSession','openJoinedWriteSession']:
 start=w.index('export const '+factory+' =');at=w.index("acquire(slotId, 'exclusive', options,",start);w=w[:at]+w[at:].replace("acquire(slotId, 'exclusive', options,","acquire(slotId, 'shared', options,",1)
changed[k]=w
k='src/crdt/custody.ts';c=original[k].replace('const clearKeys = (keys: OwnedKeys) => {','const clearKeys = (keys: OwnedKeys) => {\n  const observedRaw = [keys.journal,...(keys.previousJournals?.values() ?? [])].filter((b): b is Uint8Array => !!b);',1).replace('  keys.signing = null;','  keys.signing = null;\n  (globalThis as any).__workerKeyCleanup?.({buffers:observedRaw.length,nonzero:observedRaw.filter(b=>b.some(v=>v!==0)).length});',1)
material="""        (globalThis as any).__windowMirrorMaterial = () => {
          (globalThis as any).__workerCurrent();
          if (!keys.journal) throw Error('Closed journal material');
          return {scope:{slotId:scope.slotId,principalId:scope.principalId,workspaceId:scope.workspaceId,storeId:record.store_id,rootId:record.root_id},dbName:name,generation:keys.generation??1,key:keys.journal.slice(),previous:[...(keys.previousJournals??[])].map(([g,k])=>[g,k.slice()]),...(carrier?.journalBinding()?{binding:structuredClone(carrier.journalBinding())}:{})};
        };
"""
anchor='        // Erasure is cleanup and must also run if cancellation follows the successful read.';changed[k]=c.replace(anchor,material+anchor,1)
k='src/crdt/accountCapture.ts';anchor='  return {\n    account,\n    carrier,';changed[k]=original[k].replace(anchor,"  (globalThis as any).__windowMirrorRoute = () => { (globalThis as any).__workerCurrent(); if(live.state!=='active')throw Error('Closed capture route');return {workspace:route.workspace,principal:route.principal,credential:route.credential,epoch:route.epoch,generation:route.generation}; };\n"+anchor,1)
k='src/crdt/accountReceive.ts';changed[k]=original[k].replace('async function openAccountReceiveOwner(','export async function openAccountReceiveOwner(',1)
assert len(original)==5
for row in build['transforms']:
 k=str(Path(row['path']).relative_to(repo));assert sha(original[k].encode())==row['beforeSha256']and sha(changed[k].encode())==row['afterSha256'],k
for name,h in build['labInputs'].items():assert sha((p/ids['reproduction']['lab/'+name]).read_bytes())==h,name
receipt=load('reports/native-mirror-03/receipt.json.gz');assert receipt['exit']==0
for name,h in receipt['inputs'].items():
 data=(json.dumps(build,indent=2)+'\n').encode()if name=='build-identity.json'else(p/ids['reproduction'][name]).read_bytes();assert sha(data)==h,name
prior=json.loads((repo/'docs/performance-experiments/2026-10-28-goals-stalls/phase162/input-identities.json').read_text());shipping={k:h for k,h in build['files'].items()if not k.startswith('worker-lab/')};assert shipping==prior['frontendSha256']and len(shipping)==86
assert '8 passed'in log('reports/native-mirror-03/console.log.gz')
assert load('reports/native-mirror-01/receipt.json.gz')['exit']==1
assert load('reports/native-mirror-02/receipt.json.gz')['exit']==0
assert '2 failed'in log('reports/phase166-unit-initial.log.gz')
assert load('phase166-cleanup.json.gz')['allRemoved']is True
assert subprocess.check_output(['git','diff','--name-only','--','test'],cwd=repo,text=True)==''
assert subprocess.check_output(['git','diff','--cached','--name-only'],cwd=repo,text=True)==''
result={'nativeAccountCases':8,'nativeCohortCasesFrom165':20,'newMirrorUnitCases':17,'focusedCases':45,'fullUnitPassed':2256,'existingSkip':1,'metadataCases':98,'diagnosticWireCases':6,'corruptedEvidenceControlsDetected':mutations,'workerTransformedFiles':len(changed),'builtRepositorySources':len(load('phase166-built-sources.json.gz')['matchedBuiltSources']),'oldSourceChanges':'erased type-only admission carrier','newTestRowsRequiredUncredited':2,'obligations':940,'unresolved':394,'status':'Internal mirror and isolated actual-worker composition; no default UI activation or performance acceptance.'}
(p/'review.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
