from pathlib import Path
import gzip,json,hashlib,subprocess
p=Path(__file__).resolve().parent;repo=p.parents[3];sha=lambda b:hashlib.sha256(b).hexdigest()
def load(n):return json.loads(gzip.decompress((p/n).read_bytes()))
def log(n):return gzip.decompress((p/n).read_bytes()).decode()
for name,h in json.loads((p/'inputs.json').read_text()).items():assert sha((repo/name).read_bytes())==h,name
before=load('167-before-census.json.gz');after=json.loads((repo/'docs/account-crypto/census.json').read_text());old={r['path']:r['sha256']for r in before['sources']};new={r['path']:r['sha256']for r in after['sources']}
assert all(new[k]==v for k,v in old.items())and len(old)==420 and len(new)==422
assert set(new)-set(old)=={'src/crdt/windowJournalBridge.ts','src/crdt/workerChannel.ts'}and before['domains']==after['domains']
a={r['id']:r for r in load('167-before-manifest.json.gz')['rows']};plan=json.loads((repo/'docs/release-validation-manifest.json').read_text());b={r['id']:r for r in plan['rows']};added={'test:test/workerChannel.test.ts','test:test/windowJournalBridge.test.ts'}
assert set(b)-set(a)==added and all(a[k]==b[k]for k in a)and all(b[k]['blocked']for k in added)
assert len(plan['rows'])==942 and len(plan['unresolved'])==396
assert all(x['exit']==0 for x in load('167-checks.json.gz'))
assert '51 passed'in log('167-final-3.log.gz')and 'pass 98'in log('167-final-4.log.gz')and 'fail 0'in log('167-final-4.log.gz')
source=(repo/'src/crdt/windowJournalBridge.ts').read_text();assert 'current !== value'in source and source.index('current !== value')<source.index('storage.removeItem(key)')
assert 'storage.setItem'not in source and 'requireWindowAccountCohort(cohort)'in source
channel=(repo/'src/crdt/workerChannel.ts').read_text();assert 'bytes += v.buffer.byteLength'in channel and 'm.id !== received + 1'in channel
assert subprocess.check_output(['git','diff','--name-only','--','test'],cwd=repo,text=True)==''
assert subprocess.check_output(['git','diff','--cached','--name-only'],cwd=repo,text=True)==''
result={'oldRuntimeUnchanged':420,'newCases':23,'focusedCases':51,'metadataCases':98,'obligations':942,'unresolved':396,'status':'Internal bounded data bridge only; no app activation/performance credit.'};(p/'review.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
