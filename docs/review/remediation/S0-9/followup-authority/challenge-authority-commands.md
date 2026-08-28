# S0-9 authority challenge — exact command/result log

All commands were run with working directory `/private/tmp/done-s0-9-authority`. No command consulted another
worktree, ref, remote, or non-ancestor repository object. I did not run `pnpm format:fix` or `git checkout --`.

## Environment and pinned state

| Command                                       | Exit | Useful result                                                                                                       |
| --------------------------------------------- | ---: | ------------------------------------------------------------------------------------------------------------------- |
| `git rev-parse HEAD`                          |    0 | `5923f510fd9ac3c1cd809e9bec352a7f73751492`                                                                          |
| `git status --short --branch` (before review) |    0 | `## HEAD (no branch)`                                                                                               |
| `node --version`                              |    0 | `v26.7.0`                                                                                                           |
| `pnpm --pm-on-fail=ignore --version`          |    0 | `11.24.0` fallback executable; the project-requested `11.20.0` was already used to install the frozen dependencies. |

## Required baseline and exact artifacts

| Command                                                                                                                                                                              | Exit | Useful result                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm trace:check`                                                                                                                                                                   |    1 | The package-manager launcher attempted to switch to project pnpm `11.20.0`; restricted registry access made signature verification/fetch fail before the script ran. Error began: `[ERROR] Refusing to run pnpm@11.20.0: its npm registry signature could not be verified ... fetch failed`. |
| `pnpm --pm-on-fail=ignore trace:check`                                                                                                                                               |    0 | `traceability: 85 claims, 27 of 28 current defects falsified, 2 declared owed. ... traceability.md is current.`                                                                                                                                                                              |
| `pnpm --pm-on-fail=ignore vectors:check`                                                                                                                                             |    1 | All 16 generator `--check` commands reported current and all negatives still failed; the final nested `pnpm vectors:coverage` re-entered the launcher without `--pm-on-fail=ignore` and failed on the same restricted registry/signature fetch before coverage ran.                          |
| `node scripts/check-aad-coverage.mjs`                                                                                                                                                |    0 | All 16 generators listed `ok`; `190 AAD fields, each isolated by a published negative.` This is the exact underlying `vectors:coverage` artifact that the nested launcher could not reach.                                                                                                   |
| `pnpm --pm-on-fail=ignore test`                                                                                                                                                      |    0 | `Test Files 36 passed (36)`; `Tests 371 passed (371)`; duration `32.34s`.                                                                                                                                                                                                                    |
| `pnpm --pm-on-fail=ignore exec vitest run test/generationApply.test.ts test/outboundSpool.test.ts test/hostedRetention.test.ts test/writeAdmission.test.ts test/attribution.test.ts` |    0 | `Test Files 5 passed (5)`; `Tests 70 passed (70)`.                                                                                                                                                                                                                                           |
| `pnpm --pm-on-fail=ignore build`                                                                                                                                                     |    0 | TypeScript and Vite build succeeded; JS gzip `306.3 kB / 350.0 kB`; origin check scanned 6 built files and found no non-allowlisted literal remote URL.                                                                                                                                      |
| `node scripts/check-retention.mjs`                                                                                                                                                   |    0 | 12 months consistent across 6 anchors; 5 states and 6 classes match the model and remain disjoint from 3 transition kinds and lineage words.                                                                                                                                                 |
| `node scripts/check-update-limit.mjs`                                                                                                                                                |    0 | Budget recomputed at 19.6 kB; 4 extrapolated rows agree; interim 16 kB remains under budget and guard.                                                                                                                                                                                       |
| `node scripts/check-origin-isolation.mjs` (before build)                                                                                                                             |    1 | Expected environmental precondition failure: `ENOENT ... stat 'dist'`. The subsequent full build invoked the same checker successfully.                                                                                                                                                      |
| `node scripts/check-wasm-seal.mjs`                                                                                                                                                   |    0 | `15 checks pass` including KAT, 4 composition vectors, size and key/nonce guards.                                                                                                                                                                                                            |

## Targeted generator reruns

Each command exited 0 and reported its checked JSON current. Where applicable it also reported every negative still
failed.

```text
node scripts/generate-suite-vectors.mjs --check
node scripts/generate-enrollment-vectors.mjs --check
node scripts/generate-head-discovery-vectors.mjs --check
node scripts/generate-device-lock-vectors.mjs --check
node scripts/generate-transition-vectors.mjs --check
node scripts/generate-antireplay-vectors.mjs --check
node scripts/generate-package-vectors.mjs --check
node scripts/generate-checkpoint-vectors.mjs --check
node scripts/generate-account-credential-vectors.mjs --check
node scripts/generate-finalization-vectors.mjs --check
node scripts/generate-attribution-vectors.mjs --check
```

Representative exact outputs:

```text
enrollment-ceremony.json is current, and every negative still fails.
head-discovery.json is current, and every negative still fails.
device-lock.json is current; the alphabet, row 3 and row 14 cross-checks pass.
transition.json is current; the keypair and row 1 cross-checks pass.
antireplay.json is current, and every negative still fails.
package.json is current, and every negative still fails.
checkpoint.json is current, and every negative still fails.
algorithm-suite.json is current; primitive KATs and the §13.2 separation check pass.
```

## Isolation/reasoning commands for new defects

These commands are non-mutating. Their output and the successful exact generators above are the counterexample:
the challenged positives pass while their required cross-object fields are absent or disconnected.

```text
rg -n "recovery_state_digest|RecoveryBootstrap|bootstrap signer|bootstrap_signer|bootstrap.*verification|RECOVERY_STATE" \
  docs/TRD.md docs/PRD.md docs/review/remediation/S0-2/A-schemas.md \
  scripts/generate-enrollment-vectors.mjs scripts/generate-head-discovery-vectors.mjs
```

Result: the only exact `recovery_state_digest` fields are counter, `R_pub`, envelope digest, and root commitment;
bootstrap-key commitment exists only as prose; the verifier is a fixed generator key.

```text
rg -n "transcript:|recovery_state_digest|inputs: \{" \
  scripts/generate-enrollment-vectors.mjs test/vectors/enrollment-ceremony.json
```

Result: executable transcript field at source line 130, but the generated formula at source line 519 / JSON line 9
and honest vector inputs omit it.

```text
rg -n "const decide|r\.workspace|r\.position|mine = \{|wrongSubject|refusal-for-another|aad-only-refusal-epoch|interface Refusal" \
  scripts/generate-antireplay-vectors.mjs test/outboundSpool.test.ts
```

Result: client subject comparison has no epoch; the exact model's refusal has no epoch; epoch coverage mutates an
old signature while genuine wrong-subject signatures cover only position/digest/credential.

```text
rg -n "archiveBase =|const archiveFields =|authRoot: ARCHIVE_PUB|authRoot: KEYS.laptop.public_key|verifyManifest\(archiveFields|sign\(laptopSigner, archiveFields" \
  scripts/generate-package-vectors.mjs
```

Result: factor restore uses `ARCHIVE_PUB` at line 880; published manifest uses `KEYS.laptop.public_key` at
1117/1240 and is verified/signed under that key at 1123/1302.

```text
rg -n "catchupDigest|knownAbsences|expected =|const caughtUp|known_absence_count|signed catch-up transcript" \
  scripts/generate-package-vectors.mjs docs/review/remediation/S0-6/A-schemas.md
```

Result: the schema claims a signed transcript and exact absence enumeration; code accepts a digest of only the two
public heads and a non-negative count. The positive has `knownAbsences: 2` and no absence entries.

```text
rg -n "const deleteClass|const past|no handoff|const enforceCeiling|handoff never came|Nothing survives the deadline|incomplete handoff" \
  test/hostedRetention.test.ts docs/review/remediation/S0-7/A-schemas.md
```

Result: the handoff guard applies only while `!past`; a named passing test deletes after the deadline when the
handoff never arrived.

```text
rg -n "unresolved upstream choice|attempt-1 replacement|sole successor|still-unselected|intentionally unresolved|RC-3A bounded" \
  docs/review/remediation/corrected-end-state.md
```

Result: stale unresolved branches at lines 76, 151, 220, 242 and the superseded attempt-1/sole-successor protocol at
169-174.

## Causal-ancestor proof

I ran `git merge-base --is-ancestor <hash> HEAD` separately for every unique `introduced_by` hash in the finding
population. All 18 commands exited 0:

```text
dbfd01f54cdfcab994ac7df2298ba0da0bbe7da9
bd876553c8a2be17ff55c399f416d7eed9075935
b997cdb6bfaabc0e73cbecbb444dc0df84044d71
992bc9113093fe04d20df0247aa118d0f8ba365f
3bea0e69469e47b790fe6214d7fbed42bcf84441
f5def83ac6f21873ab7fb589247dd116fc2febd9
4259822828060fe2b9592fa525cd9a17170af285
caee157305d3080ec870ca0959bd49c61a714f3b
745e332b061e0e964ae655e853f2f3b393667c66
b9ff071ddb4ee67e47179e549b5ad22a429ac5ee
9b49b743cb03cb8827682d79fc66405f458cf29b
5bd9552b38d12e2c8b51bd490d2b78c64351eaa7
a073574fcb90f9f2a70fa1be2bae5dc1d9c364f3
138a5f81ac07d505d9494a899ccf546e383a0684
6b021c46995379be79d459432f8bc514f72dbcfc
66a7c6a85cc743896568a0ffc678431c1ebaf579
9860a0bc1611b01eac76abcc5584afc51f5ed959
c6116669030eedeea3d599bca0da3547114e6930
```

## Final hygiene

No tracked file was mutated for isolation testing. The build created only ignored output. Final status/diff checks
after the report files were added:

| Command              | Exit | Useful result                                                                                                |
| -------------------- | ---: | ------------------------------------------------------------------------------------------------------------ |
| `git diff --check`   |    0 | No whitespace errors.                                                                                        |
| `git status --short` |    0 | `?? docs/review/remediation/S0-9/` — the only intended change is the directory containing these two reports. |
