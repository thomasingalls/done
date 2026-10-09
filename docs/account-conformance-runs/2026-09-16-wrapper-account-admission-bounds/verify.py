from pathlib import Path
import base64,hashlib,json,lzma,struct,sys
root=Path(__file__).resolve().parent;sha=lambda b:hashlib.sha256(b).hexdigest()
s=json.loads((root/'summary.json').read_bytes());b=(root/'artifacts.bin.xz').read_bytes();assert len(b)==s['compressedBytes']<=1000000 and sha(b)==s['artifactsSha256'];packed=lzma.decompress(b)
assert packed[:8]==b'DONEHEX1'
length=struct.unpack('>Q',packed[8:16])[0];offset=16+length
lengths=json.loads(packed[16:offset]);tokens=[]
for length in lengths:
 assert isinstance(length,int) and length>=16 and offset+length<=len(packed)
 tokens.append(packed[offset:offset+length].hex().encode());offset+=length
body=packed[offset:];parts=[];offset=0
while True:
 end=body.find(b'\xff',offset)
 if end<0:parts.append(body[offset:]);break
 assert end+5<=len(body);parts.append(body[offset:end])
 index=struct.unpack('>I',body[end+1:end+5])[0];assert index<len(tokens)
 parts.append(tokens[index]);offset=end+5
a=json.loads(b''.join(parts));data={};chunks={}
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
 if e['kind'] in ['account-admission-bounds','account-activation']:
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
  assert len(tree['entries'])==(24 if e['kind']=='account-admission-bounds' else 32)
  assert tree['bytes']<=r['contract']['fileOutputs']['maxBytes']
  for x in tree['entries']:
   if x['type']=='directory':continue
   assert len(data[prefix+'files/'+x['path']])==x['bytes'] and sha(data[prefix+'files/'+x['path']])==x['sha256']
assert count==220 and sum(s['reused'] for s in q['stages'])==1 and q['stages'][-1]['key']==q['stages'][5]['key']
assert [s['cases'] for s in q['stages'][:-1]]==[70,5,12,4,55,11,25,38]
f=j('smoke-failed-reconcile/summary.json');assert f['status']=='failed' and len(f['stages'])==1 and f['stages'][0]['cases']==11
prefix='smoke-failed-reconcile/stages/'+f['stages'][0]['key']+'/';r=j(prefix+'receipt.json');assert r['result']['groupDrained'] and r['result']['code']==0 and 'Invalid coverage bytes' in r['result']['reason']
for artifact in r['artifacts']:assert sha(data[prefix+artifact['path']])==artifact['sha256']
for step in r['contract']['expect']['steps']:
 if step['kind']=='node':node(j(prefix+'files/case-reports/'+step['name']+'.json'),step['expect']['cases'],r['nonce']+':'+step['name'])
h=j('phase/historical-controls.json');assert len(h['pins'])==len(h['files'])==3 and h['restored']
assert all(x['detected'] and x['batchMatchesFreshShow'] and 'Historical source changed' in x['error'] for x in h['files'])
prefix='owned/stages/'+q['stages'][5]['key']+'/';r=j(prefix+'receipt.json');assert r['contract']['expect']['historyInputs']==h['pins']
for pin in h['pins']:assert pin['reference']=='6398e33' and sha(data['historical/'+pin['path']])==pin['sha256']
def report(name):return j(prefix+'files/'+name+'.json')
b=report('reproduction');assert b['commit']=='6398e33' and len(b['cases'])==20 and b['source']=={k:h['pins'][0][k] for k in ['path','sha256']}
i=0
for size in [32766,32767,32768]:
 for field in ['sv','ds']:
  for name in ['manifest','admission','parser']:
   row=b['cases'][i];i+=1;assert row=={'bytes':size,'field':field,'name':name,'error':(('Invalid coverage bytes' if name=='parser' else 'Protocol field too long') if size==32768 else None)}
for row in b['cases'][18:]:assert row['refusedBoth'] and row['errors']==['Protocol field too long']*2
codecs=report('generated-codecs');assert codecs['seed']==9112071 and codecs['histories']==len(codecs['observations'])==len(codecs['generatedInputs'])==85
assert codecs['run']=={'numRuns':80,'numShrinks':0,'failed':False,'counterexample':None,'counterexamplePath':None}
for inp,o in zip(codecs['generatedInputs'],codecs['observations']):
 assert inp==o['input'] and [x['field'] for x in o['mutations']]==['sv','ds']
 for f in ['sv','ds']:assert o['completion']['coverage'][f]=={'bytes':inp[f],'sha256':sha(bytes([inp['byte']])*inp[f])}
 for kind in ['manifest','admission']:assert len(bytes.fromhex(o['completion'][kind]['signature']))==64 and o['messages'][kind]
u=report('upper-bound');assert u['combinedBytes']==16777216 and u['receiptHash']==u['coldReceiptHash'] and u['rowsBefore']==u['rowsAfter'] and len(u['oversize'])==2 and len(u['malformed'])==14
histories=report('long-histories');assert [(x['kind'],x['count']) for x in histories]==[(k,n) for k in ['sv','ds'] for n in [12000,12317,13001]]
for o in histories:
 raw=base64.b64decode(o['updateBase64'],validate=True);assert base64.b64encode(raw).decode()==o['updateBase64'] and len(raw)==o['checkpointBytes']
 assert o['visible']==('x' if o['kind']=='sv' else '.')*o['count'] and o[o['kind']+'Bytes']>32767
for kind in ['sv','ds']:
 o=report('native-long-'+kind);raw=base64.b64decode(o['updateBase64'],validate=True);assert raw and o['v']==2 and o['receiptHash']==o['coldReceiptHash'] and o['before']==o['after'] and o['markerBefore']==o['markerAfter'] and len(o['errors'])==2
 assert o['updateBytes']==next(h['checkpointBytes'] for h in histories if h['kind']==kind and h['count']==12000)
 o=report('native-lie-'+kind);assert o['finishCalls']==0 and o['before']==o['after'] and o['carrierBefore']==o['carrierAfter']
o=report('native-v1');assert o['stage']=='admission-offered' and o['completion']['manifest']['v']==1 and o['before']==o['after'] and o['carrierBefore']==o['carrierAfter']
o=report('native-preflight');assert o['stage']=='genesis-prepared' and o['admissionCalls']==0 and o['before']==o['after'] and o['carrierBefore']==o['carrierAfter']
controls=j('phase/process-controls.json');assert len(controls)==8
for c in controls:
 assert c['code']==0 and c['groupDrained'] and c['status']==('passed' if c['name']=='valid' or c['name'].startswith('omitted-') else 'failed')
 p='controls/'+c['name']+'/receipts/'+c['key']+'/';r=j(p+'receipt.json')
 for a in r['artifacts']:assert sha(data[p+a['path']])==a['sha256']
mutations=j('phase/mutations.json');assert len(mutations)==2 and all(x['detected'] for x in mutations)
m=j('current/docs/release-validation-manifest.json');rows={r['id']:r for r in m['rows']}
assert len(rows)==629 and {k:sum(rows[i]['kind']==k for i in m['unresolved']) for k in ['test','command','campaign']}=={'test':0,'command':70,'campaign':38}
general=[rows[i]['stage'] for i in m['selections']['general-tests']];assert len(general)==272 and sum(len(x['expect']['cases']) for x in general)==2203
raw=(root/'raw-artifacts.json').read_bytes();assert sha(raw)==s['rawIndexSha256']
if '--raw' in sys.argv:
 for x in json.loads(raw):
  b=Path(x['path']).read_bytes();assert len(b)==x['bytes'] and sha(b)==x['sha256']
if '--current' in sys.argv:
 repo=root.parents[2]
 for name,b in data.items():
  if name.startswith('current/'):assert (repo/name[8:]).read_bytes()==b,name
print(f'Verified {len(data)} payloads: 220 passing cases, exact reuse, retained reconciliation failure, historical and omission controls, descriptor and replay evidence. Node owns signature/Yjs reconciliation. No aggregate claim.')
