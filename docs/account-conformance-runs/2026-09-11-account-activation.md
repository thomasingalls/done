# Fresh first-activation assertion — 2026-09-11

Base: `4f71bac` (descriptor bounds/versioning). This closes the bounded private F-04 seam:
[contract](../account-activation.md). It does not enable real Account onboarding or certify the full protocol.

The immutable base completes service activation with no fresh passkey assertion. Its genuine receipt-v1
artifact is refused by the new parser. Current first activation requires a service-signed challenge
binding the independent pin, account, request, offered head, exact completion, registered passkey ID,
random nonce and expiry. WebAuthn verification and the final transaction check those bindings; proof
consumption, receipt storage, counter observation and account activation commit together.

Schema 5 retains the challenge and canonical proof hash; receipt v2 signs the corresponding authorization.
The actual registration passkey ID also binds later slot handoff and service delivery. An expired pending
challenge can renew only for the exact completion. Exact committed receipt readback needs no new prompt,
including after expiry. Old receipts and missing consumption records refuse without invented history.
No raw assertion is persisted. Client slot/custody ownership spans the prompt and drains on cancellation.

## Bounded campaign

Final campaign: `test-results/account-activation/2026-09-11T13-16-22.637Z`; all 25 tests and the immutable reproduction pass.

- Fourteen service/protocol tests cover independent OpenSSL/LP challenge reconstruction, ES256 and Ed25519
  WebAuthn signatures, missing/wrong-purpose/origin/RP/user/credential proofs, bounds, exact retry,
  expiration and renewal, validly signed changed completions, account swaps, schema upgrade and concurrency.
- 120 shrinking-enabled histories (seed 9110401) model challenge issuance/renewal, expiry, completion,
  stale retry, changed completion, restart and abandonment with an independent state ledger.
- Three service omission controls allow forbidden activation when assertion verification, completion
  target binding or final transaction expiry is removed. A generated stale-proof control (seed 9110402)
  finds and shrinks a counterexample when the verifier is omitted. Passing histories found no additional
  implementation counterexample; these controls establish sensitivity to the selected missing checks.
- Process SIGKILL before/after challenge commit demonstrates cold recovery of the durable result. Existing
  admission regression cases cover both sides of activation commit and competing service processes.
- Five native cases verify challenge signature/target rejection before prompt, effective omitted-check
  controls, forwarded cancellation and deferred-callback draining behind a queued tab, renderer death at
  the prompt, and cold recovery after a committed-but-lost finish reply with zero additional prompts.

## Final race correction

A deterministic interleaving exposed a service response bug during final review: a challenge request
whose completion lost to a concurrently committed different completion could receive that winner's
receipt. The client already rejected the mismatch, and the winner required its own valid assertion.
The service now returns proof-conflict instead; exact same-completion readback still returns the receipt.
The failing test output and pre-repair core source are retained. Final activation and admission campaigns
exercise the correction; the earlier broad regression campaign used the pre-correction core. The changed
branch is covered directly rather than crediting the older campaign as a run of the final branch.

## Regressions and scope

Sequential regressions: `test-results/account-activation-regressions/2026-09-11T13-02-45.874Z`.

- All 980 unit tests across 87 files, with two workers.
- All 49 selected registration/recovery service, control, property and restart tests.
- Complete genesis (17), admission (34), handoff (21), service-delivery and descriptor-bound campaigns.
- Full composed-sync campaign, including eight generated native histories and effective controls.
- Isolated production build, budget/origin and fresh prerequisite/trace receipt checks in
  `/private/tmp/done-account-activation-4f71bac`; the personal build directories were never build targets.

Type, targeted lint/format and whitespace checks pass. Existing authority-map and admission checks pass
within their declared scope; they still do not register all Account constructions.

Older receipt-oracle fixtures now use the v2 receipt domain and assert the activation target independently.
Synthetic authentication fixtures obtain a real newly signed assertion for the challenge; they do not stub
verification. The schema-3 regression now expects retained historical rows but refusal when activation
history is absent. It no longer treats schema upgrade as authorization to invent a consumed proof.

Harness setup corrections were an omitted synthetic algorithm argument, an overly broad policy object
in the upgrade fixture and a formatting-sensitive mutation anchor. They are not production defects.
The final tests assert actual credential algorithms, binding reconstruction, rejection and omission outcomes.
The historical `pnpm check` aggregate was not rerun; `e835243` remains its recorded baseline.

The [artifact manifest](./2026-09-11-account-activation/manifest.json) hashes the final and preliminary
campaigns, logs, JUnit, generated inputs/counterexamples, effective controls, regression and build records,
source inventories and changed implementation. Temporary-runner source is included for reproduction.

No personal browser, factors, authority pin, account, deployment or service was used. All accounts and
keys here are disposable fixtures. All 21 personal package hashes, the historical annotated review and
L-2 checkpoint match their saved baselines. Crypto construction registration and interoperable vector
alignment (including recovery's 96-byte payload), invocation power-loss accounting and the remaining
accepted review gates still precede real Account use.
