from pathlib import Path
import base64,hashlib,json,lzma,sys
root=Path(__file__).resolve().parent;sha=lambda b:hashlib.sha256(b).hexdigest()
s=json.loads((root/'summary.json').read_bytes());b=(root/'artifacts.json.xz').read_bytes();assert len(b)==s['compressedBytes']<=1000000 and sha(b)==s['artifactsSha256'];a=json.loads(lzma.decompress(b));data={};chunks={}
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
assert count==225 and sum(s['reused'] for s in q['stages'])==1 and q['stages'][-1]['key']==q['stages'][5]['key']
assert [s['cases'] for s in q['stages'][:-1]]==[70,5,12,4,50,25,21,38]
f=j('owned-failed-census/summary.json');assert f['status']=='failed' and len(f['stages'])==2
assert [x['status'] for x in f['stages']]==['passed','failed']
for stage in f['stages']:
 prefix='owned-failed-census/stages/'+stage['key']+'/';r=j(prefix+'receipt.json');assert r['result']['groupDrained']
 for artifact in r['artifacts']:assert sha(data[prefix+artifact['path']])==artifact['sha256']
failed=j(prefix+'cases.json');assert failed['summary']['counts']['failed']==1 and failed['summary']['counts']['passed']==4
f=j('owned-failed-generated-census/summary.json');assert f['status']=='failed' and len(f['stages'])==3
assert [x['status'] for x in f['stages']]==['passed','passed','failed']
for stage in f['stages']:
 prefix='owned-failed-generated-census/stages/'+stage['key']+'/';r=j(prefix+'receipt.json');assert r['result']['groupDrained']
 for artifact in r['artifacts']:assert sha(data[prefix+artifact['path']])==artifact['sha256']
failed=j(prefix+'cases.json');assert failed['summary']['counts']['failed']==1 and failed['summary']['counts']['passed']==11
assert j('phase/before-manifest.json')==j('phase/after-manifest.json')
for name,count in [('before',62),('after',37)]:
 samples=j('phase/'+name+'-profile.json');assert len(samples)==3
 for p in samples:assert p['subprocessCount']==count and len(p['calls'])==count and p['uniqueCommands']==count
assert j('phase/before-profile.json')[0]['digest']==j('phase/after-profile.json')[0]['digest']
assert 'assertHistoricalInputs(clone,fresh)' in data['phase/historical-controls.mjs'].decode()
h=j('phase/historical-controls.json');assert len(h['pins'])==len(h['files'])==26 and h['restored'] and h['population']['detected'] and h['population']['status']==1
assert all(x['detected'] and x['batchMatchesFreshShow'] and 'Historical source changed' in x['error'] for x in h['files'])
prefix='owned/stages/'+q['stages'][5]['key']+'/';r=j(prefix+'receipt.json');assert r['contract']['expect']['historyInputs']==h['pins']
for pin in h['pins']:assert sha(data['historical/'+pin['path']])==pin['sha256']
mutations=j('phase/mutations.json');assert len(mutations)==2 and all(m['detected'] and m['exit']==1 for m in mutations)
for m in mutations:
 log=data['phase/'+m['fault']+'.log'].decode();assert m['testPattern'] in log and 'Missing expected exception' in log and 'ERR_MODULE_NOT_FOUND' not in log
assert 'numRuns: 160' in data['current/test/release-validation/stage.test.mjs'].decode()
m=j('current/docs/release-validation-manifest.json');rows={r['id']:r for r in m['rows']}
assert len(rows)==629 and {k:sum(rows[i]['kind']==k for i in m['unresolved']) for k in ['test','command','campaign']}=={'test':0,'command':71,'campaign':39}
general=[rows[i]['stage'] for i in m['selections']['general-tests']];assert len(general)==272 and sum(len(x['expect']['cases']) for x in general)==2203
raw=(root/'raw-artifacts.json').read_bytes();assert sha(raw)==s['rawIndexSha256']
if '--raw' in sys.argv:
 for x in json.loads(raw):
  b=Path(x['path']).read_bytes();assert len(b)==x['bytes'] and sha(b)==x['sha256']
if '--current' in sys.argv:
 repo=root.parents[2]
 for name,b in data.items():
  if name.startswith('current/'):assert (repo/name[8:]).read_bytes()==b,name
print(f'Verified {len(data)} payloads: 225 passing cases, exact reuse, retained census failure, historical and omission controls, identical-manifest profiles. No aggregate claim.')
