# Third sparse write: publication to Window — phase 447

The third sparse write is delayed, not absent from the service or the eventual
Window mirror. One observation-only diagnostic repeats the original known-backlog
normal case on an exact clone of the closed fictional seed, using the same frozen
assets and installed Playwright browser. It fails the original sparse-visibility
assertion again, in **68.418 s**. This grants no acceptance or Stage 5 timing credit.
The phase 445/446 failures remain unchanged.

## The traced path

Times below are seconds after the hot-writing phase starts, not the whole test.
Network timestamps are when the Node observer handles the browser event; they can
lag actual browser progress while the shared service/test process is busy.
Window timestamps use that page's performance clock translated to epoch time.

| Boundary | Sparse 20 | Sparse 40 | Sparse 60 |
| --- | ---: | ---: | ---: |
| Offered by the test | 10.005 | 20.009 | 31.473 |
| Accepted decision observed | 10.403 | 20.991 | 36.174 |
| Request returning its signed page observed | 10.415 | 20.997 | 44.847 |
| Response headers observed | 10.436 | 21.449 | 53.834 |
| Response body observed | 10.440 | 21.455 | 54.763 |
| Post-commit Window preparation arrives | 10.861 | 21.484 | 55.725 |
| Marker visible in Window mirror | 10.863 | 21.487 | 55.728 |

The three signed pages contain sparse publisher positions **18, 19 and 20**.
Each envelope digest exactly matches its saved accepted service tuple. This
read-only syntax census grants the app no new authority. The third offer-to-Window
interval is **24.255 s**; its final Window prepare/apply/reply exchange is only
**3.4 ms**. The original cutoff is **55.687 s**, about **41.4 ms before** the
third marker first appears in the mirror. All three Windows contain all three
markers in the diagnostic's final cached view. Do not regrade the failed cutoff.

A native commit is not independently timestamped. The existing single-page and
group paths call `promote` only after append, fresh authenticated readback and the
unchanged stamp check. The prepared Worker queue then requests `workspacePrepare`;
its final task/authority check holds through the `workspaceApply` acknowledgment.
Thus commitment/readback precedes the observed prepare boundary by the source
contract; this trace does not establish an exact native commit duration or cold
exactness. No owner-close message occurs during the hot interval.

## Where receiving waits

The receiver repeatedly includes the sparse publisher in requests. It is usually
an extra quiet request after the hot publisher. Three fully observable replies
omit that sparse suffix entirely: requests 513, 517 and 543 return only hot
positions 63; 64–65; and 69–70. Their complete bodies are 1.7–3.5 KiB. Two other
response bodies (525/530) are aborted/unavailable to the browser observer and stay
unknown, rather than being counted as partial replies.

The server deliberately permits prefix-only batches: `readInboundBatch` stops
following a completed inner read after its unchanged **250 ms** work budget, or
at the **10 MiB** response bound. The omitted sparse page is itself small. The
observed prefix-only replies and request order are consistent with the work cap
cutting off appended quiet probes. The cap's exact firing time is not directly
instrumented. The client correctly treats extra pages as unverified originals;
no omitted suffix advances a cursor or earns proof reuse. Native allowance is
still eight logical positions, so these data do not establish a violation of
that durable fairness assertion (which is later in the test and unreached).

The successful third read comes in request 545, with the self check followed by
the sparse check, after the observed hot-prefix run. Most delay precedes the
Window handoff: about 4.7 s until the publication decision is observed, another
8.7 s until the returning read is observed, then 9.0 s until response headers.
These are diagnostic event intervals, not attribution of CPU or network cost.

The shared Node process hosting the service and test becomes busy as responses
slow across all devices. **Its CPU is not yet attributed** between service work,
fixture assertions and browser-event observation. No server or wire repair is
made. The next bounded diagnosis should separate those costs and examine how an
omitted quiet suffix regains a native turn, keeping the work cap and every guard.
This is not evidence for an idle-poll-only explanation: requests continued.

## Evidence limits and preservation

Fourteen five-second host samples show swap flat at 15,824.31 MiB. No sustained
non-test process over one full core triggers the operator's noise retry rule;
a single Codex renderer sample reaches 142.1%. Keep all host observations and
windowed power logs. Display protection/checks are unchanged. No profiler runs.

Chromium's request-body representation cannot decode 81 binary submissions; keep
those observer errors. Accepted response positions, actor identity, saved accepted
tuples and returned envelope digests bind the publication path instead. Observer
overhead is unmeasured. The metadata observers neither modify messages nor send
requests, flush, retry, grant trust or bypass erasure. Inverse edits restore the
entire original spec byte for byte, retaining every assertion, wait and deadline.

Keep the initial private-root ESM collection failure (no app executed) and the
reviewer's initial mistaken classification of a two-page reply as a missing
sparse suffix. Correcting that classification requires no new app run. The
reporter's extra error only says maximum failures stopped collection. Later
archive, Undo and ordinary offline cold assertions remain unreached.

[Evidence](./evidence.json) references committed sources by SHA/path and the local
observation originals by SHA-256/size. No source archives, profiles or raw full
power logs are added to the repository. This patch changes documentation only.
Stage 5 remains held; no app repair, commit, push, publication or deployment.

Release-validation inventory/policy and debt-bookkeeping checks pass;
`git diff --check` is clean. These checks do not change the failed app result.
