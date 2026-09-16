from pathlib import Path
import base64, hashlib, json, lzma, sys
root = Path(__file__).resolve().parent
sha = lambda b: hashlib.sha256(b).hexdigest()
s = json.loads((root / 'summary.json').read_bytes())
archive = (root / 'artifacts.json.xz').read_bytes()
assert len(archive) == s['compressedBytes'] <= 1000000
assert sha(archive) == s['artifactsSha256']
a = json.loads(lzma.decompress(archive))
assert a['schema'] == 3 and a['encoding'] == 'chunked-utf8-or-base64'
chunks = {}
for key, value in a['blobs'].items():
    b = value.encode('utf-8') if isinstance(value, str) else base64.b64decode(value['base64'], validate=True)
    assert sha(b) == key
    chunks[key] = b
data = {}
for name, meta in a['files'].items():
    b = b''.join(chunks[key] for key in meta['chunks'])
    assert len(b) == meta['bytes'] and sha(b) == meta['sha256']
    data[name] = b
assert len(data) == s['payloads']
j = lambda name: json.loads(data[name])
q = j('owned/summary.json')
assert q == s['qualification'] and q['status'] == 'passed' and len(q['stages']) == 7
contracts = {c['id']: c for c in j('phase/selection.json')}
normalize = lambda rows: sorted([{'id': x['id'], 'outcome': x['outcome']} for x in rows], key=lambda x: x['id'])
cases = 0
for stage in q['stages']:
    prefix = 'owned/stages/' + stage['key'] + '/'
    r = j(prefix + 'receipt.json')
    c = j(prefix + 'cases.json')
    assert r['input'] == q['input'] and r['status'] == stage['status'] == 'passed'
    assert r['result']['groupDrained'] and stage['groupDrained']
    assert r['result']['code'] == 0 and r['result']['reason'] is None
    for key, value in r['contract'].items():
        assert contracts[stage['id']][key] == value
    assert stage['elapsedMs'] <= r['contract']['deadlineMs']
    assert c['nonce'] == r['nonce'] and c['phase'] == 'complete' and not c['errors']
    assert c['summary']['success'] and normalize(c['cases']) == normalize(r['contract']['expect']['cases'])
    assert c['summary']['counts']['tests'] == len(c['cases'])
    for key in ['failed', 'cancelled', 'skipped', 'todo']:
        assert c['summary']['counts'][key] == 0
    for artifact in r['artifacts']:
        assert sha(data[prefix + artifact['path']]) == artifact['sha256']
    if not stage['reused']:
        cases += len(c['cases'])
assert cases == 172 and sum(x['reused'] for x in q['stages']) == 1
assert q['stages'][-1]['key'] == q['stages'][0]['key']
assert [x['cases'] for x in q['stages'][:-1]] == [70, 45, 5, 12, 4, 36]
assert [c['deadlineMs'] for c in j('phase/selection.json')[:-1]] == [60000] * 5 + [120000]
f = j('owned-failed-census/summary.json')
assert f['status'] == 'failed' and len(f['stages']) == 3
assert [x['status'] for x in f['stages']] == ['passed', 'passed', 'failed']
for stage in f['stages']:
    prefix = 'owned-failed-census/stages/' + stage['key'] + '/'
    r = j(prefix + 'receipt.json')
    assert r['result']['groupDrained']
    for artifact in r['artifacts']:
        assert sha(data[prefix + artifact['path']]) == artifact['sha256']
failed = j('owned-failed-census/stages/' + f['stages'][-1]['key'] + '/cases.json')
assert failed['summary']['counts']['failed'] == 1 and failed['summary']['counts']['passed'] == 4
assert j('phase/baseline-qualified-manifest.json') == j('phase/candidate-qualified-manifest.json')
for name, count in [('baseline-qualified', 70), ('candidate-qualified', 42)]:
    p = j('phase/' + name + '-profile.json')
    assert len(p) == 3
    for sample in p:
        assert sample['subprocessCount'] == len(sample['calls']) == count
        assert sample['uniqueCommands'] == 35
        assert sample['digest'] == p[0]['digest']
assert j('phase/baseline-qualified-profile.json')[0]['digest'] == j('phase/candidate-qualified-profile.json')[0]['digest']
mutations = j('phase/mutations.json')
assert len(mutations) == 2 and all(x['detected'] and x['exit'] == 1 for x in mutations)
for m in mutations:
    log = data['phase/' + m['fault'] + '.log'].decode()
    assert '✖ historical planning snapshots' in log
m = j('current/docs/release-validation-manifest.json')
rows = {r['id']: r for r in m['rows']}
assert len(rows) == 629
assert {k: sum(rows[i]['kind'] == k for i in m['unresolved']) for k in ['test', 'command', 'campaign']} == {'test': 0, 'command': 72, 'campaign': 40}
general = [rows[i]['stage'] for i in m['selections']['general-tests']]
assert len(general) == 272 and sum(len(x['expect']['cases']) for x in general) == 2201
raw = (root / 'raw-artifacts.json').read_bytes()
assert sha(raw) == s['rawIndexSha256']
if '--raw' in sys.argv:
    for entry in json.loads(raw):
        b = Path(entry['path']).read_bytes()
        assert len(b) == entry['bytes'] and sha(b) == entry['sha256']
if '--current' in sys.argv:
    repo = root.parents[2]
    for name, b in data.items():
        if name.startswith('current/'):
            assert (repo / name[len('current/'):]).read_bytes() == b, name
print(f'Verified {len(data)} payloads; 172 passed cases, exact reuse, failed census epoch, two faults and identical manifests. No aggregate claim.')
