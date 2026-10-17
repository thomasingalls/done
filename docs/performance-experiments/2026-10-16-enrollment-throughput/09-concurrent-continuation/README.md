# Concurrent history continuation — bounded acceptance evidence

Patch 08 keeps the safe native raced-snapshot refusal and makes the real additional-device client repeat exact signed reads under a load-wide four-extra-attempt cap, a cancellable 200 ms pause and the original ten-second logical-request deadline. No server guard, authority/signature check, corruption behavior, numeric rate or stored format changes. This phase adds evidence and documentation only.

## Native workload

Three restored alternating pairs use exactly the earlier 1,024-row first-epoch fixture, eight-entry pages, nine same-publisher writes offered every 500 ms and second-account reads every 250 ms. Both arms run the exact same phase-C server. Reference uses the actual old privateDeliveryPost; candidate uses that adapter plus the exact new history retry owner. Fresh native scoped grants are supplied before timing; renewal behavior is tested separately by the existing scoped-client/browser cases. No other validation job ran during ordinary timing. Private fixtures/keys/service databases stay outside Git; their original authored probe sources remain available in preceding evidence.

| Pair | Old client replay | Repaired replay | Repaired state-change refusals / extra attempts | Old / repaired max input-to-write |
| --- | ---: | ---: | ---: | ---: |
| 0 | 7,527 ms | 6,829 ms | 0 / 0 | 1,384 / 974 ms |
| 1 | 6,074 ms | 6,028 ms | 0 / 0 | 902 / 880 ms |
| 2 | 7,574 ms | 6,295 ms | 1 / 1 | 1,392 / 1,719 ms |

**All six runs complete the original fixed 1,024-position cut**, all 54 offered writes succeed, every returned replay/peer/live-write proof passes its independent oracle, and every repeated read body matches its original captured signed query. The repaired run that receives a genuine native 409 continues with the same body and verifies the eventual successful page. It uses one of four extra attempts. There are no 429s, all input-to-write times remain below the prospective 2,500 ms ceiling, and every observed logical-read duration upper bound remains below 10 seconds. The probe's legacy printed field named `refusals` counts 429s only; the retained raw statuses and independent summary explicitly record the 409.

The old client also completes all three runs this time. The earlier six failures used a raw HTTP probe; the actual client parser and native interleavings produce different schedules. Preserve both results. This is evidence of successful bounded recovery from one observed native exhaustion plus the deterministic actual-coordinator regression, not an estimated reduction in failure probability, a causal speedup estimate, a universal concurrency guarantee or an erasure of the old failures.

### Writer guardrail inspection

With only nine dependent offered writes, nearest-rank p95 is the maximum. Pair 2 rises 23.49% (1,392→1,719 ms), triggering the predeclared inspection. Its slowest input was offered at 2,500 ms, waited about 1,030 ms, and began native work at about 3,530 ms. The first refusal arrives at 3,559 ms; a retry cannot dispatch until at least 3,759 ms. That queue predates the retry. The native request itself takes about 689 ms, within the unchanged full-census write range. Different native read/append interleavings create the queue; the extra retry did not create that already-existing wait. The hard ceiling passes, while this higher paired input latency remains explicit. No population latency or service-capacity conclusion follows. Native cache invalidation remains a performance opportunity; the unsuccessful cache prototype stays deferred.

A preliminary 32-position two-arm interface calibration runs alongside functional browser work, exercises no 409 and is excluded from timing/guardrail conclusions. Its raw result remains. Every ordinary arm, successful or failed, is retained; these six ordinary arms all succeed.

## Final browser and regression closure

All nine preceding packaged journeys pass on the final runtime: normal batching, older-server fallback, wrong-request substitution, lost reply/exact saved continuation, explicit capacity backoff, progress/retirement, rejected signed page, and both original/joined rotated-history handoffs containing removed-device and journal writing. Together with all six new journeys in patch 08, this is 15 unique passing functional journeys.

Four additional restored connections (one reference/candidate pair each for original and joined 96-edit owners) preserve every Markdown export entry/byte, two-way writing and lock/reopen. All export hashes match `dee6950766a8a55a0304976c577647bdb651ddfc8c22cd1b1f8a49a1512b8757`. Foreground times are 4,845→4,854 ms original and 4,847→4,843 ms joined. These are descriptive guardrails; one pair per owner supports no speedup estimate. No additional writes occur during those foreground comparisons; the separate native workload provides concurrent-write evidence.

Patch 08's 88 unit/codec/actual guard-removal cases, 50 existing scoped/native/history cases, 37 registry/adapters, TypeScript, normal changed-source lint/format and frozen build budget/origin checks remain passing on byte-identical runtime. Read-only planning/census checks pass. The independent audit anchors old tests to the immutable patch-07 Git tree (its first draft mistakenly treated the new regression copied into the negative baseline as an old test). No old test file changes in this follow-up. All old stages, expectations, deadlines, blocks and construction contracts/statuses remain; the two new files are blocked from aggregate credit (876 obligations / 332 unresolved). All runtime/API/client-bundle/frontend identities are pinned; no failed cache code is revived.

## Acceptance and limits

The identified client failure boundary is addressed: a transient raced-snapshot refusal can continue safely, and persistent refusal stops under the original deadline and finite load-wide cap with saved setup retained. The chosen finite concurrency workload and all directed/native/browser controls meet their stated completion and safety conditions. Arbitrarily continuous/adversarial writing can still exhaust the cap/deadline and require the saved retry; no lock or stale-evidence shortcut is added to promise otherwise. Physical phone/WAN, Firefox/Bitwarden, broad capacity, full-suite and generalized security/release qualification remain unclaimed. General qualification stays paused.

Prepare evidence-only patch 09 after immutable 08; retain all earlier patches and unsuccessful experiments. No signing, push, preview restart, merge or deployment. Port 8443 remains the signed progress build. docs/progress.md and deferred formatting are unchanged. Sequential clean/index-only application receipts are kept in the external operator manifest so this tree does not contain its own hash.
