"""Retain numeric evidence only, never browser/service snapshots or credentials."""
import hashlib,json,pathlib,tarfile
root=pathlib.Path('/tmp/done-authority-reuse-20261012')
out=pathlib.Path(__file__).resolve().parent.parent
files=list(root.glob('*.log'))+[root/'candidate.patch']
for directory in root.iterdir():
 if not directory.is_dir():continue
 for name in ['result.json','before-verification.json','typing.cpuprofile','profile.json','attribution.json']:
  p=directory/name
  if p.is_file():files.append(p)
files=sorted(set(files))
manifest=[{'path':str(p.relative_to(root)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]
archive=out/'evidence.tar.gz'
with tarfile.open(archive,'w:gz') as tar:
 for p in files:tar.add(p,arcname=str(p.relative_to(root)))
(out/'manifest.json').write_text(json.dumps({'archive':archive.name,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'bytes':archive.stat().st_size,'files':manifest,'excluded':'Private disposable service state, fixture/browser snapshots, credentials, compiled bundles and Playwright artifacts are not included. Bundles/fixtures have hashes in source-identity.json.'},indent=2)+'\n')
