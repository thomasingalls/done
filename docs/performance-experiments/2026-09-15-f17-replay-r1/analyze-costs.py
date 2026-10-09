from pathlib import Path
import json,statistics
h=Path(__file__).parent;rows=[]
for name in ['selected','guarded']:
 for i in range(2):
  r=json.loads((h/f'results/cost-{i}-{name}/result.json').read_text());assert r['status']=='passed' and r['closed'] and not r['errors']
  for b in r['costs']:
   names=sorted(set(x['name'] for x in b['calls']));parts={n:[x['ms'] for x in b['calls'] if x['name']==n] for n in names};assert all(len(v)==40 for v in parts.values())
   row={'variant':name,'pair':i,'block':b['block'],'components':{n:{'count':len(v),'meanMs':statistics.mean(v),'sumMs':sum(v),'minMs':min(v),'maxMs':max(v)} for n,v in parts.items()}}
   if name=='selected':row['freshOtherMeanMs']=statistics.mean(parts['fresh-total'])-statistics.mean(parts['fresh-doc'])-statistics.mean(parts['fresh-stacks'])
   rows.append(row)
summary={}
for name in ['selected','guarded']:
 for block in ['shallow','deeper']:
  group=[r for r in rows if r['variant']==name and r['block']==block]
  summary[name+'-'+block]={n:statistics.mean(r['components'][n]['meanMs'] for r in group) for n in group[0]['components']}
(h/'cost-analysis.json').write_text(json.dumps({'rows':rows,'summaryMeanOfSessionMeansMs':summary},indent=2)+'\n');print(json.dumps(summary,indent=2))
