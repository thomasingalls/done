"""Verify retained lifetime observations and exact native receipts; --raw checks local input inventories."""
from pathlib import Path
import json,gzip,hashlib,sys
packet=Path(__file__).resolve().parent;root=packet.parents[2];sha=lambda b:hashlib.sha256(b).hexdigest()
s=json.loads((packet/'summary.json').read_bytes())
assert sha((packet/'artifacts.json.gz').read_bytes())==s['artifactsSha256']
assert sha((packet/'raw-artifacts.json').read_bytes())==s['rawIndexSha256']
a=json.loads(gzip.decompress((packet/'artifacts.json.gz').read_bytes()))
assert len(a['files'])==s['files'] and len(a['blobs'])==s['blobs']
for h,b in a['blobs'].items():assert sha(b['text'].encode())==h

def data(p):
 m=a['files'][p];b=a['blobs'][m['sha256']]['text'].encode();assert len(b)==m['bytes'];return b
def read(p):return json.loads(data(p))
for p in a['files']:data(p)
f=read('phase/freeze.json');mf=read('phase/memory-freeze.json')
assert s['base']==f['base']==mf['base']
for p,h in f['original'].items():assert sha(data('original/'+p))==h==sha((root/p).read_bytes()),p
assert sha(data('observed/src/crdt/yjs.ts'))==mf['observation']['src/crdt/yjs.ts']
for p,h in mf['helpers'].items():
 name='observed/'+p.removeprefix('source/') if p.startswith('source/') else 'phase/'+p
 assert sha(data(name))==h,p
r=read('campaign/report.json');command=read('phase/campaign-command.json')
assert r['status']=='passed' and r['browserClosed'] and r['serverClosed']
assert command['code']==0 and command['drained'] and not command['timedOut']
assert [x['mode'] for x in r['sessions']]==['reference','local-snapshots','local-snapshots','reference']
assert r['inputs']['src/crdt/yjs.ts']==mf['observation']['src/crdt/yjs.ts']
assert r['inputs']['browser.ts']==mf['helpers']['source/browser.ts']
count=0
for session in r['sessions']:
 assert session['status']=='passed' and session['contextClosed'] and not session['errors']
 assert session['cycles']==12 and len(session['treatments'])==12
 for t in session['treatments']:assert t['createdHistories']==40 if session['mode']=='reference' else 1<=t['createdHistories']<=2
 obs=session['observations'];assert len(obs)==38;count+=len(obs)
 assert session['scratchProbe']['maxBytes']>256*1024 and session['scratchProbe']['maxFields']>1024
 for o in obs:
  assert 1<=o['gcRounds']<=5
  limit=2 if o['label'] in ['pressured','closing-write-leased'] or (session['mode']=='local-snapshots' and (o['label'].startswith('warm-') or o['label']=='retried')) else 1
  if o['label'].startswith('closed-') or o['label']=='final-closed':limit=0;assert o['created']==o['destroyed']
  assert len(o['histories'])<=limit
  assert all(h['beforeTransactions']<=1 for h in o['histories'])
  assert sum(h['beforeTransactions']>0 for h in o['histories'])<=1
  assert len(o['scratch'])<=2
  for e in o['scratch']:assert e['bytes']<=256*1024 and e['fields']<=1024 and not any(e[k] for k in ['buffers','position','dirtyBytes','activeFields','dirtyFields'])
 assert obs[-1]['closedFacades']==5 and not obs[-1]['histories']
 assert obs[-1]['created']==obs[-1]['destroyed']==(508 if session['mode']=='reference' else 36)
assert count==152
faults=read('phase/faults.json');assert len(faults)==3
for fault in faults:
 command=read('phase/'+fault['name']+'-command.json');r=read(fault['name']+'/report.json')
 assert command['code']==1 and command['drained'] and not command['timedOut']
 assert r['status']=='failed' and fault['marker'] in r['error']['message'] and r['error']['message']==fault['caughtBy']
 if fault['file']:
  assert sha(data('phase/'+fault['name']+'-source.ts'))==fault['changedSha256']
  before=data('observed/src/crdt/yjs.ts') if fault['file'].endswith('/yjs.ts') else data('original/'+fault['file'])
  assert sha(before)==fault['originalSha256']
  assert before.decode().count(fault['from'])==fault['count']
  assert before.decode().replace(fault['from'],fault['to']).encode()==data('phase/'+fault['name']+'-source.ts')
# Initial setup and observer failures stay distinct from the positive fixed campaign.
assert read('phase/pilot-command.json')['code']==1
assert 'ERR_MODULE_NOT_FOUND' in data('phase/pilot.log').decode()
assert read('pilot2/report.json')['status']=='failed'
assert 'Workspace admission is closed' in read('pilot2/report.json')['error']['message']
assert read('pilot3/report.json')['status']=='passed'
# Supplemental observation narrows the claim: canonical lifetime follows the retained facade.
canonical=read('canonical2/report.json');cc=read('phase/canonical2-command.json')
assert canonical['status']=='passed' and cc['code']==0 and cc['drained'] and not cc['timedOut']
assert [x['mode'] for x in canonical['sessions']]==['reference','local-snapshots']
for session in canonical['sessions']:
 assert session['status']=='passed' and session['contextClosed']
 opened,held,dropped=session['observations']
 assert held['canonicals']==[{'destroyed':True,'textLength':40}] and held['histories']==[]
 assert dropped['canonicals']==[] and dropped['histories']==[]
for name,h in read('phase/canonical2-source.json')['files'].items():assert sha(data('phase/'+name))==h
assert 'destroyed canonical retains writing' in read('canonical/report.json')['error']['message']
diag=read('phase/receive-diagnostic.json')
assert diag['code']==0 and diag['drained'] and not diag['timedOut']
assert 'ℹ tests 1' in data('phase/receive-diagnostic.log').decode() and 'ℹ pass 1' in data('phase/receive-diagnostic.log').decode()
analysis=read('phase/account-analysis.json');assert analysis==s['account']
expected={x['id']:x for x in read('phase/account-selection.json')['stages']};passed={}
for attempt in analysis['attempts']:
 epoch=attempt['epoch'];run=read(epoch+'/summary.json');assert run['input']==attempt['input'] and run['status']==attempt['status']
 for stage in run['stages']:
  p=epoch+'/stages/'+stage['key']+'/';r=read(p+'receipt.json');c=read(p+'cases.json')
  assert r['stageId']==stage['id'] and r['key']==stage['key'] and r['input']==run['input']
  assert r['nonce']==c['nonce'] and stage['groupDrained'] and r['result']['groupDrained']
  for art in r['artifacts']:assert sha(data(p+art['path']))==art['sha256']
  if r['result'].get('browser'):assert r['result']['browser']['groupDrained']
  if stage['status']=='passed':
   assert r['result']['code']==0 and c['phase']=='complete' and not c['errors']
   assert sorted(c['cases'],key=lambda x:x['id'])==sorted(expected[stage['id']]['expect']['cases'],key=lambda x:x['id'])
   passed[stage['id']]=len(c['cases'])
  else:assert stage['reason']=='timeout' and stage['id']=='test:test/account-receive/native.test.mjs'
assert len(passed)==analysis['completedFiles'] and sum(passed.values())==analysis['completedCases']
assert sorted(set(expected)-set(passed))==analysis['missing']
assert read('phase/preservation.json')['sourceUnchanged']
if '--raw' in sys.argv:
 for p in json.loads((packet/'raw-artifacts.json').read_bytes()):
  b=Path(p['path']).read_bytes();assert len(b)==p['bytes'] and sha(b)==p['sha256']
print(f"Verified {s['files']} payloads; 152 lifetime checkpoints/three faults; {len(passed)} completed Account files/{sum(passed.values())} cases. Separate timeout attempts retained; no activation or release claim.")
