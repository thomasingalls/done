"""One local browser process at a time; stop on failure, retain every attempt."""
import os,pathlib,subprocess,sys
root=pathlib.Path('/tmp/done-online-typing-20261012')
config='docs/performance-experiments/2026-10-12-online-typing/probe/typing.config.ts'
def run(name,**extra):
 if (root/name).exists() or (root/f'{name}.log').exists():raise SystemExit(f'Refusing to overwrite retained attempt: {name}')
 env=dict(os.environ,DONE_PERF_SOURCE=os.getcwd(),DONE_PERF_DIST=str(root/'dist'),DONE_PERF_RESULTS=str(root/name),**extra)
 with (root/f'{name}.log').open('w') as log:
  result=subprocess.run(['node','node_modules/@playwright/test/cli.js','test','--config',config],env=env,stdout=log,stderr=subprocess.STDOUT)
 print(name,'exit',result.returncode,flush=True)
 if result.returncode:raise SystemExit(result.returncode)
def fixture(n):return str(root/('seed-matched-12000' if n==12000 else f'seed-{n}')/'fixture.json')
mode=sys.argv[1]
if mode=='seeds':
 for n in [3000,64000]:run(f'seed-{n}',ONLINE_SEED='1',GOALS_CHARS=str(n),DONE_PAIR_FIXTURE=fixture(12000))
elif mode=='diagnostics':
 for kind,n in [('card',12000),('goals',12000),('goals',64000)]:
  run(f'diagnostic-{kind}-{n}',GOALS_CHARS=str(n),TYPING_TARGET=kind,TYPING_ONLINE='1',TYPING_PROFILE='1',RECEIVE_DELAY_MS='75',DONE_PAIR_FIXTURE=fixture(n))
elif mode=='matrix':
 targets=[('card',12000),('goals',3000),('goals',12000),('goals',64000)]
 for repetition in [1,2]:
  for kind,n in targets if repetition==1 else reversed(targets):
   for online in ([False,True] if repetition==1 else [True,False]):
    name=f'{kind}-{n}-'+('online' if online else 'offline')+f'-{repetition}'
    run(name,GOALS_CHARS=str(n),TYPING_TARGET=kind,TYPING_ONLINE='1' if online else '0',RECEIVE_DELAY_MS='75',DONE_PAIR_FIXTURE=fixture(n))
else:raise SystemExit('Expected seeds, diagnostics or matrix')
