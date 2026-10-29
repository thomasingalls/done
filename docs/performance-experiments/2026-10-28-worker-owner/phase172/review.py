from pathlib import Path
import gzip,json,hashlib
p=Path(__file__).resolve().parent;repo=p.parents[3];sha=lambda b:hashlib.sha256(b).hexdigest()
def load(n):return json.loads(gzip.decompress((p/n).read_bytes()))
def log(n):return gzip.decompress((p/n).read_bytes()).decode()
for n,h in json.loads((p/'inputs.json').read_text()).items():assert sha((repo/n).read_bytes())==h,n
assert all(load('172-source-extraction.json.gz').values())
assert '83 passed'in log('172-focused-closure.log.gz')and 'pass 98'in log('172-metadata.log.gz')and 'fail 0'in log('172-metadata.log.gz')
fault=log('172-fence-fault-final.log.gz');assert 'expect(observed.remaining).toBe(0)'in fault and '1 failed'in fault and 'Test timed out'not in fault
assert load('native-admission/summary.json.gz')['status']=='failed'
r=load('native-admission/report.json.gz');assert len(r['candidates'][0]['cases'])==15 and all(c['status']=='pass'for c in r['candidates'][0]['cases'])
assert [m['status']for m in r['mutations']]==['detected']*3+['error']*3
prior=load('172-before-census.json.gz');after=json.loads((repo/'docs/account-crypto/census.json').read_text());strip=lambda rows:[{**d,'sites':[{'path':s['path']}for s in d['sites']]}for d in rows]
assert strip(prior['domains'])==strip(after['domains'])and len(after['sources'])==431
old={r['id']:r for r in load('172-before-manifest.json.gz')['rows']};plan=json.loads((repo/'docs/release-validation-manifest.json').read_text());new={r['id']:r for r in plan['rows']}
assert all(old[k]==new[k]for k in old)and set(new)-set(old)=={'test:test/admissionJournalFence.test.ts'}and new['test:test/admissionJournalFence.test.ts']['blocked']
assert len(new)==949 and len(plan['unresolved'])==403
print('Reviewed journal fence regression/fault sensitivity; combined native campaign explicitly remains failed.')
