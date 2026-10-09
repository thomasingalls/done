# Mixed-epoch client replay adapters — chunk C2a

2026-09-16, after signed client-history foundation `6ba5336b`. Opt-in low-level adapters only: the
production owner does not yet supply the new verified history, install a successor or construct
current requests. Native successor installation/reopen remains C2b. Release validation remains paused.

| Check | Result |
| --- | --- |
| Focused Node command below | 32 passed: nine replay cases/controls, 11 history cases/controls, 12 registry cases |
| Unit command below | 74 passed in seven files |
| Two named browser regressions below | 2 passed using disposable profiles/service |
| Typecheck, scoped oxlint/oxfmt and reviewed crypto inventory | passed; 175 sources, 96 labels/templates, 24 groups, 14 manual entrypoints |

```
node --test --test-timeout=30000 test/account-successor/client-replay.test.mjs test/account-successor/client-replay-controls.test.mjs test/account-successor/history.test.mjs test/account-successor/history-controls.test.mjs test/account-first-authority/registry.test.mjs
node node_modules/vitest/vitest.mjs run test/sourceCapture.test.ts test/spoolRecord.test.ts test/spoolBatch.test.ts test/accountDelivery.test.ts test/accountInboundCodec.test.ts test/accountInboundControls.test.ts test/accountTransportContract.test.ts
node --test --test-timeout=90000 --test-name-pattern='owned request, atomic|one owner sends and reads back' test/account-receive/native.test.mjs test/account-sync/native.test.mjs
```

Independent Node/OpenSSL fixtures frame real encrypted Yjs updates, source capsules, spool events,
submissions, decisions, signed pages and local receive records. Replay verifies decryption and exact
originals, counters and both prefixes, with and without memo reuse. Forty shrinking mixed histories
(seed 16091604) vary accepted boundaries and current/old records. Directed cases retain old pending
submissions and journal capsule bytes; resume a burned old grant with a new epoch-2 invocation; refuse
reused grants, mixed-source-epoch batches, changed actor/head/content and regressing ledger context;
and receive current pages containing historical proofs, including exact stale duplicates.

Two actual-receiver omission controls return the forbidden plaintext only with the guard removed:
an old-epoch acceptance past the boundary, or a publisher key substituted for the certified key. The
ordinary receiver refuses both. Synthetic signatures and encryption remain real in each mutant.
Yjs is externalized from these Node bundles to share its module; only bytes cross verification calls.

The existing prefix-proof control and its paused command wrapper received the same source-anchor
update after the verifier delegation changed. No assertion or control was removed. The wrapper
campaign was not run, and no frozen release manifest/count/qualification was refreshed.

Preserved early failures are harness defects: a stale control anchor (`early`), a test predicate
attempting JSON parsing of a Yjs content record (`replay-initial`), and a missing fixture parameter
when adding the burned-grant case (`fixture-error`, generated shrink path `0:0:0`). They are corrected;
final focused/unit/native logs pass. The native checks are first-epoch regressions, not evidence of
successor installation. `inputs.json` pins the final files; no existing vector bytes changed.
