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
  assert [pin['reference'],pin['path']]==['2cb42a2','account-service/core.ts'] and sha(data['phase/historical-core.ts'])==pin['sha256']
 if expect['kind'] in ['account-inbound-prep','account-service-delivery']:
  assert c['schema']==1 and c['adapter']=='campaign-v1' and c['nonce']==r['nonce'] and c['phase']=='complete'
  assert len(c['steps'])==len(expect['steps']) and [v['name'] for v in c['steps']]==[v['name'] for v in expect['steps']]
  for pin in expect.get('dataInputs',[]):assert sha(data['current/'+pin['path']])==pin['sha256']
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
    assert sorted(v['file'] for v in child['modules'])==sorted(want['expect']['files'])
    for v in child['cases']:assert v['retryCount']==0 and v['repeatCount']==0 and not v['errors'] and v['mode']=='run' and not v['expectedFailure']
   actual+=child['cases']
  assert normalize(actual)==normalize(expect['cases']) and len(actual)==len(expect['cases'])
 else:node_report(c,expect['cases'],r['nonce'])
 if not stage['reused']:cases+=len(expect['cases'])
 for artifact in r['artifacts']:assert sha(data[prefix+artifact['path']])==artifact['sha256']
 if r['contract'].get('fileOutputs'):
  tree=j(prefix+'files.json');assert tree['complete'] and tree==r['result']['fileOutputs']
  assert len(tree['entries'])==(17 if expect['kind']=='account-inbound-prep' else 11)
  for e in tree['entries']:
   if e['type']=='directory':assert e['path']=='case-reports';continue
   assert e['type']=='file' and sha(data[prefix+'files/'+e['path']])==e['sha256'] and len(data[prefix+'files/'+e['path']])==e['bytes']
  assert tree['bytes']==sum(e.get('bytes',0) for e in tree['entries']) and tree['bytes']<=r['contract']['fileOutputs']['maxBytes']
assert cases==205 and sum(x['reused'] for x in q['stages'])==1 and q['stages'][-1]['key']==q['stages'][5]['key']
prefix='owned/stages/'+q['stages'][6]['key']+'/';r=j(prefix+'receipt.json');f=lambda name:j(prefix+'files/'+name+'.json')
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
prefix='owned/stages/'+q['stages'][5]['key']+'/';f=lambda name:j(prefix+'files/'+name+'.json')
fixture=f('fixtures');g=f('generated');assert g['status']=='passed' and g['seed']==9142026 and g['runs']==len(g['histories'])==300
entries=fixture['entries'];assert len(entries)==4
for i,e in enumerate(entries):assert e['publisher']==('11' if i<2 else '22')*16 and e['position']==i%2+1
# Replay of plaintext Yjs is performed by the archived JS adapter during the owned
# epoch. Offline Python corroborates cursor/ledger/coverage and final text only.
def check_observation(o,indices):
 selected=[entries[i] for i in indices];cursor={e['publisher']:e['position'] for e in selected}
 assert o['cursor']==cursor and o['captures']==0 and isinstance(o['pending'],bool) and isinstance(o['text'],str)
 ledger=[['received',e['publisher'],e['position'],e['envelope'],e['proof']] for e in selected]
 assert o['ledgerHash']==sha(json.dumps(ledger,separators=(',',':')).encode())
for h in g['histories']:
 assert 4<=len(h['history'])<=24 and len(h['observations'])==len(h['history']);accepted=[]
 for op,o in zip(h['history'],h['observations']):
  assert 0<=op['index']<4 and op['cut'] in ['none','before','after'] and isinstance(op['close'],bool) and isinstance(op['compact'],bool)
  e=entries[op['index']];prior=sum(entries[i]['publisher']==e['publisher'] for i in accepted)
  if e['position']==prior+1 and not op['close'] and op['cut']!='before':accepted.append(op['index'])
  check_observation(o,accepted)
 for i in range(4):
  if i not in accepted:accepted.append(i)
 check_observation(h['final'],accepted);assert not h['final']['pending'] and h['final']['text']==fixture['expected']
c=f('control-deletion-coverage');assert c['sameStateVector'] and not c['sameSnapshot'] and c['complete']!=c['omittedDeletion']
c=f('control-baseline');assert c['signatureWithAttackerBaseline']=='accepted' and c['heldBaseline']=='unknown' and c['missingGenesis']['pending'] and c['missingGenesis']['text']!=fixture['expected']
c=f('control-split');assert c['received']==1 and c['contentRecords']==0 and 'Content does not cover' in c['error']
c=f('control-pending');assert c['expected']==fixture['expected'] and c['afterDroppingPendingDeletion']!=c['expected']
c=f('control-early-promotion');assert c['pending'] and c['beforeKill']!=c['coldWithoutRemoteCommit']
c=f('control-global-cursor');assert c['cursor']==2 and c['expected']==fixture['expected'] and c['actual']!=c['expected']
c=f('control-relabel');assert c['sameUpdate'] and c['correctReceiverCapsules']==0 and c['originalPublisher']!=c['newCapsulePublisher']
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
for m in mutations:assert sha(data['current/scripts/release-validation/'+m['baseFile']])==m['before'] and sha(data['mutants/scripts/release-validation/'+m['file']])==m['after']
if '--current' in sys.argv:
 repo=root.parents[2]
 for name,b in data.items():
  if name.startswith('current/'):assert (repo/name.removeprefix('current/')).read_bytes()==b,name
print(f'Verified {len(data)} payloads, 205 real passed cases, exact inbound-preparation reuse, sixteen inbound reports, eight synthetic runs and two discriminating faults. No aggregate claim.')
