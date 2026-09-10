# Private first-epoch admission — bounded evidence

Parent: signed `280f616` (`Prepare journal-inclusive promotion genesis and exact key wraps`).
[Contract](../account-admission.md). The component admits the exact retained genesis at the private
service and retains a verified receipt under the Local promotion owner. The Local index, writing,
credentials, keys, counters and generation remain retained. Account index handoff, default UI and
relay publication are subsequent phases. The personal preview and relay remain off.

## Evidence

`pnpm account:admission` ran from `test-results/account-admission/2026-09-10T17-27-13.132Z`:

- **34 tests pass**, 70.07 seconds; no failed, cancelled or skipped tests, no campaign timeout.
- The service rechecks live registration/passkey/recovery eligibility, recipient approval and recovery-
  bootstrap endorsement. A durable signed offer fixes the first epoch and sealed acceptance key.
  Exact row-7 manifest and semantic-admission verification precedes the transaction that stores its
  signed receipt and activates the account. Cancelled attempts cannot activate; admitted attempts cannot
  authorize Local abandonment. A cancelled offer releases its workspace reservation for a fresh attempt.
- **80 generated service histories**, seed `9232026`, compare offer, finish, restart, abandonment and
  wrong-capability commands against an independent pending/offered/active/cancelled ledger. These use
  synthetic ciphertext: they test service eligibility and atomicity, not Yjs semantics.
- **30 generated native histories**, seed `9242026`, combine insert/delete, disk versus synchronous
  journal persistence, reversed delivery, aborted request/offer/receipt commits, lost replies, altered
  offer signatures and repeated cold resumes. An independent string model supplies expected writing.
  An OpenSSL HPKE/checkpoint decrypt feeds Node Yjs replay; separate LP/OpenSSL signature checks and
  rederived SV/DS must match the manifest and admission. Full browser application JSON/card state must
  also match the pre-promotion source. Direct SQLite inspection requires one admitted row and exact
  receipt, while an independent carrier inventory excludes any mutation outside the promotion marker.
  Histories stop on failure without unbounded shrinking.
- Native IDB abort before and renderer death after each of the three progress commits. Lost proposal
  and final replies recover identical bytes. Cancellation with a committed acknowledgement held keeps
  the competing slot owner blocked until drain. Caller mutation after queuing cannot redirect the slot.
- Four actual SQLite process SIGKILL boundaries, before/after offer and final commit; cold processes
  recover exact outcomes. Two processes racing on one attempt converge on one offer and receipt.
  An unreadable acceptance seal refuses without replacement. Schema-2 upgrade is explicit and retains
  previous rows. The actual committed `280f616` reader and ordinary Local editing refuse the v3 carrier.
- **Three observed bad-acceptance controls**: disabling origin endorsement or CertifiedSet approval
  verification activates an unapproved genesis; disabling final client receipt verification retains a
  receipt with an invalid signature. Normal code refuses each. Artifact JSON contains actual accepted
  outcomes. These controls test represented guards; they do not establish completeness of the model.

Affected regressions refreshed against the final source:

| Campaign | Passing result |
| --- | --- |
| Account core | 30 tests |
| Recovery preparation | 25 tests |
| Authority/preflight | 14 tests |
| Promotion preparation | 18 tests |
| Genesis candidate | 17 tests, including 100 generated wraps and 40 native histories |
| Writer lifetime | 13 native cases; all five deliberate faults detected |
| Local genesis | 17 native cases; all four deliberate faults detected |
| Existing unit suite | 825 tests in 73 files, 50.69 seconds, two workers |

TypeScript, focused lint/format, isolated application build and 13 final repository/build gates pass.
Initial JavaScript remains **328.0 / 350.0 kB**. Build output is confined to this run's `app-build`, with
an isolated `build-checks/dist` symlink for bundle checks. The retained personal `dist/` and
`.dev/releases/17d87c2/app` were not overwritten. This was not a full `pnpm check` invocation.

[Preserved inventory](./2026-09-10-account-admission/manifest.json) includes source hashes, logs, JUnit,
generated histories, observed controls, regressions, unit/build/static output and final gates. Only
disposable test credentials and documents occur in its generated artifacts.

## Findings and corrections

The first native run caught an implementation error after the bootstrap endorsement was added: a
normalized persisted request was compared with the same fields in a different object-property order.
Admission refused before its service request. The client now normalizes its owned request before
retention, comparison and transport. The directed before/after logs are retained. Interruption tests
now surface early owner rejection instead of waiting for an unreachable commit boundary. This was a
directed native-test finding, not a property-generator discovery.

Review of abandonment followed by a new attempt produced a second directed counterexample: the first
schema's unconditional workspace/lineage uniqueness retained the cancelled proposal's reservation,
so a new registration for the unchanged Local source was permanently refused. Partial unique indexes
now cover proposed/admitted rows, retaining cancelled audit rows while allowing a fresh attempt. The
new directed test verifies cancellation followed by successful admission and both durable audit rows.
Before/after logs are retained. Existing active reservations remain exclusive.

The promotion regression's original textual fault control mutated the first occurrence of a guard
which now also exists in admission. Its mutant consequently still refused, so the control test failed.
The mutation now targets preparation plus its credential helper and asserts unique anchors. An
intermediate overly narrow anchor also failed explicitly; its log is retained. The final regression
again observes the intended bad acceptance. No production weakening was made to satisfy the control.
The final generated histories found no additional production counterexample.

## Limits and next boundary

This private first epoch identifies one sole semantic-admitting client. A content-blind service verifies
its signatures and live eligibility, not the truth of its replay; recipients still must decrypt and
rederive coverage. Origin endorsement is rooted in the independently retained, factor-opened recovery
draft, not an arbitrary request key. Later recovery must preserve that trust bootstrap.

This result does not establish whole-protocol correctness, power-loss or profile-rollback safety,
production root distribution/restore, acceptance-key use/rotation, a full platform matrix, offline
Account startup, encrypted relay or two-device convergence. No debt or selection-matrix status changes.

Next is verified Local-to-Account index handoff and owned restart classification, preserving principal,
workspace, content database and generation. It must require the fully authenticated receipt and recheck
source/custody/bindings under the exclusive owner, with atomic index selection and unambiguous restart.
Encrypted relay, account UI and fresh adoption by the author's actual pre-encryption second device
follow later; that device will not merge its old writing.
