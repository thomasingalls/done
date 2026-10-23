from pathlib import Path
import hashlib, io, json, subprocess, tarfile

root = Path('/Users/thomasingalls/.codex/worktrees/7fda/done')
scratch = Path(__file__).resolve().parent
packet = root / 'docs/development-evidence/2026-10-23-distroless-release'
source = json.loads((packet / 'signed-d8b3f22b/source.json').read_text())
image = json.loads((packet / 'signed-d8b3f22b/image.json').read_text())
assert source['source'] == image['source'] == 'd8b3f22b0790770192a809aa8d83064fd42d9804'
assert image['indexDigest'] == 'sha256:6f1cb5d644cbee92d2b344d591d182d900ab059670ed5870acc01b556e82cacb'
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
        assert (member.mode & 0o111) == ((root / member.name).stat().st_mode & 0o111), member.name
        assert data == (root / member.name).read_bytes(), member.name
        files.append({'path': member.name, 'sha256': hashlib.sha256(data).hexdigest()})
record = {'source': source['source'], 'testedImage': image['indexDigest'], 'sourceArchiveSha256': source['archiveSha256'], 'buildInputFiles': len(files), 'allBuildInputBytesAndExecutableModesMatchSignedArchive': True, 'noChangedOrUntrackedBuildInputs': True, 'imageRebuiltDuringComparison': False, 'imageRelabeled': False, 'bookkeepingOnly': True}
(scratch / 'carry-forward.json').write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(record, indent=2))
