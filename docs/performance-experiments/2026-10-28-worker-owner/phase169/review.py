from pathlib import Path
import gzip,json,hashlib
p=Path(__file__).resolve().parent;repo=p.parents[3];sha=lambda b:hashlib.sha256(b).hexdigest()
def load(n):return json.loads(gzip.decompress((p/n).read_bytes()))
def log(n):return gzip.decompress((p/n).read_bytes()).decode()
for n,h in json.loads((p/'inputs.json').read_text()).items():assert sha((repo/n).read_bytes())==h,n
for n,h in json.loads((p/'built-source-identities.json').read_text()).items():assert sha((repo/n).read_bytes())==h,n
assert all(load('169-extraction-review.json.gz').values())
assert 'High-level owner dependency:'in log('169-boundary-before-actual.log.gz')and '2 failed'in log('169-boundary-before-actual.log.gz')
assert '63 passed'in log('169-focused-closure.log.gz')and '26 passed'in log('169-native-ports.log.gz')
assert '2 failed'in log('169-native-anchor-control-final.log.gz')and 'Received: "active"'in log('169-native-anchor-control-final.log.gz')
assert 'pass 98'in log('169-metadata.log.gz')and 'fail 0'in log('169-metadata.log.gz')
assert load('actual-account/receipt.json.gz')['exit']==0 and '8 passed'in log('actual-account/console.log.gz')
results=list((p/'actual-account').glob('*/result.json.gz'));assert len(results)==8
for f in results:
 r=load(str(f.relative_to(p)));assert r['outcome']=='passed'and all(r['guards'].values()),f
before=load('169-before-census.json.gz');after=json.loads((repo/'docs/account-crypto/census.json').read_text());assert len(after['sources'])==429
move=lambda path:'src/crdt/nativeCoordination.ts'if path=='src/crdt/writeSession.ts'else path
strip=lambda rows:[{**d,'sites':[{'path':move(s['path'])}for s in d['sites']]}for d in rows]
assert strip(before['domains'])==strip(after['domains'])
a={r['id']:r for r in load('169-before-manifest.json.gz')['rows']};plan=json.loads((repo/'docs/release-validation-manifest.json').read_text());b={r['id']:r for r in plan['rows']}
assert all(a[k]==b[k]for k in a)and set(b)-set(a)=={'test:test/workerRuntimeBoundary.test.ts'}and b['test:test/workerRuntimeBoundary.test.ts']['blocked']
assert len(b)==946 and len(plan['unresolved'])==400
print('Reviewed extraction, actual native account results, source classification and unchanged prior obligations.')
