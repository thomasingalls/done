"""Independent endpoint-only diff, native evidence and retained-obligation audit."""
from pathlib import Path
from copy import deepcopy
import gzip,hashlib,json,re,subprocess
packet=Path(__file__).resolve().parent;repo=packet.parents[3]
sha=lambda b:hashlib.sha256(b).hexdigest()
def load(p):
 b=p.read_bytes();return json.loads(gzip.decompress(b)if p.suffix=='.gz'else b)
def text(p):
 b=p.read_bytes();return(gzip.decompress(b)if p.suffix=='.gz'else b).decode()
def original(name):return subprocess.check_output(['git','show','8d6d42c1:'+name],cwd=repo).decode()
def once(s,a,b):
 assert s.count(a)==1,(a,s.count(a));return s.replace(a,b,1)

def restored(name,s):
 s=once(s,"import { pageRuntimePorts } from './runtimePorts';\n",'')
 if name=='accountCapture.ts':
  changes=[
   ("pageRuntimePorts.activity.visibilityState()",'document.visibilityState'),
   ("const stopVisible = pageRuntimePorts.activity.onDocument('visibilitychange', visible);","document.addEventListener('visibilitychange', visible);"),
   ("const stopFreeze = pageRuntimePorts.activity.onDocument('freeze', freeze);","document.addEventListener('freeze', freeze);"),
   ("const stopResume = pageRuntimePorts.activity.onDocument('resume', invalidate);","document.addEventListener('resume', invalidate);"),
   ("const stopPageShow = pageRuntimePorts.activity.onPageShow(invalidate);","window.addEventListener('pageshow', invalidate);"),
   ('stopVisible();',"document.removeEventListener('visibilitychange', visible);"),
   ('stopFreeze();',"document.removeEventListener('freeze', freeze);"),
   ('stopResume();',"document.removeEventListener('resume', invalidate);"),
   ('stopPageShow();',"window.removeEventListener('pageshow', invalidate);"),
  ]
 elif name=='journalStore.ts':
  changes=[('return pageRuntimePorts.journal.storage();','return globalThis.localStorage;'),
   ('const stopStorage = pageRuntimePorts.journal.onStorage(onStorage);',"globalThis.addEventListener?.('storage', onStorage);"),
   ('stopStorage();',"globalThis.removeEventListener?.('storage', onStorage);")]
 else:
  changes=[
   ('    locks = pageRuntimePorts.lifetime.requireLocks();',"    if (globalThis.isSecureContext !== true || !globalThis.navigator?.locks)\n      throw new Error('Web Locks requires a supported secure context.');\n    locks = globalThis.navigator.locks;"),
   ('    stopPageHide();\n    stopRetirement();',"    globalThis.removeEventListener?.('pagehide', cancel);\n    lifecycle?.close();"),
   ("  const stopRetirement =\n    mode === 'shared' ? pageRuntimePorts.lifetime.onRetirement(slotId, cancel) : () => {};", "  const lifecycle =\n    mode === 'shared' && typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'\n      ? new BroadcastChannel('done/slot-lifecycle')\n      : undefined;\n  if (lifecycle)\n    lifecycle.onmessage = (event) => {\n      if (event.data?.kind === 'retire' && event.data?.slotId === slotId) cancel();\n    };"),
   ('  const stopPageHide = pageRuntimePorts.lifetime.onPageHide(cancel);',"  globalThis.addEventListener?.('pagehide', cancel, { once: true });"),
   ('  pageRuntimePorts.lifetime.requestRetirement(slotId);',"  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;\n  const channel = new BroadcastChannel('done/slot-lifecycle');\n  channel.postMessage({ kind: 'retire', slotId });\n  channel.close();"),
   ('  return pageRuntimePorts.lifetime.onRetirement(slotId, retire);',"  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return () => {};\n  const channel = new BroadcastChannel('done/slot-lifecycle');\n  channel.onmessage = (event) => {\n    if (event.data?.kind === 'retire' && event.data?.slotId === slotId) retire();\n  };\n  return () => channel.close();"),
  ]
 for a,b in changes:s=once(s,a,b)
 assert s==original('src/crdt/'+name),'Unexpected owner algorithm/API change: '+name
 return True
names=['accountCapture.ts','writeSession.ts','journalStore.ts']
for name in names:restored(name,(repo/'src/crdt'/name).read_text())
prior=load(repo/'docs/performance-experiments/2026-10-28-worker-owner/phase163/identities.json')
unchanged=0
for p,digest in prior['sourceFiles'].items():
 if p in ['src/crdt/'+n for n in names]:continue
 assert sha((repo/p).read_bytes())==digest,p;unchanged+=1
ports=(repo/'src/crdt/runtimePorts.ts').read_text()
assert not re.search(r'\b(await|Promise|Worker|SharedWorker|Atomics|setTimeout|queueMicrotask)\b',ports)
assert ports.count('Object.freeze(')==4 and ports.count("'done/slot-lifecycle'")==1
assert "storage: () => globalThis.localStorage" in ports
assert "{ once: true }" in ports
assert "if (globalThis.isSecureContext !== true || !globalThis.navigator?.locks)" in ports
assert 'runtime'not in original('src/crdt/accountStartup.ts').split('export interface AccountStartupOptions')[1].split('export const captureAccountOptions')[0].lower()

def native(v,base,mutants):
 assert v['exitCode']==0 and len(v['candidates'])==1
 candidate=v['candidates'][0];assert len(candidate['cases'])==base
 assert all(c['status']=='pass' and all(a['passed']is True for a in c['assertions'])for c in candidate['cases'])
 assert len(v['mutations'])==mutants and all(m['status']=='detected'for m in v['mutations'])
 files=candidate['source']['files']
 for name in names+['runtimePorts.ts']:
  assert files['src/crdt/'+name]==sha((repo/'src/crdt'/name).read_bytes())
for name,n,m in [('native-session-copy',13,5),('native-journal-copy',17,6)]:
 v=load(packet/'reports'/name/'report.json.gz');native(v,n,m)
 s=load(packet/'reports'/name/'summary.json')
 assert s['status']=='passed' and len(s['stages'])==1 and s['stages'][0]['groupDrained']is True
 assert s['stages'][0]['cases']==n+m
inputs=load(packet/'inputs.json')
for p,h in inputs['candidateRuntime'].items():assert sha((repo/p).read_bytes())==h,p
for row in load(packet/'reports/contract-receipt.json'):assert row['exit']==0
assert '2225 passed | 1 skipped (2226)'in text(packet/'reports/full-unit.log.gz')
assert 'pass 5' in text(packet/'reports/native-account-activity.log.gz') and 'fail 0'in text(packet/'reports/native-account-activity.log.gz')
assert 'pass 111' in text(packet/'reports/metadata-final.log.gz') and 'fail 0'in text(packet/'reports/metadata-final.log.gz')
assert 'no literal remote URL'in text(packet/'reports/build.log.gz')
assert 'External input symlink: .bin'in load(packet/'reports/native-session-initial-summary.json')['error']
assert '1 failed | 37 passed'in text(packet/'reports/after-focused-unit.log.gz')
assert 'pass 110' in text(packet/'reports/metadata-first.log.gz') and 'fail 1' in text(packet/'reports/metadata-first.log.gz')
# Construction registry changes only the explicitly non-crypto site's census, not a contract/status.
b=load(packet/'before-constructions.json.gz');a=load(repo/'docs/account-crypto/constructions.json')
for old,new in zip(b['constructions'],a['constructions']):
 if old['id']=='remaining-coordination-names':
  assert old['status']==new['status']=='excluded' and old['phase']==new['phase']=='non-crypto'
  old=deepcopy(old);old['sourceSites']=new['sourceSites']
 assert old==new,old['id']
b['constructions']=a['constructions'];assert a==b
old=load(packet/'before-manifest.json.gz');new=load(repo/'docs/release-validation-manifest.json')
x={r['id']:r for r in old['rows']};y={r['id']:r for r in new['rows']}
assert set(y)-set(x)=={'test:test/runtimePorts.test.ts'} and not(set(x)-set(y))
assert all(x[k]==y[k]for k in x)
assert new['status']=='blocked' and len(new['rows'])==936 and len(new['unresolved'])==390
assert set(new['unresolved'])-set(old['unresolved'])=={'test:test/runtimePorts.test.ts'}
assert y['test:test/runtimePorts.test.ts']['blocked']
assert subprocess.check_output(['git','diff','--name-only','--','test'],cwd=repo,text=True)==''
assert subprocess.check_output(['git','diff','--cached','--name-only'],cwd=repo,text=True)==''
controls=[]
for fault in ['changed-owner-guard','false-native-assertion','undetected-mutant']:
 try:
  if fault=='changed-owner-guard':restored('writeSession.ts',(repo/'src/crdt/writeSession.ts').read_text().replace('if (!live) throw inactive();','void live;'))
  else:
   trial=deepcopy(load(packet/'reports/native-session-copy/report.json.gz'))
   if fault=='false-native-assertion':trial['candidates'][0]['cases'][0]['assertions'][0]['passed']=False
   else:trial['mutations'][0]['status']='not-detected'
   native(trial,13,5)
 except AssertionError:controls.append({'fault':fault,'rejected':True})
 else:raise AssertionError('Corrupt evidence accepted: '+fault)
if(packet/'MANIFEST.json').exists():
 expected=load(packet/'MANIFEST.json')['files']
 assert {str(p.relative_to(packet)):sha(p.read_bytes())for p in packet.rglob('*')if p.is_file()and p.name!='MANIFEST.json'}==expected
result={'ownerBodiesAndPublicAPIsRestoredExactlyExceptDeclaredEndpoints':names,'otherPriorInputsUnchanged':unchanged,'pageExecutionAndSynchronousJournalRetained':True,'nativeCases':35,'nativeMutationControlsDetected':11,'unitPassed':2225,'existingUnitSkip':1,'metadataCases':111,'negativeControls':controls,'qualification':'New test remains blocked;936 obligations/390 unresolved. No worker, cohort activation, performance acceptance or release claim.'}
(packet/'review.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
