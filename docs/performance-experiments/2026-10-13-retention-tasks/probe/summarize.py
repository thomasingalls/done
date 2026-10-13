"""Numeric-only summary; observations, not release gates or independent trials."""
import json, pathlib, statistics, sys
raw=json.loads(pathlib.Path(sys.argv[1]).read_text())
def numbers(values):
 return {'min':min(values),'median':statistics.median(values),'max':max(values)}
summary={'taskReporting': 'Long Tasks observer: 0 means no task reported at the 50 ms floor, not zero work', 'depth':raw['depth'],'bundles':{'reference':raw['referenceBundleSha256'],'candidate':raw.get('measuredCandidateSha256',raw['bundleSha256'])},'quiet':{},'interrupted':[]}
for arm in ['reference','candidate','reference-4x','candidate-4x']:
 rows=[s for s in raw['samples'] if s['arm']==arm]
 if not rows:continue
 summary['quiet'][arm]={
  'samples':len(rows), 'totalMs':numbers([s['ms'] for s in rows]),
  'maxTaskMs':numbers([max([t['ms'] for t in s['tasks']],default=0) for s in rows]),
  'maxGapMs':numbers([max(s['gaps'],default=0) for s in rows]),
  'longTaskCounts':[len(s['tasks']) for s in rows],
  'preparationMs':[s['costs']['retentionPreparation']['totalMs'] for s in rows if 'retentionPreparation' in s['costs']],
  'replaceExchangeMs':[s['costs']['retentionReplaceExchange']['totalMs'] for s in rows],
  'readbackMs':[sum(s['costs'][n]['totalMs'] for n in ['retentionReadback','retentionReadbackCompare','retentionReload','retentionReplay']) for s in rows],
  'fencedMs':[s['costs']['retentionFenced']['totalMs'] for s in rows if 'retentionFenced' in s['costs']],
  'passed':all(s['phase']=='passed' and s['recovered'] for s in rows),
 }
for s in raw['samples']:
 if not s['queued']:continue
 summary['interrupted'].append({k:s.get(k) for k in ['arm','ms','result','inputLatency','journalBeforeApply','undoRedo','recovered','phase']})
summary['nativeCrypto']={arm:[s['nativeCrypto'] for s in raw['samples'] if s['arm']==arm] for arm in summary['quiet']}
summary['work']={arm:[s['work'] for s in raw['samples'] if s['arm']==arm] for arm in summary['quiet']}
print(json.dumps(summary,indent=2))
