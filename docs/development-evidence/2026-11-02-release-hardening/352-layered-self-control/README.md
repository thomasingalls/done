# Layered self-stream control — phase 352

**Stop, as instructed: the double omission still leaves receive at0.** Both mutations are test-only, source-path scoped and uniquely anchored once each. Omitting the decision step removes its call and declined-result handling; proof erasure and every remaining guard stay. No accepted decision, position or persistence is fabricated. [All runs, byte comparisons and source path map](./evidence.json).

| Arm | Receive position | Receive result | Send result | Editor | New delivery decision rows |
| --- | --- | --- | --- | --- | --- |
| Baseline | 0 | blocked / integrity | retrying / network unavailable | active | 0 |
| Self-envelope omission | 0 | blocked / conflict | blocked / conflict | active | 1 |
| Self-envelope + decision-step omission | 0 | retrying / network unavailable | retrying / network unavailable | active | 0 |

The baseline stays intact. The single omission meets the approved different-outcome check and keeps authenticated content/inbound rows byte-identical and visible writing unchanged. Persistence qualification: it stores one authenticated conflict-decision record, plus ordinary outbound preparation records. Thus no forked writing or inbound receipt persists; a literal claim of zero new rows of any kind would be false, even for baseline preparation. The report retains complete before/after row lists rather than inferring this from a cursor.

The next barrier is durable-state authority. `api.receivePage(..., selfOnly=true)` returns before the native inbound append, yielding only the service decision. Normally `outbound.recordResponse` verifies and persists that decision. Removing the entire step also removes the write that could advance the composed self prefix. `driveReceiveStep` rereads authenticated `receiveStatus` after I/O and sees0; the returned received kind and selector scheduling credit cannot change it. The double arm offered the alternate page once, completed into retry, and then closed/drained before its actual storage census. No incoming record or decision was added. The original expected-advance assertion remains red; no extra layer is omitted to force it.

The first attempt observed the single arm's transient retry immediately after persisting conflict evidence, before both lanes reached their conflict halt. Preserve it as a harness observation failure. Wait for both terminal conflict states in the single arm; the second run passes baseline/single assertions and stops at the explicit double-advance predicate. Both attempts retain the original60-second case deadline and external5-second host logs.

A live compatibility Worker path remains: the owner exposes receiveFetch/receiveVerify; `createAccountWorkerReceive.verify` calls `owner.api.receivePage(page, stage, request)` without selfOnly, and without a delivery recordResponse step. The authenticated Window client reaches those methods. Ordinary page handling therefore reaches requireSelfEnvelope and native inbound append, so the original single-omission coverage belongs there. This is static reachability, not a deployed-flag or device observation. Its native control and classification mode remain unrun because the operator explicitly required stopping when the double omission did not advance. No report-consumer acceptance update or full campaign success is claimed.

Historical qualification: 46388e4f's parent already calls recordResponse on the self-only path; the cited commit adds the explicit declined-decision-result check. Exact earlier introduction is not established here. Earlier records stay untouched.

Formatting, configured lint and planning inventory pass; source hash checks show application code unchanged after Stage1. No limits, deadlines, budgets, trust, format or production defaults changed. Keep the sequential patch and this result as evidence. Stage2 and the remaining contract/receipt work wait for the operator's next direction; no commit, merge, publication or deployment.
