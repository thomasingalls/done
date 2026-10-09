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
 assert c['nonce']==r['nonce'] and c['phase']=='complete' and not c['errors']
 key=lambda x:x['id'];assert sorted(c['cases'],key=key)==sorted(r['contract']['expect']['cases'],key=key)
 if not stage['reused']:cases+=len(c['cases'])
 for artifact in r['artifacts']:assert sha(data[prefix+artifact['path']])==artifact['sha256']
 if r['contract'].get('fileOutputs'):
  tree=j(prefix+'files.json');assert tree==r['result']['fileOutputs'] and tree['complete'] and tree['error'] is None
  entries=tree['entries'];assert tree['bytes']==sum(x['bytes'] for x in entries if x['type']=='file')
  assert len(entries)<=r['contract']['fileOutputs']['maxEntries'] and tree['bytes']<=r['contract']['fileOutputs']['maxBytes']
  for item in entries:
   if item['type']=='file':assert len(data[prefix+'files/'+item['path']])==item['bytes'] and sha(data[prefix+'files/'+item['path']])==item['sha256']
assert cases==68 and sum(x['reused'] for x in q['stages'])==1
assert q['stages'][-1]['key']==q['stages'][-2]['key'] and q['stages'][-1]['reused']
p='owned/stages/'+q['stages'][-2]['key']+'/files/contract-probes.json';report=j(p)
assert report['status']=='passed' and len(report['messages'])==6 and all(x['signatureVerified'] and x['propertyReorderingStable'] for x in report['messages'])
assert report['recovery']['current']['payloadBytes']==96 and report['recovery']['historical']['payloadBytes']==32
assert report['recovery']['publicKeysAndDigestsMatched'] and report['recovery']['historicalPayloadRejectedByCurrentParser']
mutations=j('phase/mutations.json');assert len(mutations)==2
for m in mutations:
 assert m['detected'] and m['code']==1
 c=j('mutants-final/'+m['name']+'/cases.json');assert c['phase']=='complete' and len(c['cases'])==7
 assert any(x['id'].endswith('::'+m['expected']) and x['outcome']=='fail' for x in c['cases'])
 file='file-outputs.mjs' if m['name']=='missing-required' else 'stage.mjs'
 assert sha(data['current/scripts/release-validation/'+file])==m['before']
 assert sha(data['mutants-final/'+m['name']+'/scripts/release-validation/'+file])==m['after']
assert b'ERR_MODULE_NOT_FOUND' in data['mutants/missing-required/run.log']
assert b'Reviewed test removed or excluded' in data['phase/planning-tests.log']
raw=(root/'raw-artifacts.json').read_bytes();assert sha(raw)==s['rawIndexSha256']
if '--raw' in sys.argv:
 for item in json.loads(raw):assert sha(Path(item['path']).read_bytes())==item['sha256']
if '--current' in sys.argv:
 repo=root.parents[2]
 for name,b in data.items():
  if name.startswith('current/'):assert (repo/name.removeprefix('current/')).read_bytes()==b,name
print(f'Verified {len(data)} payloads, 68 passed cases, report reuse and two detected faults. No whole-campaign or aggregate claim.')
