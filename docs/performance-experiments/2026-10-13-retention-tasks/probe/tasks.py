"""Clip CPU samples to preparation tasks. New captures align observer times by a User Timing mark.
Older captures use non-nested >=50ms main-thread trace events, labelled separately as events.
"""
import collections,json,pathlib,sys
path=pathlib.Path(sys.argv[1]);p=json.loads(path.read_text())
trace=json.loads(path.with_suffix('.trace.json').read_text())['traceEvents']
spans=json.loads(path.with_suffix('.fenced.json').read_text())['spans']
prep=next(s for s in spans if s['name']=='retentionPreparation')
event=next(e for e in trace if e.get('name')=='retentionPreparation' and e['ph']=='b')
nodes={n['id']:n for n in p['nodes']};parents={c:n['id']for n in p['nodes']for c in n.get('children',[])}
def label(i):
 f=nodes[i]['callFrame'];return f"{f['functionName'] or '(anonymous)'}:{f['lineNumber']+1}"
sample=next((s for s in json.loads((path.parent/'results.json').read_text())['samples'] if path.name==f"{s['arm']}-{s['rep']}.cpuprofile"),None)
mark=next((e for e in trace if e.get('name')=='retentionProbeStart'),None)
method='outermost-main-thread-trace-events';tasks=[]
if mark and sample and 'probeStartTime' in sample:
 offset=mark['ts']/1000-sample['probeStartTime'];method='long-tasks-observer-aligned-by-user-timing'
 for t in sample['tasks']:
  start=(offset+t['at'])*1000;end=start+t['ms']*1000
  if start<prep['end'] and end>prep['start']:tasks.append({'start':start,'end':end,'ms':t['ms']})
else:
 candidates=sorted((e for e in trace if e.get('ph')=='X' and e.get('dur',0)>=50000 and e['pid']==event['pid'] and e['tid']==event['tid'] and e['ts']<prep['end'] and e['ts']+e['dur']>prep['start']),key=lambda e:(e['ts'],-e['dur']))
 for e in candidates:
  start=e['ts'];end=start+e['dur']
  if any(t['start']<=start and t['end']>=end for t in tasks):continue
  tasks.append({'name':e['name'],'start':start,'end':end,'ms':e['dur']/1000})
for task in tasks:
 self=collections.Counter();inc=collections.Counter();at=p['startTime']
 for i,dt in zip(p['samples'],p['timeDeltas']):
  end=at+dt;ms=max(0,min(end,task['end'],prep['end'])-max(at,task['start'],prep['start']))/1000;at=end
  if not ms:continue
  self[label(i)]+=ms;seen=set()
  while i is not None:
   l=label(i)
   if l not in seen:inc[l]+=ms;seen.add(l)
   i=parents.get(i)
 task['offsetMs']=(task['start']-prep['start'])/1000
 task['profile']={k:[{'function':f,'ms':round(v,2)}for f,v in c.most_common(25)]for k,c in [('self',self),('inclusive',inc)]}
tasks.sort(key=lambda t:-t['ms'])
output={'method':method,'preparation':prep,'tasks':tasks}
path.with_suffix('.tasks.json').write_text(json.dumps(output,indent=2)+'\n')
for t in tasks[:8]:print(t['ms'],t['profile']['inclusive'][:5])
