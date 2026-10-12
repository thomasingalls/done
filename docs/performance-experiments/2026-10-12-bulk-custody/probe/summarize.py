"""Per-session results; no pooling of dependent keystrokes or unequal receive counts."""
import pathlib,json,subprocess,math,sys
root=pathlib.Path('/tmp/done-bulk-custody-20261012');out=pathlib.Path('docs/performance-experiments/2026-10-12-bulk-custody')
rows=[]
for rep in [1,2]:
 for mode in ['active','backlog']:
  for arm in ['reference','candidate']:
   name=f'{arm}-{mode}-{rep}';p=root/name
   if not (p/'result.json').exists():continue
   subprocess.run(['node','docs/performance-experiments/2026-10-12-final-apply/probe/analyze.mjs',str(p),str(root/arm)],stdout=subprocess.DEVNULL,check=True)
   a=json.loads((p/'analysis.json').read_text());r=json.loads((p/'result.json').read_text())
   frames=sorted(s['frame'] for s in r['samples'])
   quant=lambda q:round(frames[min(len(frames)-1,math.ceil(len(frames)*q)-1)],1)
   costs={k:round(v['totalMs']-r['before']['costs'].get(k,{}).get('totalMs',0),1) for k,v in r['after']['costs'].items()}
   rows.append({'session':name,'arm':arm,'mode':mode,'rep':rep,'phase':r['phase'],'guardrails':a['guardrails'],
    'frames':{'n':len(frames),'median':quant(.5),'p95':quant(.95),'max':quant(1),'over100':sum(v>100 for v in frames)},
    'finalStages':a['finalStages'],'longTasks':{'n':len(a['longTasks']),'max':max((t['ms'] for t in a['longTasks']),default=0)},
    'costs':costs,'counts':a['counters'],'syncBefore':r['syncBefore'],'syncAfter':r['syncAfter'],
    'typingHttp':sorted({q['status'] for q in r['requests'] if q['phase']=='typing' and q.get('status') is not None})})
comparisons=[]
for rep in [1,2]:
 for mode in ['active','backlog']:
  arms={r['arm']:r for r in rows if r['rep']==rep and r['mode']==mode}
  if len(arms)<2:continue
  ref,c=arms['reference'],arms['candidate'];old=ref['finalStages']['read']['median'];new=c['finalStages']['read']['median']
  comparisons.append({'mode':mode,'rep':rep,'readMedianReductionPercent':round(100*(old-new)/old,1),'frameP95ChangePercent':round(100*(c['frames']['p95']/ref['frames']['p95']-1),1)})
summary={'base':'902806c9','sessions':rows,'comparisons':comparisons}
(out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
for r in rows:print(r['session'],'read',r['finalStages']['read']['median'],'apply',r['finalStages']['apply']['median'],'frame p95',r['frames']['p95'],'phase',r['phase'])
for r in comparisons:print(r)
