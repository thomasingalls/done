"""Independent artifact checks after real application seeding; no account data is rewritten."""
from pathlib import Path
import hashlib,json
sha=lambda b:hashlib.sha256(b).hexdigest()
def verify_files(root, files):
    actual={str(p.relative_to(root)) for p in root.rglob('*') if p.is_file() and not p.is_symlink() and 'node_modules' not in p.parts}
    assert actual==set(files), 'Source/asset file set changed'
    assert all(sha((root/name).read_bytes())==digest for name,digest in files.items()), 'Source/asset bytes changed'
def verify_fixture(out: Path, pin: str, date: str):
    read=lambda name:json.loads((out/name).read_text())
    source=read('source-inputs.json');assert source['pin']==pin
    verify_files(out/'source',source['files'])
    verify_files(out/'dist',read('build-assets.json'))
    fixture=read('private-fixture/fixture.json');check=read('seed/seed-check.json')
    expected=[('H',6,1024),('M',2,256),('Q',2,32)]
    assert check['outcome']=='passed'
    assert [(a['label'],a['devices'],a['backlog'])for a in fixture['accounts']]==expected
    assert [(a['label'],a['devices'],a['backlog'])for a in check['accounts']]==expected
    assert all(a['date']==date and len(a['actors'])==a['devices']for a in fixture['accounts'])
    assert all(a['acceptedDelta']==a['backlog']==a['after']-a['before']for a in check['accounts'])
    assert Path(fixture['state']).resolve()==(out/'seed/state').resolve() and (out/'seed/state').is_dir()
    native=read('seed/container-identity.json')
    assert native['requestLimits']=={'sessionBurst':120,'sessionPerSecond':16,'processBurst':480,'processPerSecond':64,'active':16,'sessionActive':4,'sessions':1024}
    host=native['HostConfig'];assert host['NanoCpus']==1000000000 and host['Memory']==1073741824 and host['MemorySwap']==1073741824 and host['PidsLimit']==128 and host['ReadonlyRootfs'] is True
    return {'fixtureSha256':sha((out/'private-fixture/fixture.json').read_bytes()),'seedCheckSha256':sha((out/'seed/seed-check.json').read_bytes()),'sourceSha256':sha((out/'source-inputs.json').read_bytes()),'buildAssetsSha256':sha((out/'build-assets.json').read_bytes()),'verificationToolSha256':sha(Path(__file__).read_bytes()),'date':date,'sourceFiles':len(source['files']),'emptySourceFilesAccepted':sum((out/'source'/n).stat().st_size==0 for n in source['files']),'checkedCases':'real setup/certification, exact device counts, baseline exports, exact accepted backlog deltas, current unfrozen cards; independent file sets/hashes and actual native policy','noAcceptanceCredit':True}
