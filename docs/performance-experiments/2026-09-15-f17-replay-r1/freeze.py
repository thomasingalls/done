from pathlib import Path
import hashlib,json,sys
h=Path(__file__).parent;mode=sys.argv[1];names=['selected','guarded'] if mode=='diagnostic' else ['selected','candidate'];paths=[]
for name in names:
 for d in ['src','test']:
  paths.extend((h/name/d).rglob('*'))
 paths.extend((h/'builds'/name).rglob('*'))
 paths.extend([h/'builds'/f'{name}-source.json',h/f'{name}-activated-admittedWorkspace.ts'])
 if mode=='diagnostic':paths.append(h/f'{name}-diagnostic-yjs.ts')
paths.extend(h/f for f in ['screen.mjs','measure.mjs','recorder.mjs','build.mjs','batch.mjs','protocol.md'])
pins={str(p.relative_to(h)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths if p.is_file()}
(h/(mode+'-freeze.json')).write_text(json.dumps({'pins':pins},indent=2)+'\n');print(mode,len(pins))
