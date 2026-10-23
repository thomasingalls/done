from pathlib import Path
import gzip, hashlib, json, shutil

root = Path('/Users/thomasingalls/.codex/worktrees/7fda/done')
scratch = Path(__file__).resolve().parent
out = root / 'docs/development-evidence/2026-10-23-distroless-release/bookkeeping'
checks = out / 'checks'
reproduction = out / 'reproduction'
checks.mkdir(parents=True, exist_ok=True)
reproduction.mkdir(parents=True, exist_ok=True)
records = []
for path in sorted((scratch / 'checks').iterdir()):
    if not path.is_file() or path.name.startswith('manifest-') and path.name in ['manifest-before.json', 'manifest-proposed.json', 'manifest-reviewed.json']:
        continue
    assert path.suffix in ['.log', '.json', '.txt']
    data = path.read_bytes()
    target = checks / (path.name + '.gz')
    target.write_bytes(gzip.compress(data, compresslevel=6, mtime=0))
    assert gzip.decompress(target.read_bytes()) == data
    records.append({'path': str(target.relative_to(out)), 'bytes': target.stat().st_size, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'uncompressedSha256': hashlib.sha256(data).hexdigest()})
for path in sorted(scratch.iterdir()):
    if path.is_file() and path.suffix in ['.py', '.mjs', '.txt']:
        target = reproduction / (path.name + ('.txt' if path.suffix == '.mjs' else ''))
        shutil.copyfile(path, target)
        records.append({'path': str(target.relative_to(out)), 'bytes': target.stat().st_size, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
(out / 'artifact-index.json').write_text(json.dumps({'claim': 'Retained runs, reviews and reproduction inputs. Original overwritten scratch logs have only the explicitly named transcript excerpt; no full-log claim.', 'files': records}, indent=2) + '\n')
print(json.dumps({'files': len(records), 'directory': str(out)}))
