"""Verify bounded baseline evidence, exact registrations and preservation; --raw checks local large inputs."""
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
assert run['input']==s['owned']['input'] and len(run['stages'])==6
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
assert count==s['owned']['cases']==118
assert [p['seed'] for p in s['properties']]==[150901,150902]
assert s['properties'][0]['runs']==96 and s['properties'][1]['runsPerStrategy']==80
for path in ['test/pendingProjection.test.ts','test/workspaceAdmission.test.ts','test/release-validation/general-tests.test.mjs','test/release-validation/generated-tests.test.mjs']:
 assert (root/path).read_bytes()==payload('source/'+path),path
assert re.search(r'seed: 150901, numRuns: 96',payload('source/test/pendingProjection.test.ts').decode())
assert re.search(r'seed: 150902, numRuns: 80',payload('source/test/workspaceAdmission.test.ts').decode())
controls=read('phase/controls.json');assert controls==s['controls'] and len(controls)==3
for c in controls:
 assert c['exit']==1 and c['intendedFailure'] is True
 log=c.get('log',c['name']+'.log')
 assert c['marker'] in payload('phase/'+log).decode()
 assert 'Counterexample:' in payload('phase/'+log).decode()
 assert payload('phase/'+c['name']+'.patch').startswith(('--- a/'+c['path']).encode())
 assert 'mutation must match exactly once' in payload('phase/'+c['name']+'.config.mts').decode()
assert read('initial-controls/controls.json')[0]['intendedFailure'] is False
assert b'Prototype' in payload('initial-controls/share-nested.log') or b'RelativePosition' in payload('initial-controls/share-nested.log')
gates=read('phase/gates.json');assert {g['name'] for g in gates}=={'runner','typecheck','format','lint','inventory','manifest','authority','whitespace'}
assert all(g['exit']==0 for g in gates)
for g in gates:payload('phase/'+g['log'])
assert re.search(r'tests 17',payload('phase/runner-final.log').decode()) and s['runnerChecks']==17
registration=read('phase/registration.json');assert registration==s['registration']
assert registration['totalRows']==616 and registration['unresolved']==159 and registration['generalDispositions']==2077
assert sum(r['after']-r['before'] for r in registration['additions'] if 'after' in r)==4
assert len(registration['additions'])==3 and registration['priorContractsPreserved']==613
p=read('phase/preservation.json');assert len(p['personalAndVectorPins'])==52
for pin in p['personalAndVectorPins']+p['priorPackets']+p['runtimePins']:assert sha((root/pin['path']).read_bytes())==pin['sha256'],pin['path']
assert {str(f) for f in Path('src').rglob('*') if f.is_file()}=={pin['path'] for pin in p['runtimePins']}
for pin in p['appendOnlyPrefixes']:assert sha((root/pin['path']).read_bytes()[:pin['prefixBytes']])==pin['prefixSha256']
assert sha((root/'docs/progress.md').read_bytes().split(b'\n---\n\n## Active slice: Stage 4',1)[1])==p['L2SuffixSha256']
assert s['runtimeChanged'] is False and s['defaultActivation'] is False and s['noFullUnitNativeOrTimingAggregate'] is True
assert s['obligations']=={'testFile':0,'command':96,'campaign':63}
if '--raw' in sys.argv:
 for pin in json.loads((packet/'raw-artifacts.json').read_bytes()):assert sha(Path(pin['path']).read_bytes())==pin['sha256'],pin['path']
 frozen=json.loads(gzip.decompress(Path('test-results/f17-selection-contract/owned/inputs.json.gz').read_bytes()))
 for pin in frozen['sources']:
  if not pin['path'].startswith('docs/') and 'sha256' in pin:assert sha((root/pin['path']).read_bytes())==pin['sha256'],pin['path']
 old=json.loads(Path('/private/tmp/done-f17-selection-contract/before/docs/release-validation-manifest.json').read_bytes())
 new=json.loads(Path('docs/release-validation-manifest.json').read_bytes())
 changed={r['id']:r for r in registration['additions']}
 assert old['unresolved']==new['unresolved'] and len(old['rows'])==len(new['rows'])
 for a,b in zip(old['rows'],new['rows']):
  assert a['id']==b['id']
  if a['id'] not in changed:assert a==b
  elif 'change' in changed[a['id']]:assert json.dumps(a).replace('2073','2077')==json.dumps(b)
  else:
   assert all(c in b['stage']['expect']['cases'] for c in a['stage']['expect']['cases'])
   added=[c for c in b['stage']['expect']['cases'] if c not in a['stage']['expect']['cases']]
   assert added==changed[a['id']]['added']
assert sum(f.stat().st_size for f in packet.iterdir() if f.is_file())<250000
print('Verified 118 owned cases, 17 runner checks, three discriminating faults, four case additions and unchanged runtime/preservation pins. Component remains unimplemented.')
