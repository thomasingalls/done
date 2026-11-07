from pathlib import Path
import json,gzip,hashlib,subprocess,sys
from datetime import datetime
from capture_storage import tracked, committed_source
r=Path('/private/tmp/done-release-hardening-20261102');repo=Path.cwd();n=int(sys.argv[1]);cfg=json.loads((r/f'{n}-record.json').read_text());record_date=cfg.get('date',datetime.now().astimezone().date().isoformat());slug=cfg['slug'];out=repo/f'docs/development-evidence/2026-11-02-release-hardening/{n}-{slug}';assert not out.exists();assert subprocess.check_output(['git','diff','--cached','--name-only'])==b''
for key in cfg['requiredChecks']:
 x=json.loads((r/f'{n}-{key}/run.json').read_text());assert x['childExit']==0 and not x['timedOut'],key
pins={p:hashlib.sha256((repo/p).read_bytes()).hexdigest()for p in cfg['sourceFiles']};(r/f'{n}-tested-inputs.json').write_text(json.dumps(pins,indent=2)+'\n');paths=[]
for p in r.glob(f'{n}-*'):paths.extend(p.rglob('*')if p.is_dir()else[p])
paths.extend(r/f'{v}{n}{suffix}'for v,suffix in [('edit','.py'),('review','.mjs'),('core','.py'),('bookkeeping','.mjs'),('checks','.py')]);paths.extend([Path(__file__).resolve(),Path(__file__).with_name('future_runner.py').resolve(),Path(__file__).with_name('capture_storage.py').resolve(),r/f'checkpoint{n}.py',r/f'start{n}.py',r/f'review{n}.py']);paths.extend(repo/p for p in cfg['sourceFiles']);source_refs={str(p):committed_source(repo,p)for p in set(paths)if p.is_file()and tracked(repo,p)};(out/'objects').mkdir(parents=True);art=[]
for p in sorted(set(paths)):
 if not p.is_file()or p.suffix not in {'.json','.jsonl','.log','.md','.py','.mjs','.ts','.txt'}:continue
 b=p.read_bytes();h=hashlib.sha256(b).hexdigest()
 if str(p)in source_refs:
  art.append({'original':str(p),'source':source_refs[str(p)],'sha256':h,'bytes':len(b)});continue
 q=out/'objects'/f'{h}.gz'
 if not q.exists():q.write_bytes(gzip.compress(b,mtime=0))
 art.append({'original':str(p),'artifact':str(q.relative_to(out)),'sha256':h,'bytes':len(b)})
(out/'evidence.json').write_text(json.dumps({'phase':n,**cfg,'testedInputs':pins,'evidence':art},indent=2)+'\n');(out/'README.md').write_text(f'# {cfg["title"]} — phase{n}\n\n'+cfg['detail']+'\n\n'+cfg['validation']+' [All attempts and reviewed source identities](./evidence.json).\n\n'+cfg['limitations']+'\n')
with(repo/'docs/completed.md').open('a')as f:f.write(f'\n\n### {cfg["title"]}\n\n**Date:**{record_date} · **Commit:**pending patch{n} · **Stage:**partial Stage3.2\n\n**Exit.** {cfg["summary"]} [Evidence](development-evidence/2026-11-02-release-hardening/{n}-{slug}/README.md).\n\n**Limits.** {cfg["limitations"]} Outcome precedes advancing this seat.\n')
with(repo/'docs/decisions.md').open('a')as f:f.write(f'\n\n### {cfg["decisionTitle"]}\n\n**Date:**{record_date} · **Commit:**pending patch{n}\n\n{cfg["decision"]} [Evidence](development-evidence/2026-11-02-release-hardening/{n}-{slug}/README.md).\n')
p=repo/'docs/progress.md';s=p.read_text();i=s.index('## Active slice: release hardening — format contract and idle audit');prefix=s[:i];own=s[i:];(r/f'{n}-progress-prior-seat.md').write_text(own);a=own.index('**Latest checks.**');b=own.index('The [385 segmented checkpoint]',a);own=own[:a]+f'**Latest checks.** [{cfg["title"]}](./development-evidence/2026-11-02-release-hardening/{n}-{slug}/README.md).\n'+cfg['validation']+'\n'+own[b:];a=own.index('**Active bounded outcome.**');b=own.index('**Remaining Stage3.2.**',a);own=own[:a]+'**Active bounded outcome.** '+cfg['next']+'\n\n'+own[b:];
for old,new in cfg.get('progressEdits',[]):
 assert old in own,old
 own=own.replace(old,new,1)
p.write_text(prefix+own);assert p.read_text().startswith(prefix);print(json.dumps({'phase':n,'artifacts':len(art),'otherSeatExact':True}))
