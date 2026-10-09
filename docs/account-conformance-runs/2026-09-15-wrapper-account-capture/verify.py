from pathlib import Path
import base64,gzip,hashlib,json,sys
root=Path(__file__).resolve().parent;sha=lambda b:hashlib.sha256(b).hexdigest()
s=json.loads((root/'summary.json').read_bytes());b=(root/'artifacts.json.gz').read_bytes();assert sha(b)==s['artifactsSha256'];a=json.loads(gzip.decompress(b));data={}
chunks={}
assert a['schema']==3 and a['encoding']=='chunked-utf8-or-base64'
for key,v in a['blobs'].items():
 b=v.encode('utf-8') if isinstance(v,str) else base64.b64decode(v['base64'],validate=True)
 assert sha(b)==key;chunks[key]=b
for name,item in a['files'].items():
 b=b''.join(chunks[key] for key in item['chunks']);assert len(b)==item['bytes'] and sha(b)==item['sha256'];data[name]=b
assert len(data)==s['payloads'];j=lambda name:json.loads(data[name])
q=j('owned/summary.json');assert q==s['qualification'] and q['status']=='passed' and len(q['stages'])==7
contracts={x['id']:x for x in j('phase/selection.json')};cases=0
normalize=lambda rows:sorted([{'id':x['id'],'outcome':x['outcome']} for x in rows],key=lambda x:x['id'])
def node_report(c,expect,nonce):
 assert c['nonce']==nonce and c['phase']=='complete' and not c['errors'] and c['summary']['success']
 assert normalize(c['cases'])==normalize(expect) and c['summary']['counts']['tests']==len(expect)
for stage in q['stages']:
 prefix='owned/stages/'+stage['key']+'/';r=j(prefix+'receipt.json');c=j(prefix+'cases.json');expect=r['contract']['expect']
 assert r['status']=='passed' and r['result']['groupDrained'] and stage['groupDrained'] and r['input']==q['input']
 for k,v in r['contract'].items():assert contracts[stage['id']][k]==v,k
 for pin in expect.get('historyInputs',[]):assert pin['reference']=='18ceb40' and pin['path']=='src/crdt/promotionRecord.ts' and sha(data['phase/historical-promotionRecord.ts'])==pin['sha256']
 if expect['kind'] in ['account-outbound','account-capture']:
  assert c['schema']==1 and c['adapter']=='campaign-v1' and c['nonce']==r['nonce'] and c['phase']=='complete'
  assert len(c['steps'])==len(expect['steps']) and [v['name'] for v in c['steps']]==[v['name'] for v in expect['steps']]
  actual=[]
  for step,want in zip(c['steps'],expect['steps']):
   for k in ['name','kind','argv','deadlineMs']:assert step[k]==want[k]
   assert step['phase']=='complete' and step['code']==0 and step['timedOut'] is False
   if step['kind']=='exit':continue
   child=j(prefix+'files/case-reports/'+step['name']+'.json');nonce=r['nonce']+':'+step['name']
   if step['kind']=='node':node_report(child,want['expect']['cases'],nonce)
   else:
    assert child['nonce']==nonce and child['adapter']=='vitest-v1' and child['reason']=='passed' and not child['errors']
    assert normalize(child['cases'])==normalize(want['expect']['cases'])
    assert all(v['state']=='passed' for v in child['modules'])
    for v in child['cases']:assert v['retryCount']==0 and v['repeatCount']==0 and not v['errors'] and v['mode']=='run'
   actual+=child['cases']
  assert normalize(actual)==normalize(expect['cases']) and len(actual)==len(expect['cases'])
 else:node_report(c,expect['cases'],r['nonce'])
 if not stage['reused']:cases+=len(expect['cases'])
 for artifact in r['artifacts']:assert sha(data[prefix+artifact['path']])==artifact['sha256']
 if r['contract'].get('fileOutputs'):
  tree=j(prefix+'files.json');assert tree['complete'] and tree==r['result']['fileOutputs']
  assert len(tree['entries'])==(11 if expect['kind']=='account-capture' else 19)
  for e in tree['entries']:
   if e['type']=='directory':assert e['path']=='case-reports';continue
   assert e['type']=='file' and sha(data[prefix+'files/'+e['path']])==e['sha256'] and len(data[prefix+'files/'+e['path']])==e['bytes']
  assert tree['bytes']==sum(e.get('bytes',0) for e in tree['entries']) and tree['bytes']<=r['contract']['fileOutputs']['maxBytes']
assert cases==128 and sum(x['reused'] for x in q['stages'])==1 and q['stages'][-1]['key']==q['stages'][4]['key']
prefix='owned/stages/'+q['stages'][4]['key']+'/';r=j(prefix+'receipt.json');f=lambda name:j(prefix+'files/'+name+'.json')
summary=f('summary');assert summary['status']=='passed' and len(summary['stages'])==2
assert all(x['code']==0 and x['timedOut'] is False for x in summary['stages'])
control=f('controls');retention=control['retention'];route=control['route']
assert retention['baseline']['after']==retention['baseline']['before']+1 and retention['mutant']['captures']==0
assert retention['baseline']['text']==retention['mutant']['text']=='base control original'
assert route['baseline']['status']=='refused' and route['baseline']['actualWorkspace']!=route['baseline']['expectedWorkspace']
assert route['mutant']==dict(route['baseline'],status='accepted')
g=f('generated');assert g['status']=='passed' and g['seed']==9322026 and g['runs']==len(g['histories'])==16
for h in g['histories']:
 original={c['id']:c for c in h['initial']};expected='base original'
 assert len(h['steps'])==len(h['commands']) and 2<=len(h['commands'])<=6
 for command,step in zip(h['commands'],h['steps']):
  expected=command['text']+(expected[1:] if command['cut'] else expected)
  assert step['observed']==expected
  admitted={c['id']:c for c in step['admitted']};recovered={c['id']:c for c in step['recovered']}
  assert len(admitted)==len(step['admitted']) and len(recovered)==len(step['recovered'])
  for identity,capsule in original.items():assert admitted[identity]==capsule
  original.update({k:v for k,v in admitted.items() if k not in original})
  assert original==admitted
  for identity,capsule in original.items():assert recovered[identity]==capsule
  for identity,capsule in recovered.items():
   if identity in original:continue
   assert command['boundary'] in ['reopen','crash']
   for field in ['v','workspace','principal','credential','epoch','generation']:assert capsule[field]==h['initial'][0][field]
   assert capsule['sources']==[dict(actor=capsule['principal'],kind='human',bytes=[0,0])]
   original[identity]=capsule
b=f('overhead');assert b['attempt']['status']=='refused' and b['attempt']['reason']=='oversize' and len(b['update'])>10000
assert b['savedBytes']==[[b['update']]]
raw=(root/'raw-artifacts.json').read_bytes();assert sha(raw)==s['rawIndexSha256']
if '--raw' in sys.argv:
 for item in json.loads(raw):assert sha(Path(item['path']).read_bytes())==item['sha256']
 inputs=json.loads(gzip.decompress(Path(next(x['path'] for x in json.loads(raw) if x['path'].endswith('/owned/inputs.json.gz'))).read_bytes()))
 pinned={x['path']:x for x in inputs['sources']}
 for p in f('sources'):assert pinned[p['path']]['sha256']==p['sha256']
failed=j('failed-owned/summary.json');assert failed['status']=='failed'
for stage in failed['stages']:
 prefix='failed-owned/stages/'+stage['key']+'/';r=j(prefix+'receipt.json');assert r['result']['groupDrained']
 for artifact in r['artifacts']:assert sha(data[prefix+artifact['path']])==artifact['sha256']
assert b'Recovered capture population changed' in data['phase/qualification-failed.log'] or any(b'Recovered capture population changed' in v for k,v in data.items() if k.startswith('failed-owned/'))
controls=j('phase/process-controls.json');assert len(controls)==8
for control in controls:
 p='controls/'+control['name']+'/receipts/'+control['key']+'/';cr=j(p+'receipt.json');assert cr['result']['code']==0 and cr['result']['groupDrained']
 assert cr['status']==control['status'] and cr['result']['reason']==control['reason']
 for artifact in cr['artifacts']:assert sha(data[p+artifact['path']])==artifact['sha256']
 assert control['status']==('passed' if control['name'] in ['valid','omitted-semantic-hook','omitted-child-census'] else 'failed')
mutations=j('phase/mutations.json');assert len(mutations)==2 and all(x['detected'] for x in mutations)
for m in mutations:assert sha(data['current/scripts/release-validation/stage.mjs'])==m['before'] and sha(data['mutants/scripts/release-validation/'+m['file']])==m['after']
if '--current' in sys.argv:
 repo=root.parents[2]
 for name,b in data.items():
  if name.startswith('current/'):assert (repo/name.removeprefix('current/')).read_bytes()==b,name
print(f'Verified {len(data)} payloads, 128 real passed cases, exact capture reuse, ten capture reports, eight synthetic runs and two discriminating faults. No aggregate claim.')
