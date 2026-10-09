from pathlib import Path
import base64,gzip,lzma,hashlib,json,sys
root=Path(__file__).resolve().parent;sha=lambda b:hashlib.sha256(b).hexdigest()
s=json.loads((root/'summary.json').read_bytes());b=(root/'artifacts.json.xz').read_bytes();assert sha(b)==s['artifactsSha256'];a=json.loads(lzma.decompress(b));data={}
chunks={}
assert a['schema']==3 and a['encoding']=='chunked-utf8-or-base64'
for key,v in a['blobs'].items():
 b=v.encode('utf-8') if isinstance(v,str) else base64.b64decode(v['base64'],validate=True)
 assert sha(b)==key;chunks[key]=b
for name,item in a['files'].items():
 b=b''.join(chunks[key] for key in item['chunks']);assert len(b)==item['bytes'] and sha(b)==item['sha256'];data[name]=b
assert len(data)==s['payloads'];j=lambda name:json.loads(data[name])
q=j('owned/summary.json');assert q==s['qualification'] and q['status']=='passed' and len(q['stages'])==8
contracts={x['id']:x for x in j('phase/selection.json')};cases=0
normalize=lambda rows:sorted([{'id':x['id'],'outcome':x['outcome']} for x in rows],key=lambda x:x['id'])
def node_report(c,expect,nonce):
 assert c['nonce']==nonce and c['phase']=='complete' and not c['errors'] and c['summary']['success']
 assert normalize(c['cases'])==normalize(expect) and c['summary']['counts']['tests']==len(expect)
for stage in q['stages']:
 prefix='owned/stages/'+stage['key']+'/';r=j(prefix+'receipt.json');c=j(prefix+'cases.json');expect=r['contract']['expect']
 assert r['status']=='passed' and r['result']['groupDrained'] and stage['groupDrained'] and r['input']==q['input']
 for k,v in r['contract'].items():assert contracts[stage['id']][k]==v,k
 for pin in expect.get('historyInputs',[]):
  name='phase/historical-core.ts' if pin['reference']=='2cb42a2' else 'phase/historical-promotionRecord.ts'
  assert [pin['reference'],pin['path']] in [['2cb42a2','account-service/core.ts'],['81a4655','src/crdt/promotionRecord.ts']] and sha(data[name])==pin['sha256']
 if expect['kind'] in ['account-service-delivery','account-delivery']:
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
  assert len(tree['entries'])==(11 if expect['kind']=='account-service-delivery' else 13)
  for e in tree['entries']:
   if e['type']=='directory':assert e['path']=='case-reports';continue
   assert e['type']=='file' and sha(data[prefix+'files/'+e['path']])==e['sha256'] and len(data[prefix+'files/'+e['path']])==e['bytes']
  assert tree['bytes']==sum(e.get('bytes',0) for e in tree['entries']) and tree['bytes']<=r['contract']['fileOutputs']['maxBytes']
assert cases==159 and sum(x['reused'] for x in q['stages'])==1 and q['stages'][-1]['key']==q['stages'][5]['key']
prefix='owned/stages/'+q['stages'][5]['key']+'/';r=j(prefix+'receipt.json');f=lambda name:j(prefix+'files/'+name+'.json')
summary=f('summary');assert summary['status']=='passed' and summary['stages']==[{'name':'service','code':0,'timedOut':False}]
for name,normal,n,account,badn,badaccount in [('commit','accepted',1,'active',0,'active'),('generation','refused',1,'active',1,'active'),('current','unknown',0,'pending',1,'pending'),('witness','unknown',0,'active',1,'active')]:
 c=f('control-'+name);assert c['baseline']==dict(outcome=normal,persisted=n,account=account) and c['outcome']=='accepted' and c['persisted']==badn and c['account']==badaccount
g=f('generated');assert g['status']=='passed' and g['seed']==9822026 and len(g['histories'])==80
for h in g['histories']:
 assert 3<=len(h['commands'])<=16 and len(h['commands'])==len(h['observations']);ledger=[];retained=[];through=0
 for i,(cmd,o) in enumerate(zip(h['commands'],h['observations'])):
  assert cmd in ['accept','refuse','retry','restart','gap','future','before','after']
  if cmd=='restart' or (cmd=='retry' and retained) or cmd in ['gap','future']:
   assert o['kind']==('restart' if cmd=='restart' else 'retry' if cmd=='retry' else 'unknown')
   assert o['before']==o['after'] and o['rows']==ledger
   if cmd=='retry':assert o['index']==i%len(retained) and o['result']==retained[o['index']]
   elif cmd!='restart':assert o['result']['kind']=='unknown'
   continue
  kind='refused' if cmd=='refuse' else 'accepted';assert o['kind']=='decision' and o['proofKind']==kind and o['subject']['position']==through+1 and o['subject']['epoch']==1
  assert o['result']['kind']=='decision';response=json.loads(bytes.fromhex(o['result']['bytes']))
  assert response[:3]==['done/position-response/v1',1,kind] and response[3:6]==[o['subject']['workspace'],o['subject']['credential'],o['subject']['position']] and response[10 if kind=='accepted' else 6]==o['subject']['digest']
  if cmd in ['before','after']:assert o['first']['kind']=='unknown' and o['firstRows']==(ledger if cmd=='before' else o['rows'])
  else:assert o['first']==o['result'] and o['firstRows']==o['rows']
  ledger.append(dict(ordinal=len(ledger)+1,kind=kind,position=o['subject']['position'],digest=o['subject']['digest']));assert o['rows']==ledger
  retained.append(o['result']);through+=kind=='accepted'
  assert [r['position'] for r in ledger if r['kind']=='accepted']==list(range(1,through+1))
 assert h['finalRows']==ledger and h['recovered']==retained
raw=(root/'raw-artifacts.json').read_bytes();assert sha(raw)==s['rawIndexSha256']
if '--raw' in sys.argv:
 for item in json.loads(raw):assert sha(Path(item['path']).read_bytes())==item['sha256']
 inputs=json.loads(gzip.decompress(Path(next(x['path'] for x in json.loads(raw) if x['path'].endswith('/owned/inputs.json.gz'))).read_bytes()))
 pinned={x['path']:x for x in inputs['sources']}
 for p in f('sources'):assert pinned[p['path']]['sha256']==p['sha256']
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
print(f'Verified {len(data)} payloads, 159 real passed cases, exact service-delivery reuse, ten service reports, eight synthetic runs and two discriminating faults. No aggregate claim.')
