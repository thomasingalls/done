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
  assert [pin['reference'],pin['path']]==['8378596','src/crdt/promotionRecord.ts'] and pin['sha256']==sha(data['phase/historical-promotionRecord.ts'])
 if expect['kind'] in ['account-receive-editor','account-receive']:
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
  assert len(tree['entries'])==(14 if expect['kind']=='account-receive-editor' else 25)
  for e in tree['entries']:
   if e['type']=='directory':assert e['path'] in ['case-reports','regression-artifacts'];continue
   assert e['type']=='file' and sha(data[prefix+'files/'+e['path']])==e['sha256'] and len(data[prefix+'files/'+e['path']])==e['bytes']
  assert tree['bytes']==sum(e.get('bytes',0) for e in tree['entries']) and tree['bytes']<=r['contract']['fileOutputs']['maxBytes']
assert cases==329 and sum(x['reused'] for x in q['stages'])==1 and q['stages'][-1]['key']==q['stages'][5]['key']
prefix='owned/stages/'+q['stages'][6]['key']+'/';f=lambda name:j(prefix+'files/'+name+'.json')
fixture=f('independent-bytes');request=json.loads(bytes.fromhex(fixture['request']));page=json.loads(bytes.fromhex(fixture['page']));record=json.loads(bytes.fromhex(fixture['record']))
assert request[:2]==['done/private-read/v2',2] and len(request)==15 and request[5]!=request[6]
assert page[:2]==['done/private-read-page/v2',2] and len(page)==7 and page[2]==sha(bytes.fromhex(fixture['request']))
assert record[:2]==['done/account-inbound/v1',1] and len(record)==13 and record[11:]==[fixture['request'],fixture['page']]
assert record[3:7]==[request[7],request[8],request[5],request[6]] and record[7]=='received' and record[8]==page[4]
assert fixture['observedRecord']==fixture['record'] and fixture['observedUpdates']==fixture['updates']
g=f('generated');assert g['status']=='passed' and g['seed']==9152026 and g['runs']==len(g['histories'])==400
for h in g['histories']:
 assert h['expectedRecord']==h['observedRecord']==h['coldRecord'] and len(h['expectedRecord'])==64
 assert h['observedUpdates']==h['coldUpdates']==[h['update']] and 'actor' in h['actorRefusal'] and 1<=h['nonce']<=250
c=f('wire-corruptions');assert c['status']=='passed' and c['seed']==9162026 and c['page']==sha(bytes.fromhex(fixture['page'])) and len(c['mutations'])==500
for m in c['mutations']:assert m['original']==bytes.fromhex(fixture['page'])[m['index']] and 1<=m['mask']<=255 and m['changed']==m['original']^m['mask'] and m['reason']
source=data['current/src/crdt/accountInbound.ts'].decode()
for mode in ['page-signature','request-binding','prefix-proof','actor','record-binding','batch-count','buffer-copy','late-close']:
 c=f('control-'+mode);assert c['mode']==mode and c['mutation']['before']==sha(source.encode());after=source
 for before,replacement in c['changes']:assert after.count(before)==1;after=after.replace(before,replacement)
 if mode=='prefix-proof':after="import { decodePositionResponse } from '../../account-protocol/positionDecision';\n"+after
 assert c['mutation']['after']==sha(after.encode()) and c['mutation']['hits']==len(c['changes'])
 o=c['observation']
 if mode=='buffer-copy':assert o['normalRetained']==o['normalRequest']==o['mutantRequest'] and o['mutantRetained']!=o['mutantRequest'] and o['coldError'];continue
 assert o['normalError'] and o['mutantKind']=='received'
 if mode=='record-binding':assert 'record' in o['normalError'] and o['storedBaseline']!=o['heldBaseline']
 elif mode=='late-close':assert 'closed' in o['normalError'] and o['closed']
 else:assert o['updates']==(256 if mode=='batch-count' else 1) and o['actor']=={'id':('22' if mode=='actor' else '11')*16,'kind':'human'}
prefix='owned/stages/'+q['stages'][6]['key']+'/';f=lambda name:j(prefix+'files/'+name+'.json')
c=f('control-coverage');assert 'coverage' in c['normalError'].lower() and [v['branch'] for v in c['single']]==['reuse','fallback'] and all('coverage' in v['error'].lower() for v in c['single']) and c['joint']['receivedThrough']==1
c=f('control-witness');assert c['normalError'] and c['changed']['receivedThrough']==0
c=f('control-split');assert 'coverage' in c['readbackError'].lower() and 'coverage' in c['coldError'].lower()
c=f('control-stored-page');assert 'unverified' in c['normalError'] and c['changed']['receivedThrough']==1
u=f('unit-ledger-histories');assert u['status']=='passed' and u['seed']==9172026 and len(u['histories'])==200
for h in u['histories']:
 assert h['text'] and 0<=h['n']<=60 and all(bytes.fromhex(h[k]) for k in ['insert','deletion','merged']) and 'coverage' in h['missing']
 if h['n']>0:assert 'coverage' in h['withoutDeletion']
 else:assert h['withoutDeletion'] is None
g=f('generated-native');assert g['status']=='passed' and g['seed']==9182026 and g['runs']==len(g['histories'])==12
for h in g['histories']:
 n=len(h['actions']);assert 1<=n<=3 and all(len(h[k])==n for k in ['frames','wires','events','observations']);previous='00'*32
 for i,(action,o,e) in enumerate(zip(h['actions'],h['observations'],h['events'])):
  assert action['cut'] in ['none','before','after'] and isinstance(action['cold'],bool) and isinstance(action['compact'],bool)
  assert o['cutCursor']==(None if action['cut']=='none' else i+(action['cut']=='after'))
  assert o['result']['kind']==('duplicate' if action['cut']=='after' else 'received') and o['result']['recorded']==(action['cut']!='after')
  for status in [o['status'],o['result']['status']]:assert status=={'state':'ready','receivedThrough':i+1,'link':o['link'],'observedThrough':n}
  event=json.loads(bytes.fromhex(e['bytes']));request=json.loads(bytes.fromhex(o['request']));page=json.loads(bytes.fromhex(o['page']))
  assert event[:2]==['done/account-inbound/v1',1] and len(event)==13 and event[7:11]==['received',i+1,previous,o['link']] and event[11:]==[o['request'],o['page']]
  assert event[3:7]==[request[7],request[8],request[5],request[6]] and request[10]==i
  assert page[:2]==['done/private-read-page/v2',2] and page[2]==sha(bytes.fromhex(o['request'])) and page[3:5]==[n,i+1] and page[5][0][0]==h['wires'][i];previous=o['link']
 assert h['value']==''.join(map(str,range(n))) and not h['pending'] and 0<len(h['content'])<=128
 assert all(e['seq']>0 and e['kind'] in ['state','update'] and bytes.fromhex(e['bytes']) for e in h['content'])

prefix='owned/stages/'+q['stages'][5]['key']+'/';f=lambda name:j(prefix+'files/'+name+'.json')
def caps(rows):
 assert len({c['id'] for c in rows})==len(rows)
 for c in rows:
  assert c['id'] and c['sources']
  for source in c['sources']:assert source['actor'] and source['kind']=='human' and bytes(source['bytes'])
 return sorted(rows,key=lambda c:c['id'])
def pos(o,n):
 assert o['state']=='ready' and o['receivedThrough']==o['observedThrough']==n and len(o['link'])==64 and len(bytes.fromhex(o['link']))==32
 if not n:assert o['link']=='00'*32
for side in ['before','after']:
 c=f('baseline-'+side);assert c['side']==side and c['held']=={'visible':c['initial'],'queuedVisible':c['initial'],'resultPending':True}
 assert c['recovered']['visible']==('REMOTE ' if side=='after' else '')+c['initial'];pos(c['recovered']['status'],int(side=='after'))
 assert caps(c['recovered']['captures'])==caps(c['before'])==caps(c['final']['captures'])
 assert c['result']['kind']==('received' if side=='before' else 'duplicate') and c['result']['recorded']==(side=='before')
 assert c['final']['visible']=='REMOTE '+c['initial'];pos(c['final']['status'],1);assert c['final']['status']==c['result']['status']
c=f('control-early');assert c['held']=={'visible':'REMOTE '+c['initial'],'resultPending':True} and c['recovered']['visible']==c['initial'];pos(c['recovered']['status'],0);assert caps(c['before'])==caps(c['recovered']['captures'])
c=f('control-relabel');before={a['id']:a for a in caps(c['before'])};after=caps(c['after']);assert len(after)==len(before)+1
assert all(a==before[a['id']] for a in after if a['id'] in before)
added=[a for a in after if a['id'] not in before];assert len(added)==1 and len(added[0]['sources'])==1 and added[0]['sources'][0]['bytes']==c['original']
assert caps(c['observed']['captures'])==after and c['observed']['visible']=='REMOTE '+c['initial'];pos(c['observed']['status'],1)
g=f('generated-editor');assert g['status']=='passed' and g['seed']==9202026 and g['runs']==len(g['histories'])==10
for h in g['histories']:
 assert 3<=len(h['actions'])<=6 and len(h['actions'])==len(h['observations']);text=h['initial'];through=0;link='00'*32;known={c['id']:c for c in caps(h['before'])}
 for action,o in zip(h['actions'],h['observations']):
  assert o['action']==action and action in ['receive','local','duplicate','invalid','compact','restart']
  if action=='receive':
   text='R'+str(through)+' '+text;through+=1;assert o['outcome']['kind']=='received' and o['outcome']['recorded'] and o['outcome']['status']==o['status'] and o['status']['link']!=link;link=o['status']['link']
  elif action=='local':text+='L'
  elif action=='invalid':assert o['outcome']=='receive-refused'
  elif action=='duplicate' and through:assert o['outcome']=={'kind':'duplicate','recorded':False,'status':o['status']}
  if action in ['local','restart','compact'] or (action=='duplicate' and not through):assert o['outcome'] is None
  assert o['visible']==text and o['status']['link']==link;pos(o['status'],through)
  current={c['id']:c for c in caps(o['captures'])};assert all(current.get(k)==c for k,c in known.items());added=[c for k,c in current.items() if k not in known];assert len(added)==int(action=='local');known.update({c['id']:c for c in added})
 assert h['final']['visible']==text and h['final']['status']['link']==link;pos(h['final']['status'],through);assert caps(h['final']['captures'])==caps(list(known.values()))
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
print(f'Verified {len(data)} payloads, 329 real passed cases, exact receive-editor reuse, thirteen receive-editor reports, eight synthetic runs and two discriminating faults. No aggregate claim.')
