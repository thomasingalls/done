from pathlib import Path
import subprocess,json,hashlib
home=Path(__file__).parent;root=home/'candidate';file=root/'src/crdt/workspacePublication.ts';original=file.read_text();records=[]
faults=[('normalization-refresh','refreshes unedited lone and split-pair',lambda s:s.replace('[...cached.sensitiveCards, ...changes.cards]','[...changes.cards]').replace('changes.master || cached.masterSensitive','changes.master').replace('for (const date of cached.sensitiveArchives)','for (const date of [] as string[])')),
('structural-fallback','falls back for structural and unknown',lambda s:s.replace('        changes.full ||\n','')),
('aliased-output','refreshes only the changed card',lambda s:s.replace('return structuredClone(cached.value);','return cached.value;'))]
for name,test,mutation in faults:
 changed=mutation(original);assert changed!=original
 try:
  file.write_text(changed);(home/(name+'-fault.ts')).write_text(changed)
  command=['node','node_modules/vitest/vitest.mjs','run','test/workspacePublication.test.ts','-t',test,'--reporter=json','--outputFile='+str(home/(name+'-fault.json'))]
  with (home/(name+'-fault.log')).open('w') as out:r=subprocess.run(command,cwd=root,stdout=out,stderr=subprocess.STDOUT,timeout=60)
  report=json.loads((home/(name+'-fault.json')).read_text());failures=[a for suite in report['testResults'] for a in suite['assertionResults'] if a['status']=='failed']
  assert r.returncode==1 and len(failures)==1,(name,r.returncode,report)
  assert 'AssertionError' in '\n'.join(failures[0]['failureMessages'])
  records.append({'name':name,'command':command,'exit':r.returncode,'caughtBy':failures[0]['fullName'],'originalSourceSha256':hashlib.sha256(original.encode()).hexdigest(),'testSha256':hashlib.sha256((root/'test/workspacePublication.test.ts').read_bytes()).hexdigest()})
 finally:file.write_text(original)
(home/'fault-controls.json').write_text(json.dumps(records,indent=2)+'\n')
print('All three faults caught by their designated assertions; source restored.')
