"""Compare a checkout or merged commit with the exact tested build archive."""
from pathlib import Path
import hashlib
import io
import json
import subprocess
import sys
import tarfile

packet = Path(__file__).resolve().parent
root = packet.parents[2]
source = json.loads((packet / 'source.json').read_text())
image = json.loads((packet / 'image.json').read_text())
target = sys.argv[1] if len(sys.argv) > 1 else None
def git(*args):
    return subprocess.check_output(['git', '-C', str(root), *args])
assert source['source'] == image['source']
archive = git('archive', '--format=tar', source['source'], '--', *source['inputs'])
assert len(archive) == source['archiveBytes']
assert hashlib.sha256(archive).hexdigest() == source['archiveSha256']
def read_archive(data):
    files = {}
    with tarfile.open(fileobj=io.BytesIO(data)) as tar:
        for member in tar:
            if member.isdir():
                continue
            assert member.isfile() and not Path(member.name).is_absolute() and '..' not in Path(member.name).parts
            files[member.name] = (tar.extractfile(member).read(), member.mode & 0o111)
    return files
tested = read_archive(archive)
assert len(tested) == len(source['files']) == 1676
if target:
    other = read_archive(git('archive', '--format=tar', target, '--', *source['inputs']))
    assert tested == other, 'Merged build input population, bytes or executable modes differ'
    compared = git('rev-parse', target).decode().strip()
else:
    assert git('diff', '--name-only', source['source'], '--', *source['inputs']) == b''
    assert git('ls-files', '--others', '--exclude-standard', '--', *source['inputs']) == b''
    for name, (data, mode) in tested.items():
        assert (root / name).read_bytes() == data, name
        assert (root / name).stat().st_mode & 0o111 == mode, name
    compared = 'working checkout at ' + git('rev-parse', 'HEAD').decode().strip()
record = {
    'source': source['source'], 'testedImage': image['indexDigest'],
    'sourceArchiveSha256': source['archiveSha256'], 'compared': compared,
    'buildInputFiles': len(tested), 'allBuildInputBytesAndExecutableModesMatchSignedArchive': True,
    'imageRebuiltDuringComparison': False, 'imageRelabeled': False,
}
print(json.dumps(record, indent=2))
