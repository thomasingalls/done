"""Retain numeric evidence only, never browser/service snapshots or credentials."""
import hashlib,json,pathlib,tarfile
root=pathlib.Path('/tmp/done-prepared-receive-20261012')
pilot=pathlib.Path('/tmp/done-prepared-receive-pilot-20261012')
out=pathlib.Path(__file__).resolve().parent.parent
files={}
for base,prefix in [(root,''),(pilot,'pilot/')]:
 if not base.exists():continue
 for p in base.glob('*.log'):files[prefix+p.name]=p
 for directory in base.iterdir():
  if not directory.is_dir():continue
  for name in ['result.json','before-verification.json','typing.cpuprofile','profile.json','attribution.json']:
   p=directory/name
   if p.is_file():files[prefix+str(p.relative_to(base))]=p
files['candidate.patch']=root/'candidate.patch'
files=dict(sorted(files.items()))
manifest=[{'path':name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for name,p in files.items()]
archive=out/'evidence.tar.gz'
with tarfile.open(archive,'w:gz') as tar:
 for name,p in files.items():tar.add(p,arcname=name)
(out/'manifest.json').write_text(json.dumps({'archive':archive.name,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'bytes':archive.stat().st_size,'files':manifest,'excluded':'Private disposable service state, fixture/browser snapshots, credentials, compiled bundles and Playwright artifacts are not included. Final bundles/fixtures have hashes in source-identity.json. Pilot observations are excluded from the summary.'},indent=2)+'\n')
