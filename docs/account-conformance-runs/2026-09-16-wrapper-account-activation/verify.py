from pathlib import Path
import base64,hashlib,json,lzma,struct,sys
root=Path(__file__).resolve().parent;sha=lambda b:hashlib.sha256(b).hexdigest()
s=json.loads((root/'summary.json').read_bytes());b=(root/'artifacts.bin.xz').read_bytes();assert len(b)==s['compressedBytes']<=1000000 and sha(b)==s['artifactsSha256'];packed=lzma.decompress(b)
assert packed[:8]==b'DONEHEX1'
length=struct.unpack('>Q',packed[8:16])[0];offset=16+length
lengths=json.loads(packed[16:offset]);tokens=[]
for length in lengths:
 assert isinstance(length,int) and length>=16 and offset+length<=len(packed)
 tokens.append(packed[offset:offset+length].hex().encode());offset+=length
body=packed[offset:];parts=[];offset=0
while True:
 end=body.find(b'\xff',offset)
 if end<0:parts.append(body[offset:]);break
 assert end+5<=len(body);parts.append(body[offset:end])
 index=struct.unpack('>I',body[end+1:end+5])[0];assert index<len(tokens)
 parts.append(tokens[index]);offset=end+5
a=json.loads(b''.join(parts));data={};chunks={}
assert a['schema']==3 and a['encoding']=='chunked-utf8-or-base64'
for key,v in a['blobs'].items():
 b=v.encode() if isinstance(v,str) else base64.b64decode(v['base64'],validate=True);assert sha(b)==key;chunks[key]=b
for name,item in a['files'].items():
 b=b''.join(chunks[k] for k in item['chunks']);assert len(b)==item['bytes'] and sha(b)==item['sha256'];data[name]=b
assert len(data)==s['payloads'];j=lambda n:json.loads(data[n]);q=j('owned/summary.json');assert q==s['qualification'] and q['status']=='passed' and len(q['stages'])==9
contracts={c['id']:c for c in j('phase/selection.json')};norm=lambda rows:sorted([{'id':r['id'],'outcome':r['outcome']} for r in rows],key=lambda r:r['id'])
def node(c,expected,nonce):
 assert c['nonce']==nonce and c['phase']=='complete' and not c['errors'] and c['summary']['success']
 assert norm(c['cases'])==norm(expected) and c['summary']['counts']['tests']==len(expected)
 for k in ['failed','cancelled','skipped','todo']:assert c['summary']['counts'][k]==0
count=0
for stage in q['stages']:
 prefix='owned/stages/'+stage['key']+'/';r=j(prefix+'receipt.json');c=j(prefix+'cases.json');e=r['contract']['expect']
 assert r['status']=='passed' and r['result']['groupDrained'] and stage['groupDrained'] and r['input']==q['input']
 for k,v in r['contract'].items():assert contracts[stage['id']][k]==v
 assert r['result']['code']==0 and r['result']['reason'] is None
 if e['kind'] in ['account-activation','account-service-inbound']:
  assert c['nonce']==r['nonce'] and c['phase']=='complete' and c['adapter']=='campaign-v1' and len(c['steps'])==len(e['steps']);actual=[]
  for step,want in zip(c['steps'],e['steps']):
   for k in ['name','kind','argv','deadlineMs']:assert step[k]==want[k]
   assert step['phase']=='complete' and step['code']==0 and not step['timedOut']
   if step['kind']=='exit':continue
   child=j(prefix+'files/case-reports/'+step['name']+'.json');node(child,want['expect']['cases'],r['nonce']+':'+step['name']);actual+=child['cases']
  assert norm(actual)==norm(e['cases'])
 else:
  node(c,e['cases'],r['nonce'])
  assert c['summary']['duration_ms']<=r['contract']['deadlineMs']
 if not stage['reused']:count+=len(e['cases'])
 for artifact in r['artifacts']:assert sha(data[prefix+artifact['path']])==artifact['sha256']
 if r['contract'].get('fileOutputs'):
  tree=j(prefix+'files.json');assert tree['complete'] and tree==r['result']['fileOutputs']
  assert len(tree['entries'])==(32 if e['kind']=='account-activation' else 21)
  assert tree['bytes']<=r['contract']['fileOutputs']['maxBytes']
  for x in tree['entries']:
   if x['type']=='directory':continue
   assert len(data[prefix+'files/'+x['path']])==x['bytes'] and sha(data[prefix+'files/'+x['path']])==x['sha256']
assert count==223 and sum(s['reused'] for s in q['stages'])==1 and q['stages'][-1]['key']==q['stages'][5]['key']
assert [s['cases'] for s in q['stages'][:-1]]==[70,5,12,4,50,25,21,36]
f=j('owned-failed-planning/summary.json');assert f['status']=='failed' and len(f['stages'])==1
prefix='owned-failed-planning/stages/'+f['stages'][0]['key']+'/';r=j(prefix+'receipt.json');assert r['status']=='failed' and r['result']['reason']=='timeout' and r['contract']['deadlineMs']==60000 and r['result']['groupDrained']
for artifact in r['artifacts']:assert sha(data[prefix+artifact['path']])==artifact['sha256']
f=j('owned-failed-wrapper/summary.json');assert f['status']=='failed' and len(f['stages'])==5
assert [x['status'] for x in f['stages']]==['passed']*4+['failed']
for stage in f['stages']:
 prefix='owned-failed-wrapper/stages/'+stage['key']+'/';r=j(prefix+'receipt.json');assert r['result']['groupDrained']
 if stage['status']=='failed':assert r['result']['reason']=='timeout' and r['contract']['deadlineMs']==60000
 for artifact in r['artifacts']:assert sha(data[prefix+artifact['path']])==artifact['sha256']
f=j('owned-failed-reproduction/summary.json');assert f['status']=='failed' and len(f['stages'])==6 and f['stages'][-1]['status']=='failed'
for stage in f['stages']:
 prefix='owned-failed-reproduction/stages/'+stage['key']+'/';r=j(prefix+'receipt.json');assert r['result']['groupDrained']
 for artifact in r['artifacts']:assert sha(data[prefix+artifact['path']])==artifact['sha256']
summary=j(prefix+'files/summary.json');assert summary['status']=='failed' and [x['name'] for x in summary['stages']]==['types','reproduction'] and summary['stages'][-1]['code']==1
smoke=j('owned-smoke/summary.json');assert smoke['status']=='passed' and len(smoke['stages'])==1 and smoke['stages'][0]['cases']==25 and smoke['stages'][0]['groupDrained']
prefix='owned-smoke/stages/'+smoke['stages'][0]['key']+'/';r=j(prefix+'receipt.json')
for artifact in r['artifacts']:assert sha(data[prefix+artifact['path']])==artifact['sha256']
assert j('phase/before-revision-sharing-manifest.json')==j('phase/after-revision-sharing-manifest.json')
for n,count in [('before',94),('after',62)]:
 for p in j('phase/'+n+'-revision-sharing-profile.json'):assert p['subprocessCount']==count and len(p['calls'])==count
prefix='owned/stages/'+q['stages'][5]['key']+'/';r=j(prefix+'receipt.json');get=lambda name:j(prefix+'files/'+name+'.json')
pins=r['contract']['expect']['historyInputs'];assert len(pins)==26
b=get('before');assert b['sources']==[{'path':p['path'],'sha256':p['sha256']} for p in pins]
for p in pins:assert p['reference']=='4f71bac' and sha(data['historical/'+p['path']])==p['sha256']
assert b['assertionCalls']==0 and b['accountState']=='active' and b['receiptVersion']==b['receipt']['v']==1
h=j('phase/historical-controls.json');assert len(h['files'])==26 and [p['path'] for p in h['pins']]==[p['path'] for p in pins]
assert all(x['detected'] and 'Historical source changed' in x['error'] for x in h['files'])
assert h['population']['status']==1 and h['population']['detected'] and h['restored']
g=get('generated-activation');assert g['seed']==9110401 and g['numRuns']==120 and g['numShrinks']==0 and not g['failed'] and g['status']=='passed' and g['counterexample'] is None and g['counterexamplePath'] is None
assert len(g['histories'])==120;values=g['values'];used=set();coverage={}
for key,v in values.items():assert sha(json.dumps(v,separators=(',',':'),ensure_ascii=False).encode())==key
def value(k):
 if k is None:return None
 used.add(k);return values[k]
for h in g['histories']:
 assert h['completed'] and 3<=len(h['commands'])<=24 and len(h['commands'])==len(h['observations'])
 state='pending';now=1000;current=None;previous=None;retained=None;issued=0;last=h['initial']
 assert last['accountState']=='pending' and last['proofHash'] is None and last['receipt'] is None
 for cmd,o in zip(h['commands'],h['observations']):
  coverage[cmd]=coverage.get(cmd,0)+1;assert o['cmd']==cmd and o['before']==last and o['nowBefore']==now
  result=value(o['result']);writes=False
  if cmd=='advance':now+=600000
  if cmd=='challenge':
   if state=='cancelled':assert result['ok'] is False
   elif state=='active':assert o['result']==retained
   else:
    assert result['kind']=='promotion-activation-challenge'
    if current and now<value(current)['context']['expiresAt']:assert o['result']==current
    else:
     if current:assert result['context']['nonce']!=value(current)['context']['nonce']
     assert result['context']['expiresAt']==now+600000;previous=current;current=o['result'];issued+=1;writes=True
  elif cmd in ['finish','old'] and current:
   chosen=(previous or current) if cmd=='old' else current;c=value(chosen)['context'];assert o['chosenNonce']==c['nonce']
   valid=state!='cancelled' and chosen==current and (state=='active' or now<c['expiresAt'])
   if valid:
    assert result['kind']=='promotion-receipt' and result['activation']['context']==c and result['activation']['proofHash']==o['proofHash']
    if retained:assert retained==o['result']
    writes=state!='active';state='active';retained=o['result']
   else:assert result['ok'] is False
  elif cmd=='changed' and current:assert result['ok'] is False
  elif cmd=='abandon':
   if state=='active':assert result['ok'] is False
   else:assert result['ok'] is True;state='cancelled';writes=True
  else:assert result is None
  assert o['nowAfter']==now and o['after']['accountState']==('active' if state=='active' else 'pending') and o['after']['receipt']==retained
  if not writes:assert o['after']['inventory']==o['before']['inventory']
  if retained:assert o['after']['proofHash']==value(retained)['activation']['proofHash']
  else:assert o['after']['proofHash'] is None
  last=o['after']
 assert h['state']==state and h['issued']==issued
assert used==set(values) and set(coverage)==set(['challenge','advance','finish','old','changed','restart','abandon'])
controls=j('phase/process-controls.json');assert len(controls)==8
for c in controls:
 assert c['code']==0 and c['groupDrained'];assert c['status']==('passed' if c['name']=='valid' or c['name'].startswith('omitted-') else 'failed')
mutants=j('phase/mutations.json');assert len(mutants)==2 and all(m['detected'] for m in mutants)
for c in controls:
 p='controls/'+c['name']+'/receipts/'+c['key']+'/';r=j(p+'receipt.json')
 for a in r['artifacts']:assert sha(data[p+a['path']])==a['sha256']
m=j('current/docs/release-validation-manifest.json');rows={r['id']:r for r in m['rows']}
assert len(rows)==629 and {k:sum(rows[i]['kind']==k for i in m['unresolved']) for k in ['test','command','campaign']}=={'test':0,'command':71,'campaign':39}
raw=(root/'raw-artifacts.json').read_bytes();assert sha(raw)==s['rawIndexSha256']
if '--raw' in sys.argv:
 for x in json.loads(raw):
  b=Path(x['path']).read_bytes();assert len(b)==x['bytes'] and sha(b)==x['sha256']
if '--current' in sys.argv:
 repo=root.parents[2]
 for name,b in data.items():
  if name.startswith('current/'):assert (repo/name[8:]).read_bytes()==b,name
print(f'Verified {len(data)} payloads: 223 passed cases, reuse, retained timeout, historical and process controls, 120 replayed histories. No aggregate claim.')
