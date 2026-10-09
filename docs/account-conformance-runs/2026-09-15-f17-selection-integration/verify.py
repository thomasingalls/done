"""Verify retained functional integration evidence; --raw checks local large frozen inputs."""
from pathlib import Path
import gzip,hashlib,json,re,sys
root=Path.cwd();packet=Path(__file__).resolve().parent;sha=lambda b:hashlib.sha256(b).hexdigest()
s=json.loads((packet/'summary.json').read_bytes())
assert sha((packet/'artifacts.json.gz').read_bytes())==s['artifactsSha256']
assert sha((packet/'raw-artifacts.json').read_bytes())==s['rawIndexSha256']
store=json.loads(gzip.decompress((packet/'artifacts.json.gz').read_bytes()))
assert len(store['files'])==s['files'] and len(store['blobs'])==s['uniqueBlobs']
for h,v in store['blobs'].items():assert sha(v['text'].encode())==h

def payload(name):
 p=store['files'][name];b=store['blobs'][p['sha256']]['text'].encode();assert len(b)==p['bytes'];return b
def read(name):return json.loads(payload(name))
for name in store['files']:payload(name)
run=read('owned/summary.json');assert run['status']=='passed' and run['stages']==s['owned']['stages']
assert run['input']==s['owned']['input'] and len(run['stages'])==13
count=0
for stage in run['stages']:
 prefix='owned/stages/'+stage['key']+'/'
 r=read(prefix+'receipt.json');c=read(prefix+'cases.json')
 assert r['status']==stage['status']=='passed' and r['key']==stage['key'] and r['stageId']==stage['id']
 assert r['input']==run['input'] and r['result']['code']==0
 assert stage['groupDrained'] is True and r['result']['groupDrained'] is True
 for p in r['artifacts']:assert sha(payload(prefix+p['path']))==p['sha256']
 assert c['nonce']==r['nonce'] and c['reason']=='passed' and c['errors']==[]
 assert all(m['state']=='passed' for m in c['modules'])
 actual=sorted([{'id':x['id'],'outcome':x['outcome']} for x in c['cases']],key=lambda x:x['id'])
 assert actual==sorted(r['contract']['expect']['cases'],key=lambda x:x['id'])
 assert len(actual)==stage['cases'] and len({x['id'] for x in actual})==len(actual)
 for x in c['cases']:assert x['retryCount']==x['repeatCount']==0 and x['expectedFailure'] is False and x['mode']=='run' and x['errors']==[]
 count+=len(actual)
assert count==s['owned']['cases']==215
for path in [name.removeprefix('source/') for name in store['files'] if name.startswith('source/')]:assert (root/path).read_bytes()==payload('source/'+path),path
for path,seed,runs in [('test/selectionHistory.test.ts',150906,120),('test/workspaceAdmission.test.ts',140925,80),('test/workspaceAdmission.test.ts',150902,80)]:
 text=payload('source/'+path).decode();assert str(seed) in text and 'numRuns: '+str(runs) in text
assert "['reference', 'local-handoff', 'local-snapshots']" in payload('source/test/workspaceAdmission.test.ts').decode()
controls=read('phase/controls.json');assert controls==s['controls'] and len(controls)==5
for c in controls:
 assert c['exit']==1 and c['intendedFailure'] is True
 log=payload('phase/'+c['name']+'.log').decode();assert c['marker'] in log
 if c['name'] in ['stale-after','omit-undo-transfer']:assert 'Counterexample:' in log
 assert payload('phase/'+c['name']+'.patch').startswith(('--- a/'+c['path']).encode())
 assert 'mutation must match exactly once' in payload('phase/'+c['name']+'.config.mts').decode()
red=payload(s['defect']['failedRun']).decode();assert 'synchronous startup failure must close its selection owner' in red and '1 failed' in red
assert '1 passed' in payload(s['defect']['repairedRun']).decode()
assert '}).catch((error) => {' in payload(s['defect']['originalSource']).decode()
assert 'synchronous startup failure must close its selection owner' in payload(s['defect']['originalTest']).decode()
gates=read('phase/gates.json');assert {g['name'] for g in gates}=={'runner','typecheck','format','lint','inventory','manifest','census','authority','whitespace'}
assert all(g['exit']==0 for g in gates)
for g in gates:payload('phase/'+g['log'])
assert re.search(r'tests 21',payload('phase/runner-final.log').decode()) and s['runnerChecks']==21
assert '1141 passed' in payload(s['fullUnit']['first']).decode()
failed=payload(s['fullUnit']['second']).decode();assert '2 failed | 1139 passed' in failed and 'Test timed out in 5000ms' in failed and 'accountLiveness' in failed and 'positionDecision' in failed
# Preserve the later whole-command result separately from the selected owned receipts.
assert '1141 passed' in payload(s['fullUnit']['third']).decode()
registration=read('phase/registration.json');assert registration==s['registration']
assert registration['totalRows']==618 and registration['unresolved']==159 and registration['generalDispositions']==2121 and registration['generalFiles']==263
assert registration['priorContractsPreserved']==614 and registration['cryptoDomainsUnchanged'] is True
assert registration['added']['id']=='test:test/selectionHistory.test.ts' and len(registration['added']['stage']['expect']['cases'])==5
assert len(registration['changes'])==3 and sum(c.get('after',0)-c.get('before',0) for c in registration['changes'])==30
changed={p['path']:p for p in registration['changedSources']}
assert set(changed)=={'src/crdt/yjs.ts','src/crdt/admittedWorkspace.ts','src/crdt/selectionSnapshots.ts'}
for path,pin in changed.items():assert pin['sha256']==sha(payload('source/'+path))
p=read('phase/preservation.json');assert len(p['personalAndVectorPins'])==52
assert len({pin['path'].split('/')[2] for pin in p['priorPackets']})==6
for pin in p['personalAndVectorPins']+p['priorPackets']+[p for p in p['runtimePins'] if p['path'] not in changed]:assert sha((root/pin['path']).read_bytes())==pin['sha256'],pin['path']
assert {str(f) for f in Path('src').rglob('*') if f.is_file()}=={pin['path'] for pin in p['runtimePins']}
for pin in p['appendOnlyPrefixes']:assert sha((root/pin['path']).read_bytes()[:pin['prefixBytes']])==pin['prefixSha256']
assert sha((root/'docs/progress.md').read_bytes().split(b'\n---\n\n## Active slice: Stage 4',1)[1])==p['L2SuffixSha256']
assert s['defaultActivation'] is False and s['accountActivation'] is False and s['noPerformanceMeasurement'] is True
assert s['obligations']=={'testFile':0,'command':96,'campaign':63}
if '--raw' in sys.argv:
 for pin in json.loads((packet/'raw-artifacts.json').read_bytes()):
  b=Path(pin['path']).read_bytes();assert sha(b)==pin['sha256'] and len(b)==pin['bytes'],pin['path']
 for name in ['owned','workspace-native','workspace-native-final']:
  frozen=json.loads(gzip.decompress(Path('test-results/f17-selection-integration',name,'inputs.json.gz').read_bytes()))
  for pin in frozen['sources']:
   if not pin['path'].startswith('docs/') and 'sha256' in pin:
    if name!='workspace-native-final' and pin['path']=='scripts/workspace-admission/catalog.mjs':assert sha(payload('phase/catalog-before.mjs'))==pin['sha256']
    else:assert sha((root/pin['path']).read_bytes())==pin['sha256'],pin['path']
 prev=Path('/private/tmp/done-f17-selection-integration/before')
 old=json.loads((prev/'docs/release-validation-manifest.json').read_bytes());new=json.loads(Path('docs/release-validation-manifest.json').read_bytes())
 assert old['unresolved']==new['unresolved'] and len(old['rows'])+1==len(new['rows'])
 current={r['id']:r for r in new['rows']};prior={r['id'] for r in old['rows']}
 assert [r for r in new['rows'] if r['id'] not in prior]==[registration['added']]
 for a in old['rows']:
  b=current[a['id']]
  if a['id']=='test:test/release-validation/general-tests.test.mjs':assert json.dumps(a).replace('2086','2121')==json.dumps(b)
  elif a['id']=='test:test/workspaceAdmission.test.ts':
   c=next(c for c in registration['changes'] if c['id']==a['id']);assert all(x in b['stage']['expect']['cases'] for x in a['stage']['expect']['cases'])
   assert [x for x in b['stage']['expect']['cases'] if x not in a['stage']['expect']['cases']]==c['added']
   assert {**b,'stage':{**b['stage'],'expect':a['stage']['expect']}}==a
  elif a['id']=='catalogue:scripts/workspace-admission/catalog.mjs':
   change=next(x for x in registration['changes'] if x['id']==a['id']);expected=json.loads(json.dumps(a).replace(change['beforeTo'],change['afterTo']));expected['stage']['variant']=change['afterVariant'];assert expected==b
   assert a['stage']['variant']==change['beforeVariant'] and b['stage']['variant']==change['afterVariant']
  else:assert a==b,a['id']
 c0=json.loads((prev/'docs/account-crypto/census.json').read_bytes());c=json.loads(Path('docs/account-crypto/census.json').read_bytes())
 assert {**c,'sources':c0['sources']}==c0
 assert [r for r in c['sources'] if r['path'] not in changed]==[r for r in c0['sources'] if r['path'] not in changed]
 p0=json.loads((prev/'scripts/release-validation/general-tests.json').read_bytes());p1=json.loads(payload('source/scripts/release-validation/general-tests.json'))
 assert p1=={**p0,'vitest':sorted(p0['vitest']+['test/selectionHistory.test.ts'])}
# Native campaign and owned catalogue evidence.
for name in ['pending-native','delivery-native']:
 d=read(name+'/report.json');assert d['status']=='passed' and d['mutation'] is None and d['finished']
 assert all(c['status']=='passed' and c['errors']==[] for c in d['cases'])
 c=d['cases'][-1];assert c['properties']=={'seed':8941,'runs':100,'failed':False,'path':None} and len(c['histories'])==100
 for row in c['histories']:
  if name=='pending-native':assert row['sourceComplete'] is True and row['afterUndo']==row['expected'] and row['actual'].replace(row['marker'],'')==row['expected']
  else:assert [row['actual'][0].replace('⟦local⟧','',1),*row['actual'][1:]]==row['expected']
 for path,h in d['files'].items():
  if not path.startswith('docs/'):assert sha((root/path).read_bytes())==h,path
 for path,h in d['dependencies'].items():assert sha((root/path).read_bytes())==h,path
 assert s['native'][name]['cases']==len(d['cases'])
w=read('workspace-native-final/summary.json');assert w['status']=='passed' and w['stages']==s['workspaceNative']['stages'] and w['input']==s['workspaceNative']['input']
assert len(w['stages'])==1
stage=w['stages'][0];prefix='workspace-native-final/stages/'+stage['key']+'/'
r=read(prefix+'receipt.json');c=read(prefix+'cases.json');browser=read(prefix+'browser.json')
assert r['status']=='passed' and r['input']==w['input'] and r['result']['code']==0 and r['result']['groupDrained'] is True and stage['groupDrained'] is True
for p in r['artifacts']:assert sha(payload(prefix+p['path']))==p['sha256']
assert browser['exit']==0 and browser['groupDrained'] is True and r['result']['browser']==browser
assert c['releaseNonce']==r['nonce'] and c['exitCode']==0 and c['finished'] and all(x['closed'] is True for x in c['servers'])
assert len(c['candidates'])==1 and c['candidates'][0]['id']=='workspace'
expected=r['contract']['expect']['selection'];cases=c['candidates'][0]['cases'];mutants=c['mutations']
assert len(cases)==10 and len(mutants)==4
assert [{'id':x['id'],'outcome':x['status']} for x in cases]==expected['cases']
assert len({x['id'] for x in cases})==len(cases)
for x in cases:assert all(a['passed'] is True for a in x['assertions']) and x['assertions']
for x,spec in zip(mutants,expected['mutants']):
 assert x['id']==spec['id'] and x['status']=='detected' and x['assertion']==spec['assertion']
 assert x['result']['mutation']==spec['patch']
 row=x['result']['cases'][0];assert row['id']==spec['case'] and row['status']=='fail'
 assert any(a['id']==x['assertion'] and a['passed'] is False for a in row['assertions'])
assert len(r['result']['cases'])==14
assert [x for x in r['result']['cases'] if x['outcome']=='pass']==expected['cases']
for path,h in c['harness']['files'].items():
 if not path.startswith('docs/'):assert sha((root/path).read_bytes())==h,path
for name in ['pending-projection','yjs-delivery']:
 assert 'index.html?preparation=local-snapshots' in payload('source/scripts/'+name+'/run.mjs').decode()
assert 'index.html?preparation=local-snapshots' in payload('source/scripts/workspace-admission/worker.mjs').decode()
for name in ['pending-projection','yjs-delivery','workspace-admission']:
 assert "new URLSearchParams(location.search).get('preparation')" in payload('source/test/'+name+'/browser.mjs').decode()
for row in read('phase/unit-runs.json'):assert sha(payload('phase/'+row['log']))==row['sha256']
assert [r['exit'] for r in read('phase/unit-runs.json')]==[0,1,0]
first=read(s['nativeControlRepair']['earlierRun']);assert first['status']=='failed' and first['stages'][0]['groupDrained'] is True
earlier=read('workspace-native/stages/'+first['stages'][0]['key']+'/cases.json')
assert all(c['status']=='pass' for c in earlier['candidates'][0]['cases'])
assert [m['status'] for m in earlier['mutations']]==['error','detected','detected','detected']
assert 'Timeout 12000ms' in earlier['mutations'][0]['result']['cases'][0]['error']['message']
original=payload(s['nativeControlRepair']['originalCatalog']).decode();current=payload('source/scripts/workspace-admission/catalog.mjs').decode()
assert original.replace('state.value = result.value; accepted = state;', 'state.value = result.value; accepted!.history.undoStack = history.undoStack;')==current
assert sum(f.stat().st_size for f in packet.iterdir() if f.is_file())<400000
print('Verified 215 owned cases, 99-file/1141-test repeat, retained timeout and startup counterexample, five unit faults, both 100-history native campaigns, ten workspace cases/four native mutants, registrations and preservation. Performance remains pending.')
