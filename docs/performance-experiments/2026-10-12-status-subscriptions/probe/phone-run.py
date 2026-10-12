import os,pathlib,subprocess,sys,shutil
root=pathlib.Path('/tmp/done-status-subscriptions-20261012')
adb='/private/tmp/done-phone-receive-debug/platform-tools/adb'
probe='docs/performance-experiments/2026-10-12-status-subscriptions/probe/'
def command(*args):return subprocess.check_output([adb,*args],text=True)
if 'tcp:53893' in command('forward','--list') or 'tcp:53771' in command('reverse','--list'):raise SystemExit('Test forwarding already occupied')
command('forward','tcp:53893','localabstract:chrome_devtools_remote')
command('reverse','tcp:53771','tcp:53771')
def run(name,config,arm='candidate'):
 if (root/name).exists() or (root/(name+'.log')).exists():raise SystemExit('Output exists: '+name)
 env=dict(os.environ,DONE_PERF_SOURCE=os.getcwd(),DONE_PERF_DIST=str(root/('phone-'+arm+'-dist')),DONE_PERF_RESULTS=str(root/name),TYPING_ARM=arm,RECEIVE_DELAY_MS='75')
 with (root/(name+'.log')).open('w') as log:
  result=subprocess.run(['node','node_modules/@playwright/test/cli.js','test','--config',probe+config],env=env,stdout=log,stderr=subprocess.STDOUT)
 print(name,'exit',result.returncode,flush=True)
 if result.returncode:raise SystemExit(result.returncode)
try:
 for arm in ['reference','candidate']:
  dest=root/('phone-'+arm+'-dist')
  if not dest.exists():
   shutil.copytree(root/arm,dest)
   (dest/'__status-probe-empty.html').write_text('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>done disposable performance check</title>')
 if len(sys.argv)>1:
  arm,rep=sys.argv[1:];run('phone-'+arm+'-'+rep,'phone.config.ts',arm)
 else:
  run('phone-calibration','phone-calibration.config.ts')
  for arm,rep in [('reference','1'),('candidate','1'),('candidate','2'),('reference','2')]:run('phone-'+arm+'-'+rep,'phone.config.ts',arm)
finally:
 command('forward','--remove','tcp:53893')
 command('reverse','--remove','tcp:53771')
