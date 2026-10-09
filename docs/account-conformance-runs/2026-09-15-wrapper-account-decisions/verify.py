from pathlib import Path
import base64,gzip,hashlib,json,sys
root=Path(__file__).resolve().parent;sha=lambda b:hashlib.sha256(b).hexdigest()
s=json.loads((root/'summary.json').read_bytes());b=(root/'artifacts.json.gz').read_bytes();assert sha(b)==s['artifactsSha256'];a=json.loads(gzip.decompress(b));data={}
chunks={}
assert a['schema']==3 and a['encoding']=='chunked-utf8-or-base64'
for key,v in a['blobs'].items():
 b=v.encode('utf-8') if isinstance(v,str) else base64.b64decode(v['base64'],validate=True)
 assert sha(b)==key;chunks[key]=b
for name,item in a['files'].items():
 b=b''.join(chunks[key] for key in item['chunks']);assert len(b)==item['bytes'] and sha(b)==item['sha256'];data[name]=b
assert len(data)==s['payloads'];j=lambda name:json.loads(data[name])
q=j('owned/summary.json');assert q==s['qualification'] and q['status']=='passed' and len(q['stages'])==7
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
  name='phase/historical-promotionRecord.ts'
  assert pin['reference']=='7210b7d' and pin['path']=='src/crdt/promotionRecord.ts' and sha(data[name])==pin['sha256']
 if expect['kind'] in ['account-decisions','account-spool']:
  assert c['schema']==1 and c['adapter']=='campaign-v1' and c['nonce']==r['nonce'] and c['phase']=='complete'
  assert len(c['steps'])==len(expect['steps']) and [v['name'] for v in c['steps']]==[v['name'] for v in expect['steps']]
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
    for v in child['cases']:assert v['retryCount']==0 and v['repeatCount']==0 and not v['errors'] and v['mode']=='run'
   actual+=child['cases']
  assert normalize(actual)==normalize(expect['cases']) and len(actual)==len(expect['cases'])
 else:node_report(c,expect['cases'],r['nonce'])
 if not stage['reused']:cases+=len(expect['cases'])
 for artifact in r['artifacts']:assert sha(data[prefix+artifact['path']])==artifact['sha256']
 if r['contract'].get('fileOutputs'):
  tree=j(prefix+'files.json');assert tree['complete'] and tree==r['result']['fileOutputs']
  assert len(tree['entries'])==(10 if expect['kind']=='account-decisions' else 12)
  for e in tree['entries']:
   if e['type']=='directory':assert e['path']=='case-reports';continue
   assert e['type']=='file' and sha(data[prefix+'files/'+e['path']])==e['sha256'] and len(data[prefix+'files/'+e['path']])==e['bytes']
  assert tree['bytes']==sum(e.get('bytes',0) for e in tree['entries']) and tree['bytes']<=r['contract']['fileOutputs']['maxBytes']
assert cases==134 and sum(x['reused'] for x in q['stages'])==1 and q['stages'][-1]['key']==q['stages'][4]['key']
prefix='owned/stages/'+q['stages'][4]['key']+'/';r=j(prefix+'receipt.json');f=lambda name:j(prefix+'files/'+name+'.json')
summary=f('summary');assert summary['status']=='passed' and len(summary['stages'])==2
assert all(x['code']==0 and x['timedOut'] is False for x in summary['stages'])
control=f('controls');assert [c['control'] for c in control]==['signature','epoch','link','parent','position']
compact=lambda x:json.dumps(x,separators=(',',':'),ensure_ascii=False).encode()
def lp(*values):
 out=b''
 for value in values:
  b=str(value).encode();out+=len(b).to_bytes(2,'big')+b
 return out
def refusal(p):return ['done/position-response/v1',1,'refused',p['workspace'],p['credential'],p['position'],p['digest'],p['epoch'],p['reason'],p['parent'],p['signature']]
for c in control[:3]:
 assert c['baseline']=='unknown' and c['badEvidence']==('accepted' if c['control']=='link' else 'refused')
 response=c['response']
 if c['control']=='link':
  h=response['head'];leaf=response['leaf'];wire=['done/position-response/v1',1,'accepted',h['workspace'],h['credential'],h['position'],h['link'],h['epoch'],h['final'],leaf['epoch'],leaf['digest'],h['signature']]
  e=c['expected'];assert h['link']!=sha(lp('done/accept/v1',e['workspace'],e['credential'],e['position'],e['epoch'],e['digest'],e['previous']))
 else:wire=refusal(response['refusal']);assert response['refusal']['epoch']==c['expected']['epoch']-(c['control']=='epoch')
 assert bytes(c['bytes'])==compact(wire)
for c in control[3:]:
 assert c['baseline']['accepted'] is False and c['badSubmissionAccepted'] is True
 before=c['original'];after=c['accepted'];assert before['signature']==after['signature'] and before['envelope']==after['envelope'] and before['lineage']==after['lineage']
 env=bytes(after['envelope']);parent=compact(refusal(after['parent']));wire=lp('done/envelope-submission-wire/v1','1',after['lineage'])+len(env).to_bytes(4,'big')+env+len(parent).to_bytes(4,'big')+parent+bytes(after['signature']);assert wire==bytes(c['bytes'])
 if c['control']=='parent':assert before['parent']['reason']=='stale-epoch' and after['parent']['reason']=='retired-generation' and before['parent']['signature']!=after['parent']['signature']
 else:assert before==after and after['parent']['position']==c['envelopePosition']+1
g=f('generated');assert g['status']=='passed' and g['seed']==9622026 and len(g['histories'])==8
for h in g['histories']:
 assert len(h['commands'])==len(h['observations']) and 2<=len(h['commands'])<=5
 for command,observation in zip(h['commands'],h['observations']):
  assert observation['kind']==(command if command in ['accepted','refused','conflict'] else 'unknown') and observation['inventoryHash']==h['before']['inventoryHash']
 assert h['before']['budget']==h['after']['budget'] and h['before']['sources']==h['after']['sources'] and h['before']['wire']==h['recovered']['wire']
 recovered={c['id']:c for c in h['recovered']['sources']};assert len(recovered)==len(h['recovered']['sources'])
 for source in h['before']['sources']:assert recovered[source['id']]==source
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
for m in mutations:assert sha(data['current/scripts/release-validation/stage.mjs'])==m['before'] and sha(data['mutants/scripts/release-validation/'+m['file']])==m['after']
if '--current' in sys.argv:
 repo=root.parents[2]
 for name,b in data.items():
  if name.startswith('current/'):assert (repo/name.removeprefix('current/')).read_bytes()==b,name
print(f'Verified {len(data)} payloads, 134 real passed cases, exact decisions reuse, nine decisions reports, eight synthetic runs and two discriminating faults. No aggregate claim.')
