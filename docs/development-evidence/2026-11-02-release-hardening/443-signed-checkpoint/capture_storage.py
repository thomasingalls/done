"""Evidence storage only. Does not decide display state or command success."""
from datetime import datetime
from hashlib import sha256
from pathlib import Path
import json
import math
import re
import subprocess

STAMP = re.compile(rb'^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4})(?:\s|$)')


def power_window(raw, started, finished):
    if not all(math.isfinite(v) for v in (started, finished)) or finished < started:
        raise ValueError('Invalid command observation window')
    kept = []
    selected = False
    events = 0
    dated = 0
    for line in raw.splitlines(keepends=True):
        match = STAMP.match(line)
        if match:
            epoch = datetime.strptime(match.group(1).decode('ascii'), '%Y-%m-%d %H:%M:%S %z').timestamp()
            dated += 1
            selected = started <= epoch <= finished
            if selected:
                events += 1
                kept.append(line)
        elif selected and line[:1] in (b' ', b'\t'):
            kept.append(line)
        else:
            selected = False
    result = b''.join(kept)
    return result, {
        'schema': 1,
        'fullLogSha256': sha256(raw).hexdigest(),
        'fullLogBytes': len(raw),
        'windowStartedEpoch': started,
        'windowFinishedEpoch': finished,
        'timestampPrecision': 'one second; inclusive epoch comparison, no window widening',
        'fullDatedEvents': dated,
        'selectedEvents': events,
        'windowSha256': sha256(result).hexdigest(),
        'windowBytes': len(result),
    }


def write_power_window(path, raw, started, finished, returncode):
    path = Path(path)
    result, meta = power_window(raw, started, finished)
    meta['pmsetExit'] = returncode
    path.write_bytes(result)
    path.with_suffix('.meta.json').write_text(json.dumps(meta, indent=2) + '\n')
    return meta


def tracked(repo, path):
    root = Path(repo).resolve()
    path = Path(path).absolute()
    path = path.parent.resolve() / path.name
    try:
        relative = path.relative_to(root).as_posix()
    except ValueError:
        return False
    return subprocess.run(['git', 'ls-files', '--error-unmatch', '--', relative], cwd=root,
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0


def committed_source(repo, path, revision='HEAD'):
    root = Path(repo).resolve()
    path = Path(path).absolute()
    path = path.parent.resolve() / path.name
    relative = path.relative_to(root).as_posix()
    if path.is_symlink() or not path.is_file() or not tracked(root, path):
        raise ValueError('A regular tracked source file is required')
    commit = subprocess.check_output(['git', 'rev-parse', '--verify', revision + '^{commit}'], cwd=root).decode().strip()
    blob = subprocess.check_output(['git', 'show', commit + ':' + relative], cwd=root)
    raw = path.read_bytes()
    if raw != blob:
        raise ValueError('Source is not byte-identical to the referenced commit; commit the input before packaging evidence')
    return {'commit': commit, 'path': relative, 'sha256': sha256(raw).hexdigest(), 'bytes': len(raw)}
