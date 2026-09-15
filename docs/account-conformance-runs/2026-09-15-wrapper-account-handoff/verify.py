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
  name='phase/historical-promotionRecord.ts' if pin['reference']=='beed8cf' else 'phase/historical-280f616-promotionRecord.ts'
  assert pin['path']=='src/crdt/promotionRecord.ts' and sha(data[name])==pin['sha256']
 for k,v in r['contract'].items():assert contracts[stage['id']][k]==v,k
 assert c['nonce']==r['nonce'] and c['phase']=='complete' and not c['errors'] and c['summary']['success']
 key=lambda x:x['id'];assert sorted(c['cases'],key=key)==sorted(r['contract']['expect']['cases'],key=key)
 assert c['summary']['counts']['tests']==len(c['cases'])
 if not stage['reused']:cases+=len(c['cases'])
 for artifact in r['artifacts']:assert sha(data[prefix+artifact['path']])==artifact['sha256']
 if r['contract'].get('fileOutputs'):
  tree=j(prefix+'files.json');assert tree['complete'] and tree==r['result']['fileOutputs'] and len(tree['entries'])==9
  for e in tree['entries']:assert e['type']=='file' and sha(data[prefix+'files/'+e['path']])==e['sha256'] and len(data[prefix+'files/'+e['path']])==e['bytes']
  assert tree['bytes']==sum(e['bytes'] for e in tree['entries']) and tree['bytes']<=r['contract']['fileOutputs']['maxBytes']
assert cases==116 and sum(x['reused'] for x in q['stages'])==1 and q['stages'][-1]['key']==q['stages'][4]['key']
prefix='owned/stages/'+q['stages'][4]['key']+'/';r=j(prefix+'receipt.json');f=lambda name:j(prefix+'files/'+name+'.json')
summary=f('summary');assert summary['status']=='passed' and summary['code']==0 and summary['timedOut'] is False
credential=f('control-credential');passkey=f('control-passkey');der=f('generated-der')
assert credential['baselineOk'] is False and credential['substitutedKey']!=credential['original']['stored']['binding']['publicKey']
assert credential['substitutedKey']==credential['accepted']['stored']['binding']['publicKey']
expected=json.loads(json.dumps(credential['original']));expected['stored']['binding']['publicKey']=credential['substitutedKey'];expected['stored']['bindingSignature']=credential['accepted']['stored']['bindingSignature'];assert expected==credential['accepted']
assert passkey['baselineUnchanged'] is True and passkey['signature']=='00'*64
assert passkey['classified']==dict(passkey['accepted'],kind='account')
assert all(passkey['accepted'][k]==v for k,v in passkey['expected'].items())
assert der['seed']==9262026 and len(der['cases'])==200
# Independently verify the retained DER and binding bytes with Node/OpenSSL; no repository import.
import subprocess
crypto = r"""
const {readFileSync}=require('node:fs'),{createPublicKey,verify}=require('node:crypto'),assert=require('node:assert/strict');
const {credential:c,der:d}=JSON.parse(readFileSync(0,'utf8'));
const pub=h=>createPublicKey({key:Buffer.from(h,'hex'),type:'spki',format:'der'});
const key=pub(d.publicKey);assert.equal(key.asymmetricKeyDetails.namedCurve,'prime256v1');
for(const row of d.cases)assert(verify('sha256',Buffer.from(row.message,'hex'),key,Buffer.from(row.der,'hex')));
for(const p of [c.original,c.accepted]){
 const b=p.stored.binding,parts=['done/slotbind/v1',b.v,b.accountId,b.principalId,b.rpId,b.epoch,b.credId,b.publicKey].map(v=>Buffer.from(String(v))).map(b=>Buffer.concat([Buffer.from([b.length>>8,b.length&255]),b]));
 assert(verify(null,Buffer.concat(parts),pub('302a300506032b6570032100'+c.authRoot),Buffer.from(p.stored.bindingSignature,'hex')));
}
"""
subprocess.run(['node','-e',crypto],input=json.dumps({'credential':credential,'der':der}).encode(),check=True,timeout=15)
service=f('generated-service');native=f('generated-native')
assert service['seed']==9252026 and len(service['histories'])==60
assert all(h['status']=='passed' and h['activated']==('activate' in h['commands']) for h in service['histories'])
assert native['seed']==9272026 and len(native['histories'])==24 and all(h['status']=='passed' for h in native['histories'])
history=r['contract']['expect']['historyInputs'];assert len(history)==1
pin=history[0];assert pin['reference']=='beed8cf' and pin['path']=='src/crdt/promotionRecord.ts' and sha(data['phase/historical-promotionRecord.ts'])==pin['sha256']
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
for m,file in zip(mutations,['stage.mjs','account-handoff-wrapper.mjs']):
 assert sha(data['current/scripts/release-validation/'+file])==m['before'] and sha(data['mutants/scripts/release-validation/'+file])==m['after']
if '--current' in sys.argv:
 repo=root.parents[2]
 for name,b in data.items():
  if name.startswith('current/'):assert (repo/name.removeprefix('current/')).read_bytes()==b,name
print(f'Verified {len(data)} payloads, 116 real passed cases, exact handoff reuse, nine handoff reports, six synthetic runs and two discriminating faults. No aggregate claim.')
