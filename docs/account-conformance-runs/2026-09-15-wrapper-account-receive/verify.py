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
 if expect['kind'] in ['account-receive','account-inbound-codecs']:
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
  assert len(tree['entries'])==(25 if expect['kind']=='account-receive' else 30)
  for e in tree['entries']:
   if e['type']=='directory':assert e['path'] in ['case-reports','regression-artifacts'];continue
   assert e['type']=='file' and sha(data[prefix+'files/'+e['path']])==e['sha256'] and len(data[prefix+'files/'+e['path']])==e['bytes']
  assert tree['bytes']==sum(e.get('bytes',0) for e in tree['entries']) and tree['bytes']<=r['contract']['fileOutputs']['maxBytes']
assert cases==287 and sum(x['reused'] for x in q['stages'])==1 and q['stages'][-1]['key']==q['stages'][5]['key']
prefix='owned/stages/'+q['stages'][5]['key']+'/';f=lambda name:j(prefix+'files/'+name+'.json')
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
def prep_evidence(prefix):
 f=lambda name:j(prefix+name+'.json')
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
prep_evidence('owned/stages/'+q['stages'][6]['key']+'/files/regression-artifacts/')
prefix='owned/stages/'+q['stages'][5]['key']+'/';f=lambda name:j(prefix+'files/'+name+'.json')
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
# The first owned attempt stopped in planning at the stale one-million-byte assertion.
failed=j('owned-cap-failure/summary.json');assert failed['status']=='failed' and len(failed['stages'])==3
for st in failed['stages']:
 fp='owned-cap-failure/stages/'+st['key']+'/';receipt=j(fp+'receipt.json');assert receipt['result']['groupDrained']
 for artifact in receipt['artifacts']:assert sha(data[fp+artifact['path']])==artifact['sha256']
last='owned-cap-failure/stages/'+failed['stages'][-1]['key']+'/';bad=j(last+'cases.json');assert bad['summary']['counts']['failed']==1
assert b'assert(Buffer.byteLength(serialized) <= 1000000)' in data[last+'output.log']
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
print(f'Verified {len(data)} payloads, 287 real passed cases, exact receive reuse, twenty-four receive reports, eight synthetic runs and two discriminating faults. No aggregate claim.')
