from pathlib import Path
import json,gzip,hashlib,subprocess
p=Path(__file__).resolve().parent;repo=p.parents[3]
sha=lambda b:hashlib.sha256(b).hexdigest()
def load(f):
 b=f.read_bytes();return json.loads(gzip.decompress(b)if f.suffix=='.gz'else b)
def text(f):return gzip.decompress(f.read_bytes()).decode()
for name,h in load(p/'phase165-inputs.json').items():assert sha((repo/name).read_bytes())==h,name
old=load(p/'before-census.json');new=load(repo/'docs/account-crypto/census.json');sources={v['path']:v['sha256']for v in new['sources']}
assert all(sources[x['path']]==x['sha256']for x in old['sources'])
assert set(sources)-{x['path']for x in old['sources']}=={'src/crdt/accountWorkerCohort.ts'}
assert new['domains']==old['domains']
a=load(p/'before-manifest.json.gz');b=load(repo/'docs/release-validation-manifest.json');x={r['id']:r for r in a['rows']};y={r['id']:r for r in b['rows']}
added={'test:test/accountWorkerCohort.test.ts','test:test/account-worker-cohort/cohort.spec.ts'}
assert set(y)-set(x)==added and all(x[k]==y[k]for k in x)
assert all(y[k]['blocked']for k in added)and len(b['rows'])==938 and len(b['unresolved'])==392
assert '35 passed'in text(p/'reports/phase165-unit-final.log.gz')
assert '20 passed'in text(p/'reports/phase165-native-frozen.log.gz')
m=text(p/'reports/phase165-native-mutation.log.gz');assert '2 failed'in m and m.count('Received: "active"')==2 and 'Nonunique cohort mutation anchor'not in m
assert '98'in text(p/'reports/phase165-metadata.log.gz')and 'fail 0'in text(p/'reports/phase165-metadata.log.gz')
assert '1 failed'in text(p/'reports/phase165-native-initial.log.gz')and 'member has not released'in text(p/'reports/phase165-native-initial.log.gz')
source=(repo/'src/crdt/accountWorkerCohort.ts').read_text();assert "[n.anchor, 'exclusive']," in source
assert "hold(locks, n.member, 'exclusive', releaseDeadline.signal)"in source
assert source.index("await anchor!.close()")<source.index('await stopWorker()')<source.index('await endpoint!.close()')
assert "if (failure) {"in source and source.index("if (failure) {")<source.index('await endpoint!.close()')
assert 'windowOwners.has(owner)'in source and 'ifAvailable: true'in source and 'steal:'not in source
assert subprocess.check_output(['git','diff','--name-only','--','test'],cwd=repo,text=True)==''
assert subprocess.check_output(['git','diff','--cached','--name-only'],cwd=repo,text=True)==''
if(p/'MANIFEST.json').exists():assert {str(f.relative_to(p)):sha(f.read_bytes())for f in p.rglob('*')if f.is_file()and f.name!='MANIFEST.json'}==load(p/'MANIFEST.json')['files']
result={'existingRuntimeSourcesUnchanged':len(old['sources']),'newSource':'accountWorkerCohort.ts','unitCases':14,'focusedExistingAndNewCases':35,'nativeCases':20,'browsers':['chromium','firefox'],'nativeMissingAnchorMutationsDetected':2,'metadataCases':98,'obligations':938,'unresolved':392,'qualification':'Private coordination primitive only; not an account verifier, no activation or performance credit.'}
(p/'review.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
