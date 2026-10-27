# Phase91 — Post-passkey opening and safe cancellation

The operator identifies the minute-long wait **after the unlock code and passkey prompt complete**,
with “Use your passkey to unlock” still visible; Back interrupts it. This excludes code-entry time
from the reported interval but does not identify which later operation is slow.

## Concrete defect and repair

`firstDeviceSetup.openAccount` published the passkey title before calling the provider and never
replaced it after return. All later authentication, classification, custody/ledger opening and editor
construction therefore wore a stale prompt. Await the assertion; retain lifetime guards; then show
“Opening your encrypted writing…” and explain access/saved-writing checks and safe Back cancellation.
Provider return is **not** labelled verified access: real proof verification still happens afterward.
No additional passkey prompt, check removal, code retention or writing-format change is introduced.

The coordinator calls `close` on Back: abort the lifetime/login ceremony, retire editors, await the
operation and any late-opened workspace, then release the setup lease. It does not call removal.
Three new boundary tests hold provider/owner completion: status changes while opening is held,
Back cannot publish a late editor and preserves saved setup, and provider rejection cannot show the
post-provider phase. These use mocked factor/owner boundaries and do not prove the real ledger's
cryptographic guarantees. Four existing real Local-factor/access/cancellation cases remain and pass.
Together with7 heading helper cases, the focused invocation is14/14. The new file retains its own
unresolved aggregate adapter obligation; no qualification credit is inferred.

## Startup path and remaining attribution

The original-device path runs a full `localCensus` before requesting the passkey and a fresh census
again after the assertion/proof. It then opens custody/envelopes/rotation keys and authenticates the
saved ledger. The owner composition subsequently performs additional initialization/replay before
publishing an editor. The two censuses straddle an external ceremony and establish current-state
agreement; removing one without a replacement freshness proof is not authorized by a slow-open report.

For the combined online assertion, `NetworkLogin.#prove` locally checks the returned proof and saves
its pending carrier. The network finish is normally activated afterward in the background; an HTTP
finish wait is not established as this phone's pre-editor cause. Existing packaged depth evidence
shows received-history opens improved2.340s→0.902s on a desktop after real local reduction. Neither
that fixture nor the native1,201-position result predicts this phone's minute. Server pruning does
not establish that its separate device-local reduction completed.

Reuse those measurements rather than repeat a broad depth sweep. The next discriminating evidence
is one actual slow cold open: whether a local baseline exists, numeric loaded rows/bytes and phase
costs. No physical-phone trace has been captured, so the minute remains unresolved.

## Content-free development diagnostics

With `VITE_ACCOUNT_LEDGER_PROFILE=1` only, opening resets a bounded milestone table and marks started,
provider return, authorized, classified, owner and editor. New cost names split preflight census,
post-assertion census and custody/ledger work. Existing work counters supply rows/bytes/full baseline
replays. These are numeric metrics with fixed labels; no writing, identifiers, codes, keys or record
bytes are added. Production-default builds do not expose these profiling globals. Successful phase
timings do not describe a failed/incomplete phase, and no source inspection substitutes for a trace.

On an explicitly chosen diagnostic development build, after opening, inspect
`__doneOpenMilestones()` and `__doneLedgerMetrics().costs`; subtract the started snapshot's counters
from the editor snapshot. In particular compare providerReturned→authorized, authorized→classified
and classified→editor. Preserve an aborted/slow attempt as such rather than replacing it with a
passing warm reopen. Do not clear browser storage or weaken factor/ledger verification to profile.

No preview restart, real-account access, release preparation or deployment occurred in this phase.

## Construction-location readback

The first normal source-check run refused the shifted `genesis-checkpoint-key` site. An independent
normalized TypeScript AST comparison confirms the complete `cpKey` derivation is unchanged. Update
only its registered accountStartup line147→157; all labels, arguments, contracts and blockers remain.
The failed check and derivation comparison are retained. Use patch91-v2; the initial artifact is
preserved and superseded, rather than silently rewritten.
