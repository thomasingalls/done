# `S0-6` — package root, Local opener, full retired package, and handoff receipt

**Started:** 2026-08-27 · **Inputs:** [`P-6`](../decisions/P-6-local-archive-factor.md) decided; `S0-2` and
`S0-5` complete, which were its other two dependencies

The largest remaining action, and the one with the most at stake: **four findings, three of them high.** Two
are confidentiality or integrity failures against a user who did everything right, and one destroys hosted data
while every surviving copy is stale.

## Findings this action must close

| Finding | Severity | What fails today |
| --- | --- | --- |
| `f-745e332-package-root-rewrap-substitution` | **high** | An attacker's fabricated history restores under the genuine recovery code |
| `f-745e332-local-archive-portable-wrap-undefined` | **high** | A Local fidelity archive is permanently unopenable on a clean device |
| `f-4259822-retirement-safe-survivor-gate-undefined` | **high** | Hosted bytes can be destroyed while every survivor is stale or incomplete |
| `f-745e332-live-retired-package-resigning-undefined` | medium | The claimed live-to-retired in-place upgrade cannot be authenticated |

## The claim that has to go

Row 10 ends its trust-root anchor with:

> A substituted root derives a different key schedule, so the wrap opens nothing, so there is no content to
> re-attribute.

**That is true of *reused ciphertext* and false of a *fresh wrap*.** HPKE base mode is anonymous: it needs only
the recipient's public key, and `R_pub` travels in the package. An attacker chooses their own `auth_root'`,
builds a fabricated history signed under it, wraps their own `K_g'` to the **genuine** `R_pub` with `info`
naming `auth_root'`, and delivers the package. The victim's genuine recovery code opens it. Every signature
verifies, under a root the attacker minted.

The generator's `substituted-trust-root` negative mutates `info` on an **existing** ciphertext, which of course
fails. It never attempts the fresh rewrap, so `--check` has always passed.

## Stages

| | Stage | Output | Status |
| --- | --- | --- | --- |
| **A** | Durable record schemas | the factor-sealed root commitment, the Local archive identity, the full retired package, and `TerminalHandoff` | **done** — [`A-schemas.md`](./A-schemas.md) |
| **B** | Normative construction | TRD §§9.3/13.8/14 | **done** — plus §15 row 10's register cell, which carried both corrected claims |
| **C** | Selection rows | rows 7/8/10/14/15 | **done** — row 10 gains the fresh-mint attack and its repair; the rest take header notes |
| **D** | Executable evidence | package and recovery generators; **the paired fresh-rewrap negative is the one that matters** | **in progress** — 4 of 16, see below |
| **E** | Product surface | PRD §§6.9/7.6–7.7/8 and archive UX | not started |

Same dependency order and the same expected intermediate state after `C` as `S0-2` and `S0-5`.

### Stage D progress

| # | Falsifier | State |
| --- | --- | --- |
| 1 | A fresh wrap to the genuine `R_pub` under an attacker-chosen `auth_root` is refused | **done** |
| 2 | The refusal happens before any generation unwrap | **done** |
| 3 | A package whose `auth_root` matches the sealed commitment imports normally | **done** |
| 4 | The existing `info` negatives still fail | **done** — unchanged and still passing |
| 5–7 | Local archive: clean restore, independent failures, forward-only factor | not started |
| 8–10 | Retired package: `lineage_state` breaks the assembler's signature | not started |
| 11–16 | `TerminalHandoff`: the deletion gate | not started |

**The attacker's package is built end to end and asserted to open**, because a negative that refuses a
malformed package would prove nothing. Nothing about the attacker's ciphertext is wrong — the wrap round-trips
under the genuine `R_priv`, and that round-trip is asserted before the negative runs. Only a value the attacker
cannot seal separates it from a real package.

**A mutation caught the third instance of the same mistake this project keeps making.** The ordering negative
originally used an unwrap that *threw*, so it refused whether or not the commitment was checked first — an
implementation that unwrapped first would have satisfied it while opening attacker-chosen content. The unwrap
now **succeeds** and what is asserted is that it never ran. Mutating the importer to check afterwards produces:

> The unwrap ran before the commitment was checked. A package under an attacker-chosen root would have been
> opened before anything noticed.

## Not in scope

- Hosted deletion, reseed and local-clear **execution** — `L-3`. `A` defines the gate that authorizes them,
  not the workers that perform them.
- The lapse and expiry state machine — `P-4` and `S0-7`, which consume `A`'s `TerminalHandoff`.
- Row 21's cutover choice, which `P-8` made cheaper but did not decide.
