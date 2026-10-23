from pathlib import Path
import subprocess,json,os,hashlib,time
r=Path(__file__).parent;receipts=[];sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest();closure=json.loads((r/'browser-identity.json').read_text())['browserClosure']
for case in json.loads((r/'browser-plan.json').read_text()):
 source=r/('source-'+case['arm']);assert{f.name:sha(f)for f in(source/'test/live-sync-attribution').iterdir()if f.is_file()}==closure
 out=r/case['name'];out.mkdir(mode=0o700)
 env={**os.environ,'SYNC_ROOT':'/private/tmp/done-live-sync-attribution-20261021','SYNC_SOURCE':str(source),'SYNC_OUT':str(out),'SYNC_DIST':str(source/'dist'),'SYNC_MODE':'catchup','SYNC_DELAY':'0','SYNC_REVISION':case['name'],'SYNC_PRESSURE':case['pressure'],'SYNC_INJECT':'0','SYNC_TIP_TRACE':'0','SYNC_DIAGNOSTIC':'0','DISPATCH_STATIC':'0','DISPATCH_FAULT':'0','DISPATCH_ISOLATED':'1','DISPATCH_FOCUSED':'1','DISPATCH_TARGET':'editor','DISPATCH_MONITOR_DIR':str(out/'node-monitors'),'NODE_OPTIONS':(os.environ.get('NODE_OPTIONS','')+' --import '+str(r/'node-monitor.mjs')).strip()}
 cmd=['node','node_modules/@playwright/test/cli.js','test','--config','test/live-sync-attribution/playwright.config.ts'];at=time.time_ns()//1000000
 with(out/'invocation.log').open('w')as log:p=subprocess.run(cmd,cwd=source,env=env,stdout=log,stderr=subprocess.STDOUT)
 row={**case,'command':cmd,'cwd':str(source),'startedAt':at,'completedAt':time.time_ns()//1000000,'exitCode':p.returncode};receipts.append(row);(r/'browser-runner.json').write_text(json.dumps(receipts,indent=2)+'\n');print(json.dumps(row),flush=True)
 if p.returncode:raise SystemExit(p.returncode)
