import os,subprocess,pathlib,json
root=pathlib.Path('/tmp/done-warm-ledger-20261012')
for arm,index in [('final-reference',1),('final',1),('final',2),('final-reference',2),('final-reference',3),('final',3)]:
 name=f'{arm}-{index}'
 env=dict(os.environ,DONE_PERF_SOURCE=os.getcwd(),DONE_PERF_DIST=str(root/f'{arm}-dist'),DONE_REOPEN_FIXTURE='/tmp/done-foreground-stall-20261012/diagnostic-before-2/deep-received-fixture.json',DONE_PERF_RESULTS=str(root/name),TYPING_REPEATS='1',TYPING_CPU='4')
 with (root/f'{name}.log').open('w') as log:
  result=subprocess.run(['node','node_modules/@playwright/test/cli.js','test','--config','docs/performance-experiments/2026-10-12-warm-ledger/probe/typing.config.ts'],env=env,stdout=log,stderr=subprocess.STDOUT)
 print(name,'exit',result.returncode,flush=True)
 if result.returncode:raise SystemExit(result.returncode)
