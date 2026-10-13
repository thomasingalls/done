"""Descriptive fixture contrasts; no independent-key or population inference."""
import json,statistics,pathlib,sys
source=pathlib.Path(sys.argv[1]);data=json.loads(source.read_text());rows=data['samples']
def stats(values):
 return dict(median=statistics.median(values),min=min(values),max=max(values))
out={'source':data['source'],'host':data['host'],'cells':[],'cuts':data['seeds'],'guardrails':{}}
for depth in sorted({r['depth'] for r in rows}):
 for arm in ['complete','reduced']:
  cell=[r for r in rows if r['depth']==depth and r['arm']==arm and r['rep']!='anchor']
  if not cell:continue
  assert all(r['phase']=='passed' and r['recovered'] and r['edit']['journalBeforeApply'] for r in cell)
  for r in cell:
   if arm=='reduced':
    assert r['statusWork']['authorityChecks']>0
    assert r['statusWork']['baselineFullReplays']==0
    assert r['editWork']['baselineFullReplays']==0
    assert r['publicationWork']['baselineFullReplays']==0
  out['cells'].append({'depth':depth,'arm':arm,'n':len(cell),
   'coldMs':stats([r['coldMs'] for r in cell]),'heapBytes':stats([r['heap']['usedSize'] for r in cell]),
   'statusMedianMs':stats([statistics.median(r['statusMs']) for r in cell]),
   'admittedMs':stats([r['edit']['admittedMs'] for r in cell]),
   'durableMs':stats([r['edit']['durableMs'] for r in cell]),
   'publicationMs':stats([r['publicationMs'] for r in cell]),
   'replacementMs':stats([r['replacementMs'] for r in cell]),
   'coldWork':{k:stats([r['coldMetrics']['work'][k] for r in cell]) for k in ['loadedRows','loadedBytes','recordCopyBytes','authorityChecks','baselineFullReplays']},
   'warmAuthorityChecks':stats([r['statusWork']['authorityChecks'] for r in cell]),
   'maxLongTaskMs':max([x['ms'] for r in cell for x in r['longTasks']] or [0])})
anchors=[r for r in rows if r['rep']=='anchor'];out['anchors']=[]
for r in anchors:
 base=next(c for c in out['cells'] if c['depth']==1 and c['arm']==r['arm'])
 out['anchors'].append({'arm':r['arm'],'coldMs':r['coldMs'],'change':r['coldMs']/base['coldMs']['median']-1})
out['guardrails']={'passedSamples':len(rows),'allRecovered':all(r.get('recovered') for r in rows),'allJournalBeforeApply':all(r['edit']['journalBeforeApply'] for r in rows),'timingTentative':any(abs(r['change'])>.2 for r in out['anchors'])}
print(json.dumps(out,indent=2))
