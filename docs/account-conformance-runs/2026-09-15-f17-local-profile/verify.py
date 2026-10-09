"""Verify retained diagnostic samples, CPU attribution, source and preservation. --raw checks local maps/inputs too."""
from pathlib import Path
import base64,collections,gzip,hashlib,json,math,subprocess,sys,tempfile
root=Path.cwd();packet=Path(__file__).resolve().parent;sha=lambda b:hashlib.sha256(b).hexdigest()
s=json.loads((packet/'summary.json').read_bytes())
assert sha((packet/'artifacts.json.gz').read_bytes())==s['artifactsSha256']
assert sha((packet/'raw-artifacts.json').read_bytes())==s['rawIndexSha256']
store=json.loads(gzip.decompress((packet/'artifacts.json.gz').read_bytes()))
assert len(store['files'])==s['fileCount'] and len(store['blobs'])==s['uniqueBlobCount']
for h,v in store['blobs'].items():assert sha(v['text'].encode())==h

def payload(name):
 p=store['files'][name];b=store['blobs'][p['sha256']]['text'].encode();assert len(b)==p['bytes'];return b
def read(name):return json.loads(payload(name))
for name in store['files']:payload(name)
run=read('run/summary.json');receipt=read('stage/receipt.json');cases=read('stage/cases.json');a=read('phase/analysis.json')
assert run['status']==receipt['status']==cases['status']=='passed'
assert len(run['stages'])==1 and run['stages'][0]==s['stage']
assert receipt['key']==s['stage']['key'] and receipt['result']['groupDrained'] is True
assert receipt['result']['browser']['groupDrained'] is True
for p in receipt['artifacts']:assert sha(payload('stage/'+p['path']))==p['sha256']
assert sha(payload('stage/cases.json'))==a['casesSha256']
assert sha(payload('stage/measurements.jsonl'))==a['measurementsSha256']
assert len(cases['cases'])==a['cases']==s['cases']==4
count=0;profiles=0
for c in cases['cases']:
 assert c['status']=='passed' and c['retry']==0
 for x in c['attachments']:
  body=base64.b64decode(x['base64']);assert len(body)==x['size'] and sha(body)==x['sha256']
  if x['name'].endswith('.cpuprofile.json.gz'):
   p=json.loads(gzip.decompress(body));row,=[q for q in a['profiles'] if (q['project'],q['label'])==(p['project'],p['label'])];profiles+=1
   assert row['attachmentSha256']==sha(body)
   nodes={n['id']:n for n in p['mapped']};parents={ch:n['id'] for n in nodes.values() for ch in n['children']}
   totals=collections.Counter();selftime=collections.Counter();classes=collections.Counter()
   assert len(p['raw']['samples'])==len(p['raw']['timeDeltas'])==row['samples']
   assert sum(p['raw']['timeDeltas'])==row['sampledWindowUs']
   for ident,us in zip(p['raw']['samples'],p['raw']['timeDeltas']):
    assert us>=0;selftime[ident]+=us;node=nodes[ident]
    path=node.get('source','').split('/checkout/')[-1]
    cls='application' if path.startswith('src/') else 'dependency' if path.startswith('node_modules/') else node['function'] if node['function'] in ['(idle)','(program)','(garbage collector)'] else 'unmapped-or-native'
    classes[cls]+=us;matched=set();seen=set()
    while ident is not None:
     assert ident not in seen;seen.add(ident);n=nodes[ident]
     loc=[n.get('source','').split('/checkout/')[-1],n.get('line')]
     matched.update(k for k,v in a['entryLocations'].items() if v==loc);ident=parents.get(ident)
    for k in matched:totals[k]+=us
    if 'forkDoc' in matched:totals['historyDocumentFork' if 'forkWorkspaceHistory' in matched else 'otherDocumentFork']+=us
   assert all(n['selfUs']==selftime[n['id']] for n in nodes.values())
   assert totals==collections.Counter(row['inclusiveUs']) and classes==collections.Counter(row['leafClassesUs'])
  elif x['name'].endswith('.json'):
   p=json.loads(body)
   if isinstance(p.get('samples'),list):
    samples=p['samples'];assert len(samples)==120 and all(math.isfinite(v) and v>=0 for v in samples)
    row,=[r for r in a['timings'] if (r['project'],r['surface'],r['block'])==(p['project'],p['surface'],p['block'])]
    assert row['p50']==sorted(samples)[59] and row['p95']==sorted(samples)[113];count+=len(samples)
assert count==a['timingCount']==s['rawTimings']==1440 and profiles==s['cpuProfiles']==4
assert s['timings']==a['timings']
for row in s['typingCpuMilliseconds']:
 p,=[p for p in a['profiles'] if p['project']==row['project'] and p['label']=='card-typing']
 assert row['inclusive']=={k:round(v/1000,3) for k,v in p['inclusiveUs'].items()}
variant=read('phase/variant.json');assert [p['path'] for p in variant['changed']]==['src/crdt/admittedWorkspace.ts']
assert sha(payload('phase/activation.patch'))==variant['activationPatch']
original=read('phase/original-source-pins.json')
for p in original['productAndDiagnosticPins']:
 if 'sha256' in p:assert sha((root/p['path']).read_bytes())==p['sha256'],p['path']
for p in a['sourcePins']:assert sha(payload('candidate/'+p['path']))==p['sha256']
module=(root/'src/crdt/admittedWorkspace.ts').read_text();needle='    options,\n  );\ntype State = {'
assert module.count(needle)==1
assert module.replace(needle,"    options,\n    'local-handoff',\n  );\ntype State = {").encode()==payload('candidate/src/crdt/admittedWorkspace.ts')
p=read('phase/preservation.json')
assert len(p['personalAndVectorPins'])==52
for pin in p['personalAndVectorPins']+p['priorPackets']:assert sha((root/pin['path']).read_bytes())==pin['sha256'],pin['path']
for pin in p['appendOnlyPrefixes']:assert sha((root/pin['path']).read_bytes()[:pin['prefixBytes']])==pin['prefixSha256']
assert sha((root/'docs/progress.md').read_bytes().split(b'\n---\n\n## Active slice: Stage 4',1)[1])==p['L2SuffixSha256']
phone=read('phase/phone-disposition.json');assert phone['serverExit']==phone['adbKillExit']==0 and phone['dedicatedAdbPort']==5047
assert phone['manualKeyboard'].startswith('cancelled') and s['defaultActivation'] is False
assert s['conversion']['candidate']==87/63.5 and s['conversion']['reference']==108.1/69.4
assert s['obligations']=={'testFile':0,'command':96,'campaign':63}
if '--raw' in sys.argv:
 for pin in json.loads((packet/'raw-artifacts.json').read_bytes()):assert sha(Path(pin['path']).read_bytes())==pin['sha256'],pin['path']
 before=json.loads(gzip.decompress(Path('/private/tmp/done-f17-local-profile/before-inputs.json.gz').read_bytes()))
 for pin in before['sources']:
  if not pin['path'].startswith('docs/') and 'sha256' in pin:assert sha((root/pin['path']).read_bytes())==pin['sha256'],pin['path']
 subprocess.run(['node','/private/tmp/done-f17-local-profile/verify-maps.mjs',a['rawOutput'],'/private/tmp/done-f17-local-profile/diagnostic-candidate','/private/tmp/done-f17-local-profile/rechecked-maps.json'],check=True)
 assert json.loads(Path('/private/tmp/done-f17-local-profile/rechecked-maps.json').read_bytes())==read('phase/source-maps.json')
assert sum(f.stat().st_size for f in packet.iterdir() if f.is_file())<250000
print('Verified four cases, 1,440 timings, four CPU profiles, inclusive attribution, candidate activation, preserved packets/pins and cancelled phone continuation.')
