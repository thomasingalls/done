from pathlib import Path
import base64,gzip,hashlib,json,sys
out=Path(__file__).resolve().parent;sha=lambda b:hashlib.sha256(b).hexdigest();s=json.loads((out/'summary.json').read_bytes());b=(out/'artifacts.json.gz').read_bytes();assert len(b)<1000000 and sha(b)==s['artifactsSha256'];a=json.loads(gzip.decompress(b));data={}
for name,v in a['files'].items():
 item=a['blobs'][v['sha256']];b=item['data'].encode('utf8') if item['encoding']=='utf8' else base64.b64decode(item['data'],validate=True);assert sha(b)==v['sha256'] and len(b)==v['bytes'];data[name]=b
assert len(data)==s['payloads'];j=lambda p:json.loads(data[p]);v=j('phase/variant.json');assert sha(data['phase/activation.patch'])==v['activationPatch'];freeze=j('phase/freeze.json');assert freeze['protocol']==sha(data['phase/protocol.md']) and freeze['helper']==sha(data['phase/application.mjs'])
assert j('phase/original-unchanged.json')['unchanged'];assert j('phase/analysis.json')==s['analysis'];assert s['analysis']['gateStatus']=='failed' and not s['analysis']['activationEligiblePendingFunctionalChecks'];assert data['phase/rc-disposition-amendment.md']
# Run the original analysis unchanged against archived bytes through a tiny read-only virtual path.
class P:
 def __init__(self,p='phase/analyze.py'):self.p=p
 def resolve(self):return self
 @property
 def parent(self):return P('phase')
 def __truediv__(self,p):return P(self.p+'/'+str(p))
 def read_bytes(self):return data[self.p.replace('phase/application/','application/')]
 def write_text(self,value):assert json.loads(value)==s['analysis']
source=data['phase/analyze.py'].decode().replace('from pathlib import Path','Path = P');exec(compile(source,'archived-analysis.py','exec'),{'P':P,'__file__':'phase/analyze.py','print':lambda *args:None})
q=j('functional/summary.json');assert q==s['functional'] and q['status']=='passed';app=j('application/summary.json');assert q['input']==app['input']==s['analysis']['applicationInput']
stages=j('phase/functional-selection.json')['stages'];contracts={x['id']:{k:v for k,v in x.items() if k not in ['id','dependsOn']} for x in stages};assert len(q['stages'])==10
for epoch in ['application','functional']:
 summary=j(epoch+'/summary.json')
 for st in summary['stages']:
  pre=epoch+'/stages/'+st['key']+'/';r=j(pre+'receipt.json');assert r['input']==summary['input'] and r['key']==st['key'] and r['status']==st['status'];assert r['result']['groupDrained']
  if epoch=='functional':assert r['status']=='passed' and r['contract']==contracts[st['id']]
  for item in r['artifacts']:assert sha(data[pre+item['path']])==item['sha256']
  if r['result'].get('browser'):assert r['result']['browser']['groupDrained']
act=j('phase/activation.json');assert act==s['activation'] and act['activated'] and act['accountUnchanged'];original=data['source/src/crdt/admittedWorkspace.ts'];needle=b'    options,\n  );\ntype State = {';assert original.count(needle)==1
activated=original.replace(needle,b"    options,\n    'local-snapshots',\n  );\ntype State = {");assert activated==data['phase/admittedWorkspace.ts'];assert sha(activated)==act['sha256']==v['changed'][0]['sha256'];assert [x['path'] for x in v['changed']]==['src/crdt/admittedWorkspace.ts']
raw=(out/'raw-artifacts.json').read_bytes();assert sha(raw)==s['rawIndexSha256']
if '--raw' in sys.argv:
 for p in json.loads(raw):assert sha(Path(p['path']).read_bytes())==p['sha256']
if '--current' in sys.argv:
 root=out.parents[2];assert (root/'src/crdt/admittedWorkspace.ts').read_bytes()==activated
 assert (root/'src/crdt/accountWorkspace.ts').read_bytes()==data['source/src/crdt/accountWorkspace.ts']
print(f'Verified {len(data)} payloads, original failed latency assessment, explicit RC amendment, ten passed functional stages and exact Local activation.')
