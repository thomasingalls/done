from pathlib import Path
import gzip,json,hashlib,re,subprocess
p=Path(__file__).resolve().parent;repo=p.parents[3];sha=lambda b:hashlib.sha256(b).hexdigest()
def load(n):return json.loads(gzip.decompress((p/n).read_bytes()))
def log(n):return gzip.decompress((p/'reports'/n).read_bytes()).decode()
for n,h in json.loads((p/'inputs.json').read_text()).items():assert sha((repo/n).read_bytes())==h,n
for n,h in json.loads((p/'built-source-identities.json').read_text()).items():assert sha((repo/n).read_bytes())==h,n
before=load('168-before-census.json.gz');after=json.loads((repo/'docs/account-crypto/census.json').read_text());assert len(after['sources'])==426
strip=lambda rows:[{**d,'sites':[{'path':s['path']}for s in d['sites']]}for d in rows]
assert strip(before['domains'])==strip(after['domains'])
a={r['id']:r for r in load('168-before-manifest.json.gz')['rows']};plan=json.loads((repo/'docs/release-validation-manifest.json').read_text());b={r['id']:r for r in plan['rows']}
assert all(a[k]==b[k]for k in a)and len(b)-len(a)==3 and all(b[k]['blocked']for k in set(b)-set(a))
assert len(b)==945 and len(plan['unresolved'])==399
# A source-line move must not silently alter an algorithm, classification, owner or contract.
before=load('168-before-constructions.json.gz');after=json.loads((repo/'docs/account-crypto/constructions.json').read_text())
def normalized(v):
 if isinstance(v,str):return re.sub(r':\d+(?=\b)',':LINE',v)
 if isinstance(v,list):return list(map(normalized,v))
 if isinstance(v,dict):return {k:normalized(x)for k,x in v.items()if k!='line'}
 return v
assert normalized(before)==normalized(after)
assert '2289 passed | 1 skipped'in log('168-unit-full-final.log.gz')and '26 passed'in log('168-native-ports-final.log.gz')
assert '2 failed'in log('168-native-fence-mutation.log.gz')and 'Received: false'in log('168-native-fence-mutation.log.gz')
for run in ['168-native-session-serial','168-native-journal-changed-only','168-native-journal-controls-only']:
 assert load('reports/'+run+'/summary.json.gz')['status']=='passed'
assert load('reports/168-native-journal-serial/summary.json.gz')['status']=='failed'
assert load('reports/actual-worker-03/receipt.json.gz')['exit']==0 and '8 passed'in log('actual-worker-03/console.log.gz')
old=(p/'earlier-source/168-old-fixture-before/packagedConfig.test.ts.txt').read_text();new=(repo/'test/packagedConfig.test.ts').read_text()
assert new==old.replace("  expect(values.get('done.account-service.membership.v2')).toBe('1');", "  await vi.waitFor(() => expect(values.get('done.account-service.membership.v2')).toBe('1'));",1)
assert subprocess.check_output(['git','diff','--cached','--name-only'],cwd=repo,text=True)==''
result={'unitCases':2289,'existingSkips':1,'nativeRuntimeCases':26,'nativeFenceMutantsDetected':2,'actualAccountCases':8,'sourceBodiesMatched':206,'fullLifetimeCampaign':'passed','fullCombinedJournalCampaign':'failed observer waits; all17 cases and6 mutants observed across retained scoped runs','obligations':945,'unresolved':399,'claim':'Internal actual worker only; no application activation or performance acceptance'}
(p/'review.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
