from pathlib import Path
import gzip,json,hashlib
p=Path(__file__).resolve().parent;repo=p.parents[3];sha=lambda b:hashlib.sha256(b).hexdigest()
def load(n):return json.loads(gzip.decompress((p/n).read_bytes()))
def log(n):return gzip.decompress((p/n).read_bytes()).decode()
for n,h in json.loads((p/'inputs.json').read_text()).items():assert sha((repo/n).read_bytes())==h,n
assert '80 passed'in log('170-focus-closure.log.gz')and '28 passed'in log('170-native-ports.log.gz')
assert '2300 passed | 1 skipped'in log('170-unit-full.log.gz')
assert 'pass 98'in log('170-metadata.log.gz')and 'fail 0'in log('170-metadata.log.gz')
assert 'pass 6'in log('170-notifications-final.log.gz')and 'fail 0'in log('170-notifications-final.log.gz')
before=load('170-before-activity-credit.json.gz');assert before['events']==100 and before['pending']==8 and before['refused']==92
assert (repo/'src/crdt/accountWorkerClient.ts').read_text().count('createWorkerActivityForwarder(')==1
for n in ['src/crdt/accountReceive.ts','src/account/notifications.ts']:
 s=(repo/n).read_text();assert 'globalThis.document'not in s and 'globalThis.addEventListener'not in s and 'globalThis.removeEventListener'not in s
prior=load('170-before-census.json.gz');after=json.loads((repo/'docs/account-crypto/census.json').read_text());strip=lambda rows:[{**d,'sites':[{'path':s['path']}for s in d['sites']]}for d in rows]
assert strip(prior['domains'])==strip(after['domains'])and len(after['sources'])==430
a={r['id']:r for r in load('170-before-manifest.json.gz')['rows']};plan=json.loads((repo/'docs/release-validation-manifest.json').read_text());b={r['id']:r for r in plan['rows']};assert all(a[k]==b[k]for k in a)and set(b)-set(a)=={'test:test/workerActivity.test.ts'}and b['test:test/workerActivity.test.ts']['blocked']
assert len(b)==947 and len(plan['unresolved'])==401
print('Verified bounded activity, worker/native observers, functional units and unchanged prior obligations; no performance acceptance.')
