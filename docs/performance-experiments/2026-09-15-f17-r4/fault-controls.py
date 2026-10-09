from pathlib import Path
import subprocess,json,hashlib
home=Path(__file__).parent;root=home/'candidate';target=root/'src/ui/workspaceUi.tsx';before=target.read_text();records=[]
faults=[('stale-index','}, [snapshot.cards]);','}, []);'),('wrong-id','return (id: string) => cards.get(id);',"return (id: string) => cards.get('absent-fault-card');")]
try:
 for name,old,new in faults:
  assert before.count(old)==1,name
  target.write_text(before.replace(old,new,1))
  command=['node','node_modules/vitest/vitest.mjs','run','test/workspaceUiIndex.test.tsx']
  with (home/(name+'-fault.log')).open('w') as log:p=subprocess.run(command,cwd=root,stdout=log,stderr=subprocess.STDOUT,timeout=60)
  records.append({'name':name,'command':command,'exitCode':p.returncode,'expected':'nonzero assertion/test failure','mutation':{'before':old,'after':new}})
  assert p.returncode not in [0,-9,-15],name
finally:
 target.write_text(before)
 (home/'fault-controls.json').write_text(json.dumps({'records':records,'sourceRestored':target.read_text()==before,'sourceSha256':hashlib.sha256(target.read_bytes()).hexdigest()},indent=2)+'\n')
print(records)
