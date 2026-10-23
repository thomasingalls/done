from pathlib import Path
import hashlib, json, os, re, shlex, subprocess

root = Path('/Users/thomasingalls/.codex/worktrees/7fda/done')
out = Path(__file__).resolve().parent / 'checks'
workflow = root / '.github/workflows/ci.yml'
document = json.loads(subprocess.check_output(['ruby', '-ryaml', '-rjson', '-e', 'puts JSON.generate(YAML.safe_load(File.read(ARGV.fetch(0))))', str(workflow)], text=True))
steps = [s for s in document['jobs']['build']['steps'] if s.get('name') == 'Check security contracts and published vectors']
assert len(steps) == 1
commands = steps[0]['run'].split(' && ')
assert all(re.fullmatch(r'pnpm [a-z:-]+', command) for command in commands)
environment = dict(os.environ)
node_runtime = '/private/tmp/done-node24-runtime/node-v24.18.0-darwin-arm64/bin'
pnpm = Path('/Users/thomasingalls/Library/pnpm/store/v11/links/@/pnpm/11.20.0/4b307cd3780af0bd745f9a323a340e5219ddf7c61e4d68ae013e09fd8073aacd/node_modules/pnpm/bin/pnpm.cjs')
assert json.loads((pnpm.parent.parent / 'package.json').read_text())['version'] == '11.20.0'
launcher = Path(__file__).resolve().parent / 'bin'
launcher.mkdir(exist_ok=True)
shim = launcher / 'pnpm'
shim.write_text('#!/bin/sh\nexec ' + shlex.quote(node_runtime + '/node') + ' ' + shlex.quote(str(pnpm)) + ' "$@"\n')
shim.chmod(0o755)
environment['PATH'] = str(launcher) + os.pathsep + node_runtime + os.pathsep + environment['PATH']
runtime = subprocess.check_output([node_runtime + '/node', '--version'], text=True).strip()
assert runtime == 'v24.18.0'
assert subprocess.check_output([node_runtime + '/node', str(pnpm), '--version'], env=environment, text=True).strip() == '11.20.0'
results = []
for command in commands:
    name = command.split()[1]
    with (out / (name.replace(':', '-') + '.log')).open('w') as log:
        result = subprocess.run([node_runtime + '/node', str(pnpm), name], cwd=root, env=environment, stdout=log, stderr=subprocess.STDOUT, timeout=600)
    results.append({'packageScript': name, 'exit': result.returncode, 'log': name.replace(':', '-') + '.log'})
    print(json.dumps(results[-1]), flush=True)
record = {'runtime': runtime, 'packageManager': 'pnpm@11.20.0', 'packageManagerPath': str(pnpm), 'commandPopulationHome': '.github/workflows/ci.yml', 'workflowSha256': hashlib.sha256(workflow.read_bytes()).hexdigest(), 'step': steps[0]['name'], 'commands': results, 'allPassed': all(r['exit'] == 0 for r in results), 'generalizedQualificationRun': False}
(out / 'contract-step.json').write_text(json.dumps(record, indent=2) + '\n')
raise SystemExit(0 if record['allPassed'] else 1)
