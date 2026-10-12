"""Run fresh restored sessions serially, after building both arms; stop on any failed assertion."""
import os
import pathlib
import subprocess

root = pathlib.Path('/tmp/done-owned-verification-20261012')
bundles = {'reference': 'final-reference-dist', 'owned': 'pilot-dist'}
for arm, index in [('reference', 1), ('owned', 1), ('owned', 2), ('reference', 2), ('reference', 3), ('owned', 3)]:
    name = f'{arm}-{index}'
    env = dict(os.environ, DONE_PERF_SOURCE=os.getcwd(), DONE_PERF_DIST=str(root / bundles[arm]),
               DONE_REOPEN_FIXTURE='/tmp/done-foreground-stall-20261012/diagnostic-before-2/deep-received-fixture.json',
               DONE_PERF_RESULTS=str(root / name), TYPING_REPEATS='1', TYPING_CPU='4')
    with (root / f'{name}.log').open('w') as log:
        result = subprocess.run(['node', 'node_modules/@playwright/test/cli.js', 'test', '--config',
                                 'docs/performance-experiments/2026-10-12-owned-verification/probe/typing.config.ts'],
                                env=env, stdout=log, stderr=subprocess.STDOUT)
    print(name, 'exit', result.returncode, flush=True)
    if result.returncode:
        raise SystemExit(result.returncode)
