"""Attribution only; serial sessions, refuse overwrite, retain every failure."""
import os,pathlib,subprocess,sys
root=pathlib.Path('/tmp/done-final-apply-20261012')
config='docs/performance-experiments/2026-10-12-final-apply/probe/typing.config.ts'
def run(mode,rep,profile):
 name=f'{mode}-{rep}'+('-profile' if profile else '')
 if (root/name).exists() or (root/f'{name}.log').exists():raise SystemExit(f'Already exists: {name}')
 fixture='/tmp/done-client-receive/fixture.json' if mode=='backlog' else '/tmp/done-online-typing-20261012/seed-matched-12000/fixture.json'
 env=dict(os.environ,DONE_PERF_SOURCE=os.getcwd(),DONE_PERF_DIST=str(root/'attributed'),DONE_PERF_RESULTS=str(root/name),DONE_PAIR_FIXTURE=fixture,TYPING_MODE=mode,TYPING_ARM='attributed',RECEIVE_DELAY_MS='75',TYPING_PROFILE='1' if profile else '0')
 with (root/f'{name}.log').open('w') as log:
  p=subprocess.run(['node','node_modules/@playwright/test/cli.js','test','--config',config],env=env,stdout=log,stderr=subprocess.STDOUT)
 print(name,'exit',p.returncode,flush=True)
 if p.returncode:raise SystemExit(p.returncode)
if len(sys.argv)>1:run(sys.argv[1],sys.argv[2],len(sys.argv)>3)
else:
 for args in [('active','1',False),('backlog','1',False),('backlog','2',True),('active','2',True)]:run(*args)
