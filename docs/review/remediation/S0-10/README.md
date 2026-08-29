# `S0-10` — corrected Stage 0 closure: the debt paid, the bar recorded

**Standing:** record — speaks of `866e500adc54c7920da4060698f2f32a165ad0c5`, the tip at which the X25519
debt was paid and the gates re-ran;
pinned in `census.json`, so edits land only as dated addenda under a re-pin.

**Written:** 2026-08-29 · **Inputs:** queue item 7 ([`HANDOFF.md`](../HANDOFF.md)); the three `S0-9`
dispositions; the debt manifest ([`debts.json`](../debts.json), `RC-9A`); TRD §10.11

`S0-10`'s queue entry owes three things, in order: collect the X25519 dated readback, record which
independence bar the closure stands on, and — under a separately authorized validation/remediation workflow
this document does not open — touch finding dispositions. This record is the first two. **No finding
disposition changed**: every `status:` in `docs/review/findings/` reads as it did at the reviewed tip, and
[`end-state-materiality.md`](../end-state-materiality.md) still reads 19/9/5/4.

## The debt, paid

The registered debt `x25519-dated-readback` blocked this gate until 2026-08-29, correctly: TRD §10.11's own
rule is a floor with evidence and a date, its evidence table was deliberately empty, and the `S0-10` consult
(`node scripts/check-debts.mjs --gate S0-10`) refused to lift on an assertion. What paid it is a **dated
external observation** — the web-platform-tests suite's stable desktop runs, read 2026-08-29 via wpt.fyi:
executions of the four `SubtleCrypto` operations §10.11 names, on the four core engines, in four pinned runs
(Chrome 152.0.7977.64, run started 2026-08-28 · Edge 152.0.4191.53, 2026-08-29 · Firefox 154.0.1,
2026-08-27 · Safari 26.6, 2026-08-27). A version citation or an assertion from memory is refused by the
payment's own type; this is neither — the runs execute the operations.

The payment has two homes and a readback that is neither of them, per `RC-8C`:

- **the artifact** — TRD §10.11's evidence table: 16 engine × operation rows, each carrying result, source
  (the pinned run), date and the one expiry, 2027-02-28, with the operation → WPT-test legend above it and
  the deviation note below it;
- **the record** — the `payment_record` on the manifest entry: kind `dated-external-observation` with
  source, date, expiry, operations and engines, landed beside the §10.11 pin re-read in the same motion;
- **the readback** — `scripts/check-debts.mjs` (`pnpm debts:check`, in the gate) holds the two to each other
  in both directions: engines × operations exactly, one row per pair, every row passing, sourced, dated,
  carrying the record's expiry — and a populated table beside an unpaid entry fails the same way. A
  19-mutation battery over this surface caught 19, the restored tree green after each.

**What the observation says**, beyond the green: every success-path row passes on all four engines —
`generateKey` 32/32, `importKey` (the `raw`/`spki` public and `pkcs8` private subtests) 54/54, `deriveBits`
19/19 on Chrome, Edge and Safari. **Firefox 154's `deriveBits` reads pass 12/19**: the six small-order
all-zero rejection subtests and the non-multiple-of-8 length subtest miss, while every positive derivation —
`pkcs8`/`spki` import, then `deriveBits` at length 256, the DH shape §13.10's DHKEM uses — passes. The
consequence is recorded at the table's dagger note: **the Stage-4 DHKEM layer carries its own RFC 9180
all-zero shared-secret abort on every engine** rather than inheriting one engine's, and no new debt is
registered for it — the duty was always the HPKE implementation's, whose conformance evidence is `L-2`/`L-3`
implementation work. When the observation expires (2027-02-28), the manifest validation refuses it exactly
as a missing one; review 3b's pass stays offered the re-measurement beside row 12's authenticator survey.

## The independence bar, exactly

What Stage 0's closure stands on, stated once and consumed from here:

- **Author-independent — seven times.** Round 1 (2026-08-28, [`DISPOSITION.md`](../S0-9/DISPOSITION.md)):
  four parallel challengers against `5923f51`, none of whom authored any repair, isolated from the author's
  pass and from each other. Round 2 (2026-08-28,
  [`FOLLOWUP-DISPOSITION.md`](../S0-9/FOLLOWUP-DISPOSITION.md)): three serial non-author challengers,
  reconciled. Both rounds **failed the package as challenged**; the constructions standing now are the ones
  rebuilt at the returns those failures forced.
- **Family-independent — once.** Round 3 (2026-08-29,
  [`ROUND-3-DISPOSITION.md`](../S0-9/ROUND-3-DISPOSITION.md)): one non-author challenger from a different
  model family (Claude Fable 5, Mythos-class; the prior seven reads were one family), against the
  regenerated corpus at `cfc6b70`, with targeted adversarial property tests against the authority map and a
  fresh 21-probe instrument battery. The seven constructions survived every axis run; the closure instrument
  failed narrowly (`R3-1`–`R3-3`) and was repaired the same day with the probes inverted; `R3-4` stays
  recorded low at `S0-2`'s homes, non-blocking.
- **Human-independent — never.** No human has rerun the battery or the gates, and no human has attacked the
  four judgement axes. Review 3a and 3b are bookings, and a booking is not a reviewer's result — the
  `S0-10` node's own floor. The human-red-team bar remains open and unclaimed.

Every consumer of "Stage 0 closed" inherits exactly this bar: machine-adversarial closure — seven non-author
reads in one model family, one read from a second family — with human review still owed and recorded as
such, never silently waived.

## The gates, at this tip

`pnpm check` ran end to end and green against this content: typecheck; the sixteen generators current with
`vectors:coverage`'s 205 isolated AAD fields; `retention:check`, `status:check`, `limit:check`;
`authority:check` at zero open joints; `recipient:check`, `admission:check`; `remediation:check` over the
census; `debts:check` reading 5 open · 1 paid with §10.11's table held to the payment record; `wasm:verify`;
445 tests across 39 files; the geometry suite; and `trace:check` last, crediting the check-script claims by
the execution receipts the run just minted. The regenerated matrix reads 101 claims with 28 of 28 current
defects carrying a named falsifier — the X25519 finding was the twenty-eighth, covered by the readback above,
partial at `S0-10`, beside its paid registered debt. The `S0-10` consult lifts — `S0-10: no registered debt
blocks` — and `pnpm debts` computes what still blocks the gates ahead (`L-1` — 1 · `L-4` — 4).

## What this record does not claim

Stage 0's closure is **not complete**. Finding dispositions are untouched and stay reserved for the
separately authorized workflow; the closure recording that follows it — `docs/progress.md`,
`docs/completed.md`, the register status sweep the `S0-10` node lists — waits for that workflow's outcome.
This record claims exactly: the one registered `S0-10` debt is paid with a dated, sourced, expiring external
observation; the independence bar is stated above, in its only home; and nothing downstream was touched to
make either true.
