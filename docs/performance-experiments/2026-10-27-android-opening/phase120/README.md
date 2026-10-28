# Phase120 — reduced Android opening

2026-10-27. Evidence-only successor to immutable119-v2. Production remains `dc53fecf`;
the cumulative development source is signed `3ae02848` plus119-v2. No product repair,
release preparation, source/test edit or device update is part of this phase.

The same Pixel9a/Chrome156 account now has counterv5, baseline revision1,989,284 bytes,
`baseline-plus-suffix`, and zero content/heads/outbound rows. A read-only native snapshot
confirms this before locking. Maintenance is no longer reported as running. This is a later
observation, not a timestamp or trace of the first reduction's completion.

The operator locks without refreshing/closing, then enters both factors directly. A light
probe records only fixed labels, numeric times/counts/ciphertext lengths and public asset
locations. It preserves native request/Promise identities and automatically restores on editor
availability. No CPU/per-crypto sampling, argument/value retention or writing capture. The
operator confirms usable editing. Full numeric report is retained, with no account identifiers.

## Observed result

- Provider ceremony2,462.4ms; provider return to editable editor **6,172.4ms**.
- Three suffix read passes, all zero rows.
- Three complete baseline reads: four encrypted chunks per pass. Their native request windows
  are10.2,10.2 and8.2ms. These windows exclude subsequent authentication/replay.
- Three large main-thread tasks are1,421,1,377 and1,428ms. All post-provider long-task overlap
  totals5,199ms. No visibility change occurs during opening after provider request.
- Three additional warm chunk probes occur before editing; capture stops on editor availability,
  so this is a partial background probe sequence, not a fourth complete baseline load.

The earlier light capture in119 took76,158.9ms with10,997 suffix rows/pass and no baseline;
its earlier instrumented capture took71,923.7ms on a slightly different row census. The new
6.17s observation corroborates the operator's approximately7s report after reduction. This is
one later warm lock/unlock with DevTools attached, not a matched randomised speedup estimate,
a clean cold-start result, a production population bound or proof of which function consumes
each long task. The account's local representation changed between these observations.

## Concrete repeated work and safe next boundary

All six referenced public scripts match SHA256 from the retained published artifact. Their paired
retained maps resolve36 observed reads, and every mapped source matches signed `dc53fecf`.
`localBaselineStorage.ts:407` owns the twelve full-load chunk reads; `warmContent.ts:141` owns
three later probes. Main-thread tasks cannot be assigned to functions from read stacks alone.

Source independently shows `withRecoveryUnderPermit` initializes its temporary owner and calls
`loadAccount` again (`custody.ts:1134` onward), then disposes it. `contentStore.openSnapshot`
always reads/authenticates/replays an active baseline; its existing sealed-row reuse does not
skip that work. Active metadata also assigns a new view identity. Finally `accountCapture.ts`
initializes a distinct live owner after startup verification. These paths support the observed
three full passes, but the synchronous IDB callback stacks do not independently identify which
owner issued each pass.

The narrow next repair is same-owner baseline proof reuse after a fresh, exact authenticated
snapshot comparison. Startup-to-live-owner reuse is a separate handoff problem: the current
code deliberately forbids sharing view identities across owners. A safe handoff needs explicit
ownership, lifetime and erasure rules, and fresh route/authority, counter/witness, journal,
inventory, cancellation and commit checks. Neither a cached success boolean nor account ID,
revision or plaintext hash is sufficient. Corruption, rollback, authority/era changes, late
journal input, lock/reopen and a disposed producer must force refusal or fresh verification.

## Checks and limitations retained

The probe control verifies original Promise/request identity, numeric-only observation, private
sentinel exclusion and editor-triggered restoration. Closed-schema review rejects additional
private fields and non-public frame URLs; independent arithmetic confirms every number above.
The first extra-public-asset read fails sandbox DNS; permitted public-only retry succeeds.
No failing functional result is hidden by that apparatus correction.

After export, all three observed APIs are native again, the diagnostic global is deleted and
DevTools is detached. No real account data is cleared or changed by diagnostics. Numeric
baseline/cleanup observations and reproducer source accompany this packet. Production notification
stream errors remain a separate observation from119, not an attributed pre-editor cause.
General qualification remains paused; no gate or security check is weakened. First maintenance
conversion cost is investigated separately in121 rather than inferred from this reduced trace.
