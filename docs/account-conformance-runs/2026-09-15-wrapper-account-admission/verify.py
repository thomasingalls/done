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
 for pin in r['contract']['expect'].get('historyInputs',[]):
  name='phase/historical-promotionRecord.ts' if pin['reference']=='280f616' else 'phase/historical-a4e1c15-promotionRecord.ts'
  assert pin['path']=='src/crdt/promotionRecord.ts' and sha(data[name])==pin['sha256']
 for k,v in r['contract'].items():assert contracts[stage['id']][k]==v,k
 assert c['nonce']==r['nonce'] and c['phase']=='complete' and not c['errors'] and c['summary']['success']
 key=lambda x:x['id'];assert sorted(c['cases'],key=key)==sorted(r['contract']['expect']['cases'],key=key)
 assert c['summary']['counts']['tests']==len(c['cases'])
 if not stage['reused']:cases+=len(c['cases'])
 for artifact in r['artifacts']:assert sha(data[prefix+artifact['path']])==artifact['sha256']
 if r['contract'].get('fileOutputs'):
  tree=j(prefix+'files.json');assert tree['complete'] and tree==r['result']['fileOutputs'] and len(tree['entries'])==(9 if r['contract']['expect']['kind']=='account-admission' else 7)
  for e in tree['entries']:assert e['type']=='file' and sha(data[prefix+'files/'+e['path']])==e['sha256'] and len(data[prefix+'files/'+e['path']])==e['bytes']
  assert tree['bytes']==sum(e['bytes'] for e in tree['entries']) and tree['bytes']<=r['contract']['fileOutputs']['maxBytes']
assert cases==107 and sum(x['reused'] for x in q['stages'])==1 and q['stages'][-1]['key']==q['stages'][4]['key']
prefix='owned/stages/'+q['stages'][4]['key']+'/';r=j(prefix+'receipt.json');f=lambda name:j(prefix+'files/'+name+'.json')
summary=f('summary');assert summary['status']=='passed' and summary['code']==0 and summary['timedOut'] is False
for gate in ['origin','certification']:
 row=f('control-'+gate);assert row['gate']==gate and row['baseline']=='refused' and row['baselineOk'] is False and row['accountState']=='active'
 assert row['originalSignature']!='00'*64 and row['approvalSignature']=='00'*64
 epoch=row['result']['offer']['epoch'];context=row['result']['activation']['context']
 assert epoch['accountId']==row['expectedAccountId']==context['accountId']
 assert epoch['requestDigest']==row['requestDigest']==context['requestDigest']
 assert context['offerHead']==row['result']['offer']['head']
row=f('control-receipt');assert row['baseline']=='refused' and row['beforeStage']=='admission-offered' and row['afterStage']=='admission-receipted'
assert row['retained']==row['accepted'] and row['accepted']['signature']=='00'*64
service=f('generated-service');native=f('generated-native')
assert service['seed']==9232026 and len(service['histories'])==80
for h in service['histories']:
 commands=h['commands'];offer=commands.index('offer') if 'offer' in commands else -1;abandon=commands.index('abandon') if 'abandon' in commands else -1
 activation=next((i for i,c in enumerate(commands) if c=='finish' and offer>=0 and i>offer),-1)
 expected='active' if activation>=0 and (abandon<0 or activation<abandon) else 'cancelled' if abandon>=0 else 'offered' if offer>=0 else 'pending'
 assert h['state']==expected
assert native['seed']==9242026 and len(native['histories'])==30 and all(h['status']=='passed' for h in native['histories'])
history=r['contract']['expect']['historyInputs'];assert len(history)==1
pin=history[0];assert pin['reference']=='280f616' and pin['path']=='src/crdt/promotionRecord.ts' and sha(data['phase/historical-promotionRecord.ts'])==pin['sha256']
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
for m,file in zip(mutations,['stage.mjs','account-admission-wrapper.mjs']):
 assert sha(data['current/scripts/release-validation/'+file])==m['before'] and sha(data['mutants/scripts/release-validation/'+file])==m['after']
if '--current' in sys.argv:
 repo=root.parents[2]
 for name,b in data.items():
  if name.startswith('current/'):assert (repo/name.removeprefix('current/')).read_bytes()==b,name
print(f'Verified {len(data)} payloads, 107 real passed cases, exact admission reuse, nine admission reports, six synthetic runs and two discriminating faults. No aggregate claim.')
