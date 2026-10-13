"""Describe matched native observations, without treating task events as independent samples."""
import json,pathlib,statistics,sys
r=json.loads(pathlib.Path(sys.argv[1]).read_text())
def stats(v):return {'median':statistics.median(v),'min':min(v),'max':max(v)}
out={'source':r['source'],'host':r['host'],'depth':r['depth'],'expected':r['expected'],'candidateBundleSha256':r['bundleSha256'],'referenceBundleSha256':r['referenceBundleSha256'],'arms':[]}
for arm in ['reference','candidate','candidate-4x']:
 rows=[s for s in r['samples'] if s['arm']==arm]
 assert all(s['phase']=='passed' and s['recovered'] and s['undoRedo'] and s['journalBeforeApply'] for s in rows)
 out['arms'].append({'arm':arm,'n':len(rows),'cutMs':stats([s['ms']for s in rows]),'maxTaskMs':stats([max(t['ms']for t in s['tasks'])for s in rows]),'taskCount':stats([len(s['tasks'])for s in rows]),'totalLongTaskMs':stats([sum(t['ms']for t in s['tasks'])for s in rows]),'maxTimerGapMs':stats([max(s['gaps'])for s in rows]),'nativeCrypto':rows[0]['nativeCrypto'],'work':{k:rows[0]['work'][k]for k in ['authorityChecks','deliveryVerifications','inboundVerifications','deliveryPrefixLinks','baselineFullReplays','sourceParses']}})
 for s in rows:assert s['nativeCrypto']==rows[0]['nativeCrypto']
assert len(r['samples'])==7
assert all(a['nativeCrypto']==out['arms'][0]['nativeCrypto'] for a in out['arms'])
assert all(a['work']==out['arms'][0]['work'] for a in out['arms'])
pathlib.Path(sys.argv[2]).write_text(json.dumps(out,indent=2)+'\n')
