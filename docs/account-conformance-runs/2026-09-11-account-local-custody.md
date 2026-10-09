# Inherited factor custody and v2 credential/metadata bridges — 2026-09-11

**Result: D6 complete; new work remains unstaged/uncommitted.** D5 was committed unsigned as
`add6fd7`, and the existing signing reminder now includes all six unsigned C/D1–D5 commits.
D6 specifies the current custody bytes and makes one small parser repair. Valid stored formats,
prior vectors and the personal installation are unchanged.

[Contract](../account-crypto/local-custody.md), [vectors](../../test/vectors/account-local-custody.json),
[summary](./2026-09-11-account-local-custody/summary.json),
[source pins](./2026-09-11-account-local-custody/sources.json),
[preservation](./2026-09-11-account-local-custody/preservation.json),
[patch](./2026-09-11-account-local-custody/working.patch),
[patch manifest](./2026-09-11-account-local-custody/patch.json).

Final execution: `node scripts/account-local-custody/run.mjs`, Node v26.8.2,
`test-results/account-local-custody/2026-09-11T18-52-05.374Z`, 18:52:05–18:53:46 UTC.
All **46 stages pass**, without timeout, with **835 matching input pins** after execution.
The package entry is `pnpm account:local-custody`. Native fixtures use synthetic identities/factors,
disposable Chromium profiles and loopback servers. No real Account or personal app was provisioned,
built or started.

The generated state-domain test reproduced a genuine parser-contract defect. `String(state)` allowed
arrays and boxed strings through the state check. A boxed `"protected"` also retained the valid metadata
MAC because it serialized like the primitive string. Fast-check shrank the example to boxed state and
three reservations, in one shrink. The ordinary owner still refused that state with creation-pending;
no successful unlock, disclosure or authority bypass was reproduced. The fix requires primitive state
strings directly. It changes malformed-input rejection, not valid custody bytes. The original property
output, runtime file, fixture and [replay instructions](./2026-09-11-account-local-custody/state-before/replay.json)
are retained. Native IndexedDB tests reproduce both the old parser acceptance and the old owner refusal.

| Evidence | Result |
| --- | --- |
| [Fixed bytes](./2026-09-11-account-local-custody/local-custody-contract/fixed.json) | Fifteen independent cases: code/PRF factor KDF and seals, generated code mapping, two envelope generations, both v2 credentials, Ed25519/X25519 local correspondence probes, metadata KDF and creating/reserved/protected tuples. Actual builders and openers match. Private keys import non-extractable with role-specific usages. |
| [Inherited bridge](./2026-09-11-account-local-custody/local-custody-contract/inherited.json) | Three inherited factor-seal cases and two row-3 generation envelopes agree with current runtime and independent encoders. Legacy-root and generation-2 cases qualify byte syntax; historical wrapping replacement and PRF ceremonies are not promoted to current support. |
| [Field bindings](./2026-09-11-account-local-custody/local-custody-contract/bindings.json) | All 115 field mutations reject under held AES/HMAC keys. All 115 encoded omission witnesses show the corresponding binding disappears while real cryptography runs. These are separate from source mutants. |
| [Parser boundaries](./2026-09-11-account-local-custody/local-custody-contract/parsers.json) | 106 counted nested-shape/field refusals, with legacy migration classification, exact widths, copied byte arrays, ordered/distinct credential IDs, generation/version and reservation bounds. Negative zero intentionally encodes as zero. |
| [State property](./2026-09-11-account-local-custody/local-custody-contract/state-properties.json) | All 100 generated cases pass after the repair, seed 5110920. The original boxed-state failure and its shrink are preserved separately, not relabeled a passing result. |
| [Metadata histories](./2026-09-11-account-local-custody/local-custody-contract/metadata-properties.json) | 200 shrinking-enabled histories, seed 5110921, 1,539 steps; reservation/completion bytes, clone/reparse, object reordering and tampering agree with independent metadata MACs. No further counterexample or shrink. This is a byte/history model, not arbitrary native concurrency or rollback qualification. |
| [Source controls](./2026-09-11-account-local-custody/local-custody-contract/source-controls.json) | Seven controls remove credential identity, signing/wrapping correspondence, metadata count, metadata KDF slot input or exact prior MAC comparison, or restore state coercion. The KDF omission still produces self-consistent records but fails independent expected bytes; payload slot binding is acknowledged separately. |
| [Export and cleanup](./2026-09-11-account-local-custody/local-custody-contract/export-cleanup.json) | Six malformed private-export cases refuse before encryption and clear temporary bytes. Failed create and both failed private-key opens clear owned buffers. Three more source controls remove format/export-cleanup/open-cleanup guards and expose the loss. This is logical disposal, not engine/OS zeroization. |
| [Native bytes](./2026-09-11-account-local-custody/local-custody-native/native-bytes.json) | Actual creation spends three root invocations plus a separate factor seal. Independent decryption checks all persisted private/public correspondence and the metadata MAC. Four observed metadata derivations match exact key info/usages and independent HMAC probes. Cold unlock succeeds; 17 observed temporary private buffers are cleared. |
| [Authentic native faults](./2026-09-11-account-local-custody/local-custody-native/native-authentic-faults.json) | Genuine valid-tag/wrong-private-key credentials and changed metadata refuse and remain stored. Actual signing/wrapping/metadata verification omissions permit opening those cases. A wrong factor remains unlock-failed with retained data. The metadata-authentication omission also exists in the inherited custody harness. |
| [Native state repair](./2026-09-11-account-local-custody/local-custody-native/native-state-fix.json) | Structured-cloned arrays and boxed strings now refuse at parsing with repair-required. Restoring the old guard accepts them at parsing but ordinary open still returns creation-pending. Valid primitive state reopens after restoration. |
| [Native comparison](./2026-09-11-account-local-custody/local-custody-native/native-comparison-control.json) | Changing the stored MAC before reservation commits causes refusal before any root encryption. Omitting only prior-MAC comparison overwrites that change and performs three root encryptions. Crypto success results are not forced true. |
| [Inherited custody](./2026-09-11-account-local-custody/custody-native/native/report.md) | All 13 cases and five mutation controls pass their detection criteria: genesis, concurrent creators, reservation/completion abort, interrupted creation, tampering, partial/legacy state, scope, ceiling, lifetime, cancellation and synthetic profile-copy probes. Mutant-case failures are the expected detections. Existing profile/renderer evidence retains its bounded scope. |
| [Registry controls](./2026-09-11-account-local-custody/registry/local-custody-registry-controls.json) | Nine new controls enforce correspondence, inherited/native evidence, format/cleanup, the state counterexample, prior-MAC comparison and metadata MAC/negative obligations, including altered corpora with refreshed aggregate pins. |
| [Units](./2026-09-11-account-local-custody/unit.log) and tools | All 983 units in 88 files, typecheck, retained A/B/C/D1/D2/D3/D4/D5 contracts, 28 vector commands and targeted lint/format pass. D6 has eight helper tests and four native tests, with two nested native comparison runs (six reported native test results). |

The independent oracle imports no production codec. It shares D5's independent Node utilities and
Node/OpenSSL primitives: independence is byte reconstruction, not a fully independent crypto stack.
The new fixtures do not issue Account membership or qualify onboarding. Custody's default IndexedDB
durability, raw rollback/branching, fresh randomness, PRF enrollment, rotation and F-15 retain explicit
limits. A fixed local Ed25519 challenge is a key-pair test, not an external authority message.

Five constructions replace the open shared-custody record: **72 specified, two open, one exclusion**.
The map has 73 entries, 90 permitted-root chains and 17 swept documents. The runtime census remains
158 sources/89 labels; only custodyRecord.ts's source hash changes for the one-line repair. F-05/F-06
remain open for checkpoint/startup, Local/migration provenance and the wider gates.

All 21 personal package hashes, 28 prior tracked vector files, historical review, L-2 and unrelated root
files are preserved. Raw evidence lists all 2,363 file hashes; 160 report/log/mutant-source files were
copied exactly. Duplicate frozen source/profile material stays out of the document archive. The base
commit, current patch, input pins and five targeted inherited mutant sources retain reproducibility.
Next is **D7: Account genesis checkpoint and persisted-startup byte bridges**.
