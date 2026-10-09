from pathlib import Path
import subprocess,json,hashlib,datetime,os,signal
root=Path.cwd();out=root/'test-results/validation-inventory'/datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds').replace(':','-');out.mkdir(parents=True)
sha=lambda b:hashlib.sha256(b).hexdigest()
graph=json.loads(Path('docs/release-validation-graph.json').read_text());pins=graph['inputs']+[{'path':p,'sha256':sha(Path(p).read_bytes())} for p in ['docs/release-validation-graph.md','docs/release-validation-graph.json']]
(out/'sources.json').write_text(json.dumps(pins,indent=2)+'\n');(out/'runner.py').write_bytes(Path(__file__).read_bytes())
commands=[('inventory',['node','scripts/release-validation/check.mjs']),('checker-tests',['node','--test','test/release-validation/inventory.test.mjs']),('types',['node','node_modules/typescript/bin/tsc','-b','--noEmit']),('lint',['node','node_modules/oxlint/bin/oxlint','scripts/release-validation','test/release-validation']),('format',['node','node_modules/oxfmt/bin/oxfmt','--check','scripts/release-validation','test/release-validation','package.json']),('authority',['node','scripts/check-authority-map.mjs'])]
summary={'status':'running','parent':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'started':datetime.datetime.now(datetime.timezone.utc).isoformat(),'node':subprocess.check_output(['node','--version'],text=True).strip(),'sourcePins':len(pins),'stages':[],'limits':['Planning inventory and checker tests only; no runtime/native/aggregate campaign.']}
def save():(out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
save();print(out,flush=True)
try:
 for name,cmd in commands:
  with (out/(name+'.log')).open('wb') as log:
   child=subprocess.Popen(cmd,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
   try:code=child.wait(timeout=60)
   except subprocess.TimeoutExpired:
    os.killpg(child.pid,signal.SIGTERM)
    try:child.wait(timeout=5)
    except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);child.wait()
    raise
  summary['stages'].append({'name':name,'command':cmd,'timeoutSeconds':60,'exitCode':code});save();print(name,code,flush=True);assert code==0,name
 for pin in pins:assert sha(Path(pin['path']).read_bytes())==pin['sha256'],pin['path']
 summary['status']='passed';summary['pinsUnchanged']=True
finally:
 summary['finished']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
