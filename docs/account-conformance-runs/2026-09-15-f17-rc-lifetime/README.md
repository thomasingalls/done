# F-17 lifetime and Account composition qualification checkpoint

The selected integration is signed and signature-verified as **`132bc7d3`**. Production source,
tests, registrations, budgets and defaults remain unchanged. [Protocol and assessment](../../f17-rc-lifetime.md).

**The bounded workspace-history/scratch checks pass. Account qualification remains open on core
receive, which times out twice at its existing complete-file limit.** This packet is not a passing
119-case selection, default activation, new application-latency result or immutable release receipt.

## Observations

| Check | Result |
| --- | --- |
| Lifetime campaign | Four fresh contexts, R/C/C/R; 1,920 main text edits; 152 collection observations |
| Histories created per session | Reference 508; candidate 36; all destroyed and collectible after close |
| Quiescent warm histories | One reference; two candidate, with one idle fence |
| Pressure/write-lease close | At most two histories; discard/retry and drained close checked |
| Retained comparison scratch | At most two encoders; each ≤256 KiB and ≤1,024 cleared string slots |
| Large-input calibration | About 1.36 MB and 1,601 fields before cleanup; reentry/throwing/small-input checks pass |
| Deliberate faults | Retained history, accumulating idle listeners and dirty scratch all detected |
| Complete Account fixtures | Ten files / 102 cases pass; all owned groups drain |
| Core receive, first attempt | Timeout at 300.612 seconds including drain; 16 cases reported passing |
| Core receive, separate repeat | Timeout at 300.660 seconds including drain; 15 cases reported passing |
| Final authority-change case alone | Passes in 8.086 seconds; diagnostic command 9.971 seconds; no full-file credit |

The Account files cover receive/editor, all five sync files, editing, handoff, capture and admission.
Full sync includes R-01 historical 600 KiB entry handling. The separate input identities and failed
attempts are preserved, never merged into a fabricated single successful run. The core-receive
40-second individual-case limit and 300-second stage bound are unchanged. Its earlier 297/300-second
observation already identified narrow headroom; this phase does not establish the cause of all
runtime variation or rule out every performance regression.

## What the memory result means

Reference and candidate use the same integrated runtime, selecting `reference` and private
`local-snapshots` preparation respectively. The fixture uses real workspace/admission owners with a
controlled in-memory carrier. Native storage and Account observations come from the separate owned
fixtures. Each lifetime session keeps five closed workspace facades reachable while its observed
workspace histories and their documents become collectible. Candidate text batches create one or
two histories rather than the reference's 40; actual reuse is asserted, not inferred from the mode.

The observer tracks WeakRefs and scalar counters. CDP forces collection between separate JavaScript
tasks, at most five attempts. Scratch observation exposes scalar sizes/cleared-state checks only.
No observer or activation transform enters production. Exact original/observed source, helpers,
all observations, failed controls and process completion records are retained.

The primary observer tracks **workspace-history documents**, not every document in the application.
A supplementary two-mode probe confirms that a retained closed facade keeps its destroyed canonical
admission document and writing reachable; dropping that facade permits collection. Its const binding
and destroy-only disposal predate integration. The original protocol's broad “document” wording must
not be used to claim eager release of every document. Canonical-facade cleanup is a separate existing
hardening opportunity, not a demonstrated buffer regression or a forensic-memory guarantee.

Total measured heap grows about 1.8 MB in both modes. These short, instrumented, forced-GC observations
on one Chromium/macOS host do not establish general heap savings, long-session behavior, handset
performance, native IME behavior or secure erasure. Observations within a session are dependent.

## Failures, provenance and next boundary

The initial pilot fails before execution because its Playwright import path is wrong. A later pilot
observer attempts a forbidden read during close. The corrected pilot passes before the fixed campaign.
The first canonical probe reads the wrong Yjs length field and remains inconclusive on retained
writing; the corrected `_length` observation confirms it in both modes. All original helpers, reports
and corrections survive. Supplementary source copies are written before launch; their explicitly
labelled hash inventory is assembled afterward. Production source is unchanged.

Next repair/qualify the core-receive fixture's execution headroom using the preserved full attempts,
with semantic assertions and individual-case contracts retained. Do not blindly increase its limit.
Then run the unchanged application gate and decide default Local activation with explicit latency-
debt disposition. Optimization exploration is closed; Account buffer activation remains excluded.

Planning stays at 626 obligations, 290 required test files and 271 general files/2,189 dispositions
(11 not applicable). The zero test-file/96 command/63 campaign unresolved adapter counts do not encode
this new failed execution. No whole-wrapper obligation is resolved here.

## Retained artifacts

`summary.json` binds `artifacts.json.gz`, a content-addressed archive of 349 payloads: exact original
runtime, observed fixture/source, protocols and helpers, scalar measurements, native fixture code,
all owned receipts and referenced artifacts, full logs, controlled faults, failed attempts and the
record-preservation audit. Eight large frozen-input/browser inventories remain local and are hashed
in `raw-artifacts.json`; `--raw` checks them while available. The archive contains synthetic test
state, with no personal browser/profile content. The verifier also checks current source equality;
later intentional source changes must distinguish historical evidence from current-tree equality.

```sh
python3 docs/account-conformance-runs/2026-09-15-f17-rc-lifetime/verify.py
python3 docs/account-conformance-runs/2026-09-15-f17-rc-lifetime/verify.py --raw
```
