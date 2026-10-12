"""Serial restored-session comparison; retain failures and refuse overwrites."""
import os,pathlib,subprocess,sys
root=pathlib.Path('/tmp/done-prepared-receive-20261012')
config='docs/performance-experiments/2026-10-12-prepared-receive/probe/typing.config.ts'
def run(arm,mode,rep,profile=False):
 name=f'{arm}-{mode}-{rep}'+('-profile' if profile else '')
 if (root/name).exists() or (root/f'{name}.log').exists():raise SystemExit(f'Already exists: {name}')
 fixture='/tmp/done-client-receive/fixture.json' if mode=='backlog' else '/tmp/done-online-typing-20261012/seed-matched-12000/fixture.json'
 env=dict(os.environ,DONE_PERF_SOURCE=os.getcwd(),DONE_PERF_DIST=str(root/arm),DONE_PERF_RESULTS=str(root/name),DONE_PAIR_FIXTURE=fixture,TYPING_MODE=mode,TYPING_ARM=arm,RECEIVE_DELAY_MS='75',TYPING_PROFILE='1' if profile else '0')
 with (root/f'{name}.log').open('w') as log:
  p=subprocess.run(['node','node_modules/@playwright/test/cli.js','test','--config',config],env=env,stdout=log,stderr=subprocess.STDOUT)
 print(name,'exit',p.returncode,flush=True)
 if p.returncode:raise SystemExit(p.returncode)
if sys.argv[1]=='matrix':
 for rep in [1,2]:
  for mode in ['silent','active','backlog']:
   for arm in (['reference','candidate'] if rep==1 else ['candidate','reference']):run(arm,mode,rep)
else:run(sys.argv[1],sys.argv[2],sys.argv[3],len(sys.argv)>4)
