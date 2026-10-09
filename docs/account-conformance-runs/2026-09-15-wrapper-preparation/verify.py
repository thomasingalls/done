from pathlib import Path
import base64,gzip,hashlib,json,sys
out=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
s=json.loads((out/'summary.json').read_bytes())
blob=(out/'artifacts.json.gz').read_bytes()
assert sha(blob)==s['artifactsSha256']
a=json.loads(gzip.decompress(blob));data={}
for name,v in a['files'].items():
 b=base64.b64decode(a['blobs'][v['sha256']],validate=True)
 assert len(b)==v['bytes'] and sha(b)==v['sha256'];data[name]=b
assert len(data)==s['payloads']
j=lambda p:json.loads(data[p])
q=j('owned-final/summary.json');assert q==s['qualification']
assert q['status']=='passed' and len(q['stages'])==36
stages={x['id']:x for x in j('selection.json')};case_count=0
for epoch in ['owned','owned-final']:
 e=j(epoch+'/summary.json')
 for stage in e['stages']:
  prefix=epoch+'/stages/'+stage['key']+'/'
  r=j(prefix+'receipt.json')
  assert r['key']==stage['key'] and r['status']==stage['status']
  assert r['result']['groupDrained'] and stage['groupDrained']
  assert r['input']==e['input']
  for item in r['artifacts']:assert sha(data[prefix+item['path']])==item['sha256']
  if epoch=='owned-final':
   assert r['status']=='passed'
   contract=stages[stage['id']]
   for k,v in r['contract'].items():assert v==contract[k],k
   if r['contract']['expect']['kind']=='cases':
    c=j(prefix+'cases.json');assert c['nonce']==r['nonce'] and c['phase']=='complete' and not c['errors']
    key=lambda x:x['id']
    assert sorted(c['cases'],key=key)==sorted(contract['expect']['cases'],key=key)
    case_count+=len(c['cases'])
assert case_count==65
assert q['stages'][-1]['reused']
vectors=[x for x in q['stages'] if x['id'].startswith('vector:')]
assert len(vectors)==29 and len(set(x['key'] for x in vectors))==29
assert q['stages'][-1]['key']==vectors[0]['key']
assert sum(x['reused'] for x in q['stages'])==1
prep=next(x for x in q['stages'] if x['id']=='campaign:scripts/account-crypto-prep/run.mjs')
test=next(x for x in q['stages'] if x['id']=='command:check:102')
r=j('owned-final/stages/'+test['key']+'/receipt.json')
p=j('owned-final/stages/'+prep['key']+'/receipt.json')
assert r['prerequisites']==[{'key':p['key'],'result':p['resultDigest']}]
for marker in [b'generated stdout evidence',b'generated stderr evidence',b'seed=150931 diagnostic evidence']:
 assert marker not in data['stream-control/before-output.log']
 assert marker in data['stream-control/after-output.log']
for version in ['before','after']:assert j('stream-control/'+version+'-receipt.json')['status']=='passed'
assert b'orphaned-child' in data['stage-tests.log'] and b'pass 32' in data['stage-tests.log']
assert j('owned/summary.json')['status']=='failed'
assert j('owned/summary.json')['stages'][-1]['reason']=='cancelled'
repair=j('census-repair.json');assert len(repair)==1 and repair[0][0]['path']=='src/crdt/admittedWorkspace.ts'
raw=(out/'raw-artifacts.json').read_bytes();assert sha(raw)==s['rawIndexSha256']
if '--raw' in sys.argv:
 for item in json.loads(raw):assert sha(Path(item['path']).read_bytes())==item['sha256']
if '--current' in sys.argv:
 root=out.parents[2]
 for name,b in data.items():
  if name.startswith('current/'):
   assert (root/name.removeprefix('current/')).read_bytes()==b,name
print(f'Verified {len(data)} payloads; 35 passed executions / 65 cases plus one exact vector reuse; original failures retained. No aggregate claim.')
