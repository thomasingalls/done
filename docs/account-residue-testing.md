# Plaintext-residue evidence: contract and first implementation boundary

2026-09-12. Source baseline: signed admission-evidence commit `f118127` (full identifier and hashes in
the [prep record](./account-conformance-runs/2026-09-12-account-residue-prep.md)). **Preparation only.**
No scanner or new runtime test is implemented by this document. F-21.4 remains open.

## Decision and claims

The immediate decision is whether the current private Local-to-Account paths leave recognizable
synthetic writing or known content factors in the logical carriers we can inspect. A measurement-system
calibration followed by a bounded lifecycle benchmark fits this question. First validate the instrument
against planted leaks; then apply the unchanged instrument to normal executions. No population leak
rate, cryptographic security level, or causal effect estimate is sought.

Three claims require separate evidence:

| Claim | Required observation | What a pass can say |
| --- | --- | --- |
| R1: logical-carrier content/factor scan | Raw browser API values, current service records and captured diagnostics, with calibrated representation readers and explicit scope | No prohibited sentinel representation was found in the enumerated values at the recorded points |
| R2: filesystem residue | Closed disposable profile and service-directory snapshots; physical files, WALs, deleted/slack data and known container decoding separately inventoried | Only the inspected file/representation scope; ordinary logical deletion is not physical erasure |
| C13: copied-profile custody | Factor-free opener attempts and factor-present recovery, including future receivers and a planted promptless opener | The actual attempted opener/receiver paths on that platform resisted the factor-free copy |

R1 does not establish R2 or C13. C13's existing component test does not establish a plaintext scan.
The ideal broad claim needs all app paths, supported platforms and readable backing formats; that is
larger than the next implementation phase. Unknown browser internals remain unqualified.

PRD §7.2, TRD §11.1 and SC-08 already require factor custody. The stale promptless-success expectation
in PRD acceptance item 13 is corrected alongside this prep; the planted opener is the deliberate positive
control, not the default behavior. This does not upgrade the empirical evidence for that requirement.

## Existing evidence and source inventory

The machine-readable [surface inventory](./account-residue-prep/surfaces.json) records source homes,
scope, expected observations and calibration requirements. The static query/provenance is a navigation
aid, not proof that every reachable persistence operation has been discovered. In particular, aliases,
dependency-owned storage, workers, browser-managed artifacts and dynamically constructed paths need
independent enumeration at execution. Scan every discovered surface, including unknown keys/stores;
never limit collection to the product's slot index or a prefix of expected names.

| Existing work | Credit | Limit |
| --- | --- | --- |
| `scripts/custody/scenarios.mjs`, C13; `test/custody/browser.mjs` | Closes/copies synthetic Chromium profiles; tries persisted 32-byte values and CryptoKey handles as known root openers; planted opener and factor-present controls | Known encrypted-content and synthetic future-ECDH probes. Same-host mock-keychain/basic-password configuration, not a neutral byte search or general receiver/platform proof |
| `scripts/legacy-cleanup/campaign.mjs`; `test/private-migration/rehearsal.spec.ts` | Known legacy database/journal/ancillary deletion and encrypted destination retention | Namespace/value absence, not a search across unrelated carriers or physical remnants |
| D5–D8 and admission/delivery campaigns | Exact encryption bytes, source preservation, authentication, logical buffer clearing and cold replay | Use openers and producer-specific structure; no general plaintext detector |
| Existing browser `inventory()` helpers | Enumerate IndexedDB/localStorage for equality assertions | Often JSON-convert values; not calibrated for all structured-clone types, encodings, caches or other surfaces |
| App-upgrade precache tests | Generated worker asset integrity and scoped cache replacement | App assets, not proof of absence of content from CacheStorage or the separate HTTP disk cache |

Current source distinctions that affect the detector:

- `done.<derived-id>` IndexedDB stores `meta`, `content`, `heads`, `outbound`; encrypted payloads coexist
  with public format/counter/routing fields. Names, keys and schema metadata are also scanned.
- `done.custody/entries` holds scoped seals, credentials, Local claims, clear/import progress and
  `application-upgrade` promotion records. A MAC protects integrity; it does not hide fields. Scan the
  complete structured clone, including keys and unexpected properties, without authenticating it first.
- `done.slots/slots` exposes routing, bindings and identifiers. It is not a complete census authority.
- `done.account-recovery-preparation.v1/progress/pending` retains a sealed draft and exact confirmation
  request, including plaintext `retryKey` copies. Confirmation does not automatically delete this row.
  The generated recovery code and private keys are not fields in that carrier. The usual native fixture's
  `ready()` performs recovery outside this browser owner; using it alone would miss this surface.
- `done.pending-update.*` stores framed base64 ciphertext in current journal v2; the legacy v1 path stores
  encoded raw updates. Independently inspect both observed forms, including unexpected names and headers.
- Current Menu actor, device-label and setting edits use `workspaceCommands` and encrypted document
  metadata. The old `actors.localDevice/renameLocalDevice`, `persistence` and `sync` paths retain plaintext
  device/actor/relay metadata. Their presence in source does not make them current editor writers.
  `src/main.tsx` opens `LocalApp`; the old slot-index/persistence comments are not reachability evidence.
- `vite/precacheServiceWorker.ts` generates `done-precache-v2-*` static-asset caches. No application
  sessionStorage/cookie/OPFS writer was found in the recorded source query. That is an absence-of-source-hit
  observation, not permission to omit those available browser surfaces from collection.
- Account core and authority use separate SQLite databases and WAL mode. Core rows contain identity,
  attempts, public credentials, sealed recovery, proposals/receipts and binary encrypted submissions.
  Authority and acceptance private seeds are sealed. Current SQL rows, raw SQLite/WAL files and logs
  are three different observation surfaces.
- Markdown ZIP and private migration recovery downloads intentionally disclose content when requested.
  The old relay's Yjs file is plaintext migration input; it is not the encrypted Account service.

## Input classes and allowed locations

Do not call all metadata public or exempt an entire database. Collection and matching happen before
classification. The independent matcher gets sentinels, bytes and locators; it gets no product allowlist.
A separate classifier applies exact surface/field/stage rules and reports expected matches too.

| Class | First-run input | Policy |
| --- | --- | --- |
| W: user content | Distinct sentinels in master text, card text, actor name and current device label, through `AdmittedWorkspace.text().input` / `.command` | Prohibited in all inspected persisted values, service records and automatic diagnostic output; visible unlocked UI is expected but outside the at-rest scan |
| F: known external factors | Actual synthetic generated device-lock and recovery codes; compact and formatted spellings | Prohibited in app/service persistence and automatic diagnostics; retained only by the controller outside the tested exposure domain |
| K: internal keys | Seed/root/generation/wrapping material | Do not claim absent merely because no writing sentinel matched. Raw material is normally unknown to R1; C13/D6 remain complementary evidence. A seeded 32-byte detector calibration checks the instrument, not every real key |
| M: routing/public proofs | IDs, counters, salts/nonces, public keys, digests, signatures, accepted-head/activation state | Structurally expected in their named fields. This does not imply harmlessness or permission for automatic logging; W/F matches in such a field still fail |
| T: operational capabilities | Actual synthetic registration retry capability; private HTTP access token | Sensitive, not public metadata. The recovery row's `retryKey` and `finalization.retryKey` are explicitly retained by current code and must be reported as known capability exposure. This is not a content factor or a new waiver of credential confidentiality. Tokens in automatic logs or unexpected persistence fail; a broad “no secrets at rest” claim is unavailable |
| L: predecessor data | Legacy `done`, v1 journal, ancillary values and old relay Yjs file | Absent in fresh R1 histories. If found unexpectedly, fail/incomplete and preserve evidence. Later migration tests label before-cleanup exposure; they must not silently exempt it from an after-cleanup claim |
| X: explicit exports | Exact user-requested ZIP/recovery artifact | Separate disclosure trial and exact artifact inventory. Never exempt content by filename extension or allow it in caches/logs because an export was requested |

Current device-label W markers are **not** allowed in `done.device`. Public-looking names or JSON
field labels never authorize a match. Known T exposures are listed separately from prohibited W/F
counts; an R1 pass is explicitly scoped to W/F and unexpected T locations, not to all secrets.

## Measurement instrument

The unit of execution is one fresh disposable browser context plus its independently initialized
service databases. Repeated checkpoints, values and matches within that execution are correlated.
The observation row is `(run, phase, origin, surface, locator, representation, needle-id, offset)`.
The decision concerns that version's declared paths, not a statistical population of users.

The controller generates unique sentinels **after** building test assets, retains the secret manifest
outside browser/service exposure, and passes values only to declared input calls. Use distinct W role
markers with at least 128 random bits, plus a Unicode calibration marker. Assert that the intended
content is actually present through the product read surface and cold factor-opened replay; this check
is separate from the neutral scan. Empty scenarios or missing marker introduction cannot pass.

The collector must not import product custody/openers, parsers, key helpers, storage-name derivation
or success flags. Use raw browser APIs, Node filesystem/SQLite APIs for the named service path, and
generic byte/encoding utilities. Hashes/counts prove acquisition integrity; **matching must occur on
original values before hashing, shortening, redacting or JSON summary conversion**.

Required R1 collection:

1. Enumerate every database, object store, key, index/schema name and record, with a read-only transaction
   across that database's stores. Recursively walk own string properties, object keys, arrays, Maps/Sets,
   ArrayBuffers/views and Blob/File bytes plus names/type. Preserve byte offsets/lengths and avoid invoking
   getters/toJSON. Cycles need a visited set; unknown cloneable types must be reported. CryptoKey handles
   are explicitly excluded opaque capability observations: record their public algorithm/usages/type
   metadata, never export them, and do not infer key confidentiality from R1. Other unhandled types
   make the affected mandatory surface incomplete.
2. Enumerate all localStorage and each live page's sessionStorage keys/values. SessionStorage must be
   measured before page close; an empty new page cannot retrospectively qualify the old one.
3. Enumerate every CacheStorage cache/request/response and inspect names, URLs, headers and body bytes.
   Opaque/unreadable responses make that claimed surface incomplete. This does not inspect HTTP disk cache.
4. Enumerate cookies from the test browser context (including HTTP-only values) and OPFS entries through
   the available root API. A missing API is `unsupported`, not an empty success. Before/after inventories
   must distinguish absence from unreadability. Acquiring OPFS access may create browser bookkeeping;
   record that observer effect and never present this as an unchanged physical profile snapshot.
5. Enumerate **all** tables, schema names, column names, TEXT and BLOB values in each fixture-owned service
   and authority database via read-only SQL snapshots. Discover tables from schema; never rely only on
   the Account table list. This sees current committed records, including visible WAL-backed state, not
   raw WAL bytes, prior versions or freed pages. No checkpoint/VACUUM/cleanup before physical R2 capture.
6. Capture application page errors/console output and service stdout/stderr from before startup. Keep
   scanner/test-runner output separate. Stored raw diagnostic capture is itself inspected. Report which execution contexts are attached; an unexpected worker with uncaptured diagnostics makes
   the declared run incomplete. No production proxy, system log or third-party telemetry is covered.

Quiesce test-driven mutations using explicit owner/native completion barriers. Never use “wait 100ms”
as a persistence boundary. Record inventory before and after acquisition; unexplained changes, aborted
transactions, vanished entries, unreadable bytes, unsupported types or exhausted budgets are incomplete.
Enumerating multiple databases is not an atomic whole-profile snapshot. Do not flush a journal-only
checkpoint merely to simplify collection. The journal test must establish that the marker is still
absent from the content DB while its synchronous journal entry has already been stored.

### Representations and limits

The first matcher supports exact string content and property/key names; raw UTF-8, UTF-16LE/BE bytes;
JSON-escaped forms; lowercase/uppercase hex; canonical base64/base64url with and without padding;
and structured byte arrays/views. Before execution, pin JSON/container traversal, encoded-string decoding and collection limits in
`scope.json`: depth 8 for recursive decoding, depth 64 for structured clones, 64 MiB per value,
256 MiB per surface, 1 GiB per checkpoint and 30 seconds per collector. These are initial engineering
budgets, not measured capacity. A limit hit is incomplete; raising it requires a recorded new run. Decode full candidate spans rather than searching just for a
needle's base64 spelling: prefix bytes change base64 alignment. Include a journal-style `2:` framed
span without importing the product journal decoder.

Calibration must cover offsets, 1/2-byte base64 alignment prefixes, Unicode/escaping, nested JSON,
byte-array chunks, Blob/File, unknown keys/tables and a marker straddling an I/O chunk boundary.
Keep enough overlap for the longest supported needle/representation. Decode depth/size exhaustion
and recognized unsupported containers are incomplete, not a clean result. For R1, ZIP/compression
decoding is deferred; deliberate export trials belong to the following packaged-flow phase.

Markers fragmented across unrelated records or transformed/compressed beyond that representation
set can escape R1. Character-by-character Yjs operations may never retain a whole marker contiguously.
Introduce primary W markers in a single actual edit and include this fragmentation limitation beside
every negative result. Calibration includes an unsupported fragmented example to demonstrate the limit;
do not combine unrelated records heuristically and label the result plaintext reconstruction.

## Controls, cases and decision rules

Before observing clean runs, execute the complete declared surface × supported representation matrix
with a fresh planted positive and clean negative for each applicable cell. Surface-level controls
include every collector, even surfaces absent in the normal app. Unknown database/key/table locations
must still produce the correct match; “unknown surface” alone is not a detected-needle control.
No cell may silently disappear because its producer is currently unused.

Effective collector controls omit one surface, skip a string key/Blob/byte view, hash before matching,
ignore a base64 prefix alignment, and truncate a chunk. Each must fail its named detection assertion
with the baseline passing. A diagnostic plant must come from the app/service stream, not runner output.
One test-bundle write-path leak additionally copies actual plaintext update bytes into a durable journal
side record before return; require a native write and a found W marker, not just the product refusing.
No production source is edited to make a control. No seed or factor belongs in URLs or served assets.

First production-path histories (fresh fixtures; fixed IDs below):

| ID | Required point and input | Observation |
| --- | --- | --- |
| P0 | Empty origin and service before account/genesis | Baseline census; detector markers absent; surfaces/capabilities recorded |
| P1 | Generated Local factor and confirmed genesis | F absent from persistence; sealed custody and routing structurally present |
| P2 | Master/card/actor/device-label edits admitted through the current workspace owner, journal held before content flush | W exists in live product read; journal contents have no W/F match at the held boundary; the planted side-write control must detect W |
| P3 | Explicit flush, supported compaction, lock/drain, cold reopen with factor | W/F absent at each collected point; cold content equals expected writing; preserve journal/content provenance |
| P4 | Browser `withRecoveryOwner.generate`, then persisted finalization with response held, then confirmed recovery | F absent; exact retained T paths reported. Use the real browser recovery owner, not only native `ready()` |
| P5 | Actual promotion/genesis/admission, including a lost final reply and retry | W/F absent from logical client/service carriers; distinguish persisted proposals from returned-only objects |
| P6 | Selected Account editor: local edit, actual HTTP submission and readback, then lock/cold reopen | Own content survives; no W/F in current service records or automatic diagnostics; no synthetic finalization or second-device enrollment |
| P7 | One refusal/cancellation and one journal-storage-failure branch through current owners | No automatic content/factor logging; previous acknowledged writing retained. Failure coverage remains these named branches |

R1 includes detector implementation, calibration and these bounded histories. If integration splits
across commits, report which IDs have actually executed; no empty placeholders count as passes. Add a
recorded-seed generated variation of edit placement, flush/lock/reopen and lost-reply order only after
directed cases pass. Target 24 histories as a practical exploration budget, not a statistical sample;
preserve counterexamples and shrinking, and bound the process with heartbeat/timeout evidence.

The primary outputs are counts of prohibited matches and completeness by cell/point. Acceptance is
**zero prohibited matches, every mandatory cell/point complete, every matching positive/control effective,
and successful independent cold recovery of introduced content**. A known T match must be listed at its
exact documented retained field/stage; an unexpected T match fails. There is no acceptable nonzero content-leak
rate. These deliberately selected, repeated observations do not justify a binomial confidence bound,
“99% safe,” or generalization to arbitrary histories.

Verdicts are `prohibited-match`, `complete-no-prohibited-match`, or `incomplete`. Report both a match
and incomplete coverage when both occur; finding one leak must not hide missing surfaces. Preserve raw
synthetic evidence and stop new application mutations on a prohibited match. Fix a demonstrated defect,
retain the failing case, then rerun affected controls and baseline. Timeout/unsupported/ambiguous cases
stay incomplete; do not average them away or increase a timeout without recording the reason.

## First implementation runbook and evidence

1. Pin production sources, dependencies, browser/OS versions, collectors, decoder limits and fixture
   entrypoints. Use new disposable roots only. Keep personal servers/profiles/recovery files untouched.
2. Generate controller-held needles and factors after asset compilation. Run isolated collector controls
   and the fixed representation matrix; write expected versus observed locators for each.
3. Execute P0–P7 in fresh histories, with passive diagnostic capture installed before application code.
   Use real owners, actual service issuance and completion barriers. Collect normal and fault versions
   separately; never clean leaked data to turn the same run green.
4. Validate intended live/cold content separately from the neutral collector. Hash and archive the exact
   synthetic captured values after scanning; label snapshots containing secrets and keep them out of
   app caches/service logs. Reports use needle IDs, offsets, lengths and digests, not secret excerpts.
5. Preserve `scope.json`, source/runtime pins, acquisition inventories/errors, representation matrix,
   match records, explicit known-T exposures, stage results, control outcomes, generated seed/failures
   and teardown status. Reject zero executed cases or missing reports. Verify personal preservation hashes.
6. Record only the bounded R1 result. The next phase qualifies packaged UI/SW/export flows and migration/
   clear transitions; physical profile/SQLite/WAL residue and platform custody are later separate runs.

Not measured here: live-origin compromise, arbitrary memory/swap, browser crash reports/history/session
restore files, deleted physical data, authenticator/cloud backups, historical personal exports, browser
extensions, other platforms, all service failure paths, total-loss recovery or future unimplemented
features. A prepared contract is not a confidentiality test result or a release gate closure.
