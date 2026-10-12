"""Per-session contrasts only; dependent keys are not independent experiment units."""
import json,math,pathlib,statistics
root=pathlib.Path('/tmp/done-immediate-authority-20261013')
out=pathlib.Path('docs/performance-experiments/2026-10-13-immediate-authority')
def stats(xs):
 xs=sorted(xs)
 return {'n':len(xs),'total':round(sum(xs),2),'median':round(statistics.median(xs),2) if xs else None,
  **{k:round(xs[min(len(xs)-1,math.ceil(len(xs)*q)-1)],2) if xs else None for k,q in [('p95',.95),('p99',.99)]},'max':round(max(xs),2) if xs else None}
sessions=[]
for rep in [1,2]:
 for mode in ['silent','active','backlog']:
  for arm in (['reference','candidate'] if rep==1 else ['candidate','reference']):
   name=f'{arm}-{mode}-{rep}';p=root/name/'result.json'
   if not p.exists():continue
   r=json.loads(p.read_text());assert r['phase']=='passed',name
   samples=r['samples'];assert len(samples)==len(r['injected'])==600
   assert all(r[k] for k in ['undoRedo','converged','coldReplay']) and not r['errors']
   begin=samples[0]['eventAt'];end=max(s['visibleAt'] for s in samples)
   tasks=[t['ms'] for t in r['tasks'] if begin<=t['at'] and t['at']+t['ms']<=end]
   counters={k:r['after']['work'].get(k,0)-r['before']['work'].get(k,0) for k in r['after']['work']}
   costs={}
   for k,after in r['after']['costs'].items():
    before=r['before']['costs'].get(k,{'calls':0,'totalMs':0})
    n=after['calls']-before['calls'];ms=after['totalMs']-before['totalMs']
    costs[k]={'calls':n,'totalMs':round(ms,2),'meanMs':round(ms/n,2) if n else None,'lifetimeMaxMs':round(after['maxMs'],2)}
   reads=[]
   for check in r.get('authorityIO',[]):
    events=check['events'];begins=[e['at'] for e in events if e['name']=='read.wait'];ends=[e['at'] for e in events if e['name']=='read.return']
    if len(begins)==len(ends)==1 and begin<=begins[0]<=ends[0]<=end:reads.append(ends[0]-begins[0])
   row={'session':name,'input':{k:stats([s[k] for s in samples]) for k in ['dispatchMs','frame','inputFrame','afterFrame']},
    'keysOver50':sum(s['inputFrame']>50 for s in samples),'keysOver100':sum(s['inputFrame']>100 for s in samples),
    'handlers':stats(r['handlers']),'longTasks':{**stats(tasks),'blockingExcess':round(sum(max(0,x-50) for x in tasks),2)},
    'freshAuthorityReads':stats(reads),'work':counters,'costs':costs,
    'clockOffsetMs':r['clock']['now']-(r['clockBefore']+r['clockAfter'])/2,'clockUncertaintyMs':(r['clockAfter']-r['clockBefore'])/2,
    'hostLateness':stats([x['sent']-x['due'] for x in r['injected']]),
    'eventGaps':stats([b['eventAt']-a['eventAt'] for a,b in zip(samples,samples[1:])]),
    'sync':{k:r[k] for k in ['syncBefore','syncAfter','syncConverged']},'actualGoalsChars':r['actualGoalsChars'],
    'guards':{k:r[k] for k in ['phase','undoRedo','converged','coldReplay','errors']},
    'typingRequests':len([q for q in r['requests'] if q['phase']=='typing']),
    'typingStatuses':sorted({q['status'] for q in r['requests'] if q['phase']=='typing' and q.get('status') is not None})}
   sessions.append(row)
   (p.parent/'analysis.json').write_text(json.dumps(row,indent=2)+'\n')
comparisons=[]
for mode in ['silent','active','backlog']:
 for rep in [1,2]:
  rows={a:next((s for s in sessions if s['session']==f'{a}-{mode}-{rep}'),None) for a in ['reference','candidate']}
  if not all(rows.values()):continue
  r=rows['reference']['input']['inputFrame']['p95'];c=rows['candidate']['input']['inputFrame']['p95']
  comparisons.append({'mode':mode,'block':rep,'referenceP95':r,'candidateP95':c,'differenceMs':round(c-r,2),'percent':round(100*(c/r-1),2)})
(out/'summary.json').write_text(json.dumps({'sessions':sessions,'contrasts':comparisons},indent=2)+'\n')
for s in sessions:
 print(s['session'],'p95',s['input']['inputFrame']['p95'],'immediate',s['work'].get('finalApplyImmediate'), 'fallbacks',s['work'].get('finalApplyFallbacks'))
