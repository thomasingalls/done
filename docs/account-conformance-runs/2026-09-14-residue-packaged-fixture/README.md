# Account packaged/profile fixtures — 2026-09-14

`residue-packaged-fixture` passes both unchanged cases from signed base `1135e757`
plus the archived source patch: 22.172 seconds Node execution, 25.637 seconds stage,
53.480 seconds including input fingerprinting. Existing 240-second file and 180/240-second
case bounds are unchanged. Full identities, counts and limits are in [summary.json](./summary.json).

The explicit inherited-profile contract binds installed Chromium and keeps browser lifetimes
inside the guarded Node group. Two synthetic profiles create three browser lifetimes, including
one whole-profile reopen. All recorded browsers and profile processes are absent afterward;
all three CDP listeners refuse connections.

Fresh Local UI editing, ZIP export, lock, service-worker readiness and offline reopen pass.
Synthetic migration covers recovery files, import, selection, later edits, authenticated source
cleanup and interrupted/resumed Local clear. The planted worker-console control is detected.
Both acquired-file observations report no prohibited match or collection issue. The fresh
case asserts zero prohibited matches, not an empty issue list; migration's physical result is
observational. This is neither forensic erasure nor a claim about every filesystem carrier.

Validation passes: 93 pure runner checks, 24 Node-owner + five Vitest-process controls,
14 native-owner controls, TypeScript and scoped gates. Six native controls exercise the new
profile contract through close/copy, timeout, cancellation, death and reopen. Prior failed
owner evidence remains in its original packet.

The archive includes exact receipts, source/browser pins, patch, auxiliary reports and their
capture metadata, owner logs, [final gates](./final-gates.json) and [preservation](./preservation.json).
The artifact index hashes compressed and normalized bytes. All 228 prior general contracts,
52 personal/vector pins and L-2 remain unchanged. Product sources and both test bodies are unchanged.

Account integration is complete: **123 files / 678 cases**. General integration now covers
229 files / 1,772 cases; 29 other test files, 96 command rows and 63 campaign rows remain.
Host-Python binding, complete output retention, existing oracle/headroom observations and
immutable aggregate qualification remain separate. Personal app/profile/deployment and real
human Account validation were not part of this run.
