from pathlib import Path
import copy
import datetime
import json
import subprocess

ROOT = Path(__file__).resolve().parent
BASE = ['just', '--justfile', '/Users/thomasingalls/Code/ol-infra/justfile',
        'kubectl', '--request-timeout=20s']
MERGE = json.loads((ROOT / 'infra-merge-verification.json').read_text())['merge']
IMAGE = 'ghcr.io/thomasingalls/done@sha256:d16c39c27528d8a541a1a8bb35d7081c384c8c9a6f75d89cca80ea74aa80cb29'
OLD = 'ghcr.io/thomasingalls/done@sha256:de9ead770b70113e6e391a128898be63c37c5a3afa9e8fda2f7b5d99f1aeea6b'


def run(label, args, *, raw=True):
    p = subprocess.run(BASE + args, capture_output=True, text=True)
    if raw:
        (ROOT / (label + '.json')).write_text(p.stdout)
        (ROOT / (label + '.stderr')).write_text(p.stderr)
    assert p.returncode == 0, label + ': ' + p.stderr
    return p.stdout


summary = {'scope': 'Post-merge production rollout metadata, runtime identity and backup health; no account contents, keys or login credentials',
           'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
           'infraMerge': MERGE, 'build': '51d8550d', 'image': IMAGE,
           'status': 'in-progress', 'actualDeviceAdoption': 'pending',
           'generalQualification': 'paused'}
try:
    initial = json.loads((ROOT / 'workloads-initial.json').read_text())['items']
    final = json.loads(run('workloads-final', ['-n', 'done', 'get', 'deployment,pods,pvc', '-o', 'json']))['items']
    one = lambda rows, kind: next(x for x in rows if x['kind'] == kind)
    before = one(initial, 'Deployment')
    deployment = one(final, 'Deployment')
    expected = copy.deepcopy(before['spec'])
    for container in expected['template']['spec']['containers'] + expected['template']['spec']['initContainers']:
        assert container['image'] == OLD
        container['image'] = IMAGE
    assert deployment['metadata']['uid'] == before['metadata']['uid']
    assert deployment['spec'] == expected, 'unexpected non-image deployment spec change'
    assert deployment['spec']['replicas'] == 1 and deployment['spec']['strategy']['type'] == 'Recreate'
    assert deployment['status']['observedGeneration'] == deployment['metadata']['generation']
    assert deployment['status']['updatedReplicas'] == 1 and deployment['status']['readyReplicas'] == 1
    assert deployment['status']['availableReplicas'] == 1
    pods = [x for x in final if x['kind'] == 'Pod' and not x['metadata'].get('deletionTimestamp')]
    assert len(pods) == 1
    pod = pods[0]
    assert pod['metadata']['uid'] != one(initial, 'Pod')['metadata']['uid']
    assert pod['status']['phase'] == 'Running'
    containers = pod['status']['containerStatuses']
    assert {c['name'] for c in containers} == {'api', 'app'}
    for c in containers:
        assert c['ready'] and c['restartCount'] == 0 and c['imageID'] == IMAGE
    assert all(c['image'] == IMAGE for c in pod['spec']['containers'] + pod['spec']['initContainers'])
    assert all(c['restartCount'] == 0 and c['state']['terminated']['exitCode'] == 0 for c in pod['status']['initContainerStatuses'])
    previous_pvc = one(initial, 'PersistentVolumeClaim')
    pvc = one(final, 'PersistentVolumeClaim')
    assert pvc['metadata']['uid'] == previous_pvc['metadata']['uid']
    assert pvc['spec'] == previous_pvc['spec'] and pvc['status']['phase'] == 'Bound'
    assert pvc['status']['capacity'] == {'storage': '10Gi'}
    flux = json.loads(run('flux-final', ['-n', 'flux-system', 'get', 'kustomizations.kustomize.toolkit.fluxcd.io,gitrepositories.source.toolkit.fluxcd.io', '-o', 'json']))['items']
    summary['flux'] = []
    for x in flux:
        ready = next(c for c in x['status']['conditions'] if c['type'] == 'Ready')
        assert ready['status'] == 'True', x['metadata']['name'] + ': ' + ready['message']
        revision = x['status']['lastAppliedRevision'] if x['kind'] == 'Kustomization' else x['status']['artifact']['revision']
        assert revision == 'main@sha1:' + MERGE, (x['metadata']['name'], revision)
        summary['flux'].append({'kind': x['kind'], 'name': x['metadata']['name'], 'ready': True, 'revision': revision})
    js = 'const b=await fetch("http://127.0.0.1:8081/backupz"); console.log(JSON.stringify({source:process.env.DONE_SOURCE_REVISION,node:process.version,apiReady:(await fetch("http://127.0.0.1:8081/readyz")).status,appReady:(await fetch("http://127.0.0.1:8080/readyz")).status,backup:{status:b.status,health:await b.json()}}))'
    runtime = json.loads(run('runtime-health-final', ['-n', 'done', 'exec', pod['metadata']['name'], '-c', 'api', '--', 'node', '--input-type=module', '-e', js]))
    assert runtime['source'] == '51d8550d30585c93e623af0f2b3adf610781eebb'
    assert runtime['node'] == 'v24.18.0' and runtime['apiReady'] == 200 and runtime['appReady'] == 200
    health = runtime['backup']['health']
    assert runtime['backup']['status'] == 200 and health['enabled'] and health['healthy']
    assert health['unprotectedChangeAgeMs'] == 0 and health['lastFailureStage'] is None
    assert health['lastUploadedAt'] is not None
    summary['backupHealth'] = runtime['backup']
    summary['backupCounterBeforeRestart'] = json.loads((ROOT / 'backup-before-rollout.json').read_text())['health']['failures']
    summary['diagnosticCounts'] = {}
    for name in ['api', 'app']:
        logs = run('logs-' + name, ['-n', 'done', 'logs', pod['metadata']['name'], '-c', name, '--since=10m', '--tail=500'], raw=False)
        summary['diagnosticCounts'][name] = {s: logs.count(s) for s in ['ledger-integrity', 'UnhandledPromiseRejection', 'uncaughtException', 'startup failed']}
        assert not any(summary['diagnosticCounts'][name].values()), summary['diagnosticCounts'][name]
    summary.update(status='passed', deployed=True, singleReadyPod=True, zeroRestarts=True,
                   deploymentSpecOnlyImagesChanged=True,
                   pod={'name': pod['metadata']['name'], 'uid': pod['metadata']['uid'], 'startedAt': pod['status']['startTime'],
                        'containers': [{k: c[k] for k in ['name', 'ready', 'restartCount', 'imageID']} for c in containers]},
                   retainedVolume={'uid': pvc['metadata']['uid'], 'pv': pvc['spec']['volumeName'], 'phase': pvc['status']['phase'], 'storage': '10Gi'},
                   runtimeSource=runtime['source'], node=runtime['node'],
                   diagnosticScope='Last 500 lines from each replacement container in preceding 10 minutes; counts do not establish a full publisher audit')
except BaseException as error:
    summary.update(status='failed', failure=repr(error))
    raise
finally:
    summary['completedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    (ROOT / 'cluster-verification.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps(summary, indent=2))
