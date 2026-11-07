"""Recheck retained actual frontend bytes and map contents, independently of CPU-name aggregation."""
from pathlib import Path
import hashlib,json,os
packet=Path(__file__).resolve().parent
repo=packet.parents[3]
frontend=Path(os.environ.get('STALL_FRONTEND','/private/tmp/done-resumable-release-20261028/frontend'))
identity=json.loads((packet/'input-identities.json').read_text())
actual={str(p.relative_to(frontend)):hashlib.sha256(p.read_bytes()).hexdigest() for p in frontend.rglob('*') if p.is_file()}
assert actual==identity['frontendSha256'],'Actual frontend identity/file-set changed'
checks=[]
for name in ['src/crdt/verifiedRecords.ts','src/crdt/verificationOwnership.ts','src/crdt/accountReceive.ts','src/crdt/accountDelivery.ts','src/crdt/accountCapture.ts','src/crdt/contentStore.ts']:
    found=[]
    for file in sorted((frontend/'assets').glob('*.map')):
        v=json.loads(file.read_text())
        for i,source in enumerate(v.get('sources',[])):
            if source.endswith('/'+name) or source==name:
                body=v['sourcesContent'][i]
                assert body==(repo/name).read_text(),name
                found.append({'map':file.name,'source':source,'sha256':hashlib.sha256(body.encode()).hexdigest()})
    assert found,name
    checks.append({'path':name,'matchesActualCheckedOutSource':True,'matches':found})
(packet/'reports/source-map-review.json').write_text(json.dumps(checks,indent=2)+'\n')
print('Exact frontend:86 files;6 mapped account-owner sources match in both directions.')
