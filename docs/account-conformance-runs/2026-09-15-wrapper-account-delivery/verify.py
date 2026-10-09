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
normalize=lambda rows:sorted([{'id':x['id'],'outcome':x['outcome']} for x in rows],key=lambda x:x['id'])
def node_report(c,expect,nonce):
 assert c['nonce']==nonce and c['phase']=='complete' and not c['errors'] and c['summary']['success']
 assert normalize(c['cases'])==normalize(expect) and c['summary']['counts']['tests']==len(expect)
final_q=q
for epoch, selection in [('owned-incomplete-contract','selection-incomplete-contract.json'), ('owned','selection.json')]:
 q=j(epoch+'/summary.json');assert q['status']=='passed' and len(q['stages'])==7
 contracts={x['id']:x for x in j('phase/'+selection)};cases=0
 for stage in q['stages']:
  prefix=epoch+'/stages/'+stage['key']+'/';r=j(prefix+'receipt.json');c=j(prefix+'cases.json');expect=r['contract']['expect']
  assert r['status']=='passed' and r['result']['groupDrained'] and stage['groupDrained'] and r['input']==q['input']
  for k,v in r['contract'].items():assert contracts[stage['id']][k]==v,k
  for pin in expect.get('historyInputs',[]):
   name='phase/historical-promotionRecord.ts'
   assert pin['reference']=='81a4655' and pin['path']=='src/crdt/promotionRecord.ts' and sha(data[name])==pin['sha256']
  if expect['kind'] in ['account-delivery','account-decisions']:
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
   assert len(tree['entries'])==(13 if expect['kind']=='account-delivery' else 10)
   for e in tree['entries']:
    if e['type']=='directory':assert e['path']=='case-reports';continue
    assert e['type']=='file' and sha(data[prefix+'files/'+e['path']])==e['sha256'] and len(data[prefix+'files/'+e['path']])==e['bytes']
   assert tree['bytes']==sum(e.get('bytes',0) for e in tree['entries']) and tree['bytes']<=r['contract']['fileOutputs']['maxBytes']
 assert cases==140 and sum(x['reused'] for x in q['stages'])==1 and q['stages'][-1]['key']==q['stages'][4]['key']
q=final_q
prefix='owned/stages/'+q['stages'][4]['key']+'/';r=j(prefix+'receipt.json');f=lambda name:j(prefix+'files/'+name+'.json')
unit=f('unit-histories')
for k,v in dict(failed=False,interrupted=False,numRuns=500,numSkips=0,numShrinks=0,seed=1121060,counterexample=None,counterexamplePath=None,error=None,errorInstance=None).items():assert unit[k]==v
assert unit['failures']==[] and unit['executionSummary']==[] and 1500<=unit['prefixes']<=60000 and unit['prefixes']%3==0
assert unit['runConfiguration']['seed']==1121060 and unit['runConfiguration']['numRuns']==500 and unit['runConfiguration']['path']=='' and unit['runConfiguration']['endOnFailure'] is False and unit['runConfiguration']['examples']==[]
summary=f('summary');assert summary['status']=='passed' and len(summary['stages'])==2
assert all(x['code']==0 and x['timedOut'] is False for x in summary['stages'])
c=f('controls');early=c['earlyReturn'];closure=c['missingClosure'];pending=lambda s:[{'position':s['position'],'bytes':s['bytes']}]
assert early['escaped']['kind']=='ready' and early['escaped']['bytes'] and early['pending']==[]
assert early['baseline']['kind']=='ready' and early['baseline']['position']==1 and early['baseline']['bytes']
assert early['baselinePending']==pending(early['baseline'])
assert closure['before']['state']=='closed' and closure['after']['state']=='ready' and closure['pending']==early['baselinePending']
assert 'incomplete' in closure['refusalReason'] or 'commitment' in closure['refusalReason']
assert sum(v['count'] for v in closure['before']['responses'])==1 and closure['after']['responses']==[]
assert f('authority-control')==[{'control':False,'returned':False,'persisted':0},{'control':True,'returned':True,'persisted':1}]
prefixes=f('prefix-control');assert [p['reverse'] for p in prefixes]==[False,True]
for p in prefixes:
 assert p['mutant']['state']=='closed' and p['actual']['state']=='conflict'
 assert dict(p['mutant'],state='conflict')==p['actual'] and sum(v['count'] for v in p['actual']['responses'])==2
def oracle(events):
 accepted=[e for e in events if e['kind'] in ['accepted','finalized']];final=[e for e in accepted if e['kind']=='finalized'];denied=[e for e in events if e['kind']=='refused']
 conflict=any(e['kind']=='conflict' for e in events) or any(d['position']<=a['position'] for d in denied for a in accepted) or any(a['position']>f['position'] for f in final for a in accepted) or len({f['position'] for f in final})>1
 return ('conflict' if conflict else 'closed' if denied else 'finalized' if final else 'ready',max([0]+[e['position'] for e in accepted]),len(events))
g=f('generated');assert g['status']=='passed' and g['seed']==9812027 and len(g['histories'])==8
for h in g['histories']:
 assert len(h['answers'])==len(h['observations']) and 3<=len(h['answers'])<=6 and h['side'] in ['before','after']
 assert h['saved']['kind']=='ready' and h['saved']['position']==1 and h['saved']==h['retry']
 assert h['postCrashPending']==(pending(h['saved']) if h['side']=='after' else [])
 events=[];seen={}
 for event,o in zip(h['answers'],h['observations']):
  assert event['kind'] in ['accepted','refused','finalized','conflict','junk'] and event['position'] in [1,2] and o['bytes']
  key=(event['kind'],event['position']);before=oracle(events)
  if key in seen:assert o['bytes']==seen[key]
  record=event['kind']!='junk' and before[0]!='conflict' and key not in seen;assert o['recorded']==record
  if record:events.append(event);seen[key]=o['bytes']
  state,through,count=oracle(events);actual=o['status']
  assert actual['state']==state and actual['acceptedThrough']==through and sum(v['count'] for v in actual['responses'])==count
  assert o['pending']==(pending(h['saved']) if state=='ready' and through==0 else [])
 assert h['beforeReopen']==h['observations'][-1]['status']==h['recovered']['status']
 assert h['before']['wires']==h['recovered']['wires'] and len(h['before']['wires'])>=2
 retained={s['id']:s for s in h['recovered']['sources']};assert len(retained)==len(h['recovered']['sources'])
 for source in h['before']['sources']:assert retained[source['id']]==source
raw=(root/'raw-artifacts.json').read_bytes();assert sha(raw)==s['rawIndexSha256']
if '--raw' in sys.argv:
 for item in json.loads(raw):assert sha(Path(item['path']).read_bytes())==item['sha256']
 inputs=json.loads(gzip.decompress(Path(next(x['path'] for x in json.loads(raw) if x['path'].endswith('/owned/inputs.json.gz'))).read_bytes()))
 pinned={x['path']:x for x in inputs['sources']}
 for p in f('sources'):assert pinned[p['path']]['sha256']==p['sha256']
controls=j('phase/process-controls.json');assert len(controls)==9
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
print(f'Verified {len(data)} payloads, 140 final passed cases (280 across both epochs), exact delivery reuse, twelve delivery reports, nine synthetic runs and two discriminating faults. No aggregate claim.')
