from pathlib import Path
import gzip,json,hashlib
p=Path(__file__).resolve().parent;repo=p.parents[3];sha=lambda b:hashlib.sha256(b).hexdigest()
def load(n):return json.loads(gzip.decompress((p/n).read_bytes()))
def log(n):return gzip.decompress((p/n).read_bytes()).decode()
for n,h in json.loads((p/'inputs.json').read_text()).items():assert sha((repo/n).read_bytes())==h,n
for n,h in json.loads((p/'built-source-identities.json').read_text()).items():assert sha((repo/n).read_bytes())==h,n
source=load('174-source-review.json.gz');assert all(v is True for k,v in source.items()if k!='newHashPurpose')
assert '2331 passed | 1 skipped'in log('174-unit-full.log.gz')and '27 passed'in log('174-rebind-first.log.gz')
assert 'pass 98'in log('174-metadata.log.gz')and 'fail 0'in log('174-metadata.log.gz')
fault=log('174-stale-binding-fault.log.gz');assert '1 failed'in fault and 'Account journal/database pairing differs'in fault and 'timed out'not in fault
assert load('actual-account/receipt.json.gz')['exit']==0 and '11 passed'in log('actual-account/console.log.gz')
results=list((p/'actual-account').glob('*/result.json.gz'));assert len(results)==11
for f in results:
 r=load(str(f.relative_to(p)));assert r['outcome']=='passed'and all(r['guards'].values()),f
assert len(load('174-container-cleanup.json.gz'))==11 and all(r['absent']for r in load('174-container-cleanup.json.gz'))
prior=load('174-before-census.json.gz');after=json.loads((repo/'docs/account-crypto/census.json').read_text());assert prior['domains']==after['domains']and len(after['sources'])==432
old={r['id']:r for r in load('174-before-manifest.json.gz')['rows']};plan=json.loads((repo/'docs/release-validation-manifest.json').read_text());new={r['id']:r for r in plan['rows']};assert all(old[k]==new[k]for k in old)and set(new)-set(old)=={'test:test/windowAccountMirrorRebind.test.ts'}and new['test:test/windowAccountMirrorRebind.test.ts']['blocked']
assert len(new)==952 and len(plan['unresolved'])==406
print('Reviewed old boundaries/tests retained, hot context fault sensitivity and actual account compatibility; native maintenance integration pending.')
