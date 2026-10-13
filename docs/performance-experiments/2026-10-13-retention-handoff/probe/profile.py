"""Summarize a native unminified observer profile; line numbers refer to its hashed bundle."""
import json,collections,sys,pathlib
path=pathlib.Path(sys.argv[1]); p=json.loads(path.read_text())
nodes={n['id']:n for n in p['nodes']}; parents={c:n['id'] for n in p['nodes'] for c in n.get('children',[])}
def label(i):
 f=nodes[i]['callFrame']; return f"{f['functionName'] or '(anonymous)'}:{f['lineNumber']+1}"
self=collections.Counter(); inclusive=collections.Counter()
for i,dt in zip(p['samples'],p['timeDeltas']):
 self[label(i)]+=dt/1000; seen=set()
 while i is not None:
  l=label(i)
  if l not in seen:inclusive[l]+=dt/1000;seen.add(l)
  i=parents.get(i)
r={k:[{'function':f,'ms':round(ms,1)}for f,ms in values.most_common()]for k,values in [('self',self),('inclusive',inclusive)]}
path.with_suffix('.summary.json').write_text(json.dumps(r,indent=2)+'\n')
for key in ['self','inclusive']:
 print(key)
 for entry in r[key][:25]:print(entry)
