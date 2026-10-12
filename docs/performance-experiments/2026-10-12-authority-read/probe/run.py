"""Four serial diagnostic sessions. Refuse to overwrite retained evidence."""
import os,pathlib,subprocess,sys
root=pathlib.Path('/tmp/done-authority-read-20261012')
config='docs/performance-experiments/2026-10-12-authority-read/probe/typing.config.ts'
def run(mode,sampled):
 name=f'{mode}-'+('sampled' if sampled else 'timing')
 if (root/name).exists() or (root/f'{name}.log').exists():raise SystemExit(f'Already exists: {name}')
 fixture='/tmp/done-client-receive/fixture.json' if mode=='backlog' else '/tmp/done-online-typing-20261012/seed-matched-12000/fixture.json'
 env=dict(os.environ,DONE_PERF_SOURCE=os.getcwd(),DONE_PERF_DIST=str(root/'diagnostic'),DONE_PERF_RESULTS=str(root/name),DONE_PAIR_FIXTURE=fixture,TYPING_MODE=mode,TYPING_ARM='diagnostic',RECEIVE_DELAY_MS='75',TYPING_PROFILE='1' if sampled else '0')
 with (root/f'{name}.log').open('w') as log:
  result=subprocess.run(['node','node_modules/@playwright/test/cli.js','test','--config',config],env=env,stdout=log,stderr=subprocess.STDOUT)
 print(name,'exit',result.returncode,flush=True)
 if result.returncode:raise SystemExit(result.returncode)
if len(sys.argv)>1:run(sys.argv[1],len(sys.argv)>2 and sys.argv[2]=='sampled')
else:
 for sampled in [False,True]:
  for mode in ['active','backlog']:run(mode,sampled)
