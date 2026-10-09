from pathlib import Path
import subprocess,hashlib,json
h=Path(__file__).parent
for name in ['guarded','candidate']:
 root=h/name
 files=subprocess.check_output(['git','ls-files','--others','--exclude-standard','test','src'],cwd=root,text=True).splitlines()
 if files:subprocess.run(['git','add','-N','--',*files],cwd=root,check=True)
 (h/(name+'.patch')).write_bytes(subprocess.check_output(['git','diff','--binary','HEAD','--','src','test'],cwd=root))
 subprocess.run(['git','apply','--reverse','--check',str(h/(name+'.patch'))],cwd=root,check=True)
files=['src/crdt/admittedWorkspace.ts','src/crdt/yjs.ts','test/historyReplay.test.ts','test/workspaceAdmission.test.ts','test/textBufferNormalizationProbe.test.ts']
parts=[]
for f in files:
 a=h/'guarded'/f;b=h/'candidate'/f
 r=subprocess.run(['git','diff','--no-index','--',str(a) if a.exists() else '/dev/null',str(b)],stdout=subprocess.PIPE)
 assert r.returncode in [0,1]
 s=r.stdout.decode().replace('a'+str(h/'guarded')+'/', 'a/').replace('b'+str(h/'candidate')+'/', 'b/').replace('a'+str(h/'candidate')+'/', 'a/')
 parts.append(s)
(h/'replay.patch').write_text(''.join(parts));subprocess.run(['git','apply','--check',str(h/'replay.patch')],cwd=h/'guarded',check=True)
# Existing owner/adoption verification is unchanged from G. Full sameDocState unchanged from S.
assert (h/'guarded/src/crdt/admissionQueue.ts').read_bytes()==(h/'candidate/src/crdt/admissionQueue.ts').read_bytes()
assert (h/'guarded/src/crdt/workspacePreparation.ts').read_bytes()==(h/'candidate/src/crdt/workspacePreparation.ts').read_bytes()
extract=lambda name:(h/name/'src/crdt/yjs.ts').read_text().split('export const sameDocState =',1)[1].split('/** Current Account recovery',1)[0]
assert extract('selected')==extract('candidate')
(h/'verification-boundary.json').write_text(json.dumps({'sameDocStateBodyUnchangedFromSelected':True,'admissionQueueUnchangedFromGuarded':True,'workspacePreparationUnchangedFromGuarded':True,'guardedIncrement':files},indent=2)+'\n')
print('Patches checked; every preexisting canonical comparison is unchanged')
