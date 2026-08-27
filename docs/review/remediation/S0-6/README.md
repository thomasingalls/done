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
| **D** | Executable evidence | package and recovery generators; **the paired fresh-rewrap negative is the one that matters** | not started |
| **E** | Product surface | PRD §§6.9/7.6–7.7/8 and archive UX | not started |

Same dependency order and the same expected intermediate state after `C` as `S0-2` and `S0-5`.

## Not in scope

- Hosted deletion, reseed and local-clear **execution** — `L-3`. `A` defines the gate that authorizes them,
  not the workers that perform them.
- The lapse and expiry state machine — `P-4` and `S0-7`, which consume `A`'s `TerminalHandoff`.
- Row 21's cutover choice, which `P-8` made cheaper but did not decide.
