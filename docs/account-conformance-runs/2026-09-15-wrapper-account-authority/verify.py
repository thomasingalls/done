from pathlib import Path
import base64,gzip,hashlib,json,sys
root=Path(__file__).resolve().parent;sha=lambda b:hashlib.sha256(b).hexdigest()
s=json.loads((root/'summary.json').read_bytes());b=(root/'artifacts.json.gz').read_bytes();assert sha(b)==s['artifactsSha256'];a=json.loads(gzip.decompress(b));data={}
for name,item in a['files'].items():
 b=base64.b64decode(a['blobs'][item['sha256']],validate=True);assert len(b)==item['bytes'] and sha(b)==item['sha256'];data[name]=b
assert len(data)==s['payloads'];j=lambda name:json.loads(data[name])
q=j('owned/summary.json');assert q==s['qualification'] and q['status']=='passed' and len(q['stages'])==7
contracts={x['id']:x for x in j('phase/selection.json')};cases=0
for stage in q['stages']:
 prefix='owned/stages/'+stage['key']+'/';r=j(prefix+'receipt.json');c=j(prefix+'cases.json')
 assert r['status']=='passed' and r['result']['groupDrained'] and stage['groupDrained'] and r['input']==q['input']
 for k,v in r['contract'].items():assert contracts[stage['id']][k]==v,k
 assert c['nonce']==r['nonce'] and c['phase']=='complete' and not c['errors'] and c['summary']['success']
 key=lambda x:x['id'];assert sorted(c['cases'],key=key)==sorted(r['contract']['expect']['cases'],key=key)
 assert c['summary']['counts']['tests']==len(c['cases'])
 if not stage['reused']:cases+=len(c['cases'])
 for artifact in r['artifacts']:assert sha(data[prefix+artifact['path']])==artifact['sha256']
 if r['contract'].get('fileOutputs'):
  tree=j(prefix+'files.json');assert tree['complete'] and tree==r['result']['fileOutputs'] and len(tree['entries'])==(6 if r['contract']['expect']['kind']=='account-authority' else 10)
  for e in tree['entries']:assert e['type']=='file' and sha(data[prefix+'files/'+e['path']])==e['sha256'] and len(data[prefix+'files/'+e['path']])==e['bytes']
  assert tree['bytes']==sum(e['bytes'] for e in tree['entries']) and tree['bytes']<=r['contract']['fileOutputs']['maxBytes']
assert cases==81 and sum(x['reused'] for x in q['stages'])==1 and q['stages'][-1]['key']==q['stages'][4]['key']
prefix='owned/stages/'+q['stages'][4]['key']+'/';r=j(prefix+'receipt.json');f=lambda name:j(prefix+'files/'+name+'.json')
summary=f('summary');assert summary['status']=='passed' and summary['code']==0 and summary['timedOut'] is False
pin=f('control-pin');replay=f('control-nonce')
for row in [pin,replay]:assert row['baseline']=='refused' and row['mutant']==row['proof']['pin']
assert pin['nonce']==pin['proof']['nonce'] and pin['expected']['authRoot']!=pin['proof']['pin']['authRoot']
assert replay['requestedNonce']!=replay['proof']['nonce'] and replay['expected']==replay['proof']['pin']
raw=(root/'raw-artifacts.json').read_bytes();assert sha(raw)==s['rawIndexSha256']
if '--raw' in sys.argv:
 for item in json.loads(raw):assert sha(Path(item['path']).read_bytes())==item['sha256']
 inputs=json.loads(gzip.decompress(Path(next(x['path'] for x in json.loads(raw) if x['path'].endswith('/owned/inputs.json.gz'))).read_bytes()))
 pinned={x['path']:x for x in inputs['sources']}
 for p in f('sources'):assert pinned[p['path']]['sha256']==p['sha256']
controls=j('phase/process-controls.json');assert len(controls)==6
for control in controls:
 p='controls/'+control['name']+'/receipts/'+control['key']+'/';cr=j(p+'receipt.json');assert cr['result']['code']==0 and cr['result']['groupDrained']
 assert cr['status']==control['status'] and cr['result']['reason']==control['reason']
 for artifact in cr['artifacts']:assert sha(data[p+artifact['path']])==artifact['sha256']
 assert control['status']==('passed' if control['name'] in ['valid','omitted-hook'] else 'failed')
mutations=j('phase/mutations.json');assert len(mutations)==2 and all(x['detected'] for x in mutations)
for m,file in zip(mutations,['stage.mjs','account-authority-wrapper.mjs']):
 assert sha(data['current/scripts/release-validation/'+file])==m['before'] and sha(data['mutants/scripts/release-validation/'+file])==m['after']
if '--current' in sys.argv:
 repo=root.parents[2]
 for name,b in data.items():
  if name.startswith('current/'):assert (repo/name.removeprefix('current/')).read_bytes()==b,name
print(f'Verified {len(data)} payloads, 81 real passed cases, exact authority reuse, six authority reports, six synthetic runs and two discriminating faults. No aggregate claim.')
