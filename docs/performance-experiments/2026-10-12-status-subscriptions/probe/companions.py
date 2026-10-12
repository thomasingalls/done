import pathlib,json,math,statistics
root=pathlib.Path('/tmp/done-status-subscriptions-20261012')
out=pathlib.Path('docs/performance-experiments/2026-10-12-status-subscriptions')
def stats(xs):
 xs=sorted(xs);return {'n':len(xs),'median':round(statistics.median(xs),2) if xs else None,'p95':round(xs[min(len(xs)-1,math.ceil(.95*len(xs))-1)],2) if xs else None,'p99':round(xs[min(len(xs)-1,math.ceil(.99*len(xs))-1)],2) if xs else None,'max':round(max(xs),2) if xs else None}
rows=[]
for prefix in ['phone','history']:
 for p in sorted(root.glob(prefix+'-*/result.json')):
  r=json.loads(p.read_text());row={'session':p.parent.name,'phase':r['phase']}
  if r['phase']!='passed':
   row['error']=r.get('error');rows.append(row);continue
  assert all(r.get(k) for k in ['undoRedo','converged','coldReplay'])
  assert len(r['samples'])==len(r['injected'])==(300 if prefix=='phone' else 600)
  begin=r['samples'][0]['eventAt'];end=max(s['at']+s['frame'] for s in r['samples'])
  tasks=[t for t in r['tasks'] if begin<=t['at'] and t['at']+t['ms']<=end]
  row.update(input={k:stats([s[k] for s in r['samples']]) for k in ['dispatchMs','frame','inputFrame','afterFrame']},handlers=stats(r['handlers']),longTasks={**stats([t['ms'] for t in tasks]),'blockingExcess':round(sum(max(0,t['ms']-50) for t in tasks),2)},above100=sum(s['inputFrame']>100 for s in r['samples']),clock=r.get('clock'),clockAfter=r.get('clockAfter'),metadata=r.get('metadata'),device=r.get('device'),visibility=r.get('visibility'),visibilityChanges=r.get('visibilityChanges'),cadence={k:stats(v) for k,v in {'hostLateness':[s['sent']-s['due'] for s in r['injected']],'commandCompletion':[s['completed']-s['sent'] for s in r['injected']],'eventGaps':[b['eventAt']-a['eventAt'] for a,b in zip(r['samples'],r['samples'][1:])]}.items()},requests=sorted({q['status'] for q in r['requests'] if q['phase']=='typing' and q.get('status') is not None}),syncBefore=r['syncBefore'],syncAfter=r['syncAfter'],batteryBefore=r.get('batteryBefore'),batteryAfter=r.get('batteryAfter'),guardrails={k:r.get(k) for k in ['undoRedo','converged','coldReplay','errors']})
  rows.append(row)
(out/'companions.json').write_text(json.dumps(rows,indent=2)+'\n')
for r in rows: print(r['session'],r['phase'],r.get('input',{}).get('inputFrame'),r.get('error',''))
