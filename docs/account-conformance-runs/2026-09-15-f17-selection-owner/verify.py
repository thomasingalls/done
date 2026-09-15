"""Verify unmounted owner evidence and preservation; --raw checks local frozen inputs and prior registrations."""
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
assert run['input']==s['owned']['input'] and len(run['stages'])==7
assert {r['id'] for r in run['stages']}=={'test:test/'+n+'.test.ts' for n in ['selectionSnapshots','pendingProjection','workspaceAdmission','workspacePreparation','admittedText','yjsDelivery','ownedReceiveQueue']}
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
assert count==s['owned']['cases']==127
assert [(p['seed'],p['runs']) for p in s['properties']]==[(150903,200),(150904,160),(150905,80)]
paths=['src/crdt/selectionSnapshots.ts','test/selectionSnapshots.test.ts','scripts/release-validation/general-tests.json','test/release-validation/general-tests.test.mjs','test/release-validation/generated-tests.test.mjs']
for path in paths:assert (root/path).read_bytes()==payload('source/'+path),path
for p in s['properties']:assert re.search(r'seed: '+str(p['seed'])+r', numRuns: '+str(p['runs']),payload('source/test/selectionSnapshots.test.ts').decode())
controls=read('phase/controls.json');assert controls==s['controls'] and len(controls)==4
for c in controls:
 assert c['exit']==1 and c['intendedFailure'] is True
 log=payload('phase/'+c['name']+'.log').decode()
 assert c['marker'] in log
 if c['name']!='share-owners':assert 'Counterexample:' in log
 assert payload('phase/'+c['name']+'.patch').startswith(b'--- a/src/crdt/selectionSnapshots.ts')
 assert 'mutation must match exactly once' in payload('phase/'+c['name']+'.config.mts').decode()
red=payload(s['defect']['failedRun']).decode();assert 'Counterexample: [1]' in red and 'sparse selection ranges must be refused' in red
before=payload(s['defect']['originalSource']).decode();now=payload('source/src/crdt/selectionSnapshots.ts').decode()
repair="      Object.keys(selected['ranges']).some((key, index) => key !== String(index)) ||\n"
assert before==now.replace(repair,'') and repair in now
assert 'generated sparse range arrays cannot disguise holes' in payload(s['defect']['originalTest']).decode()
assert '9 passed' in payload('phase/focused-final.log').decode()
assert not any('selectionSnapshots' in p.read_text() for p in Path('src').rglob('*.ts') if p.name!='selectionSnapshots.ts')
gates=read('phase/gates.json');assert {g['name'] for g in gates}=={'runner','typecheck','format','lint','inventory','manifest','census','authority','whitespace'}
assert all(g['exit']==0 for g in gates)
for g in gates:payload('phase/'+g['log'])
assert re.search(r'tests 17',payload('phase/runner-final.log').decode()) and s['runnerChecks']==17
registration=read('phase/registration.json');assert registration==s['registration']
assert registration['totalRows']==617 and registration['unresolved']==159 and registration['generalDispositions']==2086 and registration['generalFiles']==262
assert registration['priorContractsPreserved']==615 and registration['cryptoDomainsUnchanged'] is True
assert registration['added']['id']=='test:test/selectionSnapshots.test.ts' and len(registration['added']['stage']['expect']['cases'])==9
assert registration['newSource']['sha256']==sha(payload('source/src/crdt/selectionSnapshots.ts'))
p=read('phase/preservation.json');assert len(p['personalAndVectorPins'])==52
assert len({pin['path'].split('/')[2] for pin in p['priorPackets']})==5
for pin in p['personalAndVectorPins']+p['priorPackets']+p['runtimePins']:assert sha((root/pin['path']).read_bytes())==pin['sha256'],pin['path']
assert {str(f) for f in Path('src').rglob('*') if f.is_file()}=={pin['path'] for pin in p['runtimePins']}|{'src/crdt/selectionSnapshots.ts'}
for pin in p['appendOnlyPrefixes']:assert sha((root/pin['path']).read_bytes()[:pin['prefixBytes']])==pin['prefixSha256']
assert sha((root/'docs/progress.md').read_bytes().split(b'\n---\n\n## Active slice: Stage 4',1)[1])==p['L2SuffixSha256']
assert s['existingRuntimeChanged'] is False and s['defaultActivation'] is False and s['noFullUnitNativeOrTimingAggregate'] is True
assert s['obligations']=={'testFile':0,'command':96,'campaign':63}
if '--raw' in sys.argv:
 for pin in json.loads((packet/'raw-artifacts.json').read_bytes()):
  b=Path(pin['path']).read_bytes();assert sha(b)==pin['sha256'] and len(b)==pin['bytes'],pin['path']
 frozen=json.loads(gzip.decompress(Path('test-results/f17-selection-owner/owned/inputs.json.gz').read_bytes()))
 for pin in frozen['sources']:
  if not pin['path'].startswith('docs/') and 'sha256' in pin:assert sha((root/pin['path']).read_bytes())==pin['sha256'],pin['path']
 prev=Path('/private/tmp/done-f17-selection-owner/before')
 old=json.loads((prev/'docs/release-validation-manifest.json').read_bytes());new=json.loads(Path('docs/release-validation-manifest.json').read_bytes())
 assert old['unresolved']==new['unresolved'] and len(old['rows'])+1==len(new['rows'])
 current={r['id']:r for r in new['rows']};prior={r['id'] for r in old['rows']}
 assert [r for r in new['rows'] if r['id'] not in prior]==[registration['added']]
 for a in old['rows']:
  b=current[a['id']]
  if a['id']=='test:test/release-validation/general-tests.test.mjs':assert json.dumps(a).replace('2077','2086')==json.dumps(b)
  else:assert a==b,a['id']
 c0=json.loads((prev/'docs/account-crypto/census.json').read_bytes());c=json.loads(Path('docs/account-crypto/census.json').read_bytes())
 assert {**c,'sources':c0['sources']}==c0
 assert [r for r in c['sources'] if r['path']!='src/crdt/selectionSnapshots.ts']==c0['sources']
 p0=json.loads((prev/'scripts/release-validation/general-tests.json').read_bytes());p1=json.loads(payload('source/scripts/release-validation/general-tests.json'))
 assert p1=={**p0,'vitest':sorted(p0['vitest']+['test/selectionSnapshots.test.ts'])}
assert sum(f.stat().st_size for f in packet.iterdir() if f.is_file())<250000
print('Verified 127 owned cases, 17 runner checks, four discriminating faults, sparse-input repair and one nine-case adapter. Owner remains unmounted; prior runtime and preservation pins match.')
