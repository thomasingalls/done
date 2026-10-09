from pathlib import Path
import subprocess,json,hashlib
home=Path(__file__).parent;root=home/'candidate';records=[]
faults=[('no-remote-invalidation','src/crdt/admittedWorkspace.ts','repairs a dirty remote basis',lambda s:s.replace('commands.invalidate(accepted!.history);','/* fault: retain stale repair eligibility */')),
('unaccepted-cleanliness','src/crdt/workspaceCommands.ts','does not transfer unaccepted cleanliness',lambda s:s.replace('const repaired = new WeakSet<YUndoManager>();','const repaired = new WeakSet<YUndoManager>();\n  let lastSource: YUndoManager | undefined;').replace('inherit(source: YUndoManager, fork: YUndoManager) {','inherit(source: YUndoManager, fork: YUndoManager) {\n      lastSource = source;').replace('repaired.add(history);\n      return result;','repaired.add(history);\n      if (lastSource) repaired.add(lastSource); // fault: unaccepted candidate blesses source\n      return result;'))]
for originalName,file,test,mutation in faults:
 name = originalName + '-final'
 p=root/file;original=p.read_text();changed=mutation(original);assert changed!=original
 try:
  p.write_text(changed)
  (home/(name+'.patch')).write_text(subprocess.check_output(['git','diff','--',file],cwd=root,text=True))
  command=['node','node_modules/vitest/vitest.mjs','run','test/membershipEligibility.test.ts','-t',test,'--reporter=json','--outputFile='+str(home/(name+'.json'))]
  with (home/(name+'.log')).open('w') as out:r=subprocess.run(command,cwd=root,stdout=out,stderr=subprocess.STDOUT,timeout=60)
  report=json.loads((home/(name+'.json')).read_text())
  failures=[x for suite in report['testResults'] for x in suite['assertionResults'] if x['status']=='failed']
  assert r.returncode!=0 and len(failures)==4,(name,r.returncode,report)
  assert all('AssertionError' in '\n'.join(x['failureMessages']) for x in failures)
  records.append({'fault':name,'command':command,'exit':r.returncode,'originalSourceSha256':hashlib.sha256(original.encode()).hexdigest(),'testSha256':hashlib.sha256((root/'test/membershipEligibility.test.ts').read_bytes()).hexdigest(),'caughtBy':[x['fullName'] for x in failures]})
 finally:p.write_text(original)
(home/'fault-controls-final.json').write_text(json.dumps(records,indent=2)+'\n')
print('Both faults caught by four owner-mode assertions each; original source restored.')
