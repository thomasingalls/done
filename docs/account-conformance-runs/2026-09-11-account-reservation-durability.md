# F-15 reservation durability evidence — 2026-09-11

Outcome: **fixed for the current private protocol under the stated strict-persistence assumptions**.
Base `ec889d9` is signed. The three-file runtime repair and this evidence remain uncommitted.
[Contract and complete grant inventory](../account-reservation-durability.md).
[Raw summary](./2026-09-11-account-reservation-durability/summary.json),
[source pins](./2026-09-11-account-reservation-durability/sources.json),
[review](./2026-09-11-account-reservation-durability/review.md),
[preservation](./2026-09-11-account-reservation-durability/preservation.json).

## Before and after

The original default/relaxed implementation completed a reservation and then invoked real AES.
After one legitimate retained event and a second abandoned encryption, modeled loss of the unflushed
reservation left count **1** against **2** observed invocations. The original assertion and actual
transaction trace are [preserved](./2026-09-11-account-reservation-durability/before/native-power-model.json),
with [failure output](./2026-09-11-account-reservation-durability/before/native.log). Enrollment and event
replay had passed before the loss injection. This is an explicit storage-loss model over real owner/AES
execution, not a physical power interruption.

After repair the same fixture retains count **2**, cold-reopens and successfully appends under a fresh
reservation. Custody AES follows a strict completed root reservation. Content allocation and final
record/witness writes request strict; both transaction helpers require reported strict before bodies run.
Existing promotion strict writes now receive the same capability check. All native work drains before
refusal, including completion winning an attempted abort. Synchronous transaction-construction throws
remain raw refusals with no transaction/body to drain. Readonly access stays available.

A separate network fixture identifies the actual encrypted attempt entry at its outer record transaction.
Downgrading that final commit prevents network AES even though local sequence allocation already succeeded.
Abandoning actual network encryption retains its attempt; retry consumes a new one. Existing spool tests
retain exact retransmission bytes, including after restart and compaction.

The generated model ran **4,000 shrinking-enabled histories**, seed **150915**, at most 300 commands,
with two pending actors and root/store/network budgets. Allocation, conflicting completion, invocation,
retention, abandonment, flush, page loss and OS loss are separate transitions. Ciphertext absence cannot
refund an invocation. Directed successful histories reach the allowed budget in every domain and refuse
its first forbidden use. Independent relaxed-persistence and early-invocation controls yield shrunk
undercounts; their seeds, paths and commands are preserved. The model assumes strict completion persists;
native mapping/option tests establish the implementation boundary, not physical flush behavior.

## Verification gates

1. Diff/callers reviewed; `node node_modules/typescript/bin/tsc -b --noEmit` passes. Fresh read-only
   investigation and one fresh candidate review found no remaining concrete bypass/regression. A
   documentation overclaim about construction-error wrapping was confirmed and corrected.
2. New model/native/network tests: **20 passed**. Default, relaxed, missing and throwing reported
   durability refuse before body execution; thrown options and failed abort are exercised. Existing
   allocation-order, exact-MAC, budget and renderer-lifetime controls still distinguish omitted guards.
3. `node scripts/account-reservation-durability/run.mjs` (also `pnpm account:reservation-durability`):
   **50 stages pass**, **855 source hashes match** at completion. **133 Node tests** include the new
   tests and counter/custody/promotion/spool/receive/genesis owners. Older native component campaigns
   pass **47 cases** (13 custody, 13 content, 21 trim); all **18** deliberate implementation faults are
   detected. Full units: **983 tests in 88 files**. Type check, all **30 vector commands**, census,
   authority map/registry, targeted lint and formatting pass. No stage timeout or skipped Node test.

The map remains 80 entries/102 chains/19 swept homes; the registry remains 78 specified, zero open,
four inherited and one non-crypto. Only reviewed durability prose pins and three runtime hashes changed;
cryptographic formats/labels and all 31 prior vector files are unchanged. The authority changes are
[recorded](./2026-09-11-account-reservation-durability/repins.json). The broad historical root `pnpm check`
and the prior 71-stage byte audit were not repeated; the relevant owner, component and vector checks ran.

## Limits and retained state

Strict reporting is an API capability check, not hardware attestation. The budget argument assumes the
browser/storage honors strict persistence, the initial budget was accurate, and only corrected writers
continue that history. It cannot repair old undercounts or authenticate a restored/branched profile.
No actual power-cut, other-browser qualification, power/performance benchmark, whole-profile residue
scan, real Account enrollment or general recovery/rotation proof is claimed. SC-01 journal acknowledgement
remains page/navigation-loss scope. Formats and normal enrollment, read, append, retry, compaction and
receive behavior were retained in the tested owners.

All 21 personal package hashes, historical review and L-2 match their baseline. Personal servers remain
stopped; no real browser, account or custody action occurred. The original root files `done ` and
`reviewpacket96a20401ceb88d.md` were not read or changed. Synthetic profiles/source copies stay under ignored
`test-results`; the committed evidence candidate retains reports, logs, test artifacts and source hashes.
