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
 
 for pin in expect.get('historyInputs',[]):assert sha(data['phase/historical-'+Path(pin['path']).name])==pin['sha256'] and pin['reference']=='4bb09042f37f68ec31f0d82587af608f599eb096'
 if expect['kind'] in ['account-sync','account-receive-driver']:
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
  assert len(tree['entries'])==(29 if expect['kind']=='account-sync' else 26)
  for e in tree['entries']:
   if e['type']=='directory':assert e['path'] in ['case-reports','regression-artifacts'];continue
   assert e['type']=='file' and sha(data[prefix+'files/'+e['path']])==e['sha256'] and len(data[prefix+'files/'+e['path']])==e['bytes']
  assert tree['bytes']==sum(e.get('bytes',0) for e in tree['entries']) and tree['bytes']<=r['contract']['fileOutputs']['maxBytes']
assert cases==219 and sum(x['reused'] for x in q['stages'])==1 and q['stages'][-1]['key']==q['stages'][5]['key']
def caps(rows):
 assert len({c['id'] for c in rows})==len(rows)
 for c in rows:
  assert c['id'] and c['sources']
  for source in c['sources']:assert source['actor'] and source['kind']=='human' and bytes(source['bytes'])
 return sorted(rows,key=lambda c:c['id'])
prefix='owned/stages/'+q['stages'][6]['key']+'/';f=lambda name:j(prefix+'files/'+name+'.json')
def driver(s,n):
 assert s['phase'] in ['starting','working','idle','retrying','offline','blocked','closed'] and s['receivedThrough']==n and 0<=s['failures']<=6
 assert s['nextAttemptAt'] is None or isinstance(s['nextAttemptAt'],int) and s['nextAttemptAt']>=0
 assert s['reason'] in [None,'conflict','operation-failed','inbound-size','response-too-large','local-storage','request-expired']
for mode,pair in {'overlap':[1,2],'poll':[2,1],'halt':[1,2],'observer':[0,1],'resume':[1,0]}.items():
 c=f('control-'+mode);assert c['mode']==mode and c['effective'] and [o['changed'] for o in c['observations']]==[False,True]
 for i,o in enumerate(c['observations']):
  assert o['calls']==pair[i] and o['timers'] in [0,1];driver(o['status'],0);driver(o['disposed']['status'],0)
  assert o['disposed']['calls']==o['calls'] and o['disposed']['timers']==0 and o['disposed']['status']['phase']=='closed' and o['disposed']['status']['nextAttemptAt'] is None
for gate in ['offline','pressure']:
 c=f('control-dispatch-'+gate);assert c['effective'] and [o['mode'] for o in c['observations']]==['baseline','dispatch']
 for o in c['observations']:
  assert o['calls']==int(o['mode']=='dispatch');driver(o['held'],0);driver(o['closed'],0);assert o['held']['phase'] in ['offline','blocked'] and o['closed']['phase']=='closed' and o['closed']['nextAttemptAt'] is None
g=f('generated-native');assert g['status']=='passed' and g['seed']==9112052 and g['runs']==len(g['histories'])==10;coverage={}
for h in g['histories']:
 assert h['completed'] and 5<=len(h['actions'])<=7 and h['actions'][-2:]==['publish','restart'] and len(h['actions'])==len(h['observations'])
 count=h['actions'].count('publish');assert len(h['wires'])==count and 1<=h['startupRequests']<=len(h['requests']);positions=[0];through=0;link='00'*32
 for req in h['requests']:
  assert req['mode'] in ['good','lost','halt'] and 0<=req['available']<=count
  request=json.loads(bytes.fromhex(req['request']));page=json.loads(bytes.fromhex(req['candidatePage']))
  assert request[:2]==['done/private-read/v2',2] and len(request)==15 and request[10:12]==[through,1]
  assert page[:2]==['done/private-read-page/v2',2] and len(page)==7 and page[2]==sha(bytes.fromhex(req['request'])) and page[3]==req['available']
  advancing=through<req['available'];assert page[4]==through+int(advancing) and len(page[5])==int(advancing) and len(bytes.fromhex(req['link']))==32
  if advancing:assert page[5][0][0]==h['wires'][through]
  else:assert req['link']==link
  if req['mode']=='good':
   assert req['responseBody']==req['candidatePage']
   if advancing:assert link!=req['link'];through+=1;link=req['link']
  elif req['mode']=='lost':assert req['responseBody'] is None
  else:assert bytes.fromhex(req['responseBody'])==b'corrupt page'
  positions.append(through)
 assert positions[h['startupRequests']]==0 and through==count;available=0;locals=0;last_end=h['startupRequests'];known={c['id']:c for c in caps(h['before'])}
 for action,o in zip(h['actions'],h['observations']):
  assert action in ['publish','local','lost','offline','halt','restart'] and action==o['action'];coverage[action]=coverage.get(action,0)+1
  assert last_end<=o['requestStart']<=o['requestEnd']<=len(h['requests']) and positions[o['requestStart']]==available
  if action=='publish':available+=1
  elif action=='local':locals+=1
  assert positions[o['requestEnd']]==available
  if action=='restart':assert o['requestEnd']>o['requestStart'] and json.loads(bytes.fromhex(h['requests'][o['requestStart']]['request']))[10]==available
  if action in ['lost','halt','offline']:
   driver(o['transition'],available);assert o['transition']['phase'] in (['offline'] if action=='offline' else ['retrying','blocked'])
  else:assert o['transition'] is None
  driver(o['status'],available);assert o['status']['phase'] in ['idle','working'] and o['status']['failures']==0 and o['status']['reason'] is None
  text=''.join('REMOTE'+str(i)+' ' for i in reversed(range(available)))+h['initial']+'L'*locals;assert o['visible']==text
  current={c['id']:c for c in caps(o['captures'])};assert all(current.get(k)==c for k,c in known.items());added=[c for k,c in current.items() if k not in known];assert len(added)==int(action=='local');known.update({c['id']:c for c in added});last_end=o['requestEnd']
 assert h['final']['visible']==h['observations'][-1]['visible'];driver(h['final']['status'],available);assert h['final']['status']['phase'] in ['idle','working'] and h['final']['status']['failures']==0 and h['final']['status']['reason'] is None and caps(h['final']['captures'])==caps(list(known.values()))
assert g['coverage']==coverage and all(coverage[a]>0 for a in ['publish','local','lost','offline','halt','restart'])

prefix='owned/stages/'+q['stages'][5]['key']+'/';f=lambda name:j(prefix+'files/'+name+'.json')
def sync_status(s,n=None):
 for lane,field in [('send','acceptedThrough'),('receive','receivedThrough')]:
  v=s[lane];assert v['phase'] in ['starting','working','idle','retrying','offline','blocked','closed'] and isinstance(v[field],int) and v[field]>=0 and 0<=v['failures']<=6
  if n is not None:assert v[field]==n
  assert v['nextAttemptAt'] is None or isinstance(v['nextAttemptAt'],int) and v['nextAttemptAt']>=0
  assert v['reason'] in [None,'closed','conflict','finalized','envelope-size','operation-failed','inbound-size','response-too-large','local-storage','request-expired']
for mode,pair in {'fairness':['receive','send'],'overlap':[1,2],'halt':['receive','send'],'resume':['send','receive'],'wake':[3,2]}.items():
 c=f('control-'+mode);assert c['effective'] and [o['mutant'] for o in c['observations']]==[False,True]
 for i,o in enumerate(c['observations']):
  assert o['observed']==pair[i] and o['held']['calls'] and all(l in ['send','receive'] for l in o['held']['calls']) and o['held']['timers'] in [0,1]
  actual=len(o['held']['calls']) if isinstance(o['observed'],int) else o['held']['calls'][0 if mode=='resume' else -1];assert actual==o['observed']
  sync_status(o['held']['status'],0);sync_status(o['disposed']['status'],0);assert o['held']['calls']==o['disposed']['calls'] and o['disposed']['timers']==0
  assert all(o['disposed']['status'][l]['phase']=='closed' and o['disposed']['status'][l]['nextAttemptAt'] is None for l in ['send','receive'])
for gate in ['offline','pressure']:
 c=f('control-dispatch-'+gate);assert c['effective'] and [o['mutant'] for o in c['observations']]==[False,True]
 for o in c['observations']:
  assert o['calls']==int(o['mutant']);sync_status(o['held']);sync_status(o['closed']);assert all(o['closed'][l]['phase']=='closed' and o['closed'][l]['nextAttemptAt'] is None for l in ['send','receive'])
c=f('control-witness');assert c['effective'] and [[o['mutant'],o['opened']] for o in c['observations']]==[[False,False],[True,True]] and c['observations'][0]['error'] and isinstance(c['observations'][1]['master'],str);sync_status(c['observations'][1]['status']);assert all(c['observations'][1]['status'][l]['phase']=='offline' for l in ['send','receive'])
for mode in ['self','classification']:
 c=f('control-'+mode);assert c['effective'] and [[o['mode'],o['advanced'],o['editorState']] for o in c['observations']]==[['baseline',False,'active'],[mode,mode=='self','active' if mode=='self' else 'closed']]
 for o in c['observations']:sync_status(o['status']);assert o['status']['receive']['receivedThrough']==int(o['advanced'])
assert f('control-self')['observations'][0]==f('control-classification')['observations'][0]
class Reader:
 def __init__(self,b):self.b=b;self.at=0
 def take(self,n):
  assert n>=0 and self.at+n<=len(self.b);v=self.b[self.at:self.at+n];self.at+=n;return v
 def count(self,n):return int.from_bytes(self.take(n),'big')
 def text(self):return self.take(self.count(2)).decode('utf-8')
 def end(self):assert self.at==len(self.b)
def submission(wire):
 b=bytes.fromhex(wire);assert b and len(b)<=1024*1024 and b.hex()==wire;s=Reader(b);assert s.text()=='done/envelope-submission-wire/v1' and s.text()=='1';assert len(bytes.fromhex(s.text()))==32
 e=Reader(s.take(s.count(4)));s.take(s.count(4));s.take(64);s.end();assert e.text()=='done/envelope-wire/v2' and e.text()=='2' and e.text() and e.text()
 epoch,gen,position=[int(e.text()) for _ in range(3)];assert min(epoch,gen,position)>0
 nonce=list(e.take(12));digest=e.take(32).hex();ct=e.take(e.count(4));assert len(ct)>=16 and sha(ct)==digest;e.take(64);e.end();return position,nonce
g=f('generated-native');assert g['status']=='passed' and g['seed']==9112062 and g['runs']==len(g['histories'])==8;coverage={}
for h in g['histories']:
 assert h['completed'] and isinstance(h['initial'],str) and 5<=len(h['actions'])<=7 and h['actions'][-2:]==['edit','restart'] and len(h['actions'])==len(h['observations'])
 first={};nonces={};seals=0
 for sent in h['submissions']:
  p,nonce=submission(sent['wire']);assert sent['position']==p
  if p in first:assert first[p]==sent['wire']
  else:assert p==len(first)+1;first[p]=sent['wire'];nonces[p]=nonce
  assert sent['sealCount']>=max(p,seals);seals=sent['sealCount'];assert sent['responseStatus']==200 and bytes.fromhex(sent['responseBody']) and sent['reply'] in ['lost','delivered']
 after=0
 for req in h['reads']:
  qv=json.loads(bytes.fromhex(req['request']));assert qv[:2]==['done/private-read/v2',2] and len(qv)==15 and qv[11]==1 and 0<=req['sentPositions']<=len(first) and after<=qv[10]<=req['sentPositions'] and req['reply'] in ['lost','continued'];after=qv[10]
 known={c['id']:c for c in caps(h['before'])};expected=h['initial'];edits=0;send_end=0;read_end=0;attempts=0;assignments={}
 def state(o):
  global attempts
  n=len(o['spool']['positions']);sync_status(o['status'],n);assert len(o['wires'])==len(o['nonces'])==n and len({tuple(v) for v in o['nonces']})==n and o['spool']['attempts']>=max(n,attempts);attempts=o['spool']['attempts'];refs=[]
  for i,p in enumerate(o['spool']['positions']):
   assert p['position']==i+1 and p['persisted'] and p['attempts'] and all(1<=a<=attempts for a in p['attempts']) and len(set(p['attempts']))==len(p['attempts']);sources=[p['source']]+p.get('additional',[])
   for source in sources:assert isinstance(source['id'],str) and source['index']>=0 and len(bytes.fromhex(source['hash']))==32;refs.append([source['id'],source['index']])
   if i in assignments:assert assignments[i]==sources
   else:assignments[i]=sources
   assert o['wires'][i]=={'position':i+1,'wire':first[i+1]} and o['nonces'][i]==nonces[i+1]
  assert refs==[[c['id'],i] for c in o['captures'] for i in range(len(c['sources']))] and o['visible']==expected
  current={c['id']:c for c in caps(o['captures'])};assert all(current.get(k)==c for k,c in known.items());return current
 for action,o in zip(h['actions'],h['observations']):
  assert action in ['edit','offline-edit','lost-send','lost-read','compact','restart'] and o['action']==action;coverage[action]=coverage.get(action,0)+1
  assert send_end<=o['sendStart']<=o['sendEnd']<=len(h['submissions']) and read_end<=o['readStart']<=o['readEnd']<=len(h['reads']);send_end=o['sendEnd'];read_end=o['readEnd']
  edited=action not in ['compact','restart']
  if edited:expected+=' ['+str(edits)+']';edits+=1
  if action=='offline-edit':sync_status(o['transition']);assert all(o['transition'][l]['phase']=='offline' for l in ['send','receive'])
  elif action.startswith('lost-'):
   lane='send' if action=='lost-send' else 'receive';sync_status(o['transition']);assert o['transition'][lane]['failures']>0
   requests=h['submissions'][o['sendStart']:o['sendEnd']] if lane=='send' else h['reads'][o['readStart']:o['readEnd']];assert any(req['reply']=='lost' for req in requests)
  else:assert o['transition'] is None
  current=state(o);added=[c for k,c in current.items() if k not in known];assert len(added)==int(edited);known.update({c['id']:c for c in added})
 state(h['final']);assert caps(h['final']['captures'])==caps(list(known.values())) and h['positions']==len(first)==len(h['final']['spool']['positions'])==seals
assert g['coverage']==coverage and all(coverage[a]>0 for a in ['edit','offline-edit','lost-send','lost-read','compact','restart'])

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
print(f'Verified {len(data)} payloads, 219 real passed cases, exact sync reuse, twenty-eight sync reports, eight synthetic runs and two discriminating faults. No aggregate claim.')
