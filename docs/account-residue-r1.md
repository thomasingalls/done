# R1 logical-carrier scanner: implementation and limits

2026-09-12. Implements the first executable boundary of
[the prepared residue contract](./account-residue-testing.md). Execution and preservation are recorded
separately in the conformance evidence. R2 physical residue and broader F-21.4 coverage remain open.

## What the instrument observes

`test/account-residue/browser-collector.mjs` uses platform APIs to enumerate all discovered IndexedDB
stores/keys/schema and raw structured-clone values, localStorage, each live page's sessionStorage,
CacheStorage request/response data and OPFS files. It never selects databases by the application's slot
index. Native typed-view offsets, Blob/File bytes, Maps/Sets, property keys and cycles are handled.
Opaque CryptoKey handles are counted with public metadata; their contents are explicitly outside R1.
An unhandled type is incomplete. Cookie acquisition includes HTTP-only cookies through Playwright.

`node-collector.mjs` enumerates every current table/schema/TEXT/BLOB in both fixture-owned SQLite files
using read-only transactions. A worker enforces the collector deadline even if synchronous SQLite
blocks. This includes currently visible WAL-backed records, not physical WAL bytes or deleted pages.
The whole browser/service acquisition runs twice, retaining both observations and comparing their
raw contents for stability. This is not a cross-database atomic snapshot. OPFS access may itself create
browser bookkeeping; R1 does not claim an unchanged physical profile.

The actual service runs in its own process, with stdout/stderr captured from startup. Page console
arguments are captured through a generic bounded clone reader: `console.text()` or `jsonValue()` alone
would lose Blob and typed-view data. Page errors are included. Unexpected workers, unreadable arguments,
missing surfaces, unsupported types and exhausted budgets prevent a clean result. Test-runner output
is outside the app/service diagnostic domain.

`matcher.mjs` accepts only bytes and an independently generated needle manifest. It imports no product
parser, opener, storage-name derivation or encryption helper. Original values use lossless tagged/base64
transport to Node, not shortened JSON summaries. Matching precedes hashes and report redaction. Text,
UTF-16 in either byte order, JSON strings/keys/byte arrays, hex, base64/base64url and nested forms are
examined within the pinned budgets. Whole encoded spans are decoded to handle prefix alignment.
A raw random 32-byte calibration needle is supported; this does not inventory unknown real keys.

The policy layer runs after collection and matching. Writing markers, literal known factor spellings
and private HTTP capabilities are prohibited in the inspected carriers. The browser recovery row's
exact `retryKey` and `finalization.retryKey` fields are reported as sensitive expected exposure. They
are not labelled public metadata. Unexpected legacy carriers in fresh trials cause incomplete results.
Neither metadata-looking keys nor valid product MACs authorize a plaintext writing match.

## How the trial reaches the storage

Assets are compiled in memory before markers or factors are generated. All accounts, authenticator
keys, service databases and browser contexts are disposable. The controller retains synthetic factors
outside the inspected application/service domain; none is embedded in the served assets or URLs.

P0–P7 exercise current owners: fresh Local genesis, master/card/actor/device-label commands, a held
journal-only point, flush/compaction, lock and fresh-page factor-opened replay; the real browser recovery
owner at generation, retained finalization and confirmation; actual HTTP promotion with a lost final
reply; selected capture, spool and delivery preparation; then the syncing Account editor and readback.
A wrong factor, cancelled open and failed localStorage write exercise named failure paths. Journal
failure is allowed to use the existing durable database fallback; cold replay checks its result.

The journal-only point uses a test-bundle switch to hold the automatic flush scheduler. Explicit
`whenDurable()` still executes the real flush. The content-record count is captured after ordinary
initialization and before any W input; it remains unchanged while the journal entries and live writing
are present. A separate bundle copies the actual update bytes into an unexpected localStorage record
before returning. The native edit must be acknowledged and the scanner must find its W marker.

Account setup calls the real capture/spool/delivery preparation owners in order. It does not forge
retained stage markers. Fixture authenticators sign genuine service challenges; the service verifies
them and issues its own answers. After publication, the test explicitly invokes the existing receive
retry action. Polling cadence is not measured by this trial. "Cold" means a closed page followed by a
fresh page and factor-opened owner; this phase does not restart the OS or copy a writable profile.

Calibration uses fresh distinct markers for each applicable surface/representation cell, with an
empty clean census and a planted census. Grouping cells in one disposable origin does not make them
independent statistical samples. Controls omit each collector, skip property keys/Blob/views, truncate
a file crossing the 64 KiB point, hash before matching and omit base64 decoding. A failure is credited
only against its passing detection assertion. Unicode, nested escapes, diagnostic Blob/views, opaque
keys and unsupported clones have separate directed checks.

Generated histories vary edit placement, flush/lock/reopen, compaction, actual lost replies and later
Account edits. Seed `1121040` determines the operation schedules; cryptographic randomness and unique
markers are fresh per attempt, including shrink attempts. Twenty-four histories are an exploration
budget. Every attempt records its progress and retained observations. No failure-rate confidence
interval or population-wide confidentiality claim follows from these selected histories.

## Reading the result

A clean R1 result says that no prohibited sentinel representation was found in the listed logical
values at the measured points, all mandatory acquisition succeeded, controls detected their plants,
and independent expected-content assertions passed through cold replay. It does not say that all
possible secrets or all possible writing are absent from every filesystem byte.

Fragmenting a marker across unrelated records is a demonstrated detector limit. Character-by-character
Yjs history may not contain one contiguous marker. Primary W inputs therefore insert each marker in
one real edit. Other transformations, arbitrary compression, physical profile/SQL/WAL remnants,
HTTP disk cache, crash/session/history files and unknown key material are not qualified. ZIP/gzip
signatures encountered in a scanned value make that representation incomplete; no decoder is invented.
Live-origin access and memory/GC/OS erasure remain outside this claim.

Packaged UI/service-worker/export flows and synthetic migration/clear transitions are the next bounded
phase. They must retain the distinction between intentional exports, pre-cleanup legacy exposure and
prohibited copies. Later filesystem/container and supported-platform copied-profile work supply
separate evidence; no personal-profile inspection, real enrollment or deployment is part of R1.
