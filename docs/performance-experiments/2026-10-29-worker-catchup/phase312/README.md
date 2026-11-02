# Phase312 — dense signed-page prototype and cut probes

Lab only; evidence/docs only. No format, verification, writer, test or manifest change lands. The isolated root is `/private/tmp/done-dense-page-lab-20261031`; prior roots remain intact. G/R on, S1Y1, V/D off; range writer remains default off outside the lab, v2 development-only, service automation off. No performance or acceptance credit is claimed here.

## Prototype contract

P stores one self-contained physical heads receipt per admitted signed-page extent. A provisional closed binary frame contains baseline, initial link, explicit first-entry/count and exact original request/page byte strings. No registry, process-local page alias or external reference supplies missing bytes. Shared bounded dispatch reads legacy JSON receipts and P. The format remains an operator decision.

All admitted logical entries go through the existing stored verifier, with their original request/page and selected index. Fresh reception still executes per-entry crypto/decryption, expiry, authorization/history, ledger/witness and commit checks. This deliberately retains ephemeral legacy encoding and conservative old size checks; it does not introduce E or F. Full retained-prefix comparison remains on when V is off. A signed page does not authorize its unchecked tail.

`inboundLedger`, `incrementalAccountLedger`, membership/successor epoch boundaries, handoff, membership reading, replacement source, retention classification and receive/native storage use logical views. Indirect content/membership stream quotas also charge expanded logical entries. Memo keys include physical sequence and entry index. Witness/counter events remain physical, while received positions, native G allowance, rate/fairness, stream limits and the 1,024 audit weight remain logical. The 32MiB/32,768 index bounds are unchanged; P charges physical bytes plus bounded expanded original-wire ownership, rather than just smaller row count. No boundary is raised.

Native writes coalesce only fully verified selected results from the same original page and recheck unchanged atomic byte/write limits. Tail extents may store a page again; committed page hashes and explicit extents are logged for later duplicate accounting. No deduplication authority is inferred from those diagnostic hashes. The writer requires both the explicit P lab bit and the existing range opt-in.

## Results and inconvenient attempts

Final source/probe typecheck passes. The final focused run passes **56 checks in five files**, including four new logical-reader checks and the authenticated interior-cut/native-v5 reopen. These are exploratory probes, not a hardened regression or full-suite claim. The unchanged canonical full suite already passed in phase309 (283 files,2,855 pass/1 skip); no new full-suite claim is made for P.

Every unit attempt1–9 remains. Initial failures were unresolved config import, missing copied crypto fixture documentation, an incorrectly ordered new incremental API call, then a missing self-receive advancement step in the new test. A later new probe called nonexistent `close` rather than the carrier's `dispose`; that failed before cold. Subsequent corrected checks pass. The first unit sampler was sandbox-blocked and has no host trace; later attempts have the external5slog. Typecheck attempt1 incorrectly disabled incremental compilation for a composite project; the broad copied test tree also lacked unrelated script inputs. Final typecheck selects the actual application/protocol and new probe closure, with strict flags retained. All errors/logs remain.

The native browser probe retains **four attempts**:

1. A total-commit barrier did not stop at its intended point; backlog drained and the probe timed out before cold.
2. A peer-cursor barrier still assumed a zero starting cursor. The fixture actually has an authenticated preexisting prefix, so it also missed the intended stop, before cold.
3. A relative-cursor barrier reached the genuine native cut, removing58rows and installing local baseline revision1. The live owner safely invalidated the old tail and fetched a fresh original page. An assertion expecting the same page therefore failed, before cold. This does not prove an admitted page-straddling suffix.
4. The same real native cut/refetch path and fresh original Page owner reopen pass exactly. No browser storage is reinserted for that reopen. It is fresh-owner local validation, not an offline browser-process restart.

The **separate discriminating interior-page probe** uses genuine independently signed membership/checkpoint evidence: a cut at peer position1 inside an original two-entry page; every entry is verified, and handoff returns only original-page entry1/position2. A real v5 local baseline covering position1 is created first, the checked suffix plus updates is appended, the carrier is disposed, and a new carrier cold-opens the reduced baseline-plus-suffix exactly. The final run records `attemptStarted:true, exact:true`. This uses the IndexedDB test implementation, not a real browser database. The browser probe above independently exercises the physical P native writer and cold reader, but does not turn that unit cut probe into a physical-browser interior-cut result.

No actual no-F cold failure occurred. No reader needed a weakened check. No timing screen has started. Final focused probes include exact raw-wire round-trip, logical limits, unique memo keys, decryption of every entry, wrong-baseline/corrupted-wire refusals, effective-prefix cut handling, full census, epoch/witness, checked incremental/reference agreement and handoff suffix ownership. These finite probes do not establish all compatibility or corruption cases.

## Explicit omissions and continuation

P deliberately omits **old-tab fencing, rollback behavior, conversion of existing v2 rows, encrypted handoff capability/version negotiation and final binary schema selection**. It also lacks the complete hardened parser/reader, corruption, boundary, interruption and cross-generation/retired-key proof suite. The same-page cut/native-v5 test is not a physical-browser process-restart test. No historical rows are converted while reading, and no legacy fixture is relabeled as a P-grown profile.

Next, in a new root, grow P reader fixtures through the P writer, then run the operator's declared P×V deep screen (three/arm), grown maintenance (two/condition/format), R1.5s/1s, 3,072-position diagnostics, three new Dpairs, and every original plus separate grown gate (three/cell). Keep every failure; one failed replicate fails the cell. Keep reader completion/journal/capacity and durable preparation bytes. Any no-F cold failure stops immediately. P1V0missing30s requires reporting the stage split, never restoring V. No hardening is authorized.

Landing needs remain separate: S needs fresh-work clock/resume/capacity controls; Y needs pure-priority10s versus other60s and quiet/wake race evidence; G logical limits/fairness; R post-drain timing and normal traffic; D exposed H1/H2 comparisons; P all compatibility, format, physical-cut/cold, verification and bounded-work contracts above. V remains comparison-only, C reserve, F never. All original gates and deadlines, including120smaintenance and>=60overlap, remain unchanged.

[Raw evidence index](./evidence-index.json), [copy check](./evidence-check.json) and [source identity](./source-identity.json) retain the exact bounded evidence. Builds, application source, databases, profiles and credentials stay outside the repo.
