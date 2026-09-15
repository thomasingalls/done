#!/usr/bin/env python3
"""Verify backlog commit provenance; never relabel historical receipts or rerun measurements."""
from pathlib import Path
import gzip, hashlib, json, subprocess, sys

packet = Path(__file__).resolve().parent
root = packet.parents[2]
read = lambda name: json.loads((packet / name).read_bytes())
sha = lambda data: hashlib.sha256(data).hexdigest()
git = lambda *args: subprocess.check_output(['git', '-C', str(root), *args])
summary, pins = read('summary.json'), read('pins.json')
assert sha((packet / 'pins.json').read_bytes()) == summary['pinsSha256']
for check in summary['verificationChecks']:
    assert check['exitCode'] == 0
    assert sha((packet / check['log']).read_bytes()) == check['sha256']
assert {check['id'] for check in summary['verificationChecks']} == {
    'commit-map', 'functional-packet', 'performance-packet', 'inventory', 'manifest', 'whitespace'}
assert json.loads((packet / 'manifest.check.log').read_bytes()) == {
    'status': 'blocked', 'obligations': 618, 'unresolved': 159,
    'infrastructureStages': 21, 'vectorStages': 29}
commits = summary['commits']
assert len(commits) == 5 and commits[-1]['commit'] == summary['contentTip']
parent = summary['base']
trees = {}
for commit in [parent, *(row['commit'] for row in commits)]:
    tree = {}
    for line in git('ls-tree', '-rz', commit).split(b'\0'):
        if line:
            mode, kind, oid, path = line.decode().split(maxsplit=3)
            assert kind == 'blob'
            tree[path] = (mode, oid)
    trees[commit] = tree
for row in commits:
    commit = row['commit']
    assert row['parent'] == parent == git('rev-parse', commit + '^').decode().strip()
    assert row['tree'] == git('rev-parse', commit + '^{tree}').decode().strip()
    assert row['title'] == git('log', '-1', '--format=%s', commit).decode().strip()
    assert git('log', '-1', '--format=%G?', commit).decode().strip() == row['signature'] == 'G'
    check = subprocess.run(['git', '-C', str(root), 'verify-commit', commit], capture_output=True)
    assert check.returncode == 0, check.stderr
    assert len(git('diff-tree', '--no-commit-id', '--name-only', '-r', '-z', commit).split(b'\0')) - 1 == row['fileCount']
    parent = commit
subprocess.run(['git', '-C', str(root), 'merge-base', '--is-ancestor', summary['contentTip'], 'HEAD'], check=True)
assert len(pins['originalWorkingTree']) == summary['originalPendingFiles'] == 219
assert len(pins['evidenceFiles']) == summary['totalEvidenceFiles'] == 177
assert len({p['path'].split('/')[2] for p in pins['evidenceFiles']}) == summary['evidencePackets'] == 8
assert len(pins['personalAndVectorFiles']) == 52
# Read each distinct relevant Git blob once. The intermediate trees are recorded checkpoints,
# not imaginary reruns at their new commit IDs.
wanted = set()
for row in pins['originalWorkingTree']:
    wanted.add(trees[summary['contentTip']][row['path']][1])
for commit, tree in trees.items():
    for name in ['docs/completed.md', 'docs/decisions.md', 'docs/performance.md']:
        wanted.add(tree[name][1])
for row in commits:
    for path in row['registrySnapshots']:
        wanted.add(trees[row['commit']][path][1])
if '--raw' in sys.argv:
    for row in commits:
        wanted.update(oid for path, (_, oid) in trees[row['commit']].items() if not path.startswith('docs/'))
ordered = sorted(wanted)
raw = subprocess.check_output(
    ['git', '-C', str(root), 'cat-file', '--batch'], input=('\n'.join(ordered) + '\n').encode())
blobs, offset = {}, 0
for expected in ordered:
    end = raw.index(b'\n', offset)
    oid, kind, count = raw[offset:end].decode().split()
    assert oid == expected and kind == 'blob'
    offset = end + 1
    count = int(count)
    blobs[oid] = raw[offset:offset + count]
    offset += count
    assert raw[offset:offset + 1] == b'\n'
    offset += 1
assert offset == len(raw)
def content(commit, path):
    return blobs[trees[commit][path][1]]
for pin in pins['originalWorkingTree']:
    data = content(summary['contentTip'], pin['path'])
    assert sha(data) == pin['sha256'] and len(data) == pin['bytes'], pin['path']
for pin in pins['evidenceFiles'] + pins['personalAndVectorFiles']:
    assert sha((root / pin['path']).read_bytes()) == pin['sha256'], pin['path']
for pin in pins['appendOnlyPrefixes']:
    assert sha((root / pin['path']).read_bytes()[:pin['prefixBytes']]) == pin['prefixSha256']
for before, after in zip([summary['base'], *(r['commit'] for r in commits[:-1])], commits):
    for name in ['docs/completed.md', 'docs/decisions.md', 'docs/performance.md']:
        assert content(after['commit'], name).startswith(content(before, name)), (after['key'], name)
assert sha((root / 'docs/progress.md').read_bytes().split(b'\n---\n\n## Active slice: Stage 4', 1)[1]) == pins['L2SuffixSha256']
for row in commits:
    for path, digest in row['registrySnapshots'].items():
        assert sha(content(row['commit'], path)) == digest, path
if '--raw' in sys.argv:
    inputs = []
    for ref in summary['frozenInputReferences']:
        data = (root / ref['path']).read_bytes()
        assert sha(data) == ref['sha256'], ref['path']
        frozen = json.loads(gzip.decompress(data))
        inputs.append(frozen[ref['sourcesKey']])
    for row in commits:
        commit = row['commit']
        expected = [pin for pin in inputs[row['frozenInputReference']]
                    if not pin['path'].startswith('docs/') and not pin.get('absent')]
        assert {pin['path'] for pin in expected} == {path for path in trees[commit] if not path.startswith('docs/')}
        assert len(expected) == row['reconstruction']['nonDocumentFiles']
        for pin in expected:
            data = content(commit, pin['path'])
            if 'link' in pin:
                assert data.decode() == pin['link'] and trees[commit][pin['path']][0] == '120000'
            else:
                assert sha(data) == pin['sha256'], (row['key'], pin['path'])
                assert trees[commit][pin['path']][0] == ('100755' if pin['executable'] else '100644')
        expectedRegistries = {pin['path']: pin['sha256'] for pin in inputs[row['frozenInputReference']]
                              if pin['path'] in row['registrySnapshots']}
        assert expectedRegistries == row['registrySnapshots'], row['key']
print('Verified five signed commits, exact final content of 219 original files, eight unchanged evidence packets, append-only records and preservation.' +
      (' All non-document and registry inputs match the retained phase runs.' if '--raw' in sys.argv else ''))
