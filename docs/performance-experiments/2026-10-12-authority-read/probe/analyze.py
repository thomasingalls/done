"""Disjoint wall-time accounting. Native waits include main-thread event dispatch latency."""
import json,math,pathlib,statistics,sys
root=pathlib.Path('/tmp/done-authority-read-20261012')
out=pathlib.Path('docs/performance-experiments/2026-10-12-authority-read')
def measure(xs):
 xs=sorted(xs)
 return {'n':len(xs),'total':round(sum(xs),2),'median':round(statistics.median(xs),2) if xs else 0,'p95':round(xs[min(len(xs)-1,math.ceil(len(xs)*.95)-1)],2) if xs else 0,'max':round(max(xs,default=0),2)}
def intervals(events,start,end):
 begins=[e['at'] for e in events if e['name']==start];ends=[e['at'] for e in events if e['name']==end]
 assert len(begins)==len(ends),(start,len(begins),len(ends))
 assert all(a<=b for a,b in zip(begins,ends)),(start,begins,ends)
 return list(zip(begins,ends))
def union(xs):
 stop=-math.inf;total=0
 for a,b in sorted(xs):total+=max(0,b-max(a,stop));stop=max(stop,b)
 return total
def analyze(name):
 p=root/name;r=json.loads((p/'result.json').read_text());begin=r['samples'][0]['at'];end=r['samples'][-1]['at']+r['samples'][-1]['frame']
 finals=[f for f in r['stalls']['finals'] if begin<=f['at'] and f['end']<=end]
 selected=[q for q in r['authorityIO'] if begin<=q['at'] and q.get('end',math.inf)<=end]
 rows=[]
 for q in selected:
  e=q['events'];get=lambda n:next(v['at'] for v in e if v['name']==n)
  bounds=(get('read.wait'),get('read.return'));duration=bounds[1]-bounds[0]
  # A cold authentication fallback can do additional IO after the inventory read. Keep it outside
  # this read's decomposition; the outer authority span still includes it.
  e=[v for v in e if bounds[0]<=v['at']<=bounds[1]]
  parts={k:intervals(e,a,b) for k,a,b in [
   ('yield','yield.begin','yield.end'),('open','open.call','open.success'),('layoutCall','layout.call','layout.return'),
   ('transaction','transaction.call','transaction.complete'),('closeCall','close.call','close.return')]}
  for xs in parts.values():assert all(bounds[0]-.01<=a<=b<=bounds[1]+.01 for a,b in xs)
  all_intervals=[v for xs in parts.values() for v in xs]
  accounted=sum(b-a for a,b in all_intervals)
  assert abs(accounted-union(all_intervals))<.05,('Overlapping accounting',q)
  match=[f for f in finals if f['acquired']-.01<=q['at']<=q['end']<=f['checked']+.01]
  assert len(match)<=1
  callbacks=intervals(e,'cursor.callback','cursor.return');values=intervals(e,'value.call','value.return')
  firstCursor=get('cursor.issued');lastCursor=callbacks[-1][1]
  row={'id':q['id'],'at':q['at'],'end':q['end'],'final':bool(match),'read':duration,
   'parts':{k:sum(b-a for a,b in xs) for k,xs in parts.items()},'intervals':parts,'residual':duration-accounted,
   'yields':len(parts['yield']),'cursorCallbacks':len(callbacks),'rows':len(values),
   'cursorCallbackMs':sum(b-a for a,b in callbacks),'valueGetterMs':sum(b-a for a,b in values),
   'cursorFirstWait':callbacks[0][0]-firstCursor,'cursorLaterWaits':sum(callbacks[i][0]-callbacks[i-1][1] for i in range(1,len(callbacks))),
   'completionWait':get('transaction.complete')-lastCursor,
   'longTaskOverlap':union([(max(a,t['at']),min(b,t['at']+t['ms'])) for a,b in [bounds] for t in r['tasks'] if a<t['at']+t['ms'] and t['at']<b])}
  if match:
   f=match[0];row.update(queue=f['acquired']-f['at'],authority=f['checked']-f['acquired'],apply=f['applied']-f['applyAt'])
  rows.append(row)
 assert all(sum(f['acquired']-.01<=q['at']<=q['end']<=f['checked']+.01 for q in selected)==1 for f in finals)
 groups={}
 for label,rs in [('final',[q for q in rows if q['final']]),('other',[q for q in rows if not q['final']])]:
  total=sum(q['read'] for q in rs)
  groups[label]={
   'read':measure([q['read'] for q in rs]),'residual':measure([q['residual'] for q in rs]),
   'parts':{k:{**measure([q['parts'][k] for q in rs]),'percent':round(100*sum(q['parts'][k] for q in rs)/total,2) if total else 0} for k in ['yield','open','layoutCall','transaction','closeCall']},
   'details':{k:measure([q[k] for q in rs]) for k in ['yields','cursorCallbacks','rows','cursorCallbackMs','valueGetterMs','cursorFirstWait','cursorLaterWaits','completionWait','longTaskOverlap']}}
  groups[label]['residual']['percent']=round(100*sum(q['residual'] for q in rs)/total,2) if total else 0
  if label=='final':groups[label]['finalStages']={k:measure([q[k] for q in rs]) for k in ['queue','authority','apply']}
 profile=None
 if (p/'typing.cpuprofile').exists():
  prof=json.loads((p/'typing.cpuprofile').read_text());nodes={n['id']:n for n in prof['nodes']};clock=r['profileClock'];at=prof['startTime'];buckets={}
  for sample,delta in zip(prof['samples'],prof['timeDeltas']):
   at+=delta;t=clock['wallMs']+(at-clock['monotonicUs'])/1000
   for q in rows:
    if not q['final']:continue
    kind=next((k for k,xs in q['intervals'].items() if any(a<=t<b for a,b in xs)),None)
    if not kind:continue
    frame=nodes[sample]['callFrame'];label=frame['functionName'] or '(anonymous)'
    if not label.startswith('('):label='JavaScript/native function'
    group=buckets.setdefault(kind,{});group[label]=group.get(label,0)+1
  profile={'samplesByFinalComponent':buckets,'clockErrorMs':clock['errorMs'],'warning':'Samples locate activity/idle overlap; counts are dependent and intervals are wall time, not disk or CPU benchmarks.'}
 data={'session':name,'sampled':bool(profile),'phase':r['phase'],'window':{'begin':begin,'end':end},
  'checks':{'recorded':len(r['authorityIO']),'completeInsideKeys':len(selected),'boundaryOrIncomplete':len(r['authorityIO'])-len(selected),'finalJobs':len(finals)},
  'frames':measure([s['frame'] for s in r['samples']]),'longTasks':measure([t['ms'] for t in r['tasks'] if begin<=t['at'] and t['at']+t['ms']<=end]),
  'groups':groups,'rows':rows,'profile':profile,
  'guardrails':{'undoRedo':r['undoRedo'],'converged':r['converged'],'coldReplay':r['coldReplay'],'errors':r['errors'],'typingHttp':sorted({q['status'] for q in r['requests'] if q['phase']=='typing' and q.get('status') is not None})}}
 (p/'analysis.json').write_text(json.dumps(data,indent=2)+'\n')
 return {k:v for k,v in data.items() if k not in ['rows','window']}
summaries=[]
for name in ['active-timing','backlog-timing','active-sampled','backlog-sampled']:
 if (root/name/'result.json').exists():summaries.append(analyze(name))
(out/'summary.json').write_text(json.dumps(summaries,indent=2)+'\n')
for s in summaries:print(s['session'],json.dumps(s['groups']['final'],indent=2))
