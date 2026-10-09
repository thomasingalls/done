# Restore current validation controls — Q-01 / Q-04

Starts after unsigned review intake `409fbd0`. This phase repairs the current source inventory,
three live omission controls and their inclusion in the liveness/residue/private-release runners.
It does not repair Q-02/Q-03 performance or Q-05 expiry diagnostics, change protocol bytes, or qualify
the full release aggregate. Implementation/evidence below is scoped to the final recorded inputs.

## Before repair

At `409fbd0`, directed executions reproduced all three Q-04 failures: the content-deletion control
still refused through the reuse branch; the HTTP bound mutation could not find its renamed anchor;
and the content carrier's C09 baseline passed before its obsolete opening anchor failed. The
read-only construction check also reproduced source drift and eight changed construction sites.
Original logs, hashes and the inventory delta are retained with this phase's evidence.

## Reviewed source classification

The previous census has 158 production sources; the current census has 165: seven additions, twenty
changed files and no removals. Comparing domain labels, kinds and site paths after removing line
coordinates gives exact equality. The eight construction-site differences are line shifts (1–13
lines), not new domains or changed byte contracts. The source changes themselves require review:

| Added file | Classification and reviewed boundary |
| --- | --- |
| `account-protocol/diagnostics.ts` | Closed unsigned reason vocabulary and bounded detached memory diagnostics. Refusal hints do not grant receipt or decision authority. No new construction. |
| `account-service/deliveryVerification.ts` | Manual entrypoint: service-owned bounded crypto-result reuse with exact input/context matching and detached copies. Callers authenticate current authority, replay row semantics and witness, and retain commit checks. Q-03's large-context eviction cost remains open. |
| `src/crdt/verifiedRecords.ts` | Manual entrypoint: complete record headers/bytes plus a private load token, lifetime/revision checks and detached results. It does not accept a spool-only witness as full content identity. |
| `src/crdt/verificationMemo.ts` | Manual entrypoint: exact per-event bytes/context and current owner, revision invalidation on clear, detached results. Callers retain semantic, coverage and publication checks. |
| `src/crdt/localRecovery.ts` | Manual entrypoint: explicit partial read-only salvage after factor-authenticated claim/custody. Existing store/journal openers supply authentication; no reservation, seal, storage mutation or editor activation. Recovery requires intact custody and does not establish completeness. |
| `src/crdt/archiveProjection.ts` | Bounded derived-text cache with exact source comparison, copied arrays and owner teardown. No admission or cryptographic authority. |
| `src/ui/LocalRecovery.tsx` | Explicit factor entry and plaintext ZIP download, cancellation and partial-result wording. Calls the restricted recovery owner; introduces no independent opener or durable carrier. |

The twenty changed files compose these features: service core/delivery/HTTP diagnostics and reuse;
Account capture/delivery/inbound/receive ownership, expiry and scheduler wakes; ordered maintenance and
projection; content reuse and custody's recovery reader; delivery/inbound/spool verification callers;
promotion refusal handling and stored-reference decoding; the Yjs equality shortcut and Local refusal
UI. Their exact old/new source hashes are in the inventory delta. Existing committed phase evidence
supports the earlier changes within its stated limits; this classification is not a new security audit.

Four unlabelled security-relevant entrypoints are now explicit in `registry.json`. Diagnostic/UI/
projection files remain covered by the full source census. All 83 construction records, byte homes,
vector files, classifications and cryptographic values retain their original meaning; only the eight
source-site line positions are refreshed. Inventory recording follows this review, not an automatic
blessing of changed hashes.

## Live control and runner contract

- Missing inbound content: the default v9 owner uses the reuse coverage branch even on cold open.
  Mutating that actual call must admit the damaged history, while production refuses. A second
  experiment explicitly forces the full-verifier fallback, checks its refusal, then omits it and
  observes the same forbidden admission. Forced fallback is identified as such in evidence.
- Oversize HTTP response: a 17-byte streamed body with a 16-byte bound must refuse; omitting the
  actual `responseLimit` comparison must expose all 17 bytes. Cancellation/drain checks remain.
- Unreadable record: C09 must refuse the full load; swallowing failure in the conditional decrypt
  must expose the forbidden result. A missing or ambiguous anchor fails with its file, count and text.

`scripts/validation-controls/preflight.mjs` lists the real gate and three directed experiments.
Liveness, residue and every private-release phase execute that shared list before their own work.
Their source snapshots now include the construction inventory, registry, canonical byte homes and
authority map. Existing zero-test/failure/skip checks apply to selected Node tests; the content harness
checks its selected baseline and mutant. These directed prerequisites do not replace the full receive,
receive-transport and content campaigns or the broader contract/crypto audit.

The origin-isolation checker accepts an explicit `--dist <built-directory>` so its actual gate can
run on a fresh disposable build while preserving the author's offline package. Default `dist` behavior
is unchanged. Its selected-output controls still reject empty output and remote code. Receipt refresh
must come from executed current checks, never by editing receipt JSON. Receipts bind a working tree
and can become stale after further edits/commits; this phase's archived result is not a promise that
later trees have already run the gate.

## Validation plan and exit

1. Retain the failing directed runs at `409fbd0` and the reviewed census delta.
2. Run the corrected directed experiments, existing registry/census negatives, and disposable-output
   origin controls. Run full receive, receive-transport and content regressions on the final inputs.
3. Exercise the newly wired preflight in liveness, residue and a private-release phase. Preserve all
   case counts, mutations, generated histories, failures, source hashes and finite stage deadlines.
4. Build into disposable output and execute the current authority, retention, selection, update-limit,
   WASM and origin checks before traceability readback. Keep personal packages and previous evidence
   unchanged. A passing trace receipt is not a complete release aggregate or payment of formal debts.

Exit requires the above bounded checks to pass, effective forbidden-result controls in both inbound
branches, and explicit current findings/checkpoint updates. Q-02/Q-03, Q-05, aggregate scheduling/
complete release coverage and P-06 prose remain separate. No personal Account, server or deployment
is changed by this phase.
