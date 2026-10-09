"""Verify retained Pixel observations and preservation; --raw also checks large local build inputs."""
import base64,gzip,hashlib,json,math,subprocess,sys
from pathlib import Path
root=Path.cwd();packet=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
summary=json.loads((packet/'summary.json').read_bytes())
for name,key in [('artifacts.json.gz','artifactsSha256'),('analysis.json','analysisSha256'),('raw-artifacts.json','rawIndexSha256'),('qualification-checks.json','qualificationChecksSha256')]:
    assert sha((packet/name).read_bytes())==summary[key],name
store=json.loads(gzip.decompress((packet/'artifacts.json.gz').read_bytes()))
assert len(store['files'])==summary['fileCount'] and len(store['blobs'])==summary['uniqueBlobCount']
for h,b in store['blobs'].items():assert sha(base64.b64decode(b))==h
for name,entry in store['files'].items():
    assert len(base64.b64decode(store['blobs'][entry['sha256']]))==entry['bytes'],name
    assert 'synthetic-factors.json' not in name

def payload(name):return base64.b64decode(store['blobs'][store['files'][name]['sha256']])
def read(name):return json.loads(payload(name))
def pct(values,p):return sorted(values)[math.ceil(len(values)*p/100)-1]
def equal(a,b):assert abs(a-b)<1e-9,(a,b)
analysis=json.loads((packet/'analysis.json').read_bytes())
completion=read('campaign/completion.json');config=read('campaign/session.json')
assert completion['measurementComplete'] is True and completion['sessions']==4
assert completion['defaultActivation'] is False and completion['manualKeyboardPending'] is True
assert [s['variant'] for s in config['sessions']]==['R','C','C','R']
assert len(set(s['origin'] for s in config['sessions']))==4
assert read('campaign/preflight.json')['browser']['model']=='Pixel 9a'
assert read('campaign/preflight.json')['browser']['platformVersion']=='17.0.0'
for name,h in read('campaign/inputs.json').items():assert sha(payload('campaign/'+name))==h
for name in ['recorder.ts','measure.ts']:
    assert sha(payload('campaign/'+name))==sha((root/'test/latency'/name).read_bytes())
assert config['builds']==read('builds.json')
assert config['builds']['builds']['R']['changes']==[]
change,=config['builds']['builds']['C']['changes']
assert change['path']=='src/crdt/admittedWorkspace.ts'
assert sha((root/change['path']).read_bytes())==change['before']
assert sha(payload('campaign/build.mjs'))==config['builds']['buildScriptSha256']
failures=[];count=0
for i,row in enumerate(analysis['sessions']):
    r=read(f'campaign/session-{i}.json');m=r['measurements']
    assert r['index']==i and r['variant']==['R','C','C','R'][i] and not r['smoke']
    assert r['emptyOriginVerified'] is True and r['completedAt']>r['startedAt']
    assert r['semantics']==['Entire corpus matches after lock and cold reopen','Exact measured card text survives lock and cold reopen']
    assert r['origin']==config['sessions'][i]['origin']
    assert len(r['frameIntervals'])==60 and all(math.isfinite(x) and x>0 for x in r['frameIntervals'])
    for name,key in [('compose','a'),('card','b')]:
        v=m[name];samples=v['samples'];events=v['eventTimes']
        assert len(samples)==len(events)==120
        assert all(math.isfinite(x) and x>=0 for x in samples)
        gaps=[b-a for a,b in zip(events,events[1:])];assert all(x>0 for x in gaps)
        equal(pct(samples,50),v['p50']);equal(pct(samples,95),v['p95'])
        equal(row['typing'][name]['gapP50'],pct(gaps,50));equal(row['typing'][name]['gapP95'],pct(gaps,95))
        assert key*120 in v['expected']
        assert v['viewport']['visibility']=='visible' and v['viewport']['breakpoint']=='narrow'
        assert v['viewport']['visual']['scale']==1 and v['viewport']['dpr']==2.625
        equal(v['viewport']['visual']['width'],411.4285583496094)
        equal(v['viewport']['visual']['height'],403.80950927734375)
        count+=len(samples)
    assert m['compose']['expected']=='a'*120
    actual={'cold':(m['coldPrompt']+m['coldUnlock'],2500),'warm':(m['warmPrompt']+m['warmUnlock'],1000),'replay':(m['replay'],500),'compose':(pct(m['compose']['samples'],95),16),'card':(pct(m['card']['samples'],95),16),'focus':(m['focus'],50)}
    for name,(value,limit) in actual.items():
        b=r['budgets'][name];equal(value,b['value']);assert b['limit']==limit and b['pass']==(value<limit)
        assert b==row['budgets'][name]
        if value>=limit:failures.append({'index':i,'metric':name})
assert count==analysis['trustedKeySamples']==summary['trustedKeySamples']==960
assert failures==analysis['budgetFailures']==summary['budgetFailures']==[{'index':i,'metric':'card'} for i in range(4)]
for pair,(r,c) in zip(analysis['pairs'],[(0,1),(3,2)]):
    assert (pair['reference'],pair['candidate'])==(r,c)
    gain=1-pct(read(f'campaign/session-{c}.json')['measurements']['card']['samples'],95)/pct(read(f'campaign/session-{r}.json')['measurements']['card']['samples'],95)
    equal(gain,pair['cardP95Reduction'])
events=[json.loads(line) for line in payload('campaign/events.jsonl').splitlines()]
assert [e['index'] for e in events if e['kind']=='session-start']==[0,1,2,3]
assert [e['index'] for e in events if e['kind']=='session-complete']==[0,1,2,3]
assert events[-1]['kind']=='debug-forward-removed' and events[-2]['kind']=='campaign-complete'
assert not any(e['kind']=='campaign-stopped' for e in events)
assert 'failure.txt' not in [Path(n).name for n in store['files'] if n.startswith('campaign/')]
assert read('preparation/phone-setup-attempt-1/session-0.json')['measurements']['freshPrompt']>0
assert read('preparation/phone-setup-attempt-2/session-0.json')['measurements']['creation']>0
assert read('preparation/phone-adapter-smoke/card-input-check.json')['exactTextVerified'] is True
p=read('preservation.json')
for pin in p['personalAndVectorPins']+p['priorPacket']:
    assert sha((root/pin['path']).read_bytes())==pin['sha256'],pin['path']
for pin in p['appendOnlyPrefixes']:
    assert sha((root/pin['path']).read_bytes()[:pin['prefixBytes']])==pin['prefixSha256']
assert sha((root/'docs/progress.md').read_bytes().split(b'\n---\n\n## Active slice: Stage 4',1)[1])==p['L2SuffixSha256']
subprocess.run([sys.executable,str(packet.parent/'2026-09-14-f17-local-performance/verify.py')],check=True)
if '--raw' in sys.argv:
    for pin in json.loads((packet/'raw-artifacts.json').read_bytes()):assert sha(Path(pin['path']).read_bytes())==pin['sha256'],pin['path']
assert sum(f.stat().st_size for f in packet.iterdir() if f.is_file())<250000
print('Verified Pixel R/C/C/R, 960 trusted-key samples, both paired contrasts, all four card-budget failures, preserved setup attempts, source and preservation pins.')
