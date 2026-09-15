from pathlib import Path
import base64,gzip,hashlib,json,sys
out=Path(__file__).resolve().parent;sha=lambda b:hashlib.sha256(b).hexdigest();s=json.loads((out/'summary.json').read_bytes());blob=(out/'artifacts.json.gz').read_bytes();assert sha(blob)==s['artifactsSha256'];a=json.loads(gzip.decompress(blob));assert len(a['files'])==s['payloads']
data={}
for name,v in a['files'].items():
 b=base64.b64decode(a['blobs'][v['sha256']],validate=True);assert len(b)==v['bytes'] and sha(b)==v['sha256'];data[name]=b
j=lambda p:json.loads(data[p]);q=j('qualification/summary.json');assert q==s['qualification'];assert q['status'] in ['passed','failed']
selection=j('phase/selection.json');assert selection['unchangedFromSignedBase'] and selection['attemptsAllowed']==1;stages={x['id']:x for x in selection['stages']};passed=0
for stage in q['stages']:
 prefix='qualification/stages/'+stage['key']+'/';r=j(prefix+'receipt.json');c=j(prefix+'cases.json');assert r['stageId']==stage['id'] and r['key']==stage['key'] and r['status']==stage['status'];assert r['result']['groupDrained'];assert r['input']==q['input'];assert c['nonce']==r['nonce']
 for key,value in r['contract'].items():
  if key in stages[stage['id']]:assert value==stages[stage['id']][key],key
 assert r['result']['browser']['groupDrained']
 for item in r['artifacts']:assert sha(data[prefix+item['path']])==item['sha256']
 if r['status']=='passed':
  assert c['phase']=='complete' and not c['errors'];assert sorted(c['cases'],key=lambda x:x['id'])==sorted(stages[stage['id']]['expect']['cases'],key=lambda x:x['id']);passed+=len(c['cases'])
if q['status']=='passed':assert len(q['stages'])==2 and passed==29
assert stages['test:test/account-receive/native.test.mjs']['deadlineMs']==300000;assert stages['test:test/account-receive-editor/native.test.mjs']['deadlineMs']==480000
probe=j('phase/probe-command.json');assert probe['code']==0 and probe['drained'] and not probe['timedOut'];assert b'"page.bundle":{"calls":75' in data['phase/probe.log']
audit=j('phase/audit.json');assert audit['base']==s['base'] and audit['signatureVerified'] and audit['caseBodiesAndCountsUnchanged'] and audit['productionAndBudgetsUnchanged'];assert sha(data['phase/repair.patch'])==audit['repairPatchSha256']
for p,h in audit['fixtures'].items():assert sha(data['after/'+p])==h
raw=(out/'raw-artifacts.json').read_bytes();assert sha(raw)==s['rawIndexSha256']
if '--raw' in sys.argv:
 for p in json.loads(raw):assert sha(Path(p['path']).read_bytes())==p['sha256']
if '--current' in sys.argv:
 root=out.parents[2]
 for p,h in audit['fixtures'].items():assert sha((root/p).read_bytes())==h,p
 for name,b in data.items():
  if name.startswith('unchanged/'):assert (root/name.removeprefix('unchanged/')).read_bytes()==b,name
print(f"Verified {len(data)} payloads; single qualification {q['status']}, {passed} passed cases. No aggregate or application-latency claim.")
