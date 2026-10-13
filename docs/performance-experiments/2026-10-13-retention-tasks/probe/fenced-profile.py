"""Align Chromium CPU samples to User Timing spans in the matching trace (same monotonic clock)."""
import collections,json,pathlib,sys
path=pathlib.Path(sys.argv[1]); p=json.loads(path.read_text())
t=json.loads(path.with_suffix('.trace.json').read_text())['traceEvents']
spans=[]; pending={}
for e in t:
 if not e.get('name','').startswith('retention'): continue
 k=(e.get('pid'),e.get('tid'),e['name'],str(e.get('id2',e.get('id'))))
 if e['ph']=='b':pending[k]=e
 elif e['ph']=='e' and k in pending:
  b=pending.pop(k); spans.append({'name':b['name'],'start':b['ts'],'end':e['ts'],'ms':(e['ts']-b['ts'])/1000})
 elif e['ph']=='X':spans.append({'name':e['name'],'start':e['ts'],'end':e['ts']+e['dur'],'ms':e['dur']/1000})
nodes={n['id']:n for n in p['nodes']};parents={c:n['id']for n in p['nodes']for c in n.get('children',[])}
def label(i):
 f=nodes[i]['callFrame'];return f"{f['functionName'] or '(anonymous)'}:{f['lineNumber']+1}"
output={'spans':spans,'profiles':{}}
for span in spans:
 self=collections.Counter();inc=collections.Counter();at=p['startTime']
 for i,dt in zip(p['samples'],p['timeDeltas']):
  end=at+dt;ms=max(0,min(end,span['end'])-max(at,span['start']))/1000;at=end
  if not ms:continue
  self[label(i)]+=ms;seen=set()
  while i is not None:
   l=label(i)
   if l not in seen:inc[l]+=ms;seen.add(l)
   i=parents.get(i)
 output['profiles'][span['name']]={k:[{'function':f,'ms':round(n,2)}for f,n in v.most_common(40)]for k,v in [('self',self),('inclusive',inc)]}
path.with_suffix('.fenced.json').write_text(json.dumps(output,indent=2)+'\n')
for s in spans: print(s['name'],round(s['ms'],2))
for row in output['profiles'].get('retentionFenced',{}).get('self',[])[:20]:print(row)
