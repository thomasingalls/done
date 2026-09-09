# Authenticated legacy source cleanup preparation

This bounded L-1 owner follows verified Local selection (`4f40ede`). `cleanupLegacySource` remains an internal
preparatory entry point, exercised only on synthetic profiles under externally maintained predecessor
exclusion. It does not expose a default application cutover route, select the real Stage 2 carrier, retire
cached shells/workers/transport or claim a whole-profile/forensic residue scan. Same-origin source equality
cannot establish exclusion, detect ABA or prevent an old writer after the last read. A production route still
needs an implemented supported-version exclusion procedure; no caller boolean or receipt substitutes for it.

## Authority and recovery

The operation copies and verifies the same explicit Markdown/system recovery packet and complete plan binding
used for selection. Under the exclusive slot lifetime it authenticates the selected Local claim, exact route,
live factor custody, content witness/counter and all current encrypted records and journal entries. A new private
Yjs document replays the journal-inclusive recovery, refuses pending dependencies and requires every immutable
receipt coupled to an imported action. Selection already verified the logical import. Cleanup permits subsequent
admitted edits and compaction; it does not require current text to equal the earlier source. Missing coupled
receipts or unreadable destination material refuses before source deletion. This internal recovery seam exposes
no keys or write methods and zeroes opened byte buffers after the callback.

Initial cleanup reobserves the whole source and compares the selected source digest before persisting intent.
The signed ready Local claim gains an optional closed cleanup record with an independent random intent, the
fixed predecessor DB fingerprint, exact journal and ancillary key fingerprints, and a progress cursor. A separate
HMAC payload domain authenticates both the record's presence and every field together with the immutable selected
provenance. Fingerprints use a root-derived HMAC key separated by cleanup intent; no source values, content,
friendly names, transport tokens or promptless openers are added to progress metadata. The key names themselves
remain in the manifest. Only the fixed supported legacy layout, journal framing and four ancillary names qualify.

The operation first removes the exact `done` predecessor database, then each captured legacy journal entry, then
ancillary actor/device/sync/last-sync entries. Before each effect, it checks all surviving keys and values against
the manifest, checks database identity/absence and verifies previously removed material stays absent. Unknown,
changed, unexpectedly missing future, or reappearing past material refuses. Synchronous removal compares the
captured value immediately before `removeItem` and requires absence afterward. Modern scoped encrypted journals
and unrelated keys/databases are outside the manifest and preserved. No prefix sweep or `localStorage.clear` runs.

Each cursor value durably authorizes exactly one effect. A restart tolerates that current effect already being
absent because deletion may have completed before its progress transaction. Future material must still match;
previously completed material must remain absent. The next signed cursor commits only after verifying the effect
and exact prior Local claim in a native custody transaction. Request success is never progress completion. The
terminal cursor checks absence again on retries. The manifest stays outside deleted source carriers and remains
authenticated without those carriers. The recovery packet and factor are still required by this preparatory API.

Native database deletion can remain blocked and cannot be cancelled. The task retains its lifecycle permit until
the queued deletion actually settles, even if cancellation has been requested. Progress observers do not authorize
cleanup or release this permit. Interruptions never delete, recreate or roll back the selected destination.

## Imported Local clear

Imported Local clear now requires authenticated terminal source cleanup and a fresh known-source absence check.
Its immutable target includes the source origin; a distinct factor-derived clear payload authenticates its presence.
Every clear census checks source absence, including after destination custody has been removed and on terminal retry.
An interrupted clear cannot report completion while recognizable material reappears in these known app-managed
source carriers. A changed/unknown legacy carrier refuses instead of being swept. Fresh Local clear retains its prior
payload and target. Partial imports and multi-workspace/shared custody cleanup still need separate owners.

## Bounded evidence

`pnpm storage:legacy-cleanup` freezes production sources and test helpers and runs native IndexedDB/WebCrypto/
Web Locks in disposable Chromium. Directed cases cover wrong authority, cold destination and journal recovery,
exact source matching, deletion/clear interruptions, blocked-delete cancellation and retained permits. Generated
histories vary external source text/day/archive/DB-WAL framing, journal-only destination edits, progress aborts,
restart and changed retained keys. The external Node string ledger supplies the expected destination. Named fault
controls must fail their specific assertions; generic exceptions or timeouts do not count. `--seed`, `--runs`,
`--path`, `--replay`, and `--mutant` retain reproduction and shrinking. The separate unit property varies smaller
Unicode inputs and partial progress with fake IndexedDB; its lock stub is not native exclusion evidence.

The cursor tolerates one ambiguous effect per durable boundary; it does not detect byte-identical restoration of
that current effect. Repeated whole-manifest comparisons and complete destination/packet replay have bounded
refusal sizes, not established latency/memory acceptance. One Chromium host and finite generated alphabets do not
establish protocol-wide correctness, adversarial-unlocked-code isolation or supported-browser/security approval.
Whole-profile residue, production old-executable exclusion, default cutover and the real carrier decision remain gates.

## Harness diagnostics and deadlines

**Validation status at `4c3c3ab`: incomplete.** The implementation was committed while the native generated
campaign was unresolved. Earlier directed PASS output does not establish completion of the generated histories,
shrinking, fault controls or teardown. The retained [history and diagnostic](../test/legacy-cleanup/regressions/captured-4c3c3ab/README.md)
are preserved with provenance; their exact pairing and minimality remain unverified. No cleanup runtime change,
historical replay or native campaign was performed in the subsequent harness instrumentation checkpoint.

`pnpm storage:legacy-cleanup:harness` tests only the Node diagnostics, fast-check orchestration and supervisor,
using synthetic exceptions, stalled promises and disposable Node subprocesses. It launches no real browser and
imports no cleanup runtime. It is a prerequisite in `pnpm check`; it cannot substitute for the native campaign.

The native runner now uses an external supervisor and a campaign worker. Each directed case and generated or
shrinking trial prints its start; trials identify their attempt, seed, stage and input hash. A heartbeat every
15 seconds lists active operations. `events.jsonl` adds operation timing and serialized browser refusals, including
message, stack, code, disposition and nested cause. Fixture call arguments, recovery packets and unlock material
are not logged. These diagnostics are for the synthetic fixture, not an interface for production profiles.

Before each property attempt, `<campaign>-current-input.json` stores its input. Before fast-check can shrink a
failure, `<campaign>-first-failure-input.json` and `<campaign>-first-failure.json` store the original input and
exception; subsequent shrink attempts do not replace them. Completed shrinking still writes the existing final
counterexample and path. `report.json` is checkpointed atomically throughout the run, before teardown and at
completion. Partial reports retain completed assertions, active operations and trial identity. An old discarded
browser stack cannot be reconstructed without another execution.

All deadline flags take positive integer milliseconds:

| Flag | Default | Boundary |
| --- | ---: | --- |
| `--call-ms` | 30000 | Fixture evaluation, restart and startup operations |
| `--case-ms` | 120000 | One directed case, generated history, control or replay |
| `--campaign-ms` | 600000 | One fast-check campaign, including shrinking |
| `--shrink-ms` | 120000 | Total shrinking time after the first failure |
| `--teardown-ms` | 10000 | Each resource close, and worker exit after its final report |
| `--run-ms` | 1800000 | Entire worker lifetime, enforced by a separate process |

These are diagnostic budgets, not measured performance requirements. Exhausting any budget fails the run and
cannot count as detecting a named fault control. The worker stops admitting new trials and attempts each resource
close even if an earlier close fails. The external supervisor can terminate a wedged worker and its registered
disposable browser process group on POSIX; the Node-only controls exercise that process boundary on the current
host. This is not cross-platform native-browser validation. A successful final report also requires a clean worker
exit; assertions passing before a leaked handle does not produce a successful command.

A watchdog bounds the harness wait; it cannot cancel an in-flight IndexedDB deletion or authorize early release
of a production lifecycle permit. Disposal/termination abandons the disposable test context. The production
blocked-delete contract above remains unchanged.

`--mutant baseline --replay <input.json>` now runs only that saved history, with no directed cases, generation,
shrinking or controls. Outputs still use a fresh directory and freeze the current sources. The next bounded work
is that replay and root-cause diagnosis, followed by any repair and the complete native campaign; none is credited
by the instrumentation tests.

## Focused bulk-encoding repair

The user's `2026-09-09T19-10-29.708Z` run passed 45 directed cases, then failed generated history 21
with `Field too long`. The 120-second shrink budget subsequently expired; teardown completed. The actual
failure was a mismatch between the source reader's 16 MiB bound and cleanup's use of a 65,535-byte field
for hex-encoded database rows. The same field-width issue also affected large local values and manifests.
The [confirmed input](../test/legacy-cleanup/regressions/field-too-long-2026-09-09/README.md) is retained;
the earlier generic diagnostic remains historical evidence rather than a proven exact replay pair.

New cleanup intents now use `sourceCleanup.v = 2`. Cleanup-only MAC messages encode a UTF-8 JSON array
whose first element is the domain (`done/legacy-cleanup-entry/v2` or `done/local-import-cleanup/v2`)
and whose remaining elements are the existing field strings. JSON escaping and array framing retain field
boundaries and all string code units, including non-ASCII values. The fingerprint KDF uses the corresponding
`done/legacy-cleanup-fingerprint/v2` domain. HMAC still authenticates the complete message; nothing is
truncated or persisted as an unkeyed source-value digest.

The authenticated manifest version selects both fingerprint and claim-authentication encoding. The reader
accepts v1 and v2; an existing v1 intent keeps its original MAC bytes, fingerprint domain and progress
version when resumed. There is no fallback verification across versions or automatic reinterpretation of
old signed progress. Old executables that only know v1 cannot read v2; production predecessor exclusion
remains a separate gate. Shared custody `fields()` and all non-cleanup constructions retain their v1 format.

Source/manifest refusal bounds and whole-input memory processing remain unchanged. This removes an accidental
encoding limit; it does not establish memory or latency acceptance at the maximum supported input sizes.

The generated native abort check now requires a fixture receipt identifying the exact transaction boundary,
as well as a storage-failure refusal. An unrelated exception cannot satisfy that injection. Reports retain
per-campaign `firstFailures`; a failed run's `failure` preserves the original error while `terminalError`
records the eventual stop, including an exhausted shrink budget. Expected fault-control failures remain
separate from the overall pass/fail result.

[Executed focused evidence](./storage-conformance-runs/2026-09-09-legacy-cleanup-size-repair.md) covers the saved
native replay, ten affected native cases, the full unit suite and encoding/property regressions. The full
60-history native campaign, complete directed set and all seven fault controls must still finish together
before source cleanup is accepted. Migration coordination and default cutover have not advanced.
