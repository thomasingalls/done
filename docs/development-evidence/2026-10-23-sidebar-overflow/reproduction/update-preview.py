from pathlib import Path
import os,signal,subprocess,json,time,urllib.request,hashlib
root=Path('/Users/thomasingalls/.codex/worktrees/7fda/done');s=Path('/private/tmp/done-ux-20261023-patches');m=json.loads((s/'preview-next.json').read_text());out=Path(m['directory'])
def owner(port):
 p=subprocess.run(['lsof','-nP','-iTCP:'+str(port),'-sTCP:LISTEN','-Fp'],text=True,capture_output=True)
 return [int(x[1:]) for x in p.stdout.splitlines()if x.startswith('p')]
def public_config():
 request=urllib.request.Request(m['origin']+'/__account-setup/config',data=b'{}',headers={'Content-Type':'application/json','Origin':m['origin']},method='POST')
 with urllib.request.urlopen(request,timeout=5)as response:return response.read()
assert owner(m['appPort'])==[m['previousGatewayPid']]
assert owner(m['servicePort'])==[m['retainedApiPid']]
before=public_config()
assert hashlib.sha256(before).hexdigest()=='dface6756553bf846a4d9de34ce05877a06a28f96b5381e4e3c7b3f44d7864e0'
(out/'api-config-before.json').write_bytes(before)
os.kill(m['previousGatewayPid'],signal.SIGTERM)
for _ in range(30):
 if not owner(m['appPort']):break
 time.sleep(.1)
else:raise RuntimeError('Old gateway did not release its port')
env={**os.environ,'PATH':'/private/tmp/done-node24-runtime/node-v24.18.0-darwin-arm64/bin:'+os.environ['PATH'],'ACCOUNT_SETUP_ORIGIN':m['origin'],'ACCOUNT_SETUP_PORT':str(m['appPort']),'ACCOUNT_SERVICE_PORT':str(m['servicePort']),'ACCOUNT_NETWORK_SESSIONS':'1','ACCOUNT_MEMBERSHIP_CONTINUATION':'1','ACCOUNT_SETUP_DIST':m['build']}
with (out/'gateway.log').open('ab') as log:
 p=subprocess.Popen(['/private/tmp/done-node24-runtime/node-v24.18.0-darwin-arm64/bin/node','scripts/serve-account.mjs'],cwd=root,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
m['gatewayPid']=p.pid
# Retain the new PID even if a later verification fails; the old gateway is no longer running.
(out/'handoff.json').write_text(json.dumps(m,indent=2)+'\n')
for _ in range(50):
 try:
  after=public_config();assert after==before;break
 except Exception:
  if p.poll()is not None:raise RuntimeError('New gateway exited; inspect log')
  time.sleep(.1)
else:raise RuntimeError('New gateway did not become ready')
assert owner(m['servicePort'])==[m['retainedApiPid']]
records=[]
for f in sorted((out/'build').rglob('*')):
 if not f.is_file()or f.suffix=='.map':continue
 path='/'+str(f.relative_to(out/'build'));expected=f.read_bytes()
 with urllib.request.urlopen(m['origin']+path,timeout=5)as response:actual=response.read()
 assert actual==expected,path
 records.append({'path':path,'bytes':len(actual),'sha256':hashlib.sha256(actual).hexdigest()})
for path in ['/local/local','/setup/local/confirm-passkey']:
 with urllib.request.urlopen(m['origin']+path,timeout=5)as response:actual=response.read()
 assert actual==(out/'build/index.html').read_bytes(),path
verification={'status':'passed','origin':m['origin'],'workerVersion':m['workerVersion'],'normalTlsVerification':True,'publicApiConfigUnchanged':True,'publicApiConfigSha256':hashlib.sha256(after).hexdigest(),'retainedApiPid':m['retainedApiPid'],'apiRestarted':False,'builtAssets':records,'deepLinks':2}
(out/'https-verification.json').write_text(json.dumps(verification,indent=2)+'\n')
m.update(status='ready',verification=str(out/'https-verification.json'),previewGatewayOnlyUpdated=True,retainedApiRestarted=False)
(out/'handoff.json').write_text(json.dumps(m,indent=2)+'\n');(s/'preview.json').write_text(json.dumps(m,indent=2)+'\n');print(json.dumps({'status':'ready','gatewayPid':p.pid,'apiPidUnchanged':m['retainedApiPid'],'httpsAssetsVerified':len(records),'directory':str(out)},indent=2))
