#!/usr/bin/env python3
"""Generate a fresh fictional civil-day workload from signed0ab, without persisted-trust edits."""
from pathlib import Path
import argparse,datetime,hashlib,io,json,os,shutil,subprocess,tarfile,time,sys
sys.dont_write_bytecode=True
from verify_fixture import verify_fixture
PIN='0ab9cbc8937e32c6542aaeeca697c87ba116c3be'
IMAGE='sha256:1869aa2c05c0e6ba5b6c3b85df7bf9bca50a4692c80201fe5af39424c2a37cbf'
HERE=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--repo',type=Path,default=HERE.parents[3]);p.add_argument('--output',type=Path,required=True);p.add_argument('--node',type=Path,required=True);p.add_argument('--browser',type=Path,default=Path('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'));p.add_argument('--image',default=IMAGE);p.add_argument('--needed-seconds',type=int,default=10800);p.add_argument('--check',action='store_true');p.add_argument('--verify-existing',action='store_true');a=p.parse_args()
 repo=a.repo.resolve();out=a.output.absolute();node=a.node.resolve();assert out.is_absolute()and ((a.verify_existing and out.is_dir())or not out.exists()),'Use a fresh output directory, or explicitly verify an existing one';assert node.is_file()and a.browser.is_file();assert (repo/'node_modules').is_dir();assert subprocess.check_output([str(node),'--version'],text=True).strip()=='v24.18.0';assert subprocess.check_output(['git','rev-parse',PIN+'^{commit}'],cwd=repo,text=True).strip()==PIN
 now=datetime.datetime.now(datetime.timezone.utc);tomorrow=now.replace(hour=0,minute=0,second=0,microsecond=0)+datetime.timedelta(days=1);assert a.needed_seconds>=1800;assert a.verify_existing or (tomorrow-now).total_seconds()>a.needed_seconds,'Not enough real UTC day remains; regenerate on the next civil day'
 lock=subprocess.check_output(['git','show',PIN+':pnpm-lock.yaml'],cwd=repo);assert lock==(repo/'pnpm-lock.yaml').read_bytes(),'Installed-workspace lock differs; do not silently substitute dependencies'
 receipt={'kind':'untimed fictional fixture preparation','sourceCommit':PIN,'date':now.date().isoformat(),'timezone':'UTC','realEpoch':True,'neededSeconds':a.needed_seconds,'output':str(out),'nodeVersion':'24.18.0','image':a.image,'nativeBudgets':{'session':16,'process':64},'seedOnlyLocalAutomation':'off','serviceAutomation':'off','noAcceptanceCredit':True}
 if a.check:print(json.dumps(receipt,indent=2));return
 if a.verify_existing:
  verified=verify_fixture(out,PIN,now.date().isoformat());(out/'fixture-identity.json').write_text(json.dumps(verified,indent=2)+'\n');print('Verified existing fictional fixture:',out/'private-fixture/fixture.json');return
 os.umask(0o077);out.mkdir(mode=0o700);(out/'recipe.json').write_text(json.dumps(receipt,indent=2)+'\n');source=out/'source';source.mkdir();archive=subprocess.check_output(['git','archive',PIN],cwd=repo)
 with tarfile.open(fileobj=io.BytesIO(archive))as tar:tar.extractall(source,filter='data')
 (source/'node_modules').symlink_to((repo/'node_modules').resolve(),target_is_directory=True);h=source/'test/account-continuation-lab';h.mkdir(exist_ok=True)
 for name in ['seed.spec.ts','seed.config.ts','common.ts','devices.ts','runtime.mjs']:shutil.copy2(HERE/name,h/name)
 for name in ['container-service.mjs','observer.mjs']:shutil.copy2(HERE/name,out/name)
 inspected=json.loads(subprocess.check_output(['docker','image','inspect',a.image],text=True))[0];assert inspected['Id']==a.image;(out/'container-image.json').write_text(json.dumps({'Id':inspected['Id'],'Architecture':inspected['Architecture'],'Os':inspected['Os']},indent=2)+'\n')
 flags=json.loads((HERE/'seed-flags.json').read_text());env={k:v for k,v in os.environ.items()if not k.startswith('VITE_ACCOUNT_')};env.update(flags);env.update({'APP_BUILD_REVISION':PIN,'APP_BUILD_DATE':now.date().isoformat(),'PATH':str(node.parent)+':'+os.environ['PATH'],'FAIR_FIXTURE_ROOT':str(out),'FAIR_DIST':str(out/'dist'),'FAIR_OUT':str(out/'seed'),'CHROMIUM_PATH':str(a.browser)})
 identities={str(f.relative_to(source)):sha(f.read_bytes())for f in source.rglob('*')if f.is_file()and not f.is_symlink()and'node_modules'not in f.parts};(out/'source-inputs.json').write_text(json.dumps({'pin':PIN,'files':identities,'recipeFiles':{f.name:sha(f.read_bytes())for f in HERE.iterdir()if f.is_file()},'flags':flags,'nodeSha256':sha(node.read_bytes()),'browserSha256':sha(a.browser.read_bytes())},indent=2)+'\n')
 with(out/'build.log').open('w')as log:q=subprocess.run([str(node),str(source/'node_modules/vite/bin/vite.js'),'build','--outDir',str(out/'dist'),'--emptyOutDir','--sourcemap'],cwd=source,env=env,stdout=log,stderr=subprocess.STDOUT)
 assert q.returncode==0,'Build failed; preserve build.log';(out/'build-assets.json').write_text(json.dumps({str(f.relative_to(out/'dist')):sha(f.read_bytes())for f in(out/'dist').rglob('*')if f.is_file()},indent=2)+'\n')
 with(out/'seed.log').open('w')as log:q=subprocess.run([str(node),str(source/'node_modules/@playwright/test/cli.js'),'test','--config','test/account-continuation-lab/seed.config.ts'],cwd=source,env=env,stdout=log,stderr=subprocess.STDOUT)
 receipt.update(seedExit=q.returncode,finishedAt=time.time_ns()//1000000);(out/'recipe.json').write_text(json.dumps(receipt,indent=2)+'\n');assert q.returncode==0,'Fixture generation failed; preserve seed.log and seed/seed-check.json';assert datetime.datetime.now(datetime.timezone.utc).date()==now.date(),'Civil day rolled over; retain attempt and regenerate';verified=verify_fixture(out,PIN,now.date().isoformat());(out/'fixture-identity.json').write_text(json.dumps(verified,indent=2)+'\n');print('Generated fresh fictional fixture:',out/'private-fixture/fixture.json')
if __name__=='__main__':main()
