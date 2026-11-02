# Phase332 — matched checkpoint return and storage-tail input

Lab only, report only; no trust, format, app/default, guard or limit change. Reused the exact330observation-only build, whose12observation statements strip back to329repaired source. No hardening, landing, release or qualification credit.

All12Breturn journeys and6primary loaded creation/admission journeys pass full archive, native Undo and offline cold checks (24cold owners). Both matched preparations pass C's normal catch-up and full archives. Original330failure, two new harness/observation failures and an offline diagnostic remain preserved; they are not regraded or omitted.

## Matched preparation

Both preparations open A/C from the same original H1024fixture, validate A, bring C online, wait for C's full archive, inspect history on both, then close all browsers/service. Only the checkpoint branch adds native Create on A and independent Verify on C; no-checkpoint B uses the control preparation's resulting service state, never the original shortcut. Frozen source/state identities checked before each return run. Three active roles in the original six-member account; other certified devices offline. No pruning, no forged catalog or historyRequired override.

C catches up in15.450s(control)and14.948s(checkpoint). Unloaded Create/Verify take7.873/6.347s. Both service states preserve all1,327legacy delivery_decisions and7publisher_decisions byte-for-byte, every column including signed submissions/replies; neither adds accepted rows. The initial in-spec acceptedRows fields cover only the7publisher rows; [independent broader check](./accepted-all-families332.json) also covers A's legacy backlog.

## Returning B — every replicate

Median unlock-submission-to-entire-target visibility:0ms18.939sordinary versus2.363scheckpoint;50ms26.243s versus2.760s. Every final full archive equals original plus exactly the offered120native Goals keys/prefix; target timing alone cannot pass. Natural historyRequired is true because continuation is present (epoch11/generation1), and an actual successful signed catalog request is observed in all12. All6checkpoint branches actually install; no plain branch does.

Snapshot:17,741ciphertext bytes,38,281canonical checkpoint JSON bytes plus706admission bytes. Actual B latest-response body size is in the table. A response-observer shape error (reply.page versus reply root) initially missed optional snapshot metadata; raw body byte counts were recorded. Sizes are independently recovered from the single immutable admitted preparation record, not invented or rerun. [Correction](./response-observation332-correction.md).

Input is key-to-visible-text, conservative clock bounds, native150ms keys. Installation exposed only0or1key per run: insufficient to establish install input p95, not a passed16msinstall gate. Whole-return input p95 is separately reported. After-install positions use request-start time through visibility; the CSV/JSON also record later input-end traffic and late prefetched replies. Delivery read units count signed logical requests, not positions; history requests are separate.

| Rep | RTT | Checkpoint | Unlock→visible ms | Delivery units | Fetched positions | Positions after install→visible | Latest body bytes | Whole input p95 ms | Install input n/p95 ms | Catalog | Undo/cold |
|---|---:|---|---:|---:|---:|---:|---:|---:|---|---|---|
| 1 | 0 | False | 18791.396 | 233 | 1024 | None | 0 | 3.460 | 0/None | checked | exact |
| 1 | 0 | True | 2345.765 | 0 | 0 | 0 | 41642 | 8.972 | 0/None | checked | exact |
| 1 | 50 | False | 26243.374 | 272 | 1024 | None | 0 | 3.726 | 0/None | checked | exact |
| 1 | 50 | True | 2890.780 | 0 | 0 | 0 | 41642 | 8.826 | 1/2.7509765625 | checked | exact |
| 2 | 0 | False | 19017.767 | 235 | 1024 | None | 0 | 3.319 | 0/None | checked | exact |
| 2 | 0 | True | 2472.242 | 0 | 0 | 0 | 41642 | 9.216 | 1/2.775634765625 | checked | exact |
| 2 | 50 | False | 25888.584 | 268 | 1024 | None | 0 | 3.220 | 0/None | checked | exact |
| 2 | 50 | True | 2756.469 | 0 | 0 | 0 | 41642 | 9.237 | 1/2.845703125 | checked | exact |
| 3 | 0 | False | 18939.333 | 239 | 1024 | None | 0 | 4.937 | 0/None | checked | exact |
| 3 | 0 | True | 2362.562 | 0 | 0 | 0 | 41642 | 8.832 | 0/None | checked | exact |
| 3 | 50 | False | 26308.091 | 272 | 1024 | None | 0 | 3.609 | 0/None | checked | exact |
| 3 | 50 | True | 2760.284 | 0 | 0 | 0 | 41642 | 9.299 | 1/3.4833984375 | checked | exact |

[All return fields](./return332-analysis.json), [CSV](./return332.csv). The comparison includes real B input, so it is not a silent-receiver drain benchmark. No Android claim.

## Loaded creation and admission — all primary runs

Separate fresh forks prevent probe history contaminating B's1,024position comparison. C catches up normally first. Native Goals input continues at150ms during Create on A and Verify on C. Each insertion is its own Undo group; every exact suffix is checked through all keys+1undos, peer must see probe before Undo and original archive after Undo. Wall durations, not CPU profiles; all original checks remain.

| Rep | RTT | Owner/command | UI duration ms | Native storage-tail ms | Input samples during tail | Input p95 ms | Undo/cold |
|---|---:|---|---:|---:|---:|---:|---|
| 1 | 0 | A/create | 7860.830 | 7402.200 | 50 | 5.768 | exact |
| 1 | 0 | C/verify | 5890.724 | 5654.600 | 38 | 6.206 | exact |
| 1 | 50 | A/create | 14411.128 | 14076.100 | 94 | 5.923 | exact |
| 1 | 50 | C/verify | 13949.666 | 13785.600 | 92 | 7.501 | exact |
| 2 | 50 | A/create | 14396.210 | 14070.500 | 94 | 6.455 | exact |
| 2 | 50 | C/verify | 13908.238 | 13823.200 | 92 | 6.839 | exact |
| 2 | 0 | A/create | 7860.735 | 7443.300 | 50 | 5.675 | exact |
| 2 | 0 | C/verify | 5837.107 | 5683.300 | 38 | 5.928 | exact |
| 3 | 50 | A/create | 14428.017 | 13889.200 | 93 | 5.987 | exact |
| 3 | 50 | C/verify | 14409.632 | 13899.100 | 93 | 8.294 | exact |
| 3 | 0 | A/create | 7861.049 | 7512.300 | 50 | 5.597 | exact |
| 3 | 0 | C/verify | 5848.639 | 5608.200 | 38 | 6.052 | exact |

At0ms, median Create/Verify UI durations7.861/5.849s(native tail7.443/5.655s). At50ms,14.411/13.950s(tail14.071/13.823s). Input during the tail has38–94samples per operation and all observed p95s5.597–8.294ms. Report-only; these do not qualify different accounts, hardware or input patterns. [Every attempt and operation](./loaded332-analysis.json), [CSV](./loaded332.csv).

## Preserved failures and observation limits

1. Loaded r1/d0attempt1: only8undos permitted after prefix+53keys. Offline copied-profile read (no input/reseeding/network) exactly matches prefix+45keys, other file unchanged. Source assigns one group per submit. Harness mistake; native Undo is correct. Keep failed attempt and diagnostic.
2. Attempt2:18exact per-Undo archives, then20sdownload-event timeout. No native owner/integrity/refusal observed,303HTTP200; original Chrome history has20completed downloads, but no20limit is established. Cause unresolved. Do not call it a proved browser policy or erase it.
3. New observation copies actual ZIP Blob produced by unchanged native Export button; URL creation/anchor click/revoke and app data paths are untouched. Missing Blob/native export refusal/wrong ZIP still fails; normal downloads are separately recorded. All new primary ZIP/download totals match per owner (68–134each); this does not retroactively explain attempt2. Give no broader export-delivery qualification credit. Cold checks still use actual downloads.
4. The initial return postprocessor had an else0SyntaxError; its log/source remain. Later metadata accounting correction is explicit above. An inline else1stopped harness preparation before any cell; the premature runner only found a missing plan. Neither is a timing sample.

No app refusal, owner closure, real archive difference or cold failure is established in this series. Operator's harness exception permits the retained corrections/reruns; latency misses would still fail a cell without stopping. All23timed/diagnostic attempts, host5slogs, source/build/browser/container maps and child exits are retained. No competing heavy work during timed runs. Current1,552canonical inputs unchanged, real index empty. [Protocol](./PROTOCOL332.md), [independent check](./independent332-check.json), [host record](./host332-summary.json), [exact evidence index](./evidence-index.json). Next is the separately scoped idle-warm-audit arm on the original329paired fixture; nothing is hardened or landed.
