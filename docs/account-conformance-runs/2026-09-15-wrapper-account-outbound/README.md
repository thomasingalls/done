# Account outbound wrapper integration — 2026-09-15

Signed base: `61e53cdb`. This is bounded wrapper integration, not immutable release qualification.

The actual five-child outbound campaign passed **29 cases** (plus two exit-only vector checks), with
original child arguments/concurrency/deadlines. Owned execution takes 12.483s
under a 150-second aggregate bound. Four complete planning suites pass 71 cases; the unchanged editing
regression passes 16 in 207.146s. **116 real cases across six executions**;
a seventh request reuses the exact outbound receipt. All groups drain. All 18 outbound files survive
disposable checkout removal (19 inventory entries including the case-reports directory).

The campaign trace binds ordered invocations and successful completion. Distinct nonce-bound Node and
Vitest reports retain actual terminal case outcomes. Report reconciliation checks source pins, model
counterexamples, actual codec mutations, generated history completeness and journal-only recovery.
It does not independently replay Yjs/model state, regenerate schedules or supply a hostile-code sandbox.
The native/codec assertions remain execution authority. The old model budget example is preparation
evidence; key-counter arithmetic does not represent billions of executed encryptions.

Eight synthetic process controls include five refused zero-exit invalid reports. Two deliberate faults
omit semantic reconciliation or the child census, causing corresponding invalid reports to pass.
Synthetic case claims are instrumentation controls, not further Account executions. Two planning failures
hit the writer/test's prior 850 kB ceiling. The 857,891-byte lossless manifest now has a 1,000,000-byte
planning ceiling; runtime bounds are unchanged. Original failed logs and passing rerun are retained.

`artifacts.json.gz` retains **313 payloads in 812,858 bytes**: source/contract
snapshots, receipts, case traces/reports, all required report bytes, logs, selected historical editing
reader, fault programs and verifier scripts. Content-addressed schema 2 stores UTF-8 text as JSON strings
and binary as base64 before whole-container gzip. The initial all-base64 representation exceeded the
1,000,000-byte prospective archive budget; this lossless representation meets it without dropping evidence.
Hashes and lengths cover decoded original bytes. Large owned input inventories are external references
in `raw-artifacts.json`; they are not self-contained in this archive. Their location and hashes remain
available, and `--raw` verifies them while present.

```sh
python3 docs/account-conformance-runs/2026-09-15-wrapper-account-outbound/verify.py
python3 docs/account-conformance-runs/2026-09-15-wrapper-account-outbound/verify.py --current --raw
```

The first command verifies retained bytes, contracts, nonces, exact case sets, trace order, output
inventories and selected semantic/control postconditions. The optional current/raw checks require the
recorded checkout and input files. They do not rerun the browser campaigns.

Integration is **138 unresolved obligations: 0 test-file /85 command /53 campaign** out of 628.
Runtime/dependencies, crypto vectors/census, F-17 latency debt and prior evidence are unchanged.
Next: Account capture wrapper, remaining qualification repairs, immutable aggregate and private human
rehearsal. No personal browser, server, relay, device or deployment operation occurred.
