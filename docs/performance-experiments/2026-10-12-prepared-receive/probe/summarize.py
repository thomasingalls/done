"""Descriptive session results, with elapsed wait overlap kept separate from synchronous costs."""
import json, pathlib, sys, collections
root=pathlib.Path(sys.argv[1]); summary={}
def quantile(xs):
 xs=sorted(xs)
 return [round(xs[min(int(len(xs)*p),len(xs)-1)],2) for p in [.5,.95,1]] if xs else []
def overlap(w,spans):
 parts=sorted((max(w['at'],s['at']),min(w['at']+w['ms'],s['at']+s['ms'])) for s in spans)
 covered=0; end=-1
 for a,b in parts:
  if b<=a:continue
  covered+=max(0,b-max(a,end));end=max(end,b)
 return covered
for directory in sorted(root.glob('*')):
 path=directory/'result.json'
 if not path.exists():continue
 row=json.loads(path.read_text())
 if row.get('seed') or 'samples' not in row:continue
 waits=[s for s in row['work'] if s['name']=='waitLocal']; per_kind={}
 for name in sorted(set(s['name'] for s in row['work'])):
  spans=[s for s in row['work'] if s['name']==name]
  per_kind[name]={'count':len(spans),'totalMs':round(sum(s['ms'] for s in spans),2),'maxMs':round(max(s['ms'] for s in spans),2)}
 costs={}
 for name in sorted(set(s['kind'] for s in row['textWork'])):
  spans=[s for s in row['textWork'] if s['kind']==name]
  costs[name]={'count':len(spans),'totalMs':round(sum(s['ms'] for s in spans),2),'perKeyMs':round(sum(s['ms'] for s in spans)/120,3),'quantilesMs':quantile([s['ms'] for s in spans])}
 req=[r for r in row['requests'] if r['phase']=='typing']; counts=collections.Counter((r['device'],r['path'],str(r.get('status'))) for r in req)
 summary[directory.name]={'phase':row['phase'],'arm':row['arm'],'mode':row['mode'],'kind':row['kind'],'goals':row['goalsChars'],'initialChars':row['initialChars'],'online':row['online'],
  'elapsedMs':row['ended']-row['started'],'keydownGapsMs':quantile([b['at']-a['at'] for a,b in zip(row['samples'],row['samples'][1:])]),
  'handler':quantile(row['handlers']),'dispatchMs':quantile([s['dispatchMs'] for s in row['samples']]),'over100ms':sum(s['frame']>100 for s in row['samples']),'frame':quantile([s['frame'] for s in row['samples']]),
  'sampleCount':len(row['samples']),'unresolvedFrames':sum(s['frame']==0 for s in row['samples']),
  'longTasks':len(row['tasks']),'longTaskTotalMs':sum(s['ms'] for s in row['tasks']),'longTaskMaxMs':max((s['ms'] for s in row['tasks']),default=0),
  'waitLocalMs':round(sum(s['ms'] for s in waits),2),'waitLocalMaxMs':round(max((s['ms'] for s in waits),default=0),2),
  'waitOverlapMs':{k:round(sum(overlap(w,[s for s in row['work'] if s['name']==k]) for w in waits),2) for k in ['admissionFlush','admissionBackgroundFlush','admissionRemote','admissionLocal']},
  'textCosts':costs,'costs':per_kind,
  'work':{k:row['after']['work'][k]-v for k,v in row['before']['work'].items()},
  'requests':[{'device':d,'path':p,'status':s,'count':v} for (d,p,s),v in counts.items()],
  'syncBefore':row['syncBefore'],'syncAfter':row['syncAfter'],'syncConverged':row.get('syncConverged'),
  'undoRedo':row.get('undoRedo',False),'coldReplay':row.get('coldReplay',False),'converged':row.get('converged',False)}
print(json.dumps(summary,indent=2))
