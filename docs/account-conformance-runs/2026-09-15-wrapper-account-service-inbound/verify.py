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

 for pin in expect.get('historyInputs',[]):assert sha(data['phase/historical-'+Path(pin['path']).name])==pin['sha256'] and pin['reference'] in ['4bb09042f37f68ec31f0d82587af608f599eb096','2cb42a2']
 if expect['kind'] in ['account-service-inbound','account-service-delivery']:
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
  assert len(tree['entries'])==(21 if expect['kind']=='account-service-inbound' else 11)
  for e in tree['entries']:
   if e['type']=='directory':assert e['path'] in ['case-reports','regression-artifacts'];continue
   assert e['type']=='file' and sha(data[prefix+'files/'+e['path']])==e['sha256'] and len(data[prefix+'files/'+e['path']])==e['bytes']
  assert tree['bytes']==sum(e.get('bytes',0) for e in tree['entries']) and tree['bytes']<=r['contract']['fileOutputs']['maxBytes']
assert cases==189 and sum(x['reused'] for x in q['stages'])==1 and q['stages'][-1]['key']==q['stages'][5]['key']
prefix='owned/stages/'+q['stages'][5]['key']+'/';f=lambda name:j(prefix+'files/'+name+'.json')
def wire(v):
 b=bytes.fromhex(v);assert b and b.hex()==v and len(b)<=512*1024;return b
def frame(v,domain,n):
 b=wire(v);p=json.loads(b);assert p[:2]==[domain,2] and len(p)==n;assert json.dumps(p,separators=(',',':'),ensure_ascii=False).encode()==b;return p
def query(v):
 p=frame(v,'done/private-read/v2',15);assert isinstance(p[10],int) and p[10]>=0 and 1<=p[11]<=8;return p
def unchanged(o):assert len(bytes.fromhex(o['before']))==32 and o['after']==o['before']
def page(o,originals,pub=None):
 assert o['result']['kind']=='decision';qv=query(o['request']);p=frame(o['result']['bytes'],'done/private-read-page/v2',7);assert p[2]==sha(wire(o['request'])) and p[3]==len(originals) and len(p[5])<=qv[11] and p[4]==qv[10]+len(p[5]) and p[4]<=p[3] and (p[4]==p[3] or p[5]);assert len(wire(p[6]))==64
 for i,e in enumerate(p[5]):assert e==[originals[qv[10]+i]['envelope'],originals[qv[10]+i]['result']['bytes']]
 if pub is not None:assert len(bytes.fromhex(pub))==32
 return p[4]
# The owned Node reconciler verifies these page signatures. This portable verifier
# checks retained byte identities, framing and signature sizes without crypto dependencies.
for mode in ['reader','publisher','signature','current','registration','witness','expiry','custody']:
 c=f('control-'+mode);assert c['control']==mode and len(c['ordinary'])==2 and len(c['originals'])==1
 for o in c['ordinary']:assert page(o,c['originals'],c['publicKey'])==1
 query(c['baseline']['request']);assert c['baseline']['result']['kind']=='unknown';assert page(c['mutant'],[] if mode=='witness' else c['originals'],c['publicKey'])==(0 if mode=='witness' else 1)
 if mode=='registration':
  assert len(c['activation'])==2
  for o in c['activation']:query(o['request']);assert o['result']['kind']=='unknown'
 else:assert c['activation']==[]
for cut in ['verified','signed']:
 c=f('restart-'+cut);assert c['cut']==cut and c['code'] is None and c['signal']=='SIGKILL' and c['replies']==0;unchanged(c);assert len(c['originals'])==1 and page(c,c['originals'],c['publicKey'])==1
g=f('generated');assert g['status']=='passed' and g['seed']==9112031 and len(g['histories'])==60 and g['details']=={'failed':False,'numRuns':60,'numShrinks':0,'counterexample':None,'counterexamplePath':None,'error':None};coverage={}
for h in g['histories']:
 assert h['completed'] and 4<=len(h['commands'])<=14 and len(h['commands'])==len(h['observations']);originals=[];saved=None;inventory=None
 for c,o in zip(h['commands'],h['observations']):
  assert c['op'] in ['append','read','restart','replay','reader','publisher','ledger'] and o['op']==c['op'] and 1<=c['limit']<=8 and 0<=c['cursor']<=20;coverage[c['op']]=coverage.get(c['op'],0)+1
  assert len(bytes.fromhex(o['before']))==len(bytes.fromhex(o['after']))==32
  if inventory is not None:assert o['before']==inventory
  inventory=o['after']
  if c['op']=='append':
   assert o['position']==len(originals)+1 and o['result']['kind']=='decision';wire(o['envelope']);result=json.loads(wire(o['result']['bytes']));assert result[:3]==['done/position-response/v1',1,'accepted'] and result[5]==o['position'] and o['after']!=o['before'];originals.append({'envelope':o['envelope'],'result':o['result']});continue
  unchanged(o)
  if c['op']=='restart':continue
  qv=query(o['request'])
  if c['op']=='replay' and saved is not None:assert o['request']==saved
  else:assert qv[10]==c['cursor']%(len(originals)+1) and qv[11]==c['limit']
  if c['op'] in ['reader','publisher']:assert qv[5 if c['op']=='reader' else 6]=='ac'*16 and o['result']['kind']=='unknown'
  elif c['op']=='ledger' and originals:assert o['result']['kind']=='unknown' and len(bytes.fromhex(o['faulted']))==32 and o['faulted']!=o['before']
  else:page(o,originals,h['publicKey']);saved=o['request']
 after=0;assert 1<=len(h['final'])<=max(1,len(originals))
 for o in h['final']:unchanged(o);assert o['before']==inventory and query(o['request'])[10:12]==[after,1];after=page(o,originals,h['publicKey'])
 assert after==len(originals)
assert g['coverage']==coverage and all(coverage[op]>0 for op in ['append','read','restart','replay','reader','publisher','ledger'])
n=f('native-http');assert [[o['tag'],o['status']] for o in n['refused']]==[['v1',409],['Origin',403],['Content-Type',403],['Authorization',403],['size',413],['signature',409]] and len(n['originals'])==len(n['pages'])==2
originals=[{'envelope':n['originals'][i],'result':{'kind':'decision','bytes':frame(o['response']['bytes'],'done/private-read-page/v2',7)[5][0][1]}} for i,o in enumerate(n['pages'])]
for i,o in enumerate(n['pages']):
 assert o['position']==i+1 and query(o['request'])[10]==i and o['response']['status']==200 and o['response']['cache']=='no-store' and o['response']['type']=='application/octet-stream' and o['retry']==o['response']
 assert page({'request':o['request'],'result':{'kind':'decision','bytes':o['response']['bytes']}},originals)==i+1 and o['outcome']['kind']=='received' and o['outcome']['status']['receivedThrough']==i+1
assert n['duplicate']['kind']=='duplicate' and n['beforeCold']['receivedThrough']==2 and n['afterCold']==n['beforeCold'] and query(n['end']['request'])[10]==2 and n['end']['response']['status']==200
assert page({'request':n['end']['request'],'result':{'kind':'decision','bytes':n['end']['response']['bytes']}},originals)==2 and n['end']['outcome']['kind']=='empty'
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

failed=j('owned-failed-planning/summary.json');assert failed['status']=='failed' and len(failed['stages'])==1 and failed['input']!=q['input']
p='owned-failed-planning/stages/'+failed['stages'][0]['key']+'/';fr=j(p+'receipt.json');fc=j(p+'cases.json');assert fr['status']=='failed' and fr['result']['code']==1 and fr['result']['groupDrained']
assert len(fc['cases'])==70 and sum(c['outcome']=='pass' for c in fc['cases'])==69 and [c['id'] for c in fc['cases'] if c['outcome']!='pass']==['test/release-validation/manifest.test.mjs::report-writing preparation remains a separate variant with required retained output']
for artifact in fr['artifacts']:assert sha(data[p+artifact['path']])==artifact['sha256']
assert data['failed-source-owned-planning/test/release-validation/manifest.test.mjs']!=data['current/test/release-validation/manifest.test.mjs']
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
print(f'Verified {len(data)} payloads, 189 real passed cases, exact service-inbound reuse, twenty service-inbound reports, eight synthetic runs and two discriminating faults. No aggregate claim.')
