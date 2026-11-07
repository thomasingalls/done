from pathlib import Path
import json,hashlib
r=Path(__file__).parent;sha=lambda b:hashlib.sha256(b).hexdigest();files=[p for p in(r/'harness').rglob('*')if p.is_file()and not p.is_symlink()and'node_modules'not in p.parts];files +=[r/n for n in ['run-case.py','freeze-inputs.py','protocol.md','qa.json','run-plan.json','container-image.json','container-service.mjs','observer.mjs','read-request.mjs','notification-probe.mjs','analyze-case.py','late-harness.patch','fairness-harness.patch','playwright-storage-source.txt','smoke.mjs','browser-identity.json','analyze-fairness.py','fairness-analyzer.patch','analyzer-controls.py','analyzer-controls.json']]
for label in ['S0','Y248','C291']:
 manifest=json.loads((r/(label+'-source-inputs.json')).read_text());files+=[r/('source-'+label)/n for n in manifest['files']];files+=[r/(label+'-source-inputs.json'),r/(label+'-assets.json')]
(r/'frozen-inputs.json').write_text(json.dumps({str(p.relative_to(r)):sha(p.read_bytes())for p in files},indent=2)+'\n');print('Frozen',len(files),'source/apparatus inputs; frontend assets separately exact')
