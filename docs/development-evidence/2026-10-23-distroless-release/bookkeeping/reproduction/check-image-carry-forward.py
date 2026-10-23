from pathlib import Path
import hashlib, io, json, subprocess, tarfile

root = Path('/Users/thomasingalls/.codex/worktrees/7fda/done')
scratch = Path(__file__).resolve().parent
packet = root / 'docs/development-evidence/2026-10-23-distroless-release'
source = json.loads((packet / 'final-artifact/source.json').read_text())
image = json.loads((packet / 'final-artifact/image.json').read_text())
assert source['source'] == image['source'] == 'd1c2784bef0ccc3ea88d99dfd82f1db3a83af384'
assert image['indexDigest'] == 'sha256:a26278f6c36952f074355ca6378ae09c96bd9e3bfbc6ca4fbfb5910fcf3f6ae6'
def git(*args):
    return subprocess.check_output(['git', '-C', str(root), *args])
inputs = source['inputs']
assert git('diff', '--name-only', source['source'], '--', *inputs) == b''
assert git('ls-files', '--others', '--exclude-standard', '--', *inputs) == b''
archive = git('archive', '--format=tar', source['source'], '--', *inputs)
assert len(archive) == source['archiveBytes']
assert hashlib.sha256(archive).hexdigest() == source['archiveSha256']
files = []
with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
    for member in tar:
        if member.isdir():
            continue
        assert member.isfile() and not Path(member.name).is_absolute() and '..' not in Path(member.name).parts
        data = tar.extractfile(member).read()
        assert data == (root / member.name).read_bytes(), member.name
        files.append({'path': member.name, 'sha256': hashlib.sha256(data).hexdigest()})
record = {'source': source['source'], 'testedImage': image['indexDigest'], 'sourceArchiveSha256': source['archiveSha256'], 'buildInputFiles': len(files), 'allBuildInputBytesMatchSignedArchive': True, 'noChangedOrUntrackedBuildInputs': True, 'imageRebuilt': False, 'imageRelabeled': False, 'bookkeepingOnly': True}
(scratch / 'checks/image-carry-forward.json').write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(record, indent=2))
