from pathlib import Path
import gzip,json,hashlib,subprocess
p=Path(__file__).resolve().parent;repo=p.parents[3];sha=lambda b:hashlib.sha256(b).hexdigest()
def load(n):return json.loads(gzip.decompress((p/n).read_bytes()))
def log(n):return gzip.decompress((p/n).read_bytes()).decode()
for n,h in json.loads((p/'inputs.json').read_text()).items():assert sha((repo/n).read_bytes())==h,n
for n,h in json.loads((p/'built-source-identities.json').read_text()).items():assert sha((repo/n).read_bytes())==h,n
assert all(load('171-source-extraction.json.gz').values())
assert '61 passed'in log('171-focused-final.log.gz')and 'pass 98'in log('171-metadata.log.gz')and 'fail 0'in log('171-metadata.log.gz')
assert load('actual-page/receipt.json.gz')['exit']==0 and '3 passed'in log('actual-page/console.log.gz')
results=list((p/'actual-page').glob('*/result.json.gz'));assert len(results)==3
for f in results:
 r=load(str(f.relative_to(p)));assert r['outcome']=='passed'and all(r['guards'].values()),f
prior=load('171-before-census.json.gz');after=json.loads((repo/'docs/account-crypto/census.json').read_text());strip=lambda rows:[{**d,'sites':[{'path':s['path']}for s in d['sites']]}for d in rows]
assert strip(prior['domains'])==strip(after['domains']) and len(after['sources'])==431
old={r['id']:r for r in load('171-before-manifest.json.gz')['rows']};plan=json.loads((repo/'docs/release-validation-manifest.json').read_text());new={r['id']:r for r in plan['rows']}
assert all(old[k]==new[k]for k in old)and set(new)-set(old)=={'test:test/accountWorkspacePort.test.ts'}and new['test:test/accountWorkspacePort.test.ts']['blocked']
assert len(new)==948 and len(plan['unresolved'])==402
assert subprocess.check_output(['git','diff','--cached','--name-only'],cwd=repo,text=True)==''
print('Factory/coordinator extraction, real page authentication/reopen and unchanged prior obligations reviewed.')
