from pathlib import Path
import subprocess,json,hashlib,time,os,signal,sys,datetime,re,platform
root=Path.cwd();phase=sys.argv[1];spec=json.loads(Path(sys.argv[2]).read_text());out=root/'test-results/liveness-followups'/f'{phase}-{datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds").replace(":","-")}'
out.mkdir(parents=True);sha=lambda b:hashlib.sha256(b).hexdigest()
files=set()
for d in ['src','account-service','account-protocol','test','scripts','docs/account-crypto']:
 for p in (root/d).rglob('*'):
  if p.is_file():files.add(str(p.relative_to(root)))
for f in ['package.json','pnpm-lock.yaml','tsconfig.json','tsconfig.app.json','tsconfig.node.json','docs/review/implementation/liveness-followups.md','docs/review/remediation/S0-2/authority-map.md']:
 files.add(f)
files.update(subprocess.check_output(['git','ls-files','wasm'],text=True).splitlines())
pins=[dict(path=f,sha256=sha((root/f).read_bytes())) for f in sorted(files)]
(out/'sources.json').write_text(json.dumps(pins,indent=2)+'\n');(out/'protocol.tested.md').write_bytes((root/'docs/review/implementation/liveness-followups.md').read_bytes());(out/'runner.py').write_bytes(Path(__file__).read_bytes())
summary=dict(phase=phase,head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),status='running',started=datetime.datetime.now(datetime.timezone.utc).isoformat(),node=subprocess.check_output(['node','--version'],text=True).strip(),platform=platform.platform(),stages=[],sourceCount=len(pins));save=lambda:(out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');save();print(str(out),flush=True)
try:
 for stage in spec:
  name,cmd,limit=stage;start=time.monotonic();folder=out/name;folder.mkdir();env={**os.environ,'ACCOUNT_REPORT_DIR':str(folder)};timeout=False
  with (out/(name+'.log')).open('wb') as log:
   p=subprocess.Popen(cmd,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
   while p.poll() is None:
    try:p.wait(timeout=min(15,max(0.01,limit-(time.monotonic()-start))))
    except subprocess.TimeoutExpired:
     if time.monotonic()-start>=limit:
      timeout=True;os.killpg(p.pid,signal.SIGTERM)
      try:p.wait(timeout=5)
      except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait()
     else:print(name+' running '+str(round(time.monotonic()-start))+'s',flush=True)
  text=(out/(name+'.log')).read_text();row=dict(name=name,command=cmd,timeoutSeconds=limit,exitCode=p.returncode,timedOut=timeout,elapsedSeconds=round(time.monotonic()-start,3));summary['stages'].append(row);save();print(name+' exit '+str(p.returncode),flush=True)
  assert p.returncode==0 and not timeout,(name,out/(name+'.log'))
  if '--test' in cmd:
   match=re.search(r'(?:ℹ|#) tests (\d+)',text);assert match and int(match[1])>0,name
   row['tests']=int(match[1])
   for key in ['fail','skipped','cancelled']:assert re.search(r'(?:ℹ|#) '+key+r' 0(?:\n|$)',text),(name,key)
 for row in pins:assert sha((root/row['path']).read_bytes())==row['sha256'],row['path']
 summary['status']='passed';summary['pinsUnchanged']=True
except BaseException as e:
 summary['status']='failed';summary['error']=repr(e);raise
finally:
 summary['finished']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
