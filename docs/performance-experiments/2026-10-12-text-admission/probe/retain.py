"""Retain synthetic numeric evidence; never copy credential/profile/database fixtures."""
from pathlib import Path
import gzip, hashlib, json, subprocess, re

root = Path(__file__).resolve().parents[4]
packet = Path(__file__).resolve().parents[1]
scratch = Path('/tmp/done-text-admission-20261012')
for name in ['samples', 'logs', 'profiles', 'identity']:
    (packet / name).mkdir(exist_ok=True)

def compressed(source, destination):
    (packet / destination).write_bytes(gzip.compress(source.read_bytes(), mtime=0))

runs = ['reference-2', 'direct-1', 'reference-3', 'direct-2', 'reference-4', 'direct-3',
        'reference-cpu4', 'direct-cpu4', 'profile']
summary = []
for run in runs:
    compressed(scratch / run / 'typing.json', f'samples/{run}.json.gz')
    compressed(scratch / (run + '.log'), f'logs/{run}.log.gz')
    row = json.loads((scratch / run / 'typing.json').read_text())[0]
    def quantiles(values):
        values = sorted(values)
        assert len(values) == 120 and all(v >= 0 for v in values)
        return {name: round(values[min(len(values)-1, int(len(values)*p))], 3)
                for name, p in [('median', .5), ('p95', .95), ('max', 1)]}
    summary.append(dict(run=run, cpu=row['cpu'], handlers=quantiles(row['handlers']),
                        frames=quantiles([x['frame'] for x in row['samples']]),
                        direct=row['after']['work']['directTextPreparations']-row['before']['work']['directTextPreparations'],
                        comparisons=row['after']['work']['projectionChecks']-row['before']['work']['projectionChecks'],
                        longTasks=len(row['tasks']), maxTask=max([x['ms'] for x in row['tasks']], default=0),
                        undoRedo=row['undoRedo'], replay=row['replay']))
(packet / 'summary.json').write_text(json.dumps(summary, indent=2)+'\n')
for name in ['reference-1', 'reference-build', 'direct-build', 'profile-build', 'two-device', 'origin']:
    compressed(scratch / (name + '.log'), f'logs/{name}.log.gz')
for name in ['done-text-unit-final', 'done-text-differential', 'done-text-boundary', 'done-text-type', 'done-text-lint']:
    compressed(Path('/tmp') / (name+'.log'), f'logs/{name}.log.gz')
for name in ['typing-0.cpuprofile', 'profile.json']:
    compressed(scratch / 'profile' / name, 'profiles/'+name+'.gz')

sha = lambda b: hashlib.sha256(b).hexdigest()
tracked = subprocess.check_output(['git','diff','--name-only','HEAD'], cwd=root, text=True).splitlines()
files = sorted([p for p in tracked if p.startswith(('src/','test/')) or p in ['vite.config.ts','tsconfig.node.json']] +
    ['src/crdt/accountTextMode.ts','src/crdt/accountTextPreparation.ts','test/plainTextUpdate.test.ts','test/packaged-account/text-admission.spec.ts'])
files = sorted(set(files))
base = subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
(packet / 'identity/source.json').write_text(json.dumps(dict(base=base,files={p:sha((root/p).read_bytes()) for p in files}),indent=2)+'\n')
patch = subprocess.check_output(['git','diff','--binary','HEAD','--',*files],cwd=root)
for p in files:
    if subprocess.run(['git','ls-files','--error-unmatch',p],cwd=root,capture_output=True).returncode:
        patch += subprocess.run(['git','diff','--no-index','--','/dev/null',p],cwd=root,capture_output=True).stdout
(packet / 'identity/repair.patch').write_bytes(patch)
for name, dist in [('reference',scratch/'reference-dist'),('direct',scratch/'direct-dist'),('profile',scratch/'profile-dist'),('default',root/'dist')]:
    sources={}
    active=set()
    pending=[dist/'index.html',dist/'local.html']
    while pending:
        path=pending.pop()
        if path in active: continue
        active.add(path)
        for asset_name in re.findall(r'["\'](?:\./|/assets/|assets/)?([A-Za-z0-9_-]+\.js)["\']',path.read_text()):
            child=dist/'assets'/asset_name
            if child.is_file(): pending.append(child)
    for path in dist.rglob('*.map'):
        if path.with_suffix('') not in active: continue
        data=json.loads(path.read_text())
        for source, content in zip(data.get('sources',[]),data.get('sourcesContent',[])):
            if 'node_modules/' in source: continue
            for prefix in ['src/','account-protocol/']:
                if prefix in source and content is not None:
                    source=prefix+source.split(prefix,1)[1]
                    digest=sha(content.encode())
                    assert source not in sources or sources[source]==digest, source
                    sources[source]=digest
                    break
    obj=dict(directory=str(dist),activeScripts=sorted(str(p.relative_to(dist)) for p in active),files={str(p.relative_to(dist)):sha(p.read_bytes()) for p in sorted(dist.rglob('*')) if p.is_file()},bundledSources=sources)
    (packet/f'identity/{name}-build.json').write_text(json.dumps(obj,indent=2)+'\n')
manifest={str(p.relative_to(packet)):dict(bytes=p.stat().st_size,sha256=sha(p.read_bytes())) for p in sorted(packet.rglob('*')) if p.is_file() and p.name!='manifest.json'}
(packet/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Retained',len(manifest),'files,',sum(x['bytes'] for x in manifest.values()),'bytes')
