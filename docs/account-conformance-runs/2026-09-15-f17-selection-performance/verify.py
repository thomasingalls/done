#!/usr/bin/env python3
from pathlib import Path
import json,gzip,hashlib,base64,statistics,math,sys,subprocess
root=Path(__file__).resolve().parents[3];p=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest();read=lambda path:json.loads(path.read_bytes())
s=read(p/'summary.json');assert sha((p/'artifacts.json.gz').read_bytes())==s['artifactsSha256'];assert sha((p/'raw-artifacts.json').read_bytes())==s['rawIndexSha256']
a=json.loads(gzip.decompress((p/'artifacts.json.gz').read_bytes()));assert len(a['index'])==len(a['artifacts']);assert len({r['path'] for r in a['index']})==len(a['index'])
def payload(name):return a['artifacts'][name].encode('utf-8')
def obj(name):return json.loads(payload(name))
for row in a['index']:
 b=payload(row['path']);assert sha(b)==row['sha256'] and len(b)==row['bytes'],row['path']
frozen=obj('comparison/frozen.json');run=obj('comparison/run.json');assert run['frozen']==frozen and run['status']=='passed';assert frozen['at']<run['startedAt']<run['completedAt']
for k,f in [('protocol','protocol.md'),('build','build.mjs'),('worker','worker.mjs'),('run','run.mjs'),('analysis','analyze.mjs'),('application','application.mjs')]:assert frozen[k]==sha(payload('comparison/'+f))
assert run['orders']==['BRSH','RHBS','HSRB','SBHR'];assert len(run['sessions'])==64
expected=[(b,['1000','10000','100000','deep'][(n+b)%4],v) for b,order in enumerate(run['orders']) for n in range(4) for v in order]
assert [(r['block'],r['stratum'],r['v']) for r in run['sessions']]==expected
# Recompute engineering decisions from every raw observation; timings within sessions are dependent.
med=statistics.median;p95=lambda a:sorted(a)[math.ceil(len(a)*.95)-1]
analysis=obj('comparison/analysis.json');assert len(analysis['rows'])==4
warmups=0;measured=0;allcriteria=True
for row in analysis['rows']:
 stratum=row['stratum'];seeds=set()
 for v in 'BRHS':
  for block in range(4):
   r=obj(f'comparison/measure-{block}-{stratum}-{v}.json');assert (r['stratum'],r['variant'],r['block'],r['status'])==(stratum,v,block,'passed')
   log=obj(f'comparison/session-{block}-{stratum}-{v}.json');assert log['status']==0 and log['signal'] is None and not log.get('error')
   assert run['startedAt']<=r['startedAt']<r['completedAt']<=run['completedAt']
   assert r['initial']['handoff']==(v in 'HS')
   warm=[x['ms'] for x in r['samples'] if x['phase']=='warmup'];ms=[x['ms'] for x in r['samples'] if x['phase']=='measured']
   assert len(warm)==(256 if stratum=='deep' else 24) and len(ms)==64
   assert all(math.isfinite(x) and x>=0 for x in warm+ms);warmups+=len(warm);measured+=len(ms)
   assert r['final']['undo']==r['initial']['undo']+len(warm)+64 and r['final']['redo']==0
   assert r['final']['revision']==r['initial']['revision']+len(warm)+64
   z=row['sessions'][v][block];assert z['median']==med(ms) and z['p95']==p95(ms)
   assert z['final']==r['final'] and z['initial']==r['initial'] and z['seed']==r['seed'];assert z['measuredStartUndo']==r['initial']['undo']+len(warm)
   seeds.add(r['seed']['sha256'])
  assert row['summary'][v]=={metric:med(x[metric] for x in row['sessions'][v]) for metric in ['median','p95']}
 assert len(seeds)==1
 for c in row['comparisons']:
  ratios=[{ 'block':i, **{metric:row['sessions'][c['a']][i][metric]/row['sessions'][c['b']][i][metric] for metric in ['median','p95']}} for i in range(4)]
  assert ratios==c['ratios'];assert med(x['median'] for x in ratios)==c['ratioMedian']
  faster=sum(x['median']<1 for x in ratios);mr=sum(x['median']>1.10 for x in ratios);pr=sum(x['p95']>1.10 for x in ratios)
  assert (c['faster'],c['medianRegressions'],c['p95Regressions'])==(faster,mr,pr)
  required=c['a']=='S' and stratum in (['10000','deep'] if c['b']=='H' else ['10000','100000'])
  guard=mr<3 and pr<3;benefit=not required or c['ratioMedian']<=.90 and faster>=3
  assert (c['benefitRequired'],c['guardrail'],c['benefit'])==(required,guard,benefit);allcriteria &=guard and benefit
assert (warmups,measured)==(5248,4096);assert allcriteria==analysis['nodeCriteriaPassed']==s['node']['relativeCriteriaPassed']
for v in 'BRHS':
 check=obj('comparison/check--1-1000-'+v+'.json');assert check['status']=='passed' and all(x['ms'] is None for x in check['samples'])
 assert run['smokeChecks'][v]==sha(payload('comparison/check--1-1000-'+v+'.json'))
i=obj('comparison/input-reference.json');assert i['base']==s['base'] and i['variants']['R']['bundle']==i['variants']['H']['bundle']==i['variants']['S']['bundle']
assert ' G ' in payload('comparison/signature.log').decode()
for row in analysis['rows']:
 for v in 'BRHS':
  for block in range(4):assert obj(f"comparison/measure-{block}-{row['stratum']}-{v}.json")['bundleSha256']==i['variants'][v]['bundle']
# The application changes only the private Local constructor argument, preserving the stage contract.
app=obj('application/summary.json');receipt=obj('application/receipt.json');cases=obj('application/cases.json');browser=obj('application/browser.json');variant=obj('comparison/application-variant.json')
assert variant['at']>run['completedAt'];assert len(app['stages'])==1 and len(cases['cases'])==len(cases['collected'])==12
assert len({x['id'] for x in cases['cases']})==12 and all(x['retry']==x['repeatEachIndex']==0 for x in cases['cases'])
assert cases['configuration']=={'workers':1,'fullyParallel':False,'projects':[{'name':'desktop','retries':0,'repeatEach':1},{'name':'android','retries':0,'repeatEach':1}]}
assert receipt['contract']=={k:v for k,v in variant['stage'].items() if k not in ['id','dependsOn']};assert receipt['input']==app['input']==s['application']['input']
assert app['stages'][0]['groupDrained'] is True and receipt['result']['groupDrained'] is True
assert browser['exit']==0 and browser['groupDrained'] is True and receipt['result']['browser']==browser
assert cases['server']['closed'] is True
assert cases['phase']=='complete' and cases['status']==app['status']==receipt['status']=='failed'
assert receipt['result']['code']==1 and cases['errors']==[]
expectedIds=[x['id'] for x in receipt['contract']['expect']['cases']]
assert cases['collected']==expectedIds and [x['id'] for x in cases['cases']]==expectedIds
failures=[x for x in cases['cases'] if x['status']!='passed'];assert len(failures)==1
assert failures[0]['id']==expectedIds[-1] and 'android' in failures[0]['id']
errors='\n'.join(failures[0]['errors']);assert 'Latency budgets failed' in errors and 'card focus' in errors and 'card editor' in errors
for artifact in receipt['artifacts']:assert sha(payload('application/'+artifact['path']))==artifact['sha256']
measure=payload('application/measurements.jsonl');assert cases['measurementArtifact']['sha256']==sha(measure) and base64.b64decode(cases['measurementArtifact']['base64'])==measure
rows=[json.loads(l) for l in measure.decode().splitlines()];assert len(rows)==30
for project in ['desktop','android']:
 m={x['metric']:x for x in rows if x['project']==project};assert len(m)==15
 value=lambda k:m[k]['value']
 assert value('cold launch → unlock prompt')+value('cold factor submit → Today editable')<2500
 assert value('warm launch → unlock prompt')+value('warm factor submit → Today editable')<1000
 assert value('encrypted content load and replay')<500 and value('keystroke → paint, compose field')<16
 assert all(value(k)<100 for k in ['day-to-day navigation, goTo (response)','day-to-day navigation, goTo (settled)','day-to-day navigation, step (response)'])
 assert all(m[k]['samples']==120 for k in ['keystroke → paint, compose field','keystroke → paint, card editor'])
 assert (value('keystroke → paint, card editor')<16)==(project=='desktop')
 assert (value('card focus → editable')<50)==(project=='desktop')
card={x['project']:x['value'] for x in rows if x['metric']=='keystroke → paint, card editor'};assert card==s['application']['cardP95Ms'];assert {x['project']:x['value'] for x in rows if x['metric']=='card focus → editable'}==s['application']['focusMs']
assert app['status']==s['application']['status'];assert app['stages'][0]['elapsedMs']==s['application']['elapsedMs']
assert s['application']['caseStatuses']=={z:sum(x['status']==z for x in cases['cases']) for z in sorted({x['status'] for x in cases['cases']})}
assert [x['path'] for x in variant['changed']]==['src/crdt/admittedWorkspace.ts']
original=payload('source/src/crdt/admittedWorkspace.ts');needle=b'    options,\n  );\ntype State = {';assert original.count(needle)==1
activated=original.replace(needle,b"    options,\n    'local-snapshots',\n  );\ntype State = {");assert sha(activated)==variant['changed'][0]['sha256']
assert sha(payload('comparison/activation.patch'))==variant['activationPatch']
# Preservation and current denominator. Record appends are allowed; previous evidence is immutable.
preserve=obj('comparison/preservation.json');assert len(preserve['personalAndVectorPins'])==52
assert len({x['path'].split('/')[2] for x in preserve['priorPackets']})==7
for pin in preserve['personalAndVectorPins']+preserve['priorPackets']+preserve['runtimePins']:assert sha((root/pin['path']).read_bytes())==pin['sha256'],pin['path']
for pin in preserve['appendOnlyPrefixes']:assert sha((root/pin['path']).read_bytes()[:pin['prefixBytes']])==pin['prefixSha256']
assert sha((root/'docs/progress.md').read_bytes().split(b'\n---\n\n## Active slice: Stage 4',1)[1])==preserve['L2SuffixSha256']
assert s['defaultActivation'] is False and s['accountActivation'] is False and s['runtimeUnchanged'] is True and s['manifestUnchanged'] is True
m=read(root/'docs/release-validation-manifest.json');assert len(m['rows'])==618 and len(m['unresolved'])==159
assert s['counts']=={'obligations':618,'requiredTestFiles':282,'generalFiles':263,'generalDispositions':2121,'notApplicable':11,'unresolvedTestFiles':0,'command':96,'campaign':63}
if '--raw' in sys.argv:
 for pin in read(p/'raw-artifacts.json'):
  b=(root/pin['path']).read_bytes();assert sha(b)==pin['sha256'] and len(b)==pin['bytes'],pin['path']
 f=json.loads(gzip.decompress((root/i['fullInputs']['path']).read_bytes()));assert sha((root/i['fullInputs']['path']).read_bytes())==i['fullInputs']['sha256']==frozen['inputsSha256']
 before=json.loads(gzip.decompress((root/'test-results/f17-selection-performance/comparison/application-before-inputs.json.gz').read_bytes()))
 after=json.loads(gzip.decompress((root/'test-results/f17-selection-performance/application-candidate/inputs.json.gz').read_bytes()))
 assert before['sources']==f['sourcePins'] and before['dependencies']==after['dependencies']==f['dependencies']
 assert len(before['sources'])==len(after['sources'])
 assert [x['path'] for x,y in zip(before['sources'],after['sources']) if x!=y]==['src/crdt/admittedWorkspace.ts']
 for pin in before['sources']:
  if not pin['path'].startswith('docs/') and 'sha256' in pin:assert sha((root/pin['path']).read_bytes())==pin['sha256'],pin['path']
assert 'Entire original source/dependency identity preserved' in payload('comparison/input-preservation.log').decode()
assert 'Verified 215 owned cases' in payload('comparison/functional-packet.log').decode()
assert json.loads(payload('comparison/inventory.log').decode().splitlines()[0])['status']=='passed'
assert json.loads(payload('comparison/manifest.log'))=={'status':'blocked','obligations':618,'unresolved':159,'infrastructureStages':21,'vectorStages':29}
assert payload('comparison/whitespace.log')==b''
assert sum(f.stat().st_size for f in p.iterdir() if f.is_file())<350000
print('Verified 64 sessions, 5,248 warmups, 4,096 measurements and recomputed criteria; unchanged single application gate, retained receipts/drain, default refusal and preservation.')
