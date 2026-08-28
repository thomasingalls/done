# S0-9 storage challenge — exact command/result log

All commands ran with working directory `/private/tmp/done-s0-9-storage`. No network repository material, other ref, branch, worktree, stash, reflog, or non-ancestor object was consulted. `pnpm format:fix` and `git checkout --` were never run.

## 1. Boundary

```text
$ pwd
/private/tmp/done-s0-9-storage

$ git rev-parse HEAD
5923f510fd9ac3c1cd809e9bec352a7f73751492
exit 0

$ git status --short
(no output)
exit 0
```

## 2. Required baseline

The first sandboxed invocation of each pnpm command was blocked before repository code ran because pnpm 11.20.0 attempted npm-registry signature verification in the restricted network environment:

```text
$ pnpm vectors:check
[ERROR] Refusing to run pnpm@11.20.0: its npm registry signature could not be verified ... fetch failed ...
exit 1 (environmental; repository command did not run)

$ pnpm test
[ERROR] Refusing to run pnpm@11.20.0: its npm registry signature could not be verified ... fetch failed ...
exit 1 (environmental; repository command did not run)
```

The exact commands were rerun with approval outside that network restriction:

```text
$ pnpm vectors:check
... all 16 generated vector artifacts are current ...
vectors:coverage: 190 AAD fields, each isolated
exit 0

$ pnpm test
Test Files  36 passed (36)
Tests       371 passed (371)
Duration    33.00s
exit 0

$ pnpm trace:check
traceability: 85 claims, 27 of 28 current defects falsified, 2 declared owed. ... current.
exit 0
```

`pnpm check` was run only to record the known unrelated lint/format baseline; no fixer was invoked:

```text
$ pnpm check
$ pnpm typecheck && pnpm lint && pnpm format && pnpm vectors:check && ...
$ tsc -b --noEmit
$ oxlint ...
scripts/generate-head-discovery-vectors.mjs:496:32: error eslint(no-shadow): 'signer' is already declared in the upper scope.
[ELIFECYCLE] Command failed with exit code 1.
exit 1
```

Typecheck completed before lint. The chain stopped at the known lint failure; this review does not classify it as a remediation failure.

## 3. Targeted exact artifacts

```text
$ ./node_modules/.bin/vitest run test/generationApply.test.ts test/writeAdmission.test.ts test/outboundSpool.test.ts test/hostedRetention.test.ts
Test Files  4 passed (4)
Tests       66 passed (66)
Duration    1.11s
exit 0

$ node scripts/generate-transition-vectors.mjs --check
transition.json is current; the keypair and row 1 cross-checks pass.
exit 0

$ node scripts/generate-checkpoint-vectors.mjs --check
checkpoint.json is current, and every negative still fails.
exit 0

$ node scripts/generate-package-vectors.mjs --check
package.json is current, and every negative still fails.
exit 0

$ node scripts/generate-antireplay-vectors.mjs --check
antireplay.json is current, and every negative still fails.
exit 0

$ node scripts/generate-journal-vectors.mjs --check
journal-aead.json is current, and the primitive KAT passes.
exit 0

$ node scripts/generate-record-vectors.mjs --check
record-format.json is current, and every negative still fails to authenticate.
exit 0

$ node scripts/check-retention.mjs
retention: 12 months stated consistently across 6 anchors; every §16 unselected cell is bounded and open; §14.7's 5 states and 6 deletion classes match the executable model and stay disjoint from §13.7's 3 kinds and from §13.5's lineage words.
exit 0

$ node scripts/check-selection-status.mjs
17 selected/4 unselected; 5 PRD citations; no contradictions
exit 0

$ node scripts/check-update-limit.mjs
update limit: 0.0476 µs/byte from 3 measurements; the budget is exhausted at 19.6 kB and §12's 4 extrapolated rows agree; the interim 16 kB is under it and under the module's guard.
exit 0

$ node scripts/check-wasm-seal.mjs
journal seal: 15 checks pass — the published KAT, 4 composition vectors, the length guard in both directions, and the key/nonce width guard.
exit 0
```

## 4. Causal-ancestor verification

Exact pattern, run once for each hash:

```text
$ git merge-base --is-ancestor <hash> HEAD
exit 0
```

Hashes checked, each with exit 0:

```text
9edd930 c611666 a073574 f5def83 b997cdb 4259822 3bea0e6 9860a0b
dbfd01f 9b49b74 992bc91 745e332 cdd2069 b9ff071 5bd9552 bd87655
66a7c6a ff0b48f
```

No hash from documentation was inspected before this proof.

## 5. Isolating Local-archive mutation

One temporary local mutation was used because the existing generator did not contain the paired fresh-wrap Local negative required by `P-6`. It was inserted with `apply_patch` immediately after the honest `restoreArchive()` positive. In pseudocode-equivalent exact terms, it:

1. chose a distinct 32-byte generation key;
2. called the generator's existing `hpkeSeal` with `ARCHIVE_PUB`, `wrapInfo(archiveBase)`, and that key;
3. passed the fresh wrap to the existing `restoreArchive`;
4. threw if the returned value equaled the chosen key.

```text
$ node scripts/generate-package-vectors.mjs --check
Error: S0-9: a freshly minted Local archive generation under attacker bytes was accepted
    at verify (file:///private/tmp/done-s0-9-storage/scripts/generate-package-vectors.mjs:942:11)
    ...
Node.js v26.7.0
exit 1
```

The added block was then deleted with `apply_patch` (not `git checkout --`), followed by:

```text
$ git diff -- scripts/generate-package-vectors.mjs
(no output)

$ git status --short
(no output)

$ node scripts/generate-package-vectors.mjs --check
package.json is current, and every negative still fails.
exit 0
```

This mutation changes only the expected outcome; it does not alter `restoreArchive`, HPKE, keys, inputs, or any existing guard. It therefore isolates that the genuine Local archive public context accepts a freshly minted generation key while the separately signed manifest is outside the factor-authenticated path.

## 6. Read-only model inspection and absence checks

Representative exact searches used to locate the state-machine obligations and detect absent checkpoint install coverage:

```text
$ rg -n "partial|install|self|second eligible|fallback|newest" scripts/generate-checkpoint-vectors.mjs test docs/review/remediation/S0-5 docs/review/remediation/decisions/P-8-checkpoint-and-creation-authority.md
... self-admission and opener-floor matches ...
... no checkpoint partial-install model/test match ...
exit 0

$ rg -n "S0-9|independent challenge|challenge" docs/review/remediation/action-tree.md
627:### `S0-9` — independent challenge of the repaired constructions
635:- **Acceptance/falsifiers:** for every `RC-*`, challenge survival at tip, causal ancestor, preservation of local
...
exit 0
```

Line-numbered inspection used `nl -ba <path> | sed -n '<range>p'` on the cited S0-2 through S0-7 schemas/READMEs, P-3/P-4/P-6/P-8 decisions, TRD sections, generators and model tests. All such read-only commands exited 0 except one initial filename typo for `P-8-checkpoint-admission.md`; `rg --files docs/review/remediation/decisions` located the correct `P-8-checkpoint-and-creation-authority.md`, which was then read.

## 7. Restoration and final tree check

Before creating these two requested reports:

```text
$ git status --short
(no output)
$ git diff --check
(no output)
exit 0
```

After report creation the only intended worktree additions are:

```text
?? docs/review/remediation/S0-9/challenge-storage-commands.md
?? docs/review/remediation/S0-9/challenge-storage.md
```

No implementation or generated artifact remains changed.

Final readback:

```text
$ git rev-parse HEAD
5923f510fd9ac3c1cd809e9bec352a7f73751492

$ git status --short --untracked-files=all
?? docs/review/remediation/S0-9/challenge-storage-commands.md
?? docs/review/remediation/S0-9/challenge-storage.md

$ git diff --check
(no output)

$ ./node_modules/.bin/oxfmt --check docs/review/remediation/S0-9/challenge-storage.md docs/review/remediation/S0-9/challenge-storage-commands.md
Checking formatting...
All matched files use the correct format.
exit 0
```
