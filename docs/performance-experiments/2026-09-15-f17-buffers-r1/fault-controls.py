from pathlib import Path
import subprocess,json,hashlib
home=Path(__file__).parent;root=home/'candidate';sha=lambda b:hashlib.sha256(b).hexdigest()
faults=[
 ('premature-retirement','src/crdt/workspacePreparation.ts','        state === slot.prepared?.state ||\n','', 'test/historyRetirement.test.ts','history retirement permits one exact previous'),
 ('omitted-catch-up','src/crdt/yjs.ts',"      applyUpdate(target.doc, update, 'text-buffer-catch-up');",'      void update;', 'test/textBufferBasis.test.ts','text history catch-up applies the exact delta'),
 ('shared-history','src/crdt/yjs.ts','      copyHistoryStacks(source, target, (meta) => snapshots.fork(meta));','      target.undoStack = source.undoStack;\n      target.redoStack = source.redoStack;\n      target.lastChange = source.lastChange;', 'test/workspaceAdmission.test.ts','alternates two actual histories'),
]
records=[]
for name,file,before,after,test,pattern in faults:
 p=root/file;original=p.read_bytes();assert before in original.decode()
 changed=original.decode().replace(before,after,1)
 (home/(name+'-fault.ts')).write_text(changed)
 command=['node','node_modules/vitest/vitest.mjs','run',test,'-t',pattern,'--reporter=json','--outputFile='+str(home/(name+'-fault.json'))]
 try:
  p.write_text(changed)
  with (home/(name+'-fault.log')).open('w') as out:r=subprocess.run(command,cwd=root,stdout=out,stderr=subprocess.STDOUT,timeout=60)
  report=json.loads((home/(name+'-fault.json')).read_text())
  failed=[a['fullName'] for t in report['testResults'] for a in t['assertionResults'] if a['status']=='failed']
  assert r.returncode==1 and len(failed)==1,(name,r.returncode,failed)
  records.append({'name':name,'file':file,'command':command,'exit':r.returncode,'caughtBy':failed,'originalSourceSha256':sha(original),'test':test,'testSha256':sha((root/test).read_bytes())})
 finally:p.write_bytes(original)
 (home/'fault-controls.json').write_text(json.dumps(records,indent=2)+'\n')
print('Three deliberately broken variants caught by designated assertions; runtime restored.')
