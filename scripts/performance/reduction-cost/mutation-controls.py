"""Phase 556 mutation controls: each mutation is applied alone to the final tree, the named tests run,
and the source is restored byte for byte. A control passes when the mutation makes a test fail.

Usage (from the worktree root): python3 -I scripts/performance/reduction-cost/mutation-controls.py
"""
import os
import re
import subprocess
import sys

TESTS = ['test/retentionSliceBudget.test.ts', 'test/retentionPreparationOwner.test.ts']
MUTATIONS = [
    (
        'fixed 2 s budget (setup ignored)',
        'src/crdt/retentionPreparation.ts',
        '    if (options.setupSince === undefined) return slice;',
        '    if (options.setupSince === undefined || slice > 0) return slice;',
    ),
    (
        "budget ignores the last save's duration",
        'src/crdt/retentionPreparation.ts',
        '    const grown = ratio * (freshAt - options.setupSince + carried);',
        '    const grown = ratio * (freshAt - options.setupSince);',
    ),
    (
        'budget ignores the window that holds routine sync off',
        'src/crdt/retentionPreparation.ts',
        '      options.deadline === undefined\n',
        '      options.deadline === undefined || ratio > 0\n',
    ),
    (
        'no plain slice after an interruption',
        'src/crdt/contentStore.ts',
        '                ...(preparationInterrupted\n',
        '                ...(preparationInterrupted && false\n',
    ),
    (
        'scheduler does not say when routine sync resumes',
        'src/crdt/automaticLocalRetention.ts',
        '        result = await options.remove(hint.revision, report, protectedUntil);',
        '        void protectedUntil;\n        result = await options.remove(hint.revision, report);',
    ),
    (
        'a cached row accepted without its check (opened rows reused from the journal)',
        'src/crdt/localRetentionPlan.ts',
        '      const bytes = await crypt.open(r);',
        """      const bytes = reuse
        ? await reuse.memo.check(
            'opened:' + r.seq,
            JSON.stringify([r.v, r.kind, r.gen, r.seq]),
            [r.nonce, r.ct],
            () => crypt.open(r),
            context.assertCurrent,
          )
        : await crypt.open(r);""",
    ),
]

failures = 0
for name, path, old, new in MUTATIONS:
    original = open(path).read()
    if original.count(old) != 1:
        print(f'## {name}: anchor not found once in {path}')
        failures += 1
        continue
    try:
        open(path, 'w').write(original.replace(old, new))
        run = subprocess.run(
            ['pnpm', 'exec', 'vitest', 'run', *TESTS, '--maxWorkers=1'],
            capture_output=True,
            text=True,
            timeout=1500,
            env={**os.environ, 'NO_COLOR': '1', 'FORCE_COLOR': '0'},
        )
        out = re.sub(r'\x1b\[[0-9;]*m', '', run.stdout + run.stderr)
        failed = [line.strip() for line in out.splitlines() if line.strip().startswith('×')]
        summary = [line.strip() for line in out.splitlines() if line.strip().startswith('Tests ')]
        print(f'## {name}')
        for line in failed:
            print('   ' + line)
        print('   ' + (summary[-1] if summary else 'no summary'))
        if not failed:
            failures += 1
    finally:
        open(path, 'w').write(original)
sys.exit(1 if failures else 0)
