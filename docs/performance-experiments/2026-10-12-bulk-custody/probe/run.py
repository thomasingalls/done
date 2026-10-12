"""Serial restored-session comparison; failures retained, output overwrite refused."""
import os,pathlib,subprocess,sys
root=pathlib.Path('/tmp/done-bulk-custody-20261012')
config='docs/performance-experiments/2026-10-12-bulk-custody/probe/typing.config.ts'
def run(arm,mode,rep):
 name=f'{arm}-{mode}-{rep}'
 if (root/name).exists() or (root/f'{name}.log').exists():raise SystemExit(f'Already exists: {name}')
 fixture='/tmp/done-client-receive/fixture.json' if mode=='backlog' else '/tmp/done-online-typing-20261012/seed-matched-12000/fixture.json'
 env=dict(os.environ,DONE_PERF_SOURCE=os.getcwd(),DONE_PERF_DIST=str(root/arm),DONE_PERF_RESULTS=str(root/name),DONE_PAIR_FIXTURE=fixture,TYPING_MODE=mode,TYPING_ARM=arm,RECEIVE_DELAY_MS='75',TYPING_PROFILE='0')
 with (root/f'{name}.log').open('w') as log:
  p=subprocess.run(['node','node_modules/@playwright/test/cli.js','test','--config',config],env=env,stdout=log,stderr=subprocess.STDOUT)
 print(name,'exit',p.returncode,flush=True)
 if p.returncode:raise SystemExit(p.returncode)
if len(sys.argv)>1:run(*sys.argv[1:])
else:
 for rep in [1,2]:
  for mode in ['active','backlog']:
   for arm in (['reference','candidate'] if rep==1 else ['candidate','reference']):run(arm,mode,rep)
