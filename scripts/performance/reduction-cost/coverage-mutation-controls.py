"""Phase 557 mutation controls for batched coverage: each mutation is applied alone to the final tree,
the phase's test file runs, and the source is restored byte for byte. A control trips when the
mutation makes at least one case fail.

Usage (from the worktree root): python3 -I scripts/performance/reduction-cost/coverage-mutation-controls.py
"""
import re
import subprocess
import sys
import os

TESTS = ['test/coverageBatches.test.ts']
LEDGER = 'src/crdt/inboundLedger.ts'
MUTATIONS = [
    (
        'the comparison skipped (a batch is proven without comparing its fork)',
        [(LEDGER,
          '        proven = !broken && running !== undefined && sameDocState(doc, running);',
          '        proven = !broken && running !== undefined;')],
    ),
    (
        'the comparison made only at the end of the pass, not per batch',
        [(LEDGER,
          '      return view.hold(records, update) >= budget ? settle() : undefined;',
          '      return view.hold(records, update) === Infinity ? settle() : undefined;')],
    ),
    (
        'the reverse: the comparison made after every row (one fork per row again)',
        [(LEDGER,
          '      return view.hold(records, update) >= budget ? settle() : undefined;',
          '      return view.hold(records, update) >= 0 ? settle() : undefined;')],
    ),
    (
        "a failed batch's fork reused for the rows checked alone, and for the next batch",
        [(LEDGER,
          '      } finally {\n        release();\n        measureLedger(\'coverageCheck\', began);',
          '      } finally {\n        if (proven) release();\n        else {\n          held = [];\n          heldBytes = 0;\n          broken = false;\n        }\n        measureLedger(\'coverageCheck\', began);'),
         (LEDGER,
          '              copy = forkDoc(doc, false);\n              Y.applyUpdate(copy, update);',
          '              copy = forkDoc(running ?? doc, false);\n              Y.applyUpdate(copy, update);')],
    ),
    (
        'content rows left unsettled until the end of the loop, after the other rows are classified',
        [('src/crdt/localRetentionPlan.ts',
          '        if (unsettled) {\n          unsettled = false;\n          await checking.finish();\n        }\n',
          '')],
    ),
    (
        'every row applied in its own Yjs transaction (groups of one)',
        [(LEDGER, 'const COVERAGE_GROUP = 64;', 'const COVERAGE_GROUP = 1;')],
    ),
    (
        'a view with pending parts allowed to prove a batch',
        [(LEDGER,
          '      if (hasPendingUpdates(doc)) broken = true;\n      else if (++waiting >= COVERAGE_GROUP) applyWaiting();',
          '      if (++waiting >= COVERAGE_GROUP) applyWaiting();')],
    ),
]

untripped = 0
for name, edits in MUTATIONS:
    originals = {}
    try:
        for path, old, new in edits:
            text = originals.setdefault(path, open(path).read())
            current = open(path).read()
            if current.count(old) != 1:
                raise SystemExit(f'## {name}: anchor not found once in {path}')
            open(path, 'w').write(current.replace(old, new))
        run = subprocess.run(
            ['pnpm', 'exec', 'vitest', 'run', *TESTS, '--maxWorkers=1'],
            capture_output=True,
            text=True,
            timeout=900,
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
            untripped += 1
    finally:
        for path, text in originals.items():
            open(path, 'w').write(text)
print(f'\n{len(MUTATIONS) - untripped} of {len(MUTATIONS)} mutations tripped at least one case.')
sys.exit(1 if untripped else 0)
