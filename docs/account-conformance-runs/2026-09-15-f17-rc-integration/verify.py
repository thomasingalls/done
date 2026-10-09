"""Verify this retained phase; --raw additionally checks local large input inventories."""
from pathlib import Path
import gzip, hashlib, json, subprocess, sys
packet = Path(__file__).resolve().parent
root = packet.parents[2]
sha = lambda b: hashlib.sha256(b).hexdigest()
s = json.loads((packet / 'summary.json').read_bytes())
assert sha((packet / 'artifacts.json.gz').read_bytes()) == s['artifactsSha256']
assert sha((packet / 'raw-artifacts.json').read_bytes()) == s['rawIndexSha256']
assert sha((packet / 'integration.patch').read_bytes()) == s['patchSha256']
a = json.loads(gzip.decompress((packet / 'artifacts.json.gz').read_bytes()))
assert len(a['files']) == s['files'] and len(a['blobs']) == s['uniqueBlobs']
for h, b in a['blobs'].items(): assert sha(b['text'].encode()) == h
def data(n):
    p = a['files'][n]; b = a['blobs'][p['sha256']]['text'].encode()
    assert len(b) == p['bytes']; return b
def read(n): return json.loads(data(n))
for name in a['files']: data(name)
selection = read('phase/selection.json')
assert selection == s['selection']
prior = root / 'docs/performance-experiments/2026-09-15-f17-replay-r1'
pins = json.loads((prior / 'performance-freeze.json').read_bytes())['pins']
assert sha((prior / 'candidate.patch').read_bytes()) == selection['candidatePatchSha256']
for p, h in selection['modifiedInputs'].items():
    assert sha(data('source/' + p)) == h == sha((root / p).read_bytes()), p
for p in selection['runtimeUnchangedFromCandidate']:
    assert selection['modifiedInputs'][p] == pins['candidate/' + p]
assert len(selection['runtimeUnchangedFromCandidate']) == 6
# Exact runner evidence, with independent input identities kept separate.
total = files = stages = 0
for epoch in s['ownedEpochs']:
    prefix = epoch['archive'] + '/'; run = read(prefix + 'summary.json')
    assert run['status'] == 'passed' and run['input'] == epoch['input']
    assert len(run['stages']) == epoch['stages']
    assert sum(x['cases'] for x in run['stages']) == epoch['dispositions']
    for stage in run['stages']:
        p = prefix + 'stages/' + stage['key'] + '/'
        r = read(p + 'receipt.json'); c = read(p + 'cases.json'); stages += 1
        assert r['status'] == stage['status'] == 'passed'
        assert r['key'] == stage['key'] and r['stageId'] == stage['id']
        assert r['input'] == run['input'] and r['result']['code'] == 0
        assert r['result']['groupDrained'] and stage['groupDrained']
        for art in r['artifacts']: assert sha(data(p + art['path'])) == art['sha256']
        if r['contract']['expect']['kind'] == 'vitest':
            assert c['nonce'] == r['nonce'] and c['reason'] == 'passed' and not c['errors']
            assert all(m['state'] == 'passed' for m in c['modules'])
            actual = sorted([{'id':x['id'], 'outcome':x['outcome']} for x in c['cases']], key=lambda x:x['id'])
            assert actual == sorted(r['contract']['expect']['cases'], key=lambda x:x['id'])
            assert len(actual) == len({x['id'] for x in actual}) == stage['cases']
            for x in c['cases']:
                assert x['retryCount'] == x['repeatCount'] == 0
                assert x['mode'] == 'run' and not x['errors'] and not x['expectedFailure']
            total += len(actual); files += 1
        else:
            assert stage['id'] == 'workspace-admission:full'
            assert c['releaseNonce'] == r['nonce'] and c['exitCode'] == 0
            assert len(c['servers']) == 5 and all(x['closed'] for x in c['servers'])
            assert len(c['candidates']) == 1 and len(c['candidates'][0]['cases']) == 10
            assert all(x['status'] == 'pass' and all(z['passed'] for z in x['assertions']) for x in c['candidates'][0]['cases'])
            assert len(c['mutations']) == 4 and all(x['status'] == 'detected' for x in c['mutations'])
            browser = read(p + 'browser.json'); assert browser['exit'] == 0 and browser['groupDrained']
            for path in selection['runtimeUnchangedFromCandidate']:
                if path in c['candidates'][0]['source']['files']:
                    assert c['candidates'][0]['source']['files'][path] == selection['modifiedInputs'][path]
assert (files, total, stages) == (29, 365, 30)
# Generated native histories retain complete observations and source snapshots.
commands = read('phase/native-commands-final.json')
assert len(commands) == 2
for cmd, expected in zip(commands, s['native']):
    n = expected['name']; prefix = 'native/' + n + '/'; r = read(prefix + 'report.json')
    assert cmd['name'] == n and cmd['code'] == 0 and cmd['drained'] and not cmd['timedOut']
    assert r['status'] == 'passed' and len(r['cases']) == expected['cases']
    assert r['commit'] == s['base'] and r['finished']
    assert all(x['status'] == 'passed' and not x['errors'] for x in r['cases'])
    generated = r['cases'][-1]
    assert generated['properties'] == {'seed':8941, 'runs':100, 'failed':False, 'path':None}
    assert len(generated['histories']) == 100 and sum(x.get('rendererDeaths',0) for x in r['cases']) == 1
    for path, h in r['testedFiles'].items(): assert sha(data(prefix + 'snapshot/' + path)) == h, path
    for path in selection['runtimeUnchangedFromCandidate']:
        assert r['testedFiles'][path] == selection['modifiedInputs'][path]
    runner = data('source/scripts/' + n + '/run.mjs').decode()
    assert 'await browser?.close();' in runner and 'await server?.close();' in runner
    assert '?preparation=local-snapshots' in runner
initial = read('phase/native-commands.json')
assert len(initial) == 1 and initial[0]['code'] == 1 and initial[0]['drained'] and not initial[0]['timedOut']
failed = read('native/initial-pending-projection/report.json')
assert failed['status'] == 'harness-error' and failed['cases'] == [{'name':'saved-forks','errors':[]}]
assert 'Timeout 20000ms' in failed['error']['message']
assert 'outside of Vite serving allow list' in data('phase/native.log').decode()
# Controlled corruption must fail its intended assertions, not just exit nonzero.
faults = read('phase/faults.json'); assert len(faults) == 9
for fault in faults:
    assert fault['exit'] == 1 and fault['originalSourceSha256'] == selection['modifiedInputs'][fault['file']]
    assert fault['testSha256'] == sha(data('source/' + fault['test']))
    report = read('phase/' + fault['name'] + '-fault.json')
    failures = [x for f in report['testResults'] for x in f['assertionResults'] if x['status'] == 'failed']
    assert report['numFailedTests'] == len(failures) == fault['expectedFailures']
    assert sorted(x['fullName'] for x in failures) == sorted(fault['caughtBy'])
    assert sha(data('phase/' + fault['name'] + '-fault.ts')) != fault['originalSourceSha256']
for run in s['fullUnitRuns']:
    log = data(run['log']).decode()
    assert str(run['files']) + ' passed' in log and str(run['tests']) + ' passed' in log
checks = read('phase/checks.json'); assert len(checks) == 8 and all(x['exit'] == 0 for x in checks)
for x in checks: data('phase/' + x['name'] + '.log')
assert 'ℹ pass 27' in data('phase/runner-checks-final.log').decode()
assert read('phase/format-ast-check.json')['historyReplay'] and read('phase/format-ast-check.json')['runtimeForkPreparation']
reg = read('phase/registration-final.json'); assert reg == s['registration']
assert (reg['oldObligations'],reg['newObligations'],reg['unchangedRows'],reg['newCaseCount']) == (618,626,614,68)
assert len(reg['newFiles']) == 8 and len(reg['administrativeRename']) == 1
assert reg['limitsPreserved'] and reg['unresolvedUnchanged']
assert read('phase/census-review.json')['domainsUnchanged']
# Restored archived codec suites: exact strings source, AST-equivalent preparation formatting.
recovered = read('phase/recovered-controls.json'); data('phase/exploratoryPreparation.test.ts')
assert data('source/test/runtimeForkStrings.test.ts') == data('phase/exploratoryAnyStrings.test.ts')
for path, seed in [('runtimeForkStrings',193917),('runtimeForkPreparation',150917)]:
    text = data('source/test/' + path + '.test.ts').decode()
    assert str(seed) in text and 'numRuns: 150' in text
if 'phase/preservation.json' in a['files']:
    p = read('phase/preservation.json')
    assert p['priorArchivesUnchanged'] and p['appendOnlyRecords'] and p['otherSeatUnchanged']
    assert p['personalAndVectorPinsVerified'] == 52 and p['runtimeMatchesCandidate']
if '--raw' in sys.argv:
    for p in json.loads((packet/'raw-artifacts.json').read_bytes()):
        b=Path(p['path']).read_bytes(); assert len(b)==p['bytes'] and sha(b)==p['sha256']
print(f"Verified {s['files']} payloads; 29 owned Vitest files/365 cases, 10 native cases/4 mutations, 200 generated native histories, 9 faults. No release or activation claim.")
