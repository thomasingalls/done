"""Keep numeric development results and exact executed probes; never save test credentials here."""
import json,pathlib,gzip,hashlib,subprocess,statistics
root=pathlib.Path('docs/performance-experiments/2026-10-13-retention-depth')
(root/'evidence').mkdir(exist_ok=True)
for src,name in [('/tmp/done-retention-depth-series/results.json','native-results.json'),('/tmp/done-retention-depth-series.log','native.log'),('/tmp/done-retention-depth-packaged/results.json','packaged-results.json'),('/tmp/done-retention-depth-packaged.log','packaged.log'),('/tmp/done-retention-depth-build-final.log','build.log'),('/tmp/done-retention-depth-boundary/results.json','boundary-results.json'),('/tmp/done-retention-depth-boundary.log','boundary.log'),('/tmp/done-retention-depth-boundary-final/results.json','boundary-final-results.json'),('/tmp/done-retention-depth-boundary-final.log','boundary-final.log'),('/tmp/done-retention-depth-cut-profile/cut.cpuprofile','cut.cpuprofile'),('/tmp/done-retention-depth-cut-profile/profile.json','cut-profile.json'),('/tmp/done-retention-depth-cut-profile/results.json','cut-profile-results.json'),('/tmp/done-retention-depth-cut-profile.log','cut-profile.log')]:
 p=pathlib.Path(src)
 if p.exists():(root/'evidence'/(name+'.gz')).write_bytes(gzip.compress(p.read_bytes(),mtime=0))
native=json.loads(pathlib.Path('/tmp/done-retention-depth-series/summary.json').read_text())
(root/'native-summary.json').write_text(json.dumps(native,indent=2)+'\n')
data=json.loads(pathlib.Path('/tmp/done-retention-depth-packaged/results.json').read_text())
def stats(v):return {'median':statistics.median(v),'min':min(v),'max':max(v)}
result={'fixtureSha256':data['fixtureSha256'],'expectedArchive':data['expected'],'cut':data['cut'],'arms':[]}
for arm in ['complete','reduced']:
 rows=[r for r in data['rows'] if r['arm']==arm]
 assert all(r['phase']=='passed' and r['undoRedo'] and r['recovered'] and not r['errors'] for r in rows)
 result['arms'].append({'arm':arm,'n':len(rows),'coldFrameMs':stats([r['cold']['frameMs'] for r in rows]),'heapBytes':stats([r['heap']['usedSize'] for r in rows]),
  'typing':[{'rep':r['rep'],'keys':len(r['keys']),'frameMedianMs':statistics.median(k['frame'] for k in r['keys']), 'frameP95Ms':sorted(k['frame'] for k in r['keys'])[int(len(r['keys'])*.95)-1], 'longTasks':len(r['tasks']),'maxLongTaskMs':max([x['ms'] for x in r['tasks']]or[0]),'work':r['work']}for r in rows],
  'coldWork':{k:stats([r['cold']['metrics']['work'][k] for r in rows]) for k in ['loadedRows','loadedBytes','recordCopyBytes','authorityChecks','baselineFullReplays']},
  'nativeCrypto':{k:stats([r['cold']['native'][k] for r in rows]) for k in rows[0]['cold']['native']}})
(root/'packaged-summary.json').write_text(json.dumps(result,indent=2)+'\n')
def identity(path):
 b=path.read_bytes();return {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
dist=pathlib.Path('/tmp/done-retention-depth-packaged-dist')
identity_data={'source':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'runtimeChanges':False,'nativeBundleSha256':json.loads(pathlib.Path('/tmp/done-retention-depth-series/results.json').read_text())['bundleSha256'],'packagedBundle':{str(p.relative_to(dist)):identity(p) for p in sorted(dist.rglob('*')) if p.is_file()},'fixture':{'path':'/tmp/done-warm-publish-f516a958/deep-receive/deep-received-fixture.json',**identity(pathlib.Path('/tmp/done-warm-publish-f516a958/deep-receive/deep-received-fixture.json'))}}
(root/'source-identity.json').write_text(json.dumps(identity_data,indent=2)+'\n')
