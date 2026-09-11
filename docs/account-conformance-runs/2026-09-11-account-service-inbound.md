# Private v2 service read evidence — 2026-09-11

The validation-baseline work was committed as `e835243`. This bounded service phase is tested against that
head with [the recorded working patch](./2026-09-11-account-service-inbound/working.patch), including all
added scripts/tests. [Contract and F-11 correction](../account-service-inbound.md).

| Check | Observed result |
| --- | --- |
| New service campaign | 19 Node tests pass: directed authorization/extent/restart checks, 60 generated histories, eight actual source omissions and two service SIGKILL cuts |
| Native HTTP interoperability | One Chromium case passes: real admitted self-stream, owned signed request, original persisted envelopes, v2 service signatures, receive commit, duplicate and cold replay |
| Full unit suite | 958 tests in 84 files pass |
| Affected regressions | Service-delivery, v1 transport including native cancellation/lost replies, and inbound-codec/verifier campaigns pass |
| Isolated build | Yjs binding, TypeScript, Vite, budget and origin-isolation checks pass; initial JS 329.6 KiB within 350 KiB |
| Traceability after fresh prerequisites | 101 claims, 28/28 named current-defect falsifiers, nine retained debts; matrix current |
| Scoped static checks | TypeScript, lint, formatting and diff checks pass |

[Campaign summary](./2026-09-11-account-service-inbound/campaign/summary.json),
[service cases](./2026-09-11-account-service-inbound/campaign/service.log),
[native case](./2026-09-11-account-service-inbound/campaign/native.log),
[generated histories](./2026-09-11-account-service-inbound/campaign/generated.json), and
[tested sources](./2026-09-11-account-service-inbound/campaign/sources.json).

The eight controls omit reader resolution, publisher resolution, reader signature, fresh snapshot,
registration identity, ledger witness, post-sign expiry and post-sign custody checks. Every mutated module
returns a positively verified prohibited signed page; the baseline refuses the same forbidden state.
The witness control demonstrates a signed false empty prefix after deletion against a retained witness.
A separate competing-process test proves that membership writes block during synchronous signing and
can commit after read exclusion ends. No timeout or harness error is counted as a control detection.

The generated run found no counterexample and exercised every required operation. Final review strengthened
the candidate/member negative to reach that exact parser check; its earlier weaker version and passing
campaign are retained under [earlier-campaign](./2026-09-11-account-service-inbound/earlier-campaign/).
An initial missing contextual TypeScript annotation and unused test parameter were fixed before the
recorded campaign. [Findings and limits](./2026-09-11-account-service-inbound/findings.json).

The first [regression chain](./2026-09-11-account-service-inbound/regressions/summary.json) is correctly
marked failed: its behavioral stages passed, but traceability rejected six stale receipts from an older
root tree. The failed [trace output](./2026-09-11-account-service-inbound/regressions/trace.log) is retained.
The [fresh build/prerequisite/trace chain](./2026-09-11-account-service-inbound/build/summary.json) then
passed in `/private/tmp/done-service-inbound-e835243`, with its own source inventory and actual execution
receipts. Those receipts are not copied back to the root as if they ran there.

[Verification](./2026-09-11-account-service-inbound/verification.json) checks all 502 campaign inputs and
2,395 isolated-checkout files against their recorded hashes; the final code matches both. Regressions
precede only the final strengthening of a test outside the Vitest suite; production code is identical.
The retained Local release and predecessor `dist/` (21 files) match their previous hashes. No personal
browser, factor, server, Account, route or deployment was changed. The historical review is unchanged;
the new contract corrects its F-11 passkey/workspace-credential conflation and documents the actual
registration binding.

This is targeted phase validation, not another full `pnpm check` execution. The prior full aggregate is
preserved in `e835243`; the new campaign is now wired into that command. No new-member enrollment,
multiple-publisher service schema, default-app Account activation, owned receive HTTP adapter, reconnect
scheduler or v9 sender composition is implemented. No whole-protocol debt is paid.
