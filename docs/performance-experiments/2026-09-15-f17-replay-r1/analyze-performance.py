from pathlib import Path
import json,statistics
h=Path(__file__).parent;rows=[];pairs=[]
for condition,ids in [('ordinary',[0,1]),('unicode',[0])]:
 for i in ids:
  pair={}
  for name in ['selected','candidate']:
   path=h/f'results/{"comparison" if condition=="ordinary" else "unicode"}-{i}-{name}/result.json'
   r=json.loads(path.read_text());assert r['status']=='passed' and r['closed'] and not r['errors']
   assert len(r['rows'])==2 and all(len(b['samples'])==40 for b in r['rows'])
   assert 'costs' not in r
   for receipt in r['bufferReceipts']:assert receipt['reused']==(40 if name=='candidate' and condition=='ordinary' else 0)
   pair[name]=r
   rows.extend({'condition':condition,'pair':i,'variant':name,'block':b['block'],'p50':b['p50'],'p95':b['p95'],'reuses':rec['reused']} for b,rec in zip(r['rows'],r['bufferReceipts']))
  for s,c in zip(pair['selected']['rows'],pair['candidate']['rows']):
   pairs.append({'condition':condition,'pair':i,'block':s['block'],'p50Ratio':c['p50']/s['p50'],'p95Ratio':c['p95']/s['p95']})
summary=[]
for condition in ['ordinary','unicode']:
 for block in ['shallow','deeper']:
  r=[p for p in pairs if p['condition']==condition and p['block']==block]
  summary.append({'condition':condition,'block':block,'selectedMedianOfP50Ms':statistics.median(x['p50'] for x in rows if x['condition']==condition and x['block']==block and x['variant']=='selected'),'candidateMedianOfP50Ms':statistics.median(x['p50'] for x in rows if x['condition']==condition and x['block']==block and x['variant']=='candidate'),'medianPairedP50ImprovementPercent':100*(1-statistics.median(x['p50Ratio'] for x in r)),'medianPairedP95ImprovementPercent':100*(1-statistics.median(x['p95Ratio'] for x in r))})
(h/'performance-analysis.json').write_text(json.dumps({'rows':rows,'pairs':pairs,'summary':summary},indent=2)+'\n');print(json.dumps(summary,indent=2))
