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
 assert not expect.get('historyInputs')
 if expect['kind'] in ['account-receive-transport','account-receive-editor']:
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
  assert len(tree['entries'])==(20 if expect['kind']=='account-receive-transport' else 14)
  for e in tree['entries']:
   if e['type']=='directory':assert e['path'] in ['case-reports','regression-artifacts'];continue
   assert e['type']=='file' and sha(data[prefix+'files/'+e['path']])==e['sha256'] and len(data[prefix+'files/'+e['path']])==e['bytes']
  assert tree['bytes']==sum(e.get('bytes',0) for e in tree['entries']) and tree['bytes']<=r['contract']['fileOutputs']['maxBytes']
assert cases==301 and sum(x['reused'] for x in q['stages'])==1 and q['stages'][-1]['key']==q['stages'][5]['key']
prefix='owned/stages/'+q['stages'][6]['key']+'/';f=lambda name:j(prefix+'files/'+name+'.json')
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

prefix='owned/stages/'+q['stages'][5]['key']+'/';f=lambda name:j(prefix+'files/'+name+'.json')
for mode in ['queue','flight','bound','drain']:
 c=f('control-'+mode);assert c['effective'] and [o['changed'] for o in c['observations']]==[False,True]
 for o in c['observations']:
  if mode=='queue':assert o['through']==o['result']['status']['receivedThrough']==1 and o['result']['kind']=='received' and o['text']==('' if o['changed'] else 'REMOTE ')+o['initial']
  elif mode=='flight':assert o['calls']==(2 if o['changed'] else 1) and o['result']['kind']==('unknown' if o['changed'] else 'busy')
  elif mode=='bound':assert o['length']==(17 if o['changed'] else None)
  else:assert o['cancelled'] and o['settledBeforeCancellationCompleted']==o['changed'] and o['settledAfterCancellationCompleted'] and o['result'] is None
g=f('generated');assert g['status']=='passed' and g['seed']==9112042 and g['runs']==len(g['histories'])==16
coverage={}
for h in g['histories']:
 assert h['completed'] and 6<=len(h['actions'])<=9 and h['actions'][0]=='lost' and h['actions'][-2:]==['receive','restart'] and len(h['actions'])==len(h['observations'])
 count=h['actions'].count('receive');assert len(h['wires'])==count
 text=h['initial'];position=0;link='00'*32;request_index=0;known={c['id']:c for c in caps(h['before'])}
 for action,o in zip(h['actions'],h['observations']):
  assert action in ['receive','local','lost','corrupt','restart','compact'] and action==o['action'];coverage[action]=coverage.get(action,0)+1
  if action in ['receive','lost','corrupt']:
   req=h['requests'][request_index];request_index+=1;assert req['mode']==action
   request=json.loads(bytes.fromhex(req['request']));page=json.loads(bytes.fromhex(req['candidatePage']))
   assert request[:2]==['done/private-read/v2',2] and len(request)==15 and request[10:12]==[position,1]
   assert page[:2]==['done/private-read-page/v2',2] and len(page)==7 and page[2]==sha(bytes.fromhex(req['request'])) and page[3:5]==[count,position+1] and len(page[5])==1 and page[5][0][0]==h['wires'][position]
   assert len(bytes.fromhex(req['link']))==32
   if action=='receive':
    assert req['responseBody']==req['candidatePage'] and o['outcome']['kind']=='received' and o['outcome']['recorded'] and o['outcome']['status']==o['status']
    text='R'+str(position)+' '+text;position+=1;assert link!=req['link'];link=req['link']
   elif action=='lost':assert req['responseBody'] is None and o['outcome']['kind']=='unknown'
   else:assert bytes.fromhex(req['responseBody'])==b'bad page' and 'AdmissionError' in o['outcome']['error']
  else:
   assert o['outcome'] is None
   if action=='local':text+='L'
  assert o['visible']==text and o['status']=={'state':'ready','receivedThrough':position,'observedThrough':count if position else 0,'link':link}
  current={c['id']:c for c in caps(o['captures'])};assert all(current.get(k)==c for k,c in known.items());added=[c for k,c in current.items() if k not in known];assert len(added)==int(action=='local');known.update({c['id']:c for c in added})
 assert request_index==len(h['requests']) and h['final']['visible']==text and h['final']['status']==h['observations'][-1]['status'] and caps(h['final']['captures'])==caps(list(known.values()))
assert g['coverage']==coverage and all(coverage[a]>0 for a in ['receive','local','lost','corrupt','restart','compact'])
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
print(f'Verified {len(data)} payloads, 301 real passed cases, exact receive-transport reuse, nineteen receive-transport reports, eight synthetic runs and two discriminating faults. No aggregate claim.')
