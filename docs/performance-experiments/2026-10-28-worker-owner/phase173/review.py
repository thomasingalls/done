from pathlib import Path
import gzip,json,hashlib
p=Path(__file__).resolve().parent;repo=p.parents[3];sha=lambda b:hashlib.sha256(b).hexdigest()
def load(n):return json.loads(gzip.decompress((p/n).read_bytes()))
def log(n):return gzip.decompress((p/n).read_bytes()).decode()
for n,h in json.loads((p/'inputs.json').read_text()).items():assert sha((repo/n).read_bytes())==h,n
source=load('173-source-review.json.gz');assert source['originalAssertionsSchedulesAndMutationsAstIdentical']and source['oneExecutedHelperPinAddedToEachRunner']
assert [(x['observations'],x['timeout'])for x in source['families']]==[(5,10000),(5,10000),(7,8000)]
assert load('173-probe.json.gz')['asyncFalse']is False and load('173-probe.json.gz')['raf']is True
assert '89 passed'in log('173-focused.log.gz')and '34 passed'in log('173-native-observers.log.gz')
for family,cases,mutations in [('admission',15,6),('journal',17,6),('write-session',13,5)]:
 assert load('native-'+family+'/summary.json.gz')['status']=='passed'
 r=load('native-'+family+'/report.json.gz');assert len(r['candidates'][0]['cases'])==cases and all(c['status']=='pass'for c in r['candidates'][0]['cases'])
 assert len(r['mutations'])==mutations and all(m['status']=='detected'for m in r['mutations'])
 assert r['harness']['files']['scripts/storage-conformance/observe.mjs']==sha((repo/'scripts/storage-conformance/observe.mjs').read_bytes())
assert 'pass 98'in log('173-metadata.log.gz')and 'fail 0'in log('173-metadata.log.gz')
prior=load('173-before-census.json.gz');after=json.loads((repo/'docs/account-crypto/census.json').read_text());assert prior==after and len(after['sources'])==431
old={r['id']:r for r in load('173-before-manifest.json.gz')['rows']};plan=json.loads((repo/'docs/release-validation-manifest.json').read_text());new={r['id']:r for r in plan['rows']};added={'test:test/nativeStateObserver.test.ts','test:test/account-worker-cohort/observer.spec.ts'}
assert all(old[k]==new[k]for k in old)and set(new)-set(old)==added and all(new[k]['blocked']for k in added)
assert len(new)==951 and len(plan['unresolved'])==405
print('Reviewed unchanged runtime, exact original native assertions/deadlines and complete detected-fault campaigns.')
