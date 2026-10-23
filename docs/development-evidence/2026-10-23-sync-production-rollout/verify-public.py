from pathlib import Path
import concurrent.futures
import datetime
import hashlib
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parent
RELEASE = ROOT.parent
ORIGIN = 'https://done.oxidationlabs.com'
EXPECTED = json.loads((RELEASE / 'candidate-frontend-files.json').read_text())
DIST = RELEASE / 'source/dist'
OUT = ROOT / 'public-http'
OUT.mkdir(exist_ok=False)
SW = (DIST / 'sw.js').read_text()
assert hashlib.sha256(SW.encode()).hexdigest() == EXPECTED['sw.js']
PRECACHE = json.loads(re.search(r'const PRECACHE = (\[[\s\S]*?\]);', SW).group(1))
assert len(PRECACHE) == 60 and len(set(PRECACHE)) == 60
VERSION = re.search(r'const VERSION = "([^"]+)"', SW).group(1)
RESULTS = []


def request(label, path, *, method='GET', origin=None, scheme='https'):
    body_file = OUT / (label + '.body')
    header_file = OUT / (label + '.headers')
    url = ORIGIN.replace('https:', scheme + ':') + path
    cmd = ['curl', '--silent', '--show-error', '--compressed',
           '--connect-timeout', '10', '--max-time', '30',
           '--dump-header', str(header_file), '--output', str(body_file),
           '--write-out', '%{http_code}', '--request', method]
    if origin is not None:
        cmd += ['--header', 'Origin: ' + origin]
    if method == 'POST':
        cmd += ['--header', 'Content-Type: application/json', '--data-binary', '{}']
    p = subprocess.run(cmd + [url], capture_output=True, text=True)
    body = body_file.read_bytes() if body_file.exists() else b''
    raw_headers = header_file.read_text() if header_file.exists() else ''
    headers = {}
    for line in raw_headers.splitlines():
        if ':' in line:
            k, v = line.split(':', 1)
            headers[k.lower()] = v.strip()
    result = {'label': label, 'url': url, 'method': method,
              'requestOrigin': origin, 'curlExit': p.returncode,
              'status': int(p.stdout) if p.stdout.isdigit() else None,
              'sha256': hashlib.sha256(body).hexdigest(), 'bytes': len(body),
              'headers': headers, 'error': p.stderr.strip() or None}
    (OUT / (label + '.json')).write_text(json.dumps(result, indent=2) + '\n')
    return result


def static(pair):
    i, path = pair
    row = request('asset-' + str(i).zfill(2), path)
    key = 'index.html' if path == '/' else path.lstrip('/')
    row['expectedSha256'] = EXPECTED[key]
    row['matchesTestedArtifact'] = row['sha256'] == EXPECTED[key]
    return row


summary = {'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
           'origin': ORIGIN, 'build': '51d8550d', 'serviceWorkerVersion': VERSION,
           'normalDnsHttps': True, 'tlsVerification': 'curl default trust and hostname validation',
           'credentialsUsed': False, 'accountsCreated': False,
           'scope': 'Public static bytes, routing and read-only service configuration; no account contents or authenticated device behavior',
           'requests': RESULTS, 'status': 'in-progress'}
try:
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        RESULTS.extend(pool.map(static, enumerate(PRECACHE)))
    RESULTS.append(request('service-worker', '/sw.js'))
    assert RESULTS[-1]['sha256'] == EXPECTED['sw.js'], 'service-worker mismatch'
    for label, path in [('accounts-route', '/accounts'), ('connect-route', '/connect/start')]:
        row = request(label, path)
        RESULTS.append(row)
        assert row['status'] == 200 and row['sha256'] == EXPECTED['index.html'], path
    RESULTS.append(request('redirect', '/', scheme='http'))
    assert RESULTS[-1]['status'] == 301 and RESULTS[-1]['headers']['location'] == ORIGIN + '/'
    RESULTS.append(request('config', '/__account-setup/config', method='POST', origin=ORIGIN))
    assert RESULTS[-1]['status'] == 200
    config = json.loads((OUT / 'config.body').read_text())
    before = json.loads((RELEASE / 'production-service-config-before.json').read_text())
    assert config['pin'] == before['pin'], 'service identity changed'
    assert config['networkSessions'] is True
    summary['serviceConfiguration'] = config
    RESULTS.append(request('config-wrong-origin', '/__account-setup/config', method='POST', origin='https://example.invalid'))
    assert RESULTS[-1]['status'] == 403
    for label, path in [('private-backup', '/backupz'), ('private-environment', '/.env')]:
        RESULTS.append(request(label, path))
        assert RESULTS[-1]['status'] == 404
    for row in RESULTS:
        assert row['curlExit'] == 0, row
    for row in RESULTS[:60]:
        assert row['status'] == 200 and row['matchesTestedArtifact'], row
        assert row['headers']['x-content-type-options'] == 'nosniff'
    for row in [RESULTS[0], RESULTS[60], RESULTS[61], RESULTS[62]]:
        assert row['headers']['cache-control'] == 'no-store'
        assert row['headers']['referrer-policy'] == 'no-referrer'
        csp = row['headers']['content-security-policy']
        assert "default-src 'self'" in csp and "object-src 'none'" in csp and "frame-ancestors 'none'" in csp
    build_files = [path for path in EXPECTED if path.endswith('.js') and b'51d8550d' in (DIST / path).read_bytes()]
    assert build_files and any(row['url'].endswith('/' + path) and row.get('matchesTestedArtifact') for path in build_files for row in RESULTS[:60])
    summary.update(status='passed', precacheAssetsVerified=60, unchangedServiceIdentity=True,
                   exactWorker=True, buildMarkerVerified=True, wrongOriginRefused=True,
                   privateBackupAndEnvironmentRefused=True)
except BaseException as error:
    summary.update(status='failed', failure=repr(error))
    raise
finally:
    summary['completedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    (ROOT / 'public-verification.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps({k: v for k, v in summary.items() if k != 'requests'}, indent=2))
