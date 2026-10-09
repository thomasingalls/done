from pathlib import Path
import subprocess
home=Path(__file__).parent;root=home/'candidate';p=root/'src/crdt/yjs.ts';fixed=p.read_bytes()
try:
 p.write_bytes((home/'before-normalization-guard.ts').read_bytes())
 with (home/'normalization-shape-before.log').open('w') as out:
  r=subprocess.run(['node','node_modules/vitest/vitest.mjs','run','test/textBufferBasis.test.ts','-t','rejects every unsupported normalization shape'],cwd=root,stdout=out,stderr=subprocess.STDOUT)
 assert r.returncode==1
finally:p.write_bytes(fixed)
with (home/'normalization-probe-final.log').open('w') as out:
 r=subprocess.run(['node','node_modules/vitest/vitest.mjs','run','test/textBufferNormalizationProbe.test.ts','--silent=false'],cwd=root,stdout=out,stderr=subprocess.STDOUT)
assert r.returncode==0
print('Old guard fails the real shape control; native fork probe passes; final source restored.')
