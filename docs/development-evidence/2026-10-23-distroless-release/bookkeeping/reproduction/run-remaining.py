from pathlib import Path
import hashlib, json, os, shlex, subprocess

root = Path('/Users/thomasingalls/.codex/worktrees/7fda/done')
scratch = Path(__file__).resolve().parent
out = scratch / 'checks'
node = '/private/tmp/done-node24-runtime/node-v24.18.0-darwin-arm64/bin/node'
environment = dict(os.environ)
environment['PATH'] = str(scratch / 'bin') + os.pathsep + str(Path(node).parent) + os.pathsep + environment['PATH']
pnpm = json.loads((out / 'contract-step.json').read_text())['packageManagerPath']
workflow = root / '.github/workflows/ci.yml'
document = json.loads(subprocess.check_output(['ruby', '-ryaml', '-rjson', '-e', 'puts JSON.generate(YAML.safe_load(File.read(ARGV.fetch(0))))', str(workflow)], text=True))
names = ['Check the complete release inventory', 'Check release execution adapters']
results = []
for name in names:
    steps = [s for s in document['jobs']['build']['steps'] if s.get('name') == name]
    assert len(steps) == 1
    logname = 'inventory-and-plan.log' if name == names[0] else 'release-adapters.log'
    exits = []
    with (out / logname).open('w') as log:
        for text in steps[0]['run'].split(' && '):
            command = shlex.split(text)
            assert command[0] in ['node', 'pnpm']
            argv = ([node] if command[0] == 'node' else [node, pnpm]) + command[1:]
            result = subprocess.run(argv, cwd=root, env=environment, stdout=log, stderr=subprocess.STDOUT, timeout=600)
            exits.append(result.returncode)
    results.append({'step': name, 'exits': exits, 'log': logname})
    print(json.dumps(results[-1]), flush=True)
(out / 'remaining-checks.json').write_text(json.dumps({'workflowSha256': hashlib.sha256(workflow.read_bytes()).hexdigest(), 'steps': results, 'allPassed': all(all(code == 0 for code in r['exits']) for r in results)}, indent=2) + '\n')
raise SystemExit(0 if all(all(code == 0 for code in r['exits']) for r in results) else 1)
