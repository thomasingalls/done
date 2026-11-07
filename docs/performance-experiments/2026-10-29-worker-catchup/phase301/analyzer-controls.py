from pathlib import Path
import copy,json,subprocess,sys
r=Path(__file__).parent;raw=json.loads(Path('/private/tmp/done-whole-client-20261027/heavy-2-C/result.json').read_text());raw['variant']='C291';start=raw['startedAt'];raw['originalDeliveryPassed']=True;raw['backgroundReplayPassed']=True
for j,p in enumerate(raw['probesAtDeadline']):
 base=next(v['length']for v in reversed(p['lengths'])if v['at']<=start)
 p['lengths']=[{'at':start-1,'length':base}]+[{'at':o['at']+(1 if j==0 else 100),'length':base+i}for i,o in enumerate(raw['offers'],1)]
# These are analyst sensitivity controls derived from synthetic old data, never performance samples.
def slow(x,device,ms):
 p=x['probesAtDeadline'][device];base=p['lengths'][0]['length'];p['lengths']=[p['lengths'][0]]+[{'at':o['at']+ms,'length':base+i}for i,o in enumerate(x['offers'],1)]
cases=[('positive',lambda x:None,0),('input-gate',lambda x:slow(x,0,100),2),('peer-gate',lambda x:slow(x,1,3000),2),('background-gate',lambda x:x.update(backgroundReplayPassed=False),2),('missing-guard',lambda x:x['guards'].pop('undoRedo'),1),('pending-archive',lambda x:x['offlineColdWriterReopen'].update(archive={}),1),('pending-deadline',lambda x:x.update(pendingConvergedAt=x['pendingReconnectAt']+120001),1),('missing-key',lambda x:x['offers'].pop(),1),('wrong-variant',lambda x:x.update(variant='other'),1)]
rows=[]
for name,mutate,expected in cases:
 d=r/'analyzer-controls'/name;d.mkdir(parents=True);x=copy.deepcopy(raw);mutate(x);(d/'result.json').write_text(json.dumps(x));p=subprocess.run([sys.executable,str(r/'analyze-fairness.py'),str(d)],capture_output=True,text=True);assert p.returncode==expected,(name,p.returncode,p.stderr);rows.append({'case':name,'exit':p.returncode,'expected':expected})
(r/'analyzer-controls.json').write_text(json.dumps(rows,indent=2)+'\n');print(json.dumps(rows,indent=2))
