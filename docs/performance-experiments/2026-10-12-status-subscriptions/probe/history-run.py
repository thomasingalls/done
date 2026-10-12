import os,pathlib,subprocess
root=pathlib.Path('/tmp/done-status-subscriptions-20261012')
for arm,ref,rep in [('authority','08a82089',1),('handoff','02829405',1),('handoff','02829405',2),('authority','08a82089',2)]:
 name=f'history-{arm}-{rep}'
 if (root/name).exists() or (root/(name+'.log')).exists():raise SystemExit('Output exists: '+name)
 env=dict(os.environ,HISTORY_REF=ref,DONE_PERF_SOURCE=os.getcwd(),DONE_PERF_DIST=str(root/('history-'+arm)),DONE_PERF_RESULTS=str(root/name),DONE_PAIR_FIXTURE='/tmp/done-online-typing-20261012/seed-matched-12000/fixture.json',TYPING_MODE='active',TYPING_ARM=arm,RECEIVE_DELAY_MS='75',TYPING_PROFILE='0')
 with (root/(name+'.log')).open('w') as log:
  p=subprocess.run(['node','node_modules/@playwright/test/cli.js','test','--config','docs/performance-experiments/2026-10-12-status-subscriptions/probe/history.config.ts'],env=env,stdout=log,stderr=subprocess.STDOUT)
 print(name,'exit',p.returncode,flush=True)
 if p.returncode:raise SystemExit(p.returncode)
