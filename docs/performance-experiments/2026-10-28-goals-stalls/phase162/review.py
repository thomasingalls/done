"""Independent raw-evidence checks; no aggregate qualification or runtime mutation."""
from pathlib import Path
from copy import deepcopy
import gzip, hashlib, json, math, subprocess
packet = Path(__file__).resolve().parent
repo = packet.parents[3]
def load(path):
    data = path.read_bytes()
    return json.loads(gzip.decompress(data) if path.suffix == '.gz' else data)
def validate(raw):
    observed = raw.get('observations') or raw.get('finalObservation')
    marks = {m['phase']: m['at'] for m in observed['marks']}
    offered = [r for r in raw['offers'] if r['label'] == 'paragraph']
    inputs = [r for r in observed['rows'] if r['kind'] == 'beforeinput' and r['target'] == 'goals' and marks['typing-start'] <= r['at'] < marks['typing-end']]
    assert len(offered) == len(inputs) == 779
    assert [r['index'] for r in offered] == list(range(779))
    assert all(r['trusted'] and r['focused'] and r['visible'] == 'visible' for r in inputs)
    brackets = [r for phase in raw['clocks'] for r in phase['rows']]
    lo = max(r['renderer'] - r['after'] - 1 for r in brackets)
    hi = min(r['renderer'] - r['before'] + 1 for r in brackets)
    assert lo <= hi
    tasks = [r for r in observed['tasks'] if r['at'] < marks['typing-end'] and r['at'] + r['ms'] > marks['typing-start']]
    control = [r for r in observed['tasks'] if r['at'] < marks['control-end'] and r['at'] + r['ms'] > marks['control-start']]
    assert any(r['ms'] >= 100 for r in control)
    assert observed['overflow'] == 0
    return {'keys':len(inputs),'paragraphLongTasks':len(tasks),'outcome':raw['outcome']}
rows = {}
for name in ['01-desktop','02-desktop-profile','03-mobile4x','04-mobile4x-offline-control']:
    raw = load(packet/'reports'/name/'result.json.gz')
    rows[name] = validate(raw)
assert [v['paragraphLongTasks'] for v in rows.values()] == [0,1,120,0]
assert [v['outcome'] for v in rows.values()] == ['completed-diagnostic','completed-diagnostic','failed','failed']
for name in ['mobile-persisted-check','offline-independent-reopen']:
    raw=load(packet/'reports'/name/'result.json.gz')
    assert raw['outcome']=='passed' and raw['originalPlusIntendedEnterAndAll779Characters'] is True
assert load(packet/'reports/offline-independent-reopen/result.json.gz')['offline'] is True
# Controls prove this independent observer audit does not silently tolerate missing input/focus/clock evidence.
original=load(packet/'reports/01-desktop/result.json.gz')
control_results=[]
for fault in ['drop-input','unfocused','inconsistent-clock']:
    trial=deepcopy(original)
    if fault=='drop-input':
        marks={m['phase']:m['at'] for m in trial['observations']['marks']}
        target=next(r for r in trial['observations']['rows'] if r['kind']=='beforeinput' and r['target']=='goals' and marks['typing-start']<=r['at']<marks['typing-end'])
        trial['observations']['rows'].remove(target)
    elif fault=='unfocused':
        for r in trial['observations']['rows']:r['focused']=False
    else:trial['clocks'][0]['rows'][0]['renderer']+=100000
    try:validate(trial)
    except AssertionError:control_results.append({'fault':fault,'rejected':True})
    else:raise AssertionError('Accepted corrupted observation: '+fault)
identities=load(packet/'input-identities.json')
for path,expected in identities['sourceSha256'].items():
    assert hashlib.sha256((repo/path).read_bytes()).hexdigest()==expected,path
for row in load(packet/'reports/source-map-review.json'):
    assert row['matchesActualCheckedOutSource'] and all(hashlib.sha256((repo/row['path']).read_bytes()).hexdigest()==v['sha256'] for v in row['matches'])
changed=subprocess.check_output(['git','diff','--name-only'],cwd=repo,text=True).splitlines()
assert all(p.startswith('docs/') for p in changed),changed
assert subprocess.check_output(['git','diff','--cached','--name-only'],cwd=repo,text=True)==''
result={'rawObservations':rows,'negativeControls':control_results,'sourceFilesUnchanged':len(identities['sourceSha256']),'sampledOwnerMapSourcesVerified':6,'oldTestsAndRuntimeUnchanged':True,'qualification':'Diagnostic only; both measured mobile failures retained; no16ms/2.5s acceptance credit.'}
(packet/'review.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
