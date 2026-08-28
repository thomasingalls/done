# `P-6` — Local archive factor and root

**Standing:** home — the decision’s current status lives in the header below; read back by
`pnpm remediation:status`, which parses it and checks `HANDOFF.md`’s claim of it in both directions.

**Decided:** 2026-08-26 · **Direction:** `RC-6A` accepted — factor-sealed root commitment and full retired-package
replacement · **Identity:** per workspace · **Confirmation:** typed back once per workspace ·
**At promotion:** retired to legacy · **Status:** decided; consolidated at `S0-6` and completed by the `S0-6`
return (2026-08-29) — requirements 1–3 below executed there against the published package (`FU-02`: the
identity grew its manifest-signing half under the same factor, which is this record's carrier completed, not
changed, so the reopen condition — the factor choice having to change — never triggered; requirement 3's
paired fresh rewrap now fails for a Local archive at the commitment, isolated, with the order observed)

Consolidation is [`S0-6`](../action-tree.md), which also needs `S0-2` and `S0-5`. This record also completes the
inputs to [`S0-2`](../action-tree.md), alongside [`P-1`](./P-1-recipient-authority.md) and
[`P-2`](./P-2-device-lock-gating.md). Nothing below is implemented.

## The defect this closes

TRD §9.3 states the requirement and stops short of the construction:

> A purely Local archive has no account recovery keypair, so it needs **its own explicit portable wrap** rather
> than one it does not have. […] What authenticates a Local archive is **the code that opens it**.

No selected construction says which key that code opens, how it is sealed, or how it unwraps the archived
generation. The tip's package generator produces exactly one HPKE wrap — to the *account* `KEYS.recovery.r_pub` —
and the never-established positive checks only a manifest signature. So `--check` passes without exercising any
Local opener, saved code, portable wrap, or clean-device restore.

The reachable end state: create a never-established Local workspace, archive it, lose the device. A clean client
verifies the device-signed manifest, finds the parts, and cannot decrypt any of them. Permanent availability loss
in the archive's own load-bearing case — total device loss.

Accepting `RC-6A` also brings the Local state under the factor-sealed `(workspace, lineage, auth_root)`
commitment. That matters here specifically because row 10 records that for a Local archive "both anchor fields are
empty and `auth_root` names the archiving device. Nothing external authenticates it." The commitment is what makes
a fresh attacker rewrap fail for Local archives as it does for account packages.

## The decision

1. **A Local workspace has one archive identity, scoped to the workspace.** A generated factor seals an archive
   keypair; every archive of that workspace opens with it, and every generation wrap in those archives binds the
   factor-sealed root commitment.
2. **The factor is typed back once, at first archive**, before the app describes any archive of that workspace as
   restorable. Until then the honest description is §9.3's own: ciphertext, and no way in.
3. **At promotion to an Account, the Local archive identity is retired to legacy.** New archives are live packages
   under the account recovery identity, per row 10's lineage states. The Local code continues to open
   pre-promotion archives, and the product says exactly that.
4. **Factor replacement is forward-only.**

**The factor construction follows precedent rather than being chosen here:** row 13 already reuses "row 14's
generator, alphabet and normalizer, unchanged" for the device-lock code, and the archive factor is the same class
of object. `S0-6` confirms it; it is not a new product choice.

## Why per workspace

§9.3 makes this argument itself, about itself:

> It should be app-driven — a periodic verified archive, or a destination configured once — rather than something
> the user is trusted to remember, **because it is the one requirement here with a recurring cost to attention.**

A per-archive factor mints a new code on every run of a periodic archive, and the user must save each one *and*
match it to the right file. That is the maximal form of the cost that sentence exists to avoid.

The objection — one code opens every archive of the workspace — is the wrong threat for this artifact. §9.3 frames
the risk as loss, not disclosure: "a user holding an archive and no code has an encrypted file and no way in."
Per-workspace scoping minimises the failure that actually happens.

## Why typed back, and why that is cheap here

`RC-6A` already requires it — "archive creation is incomplete until factor confirmation and package verification."
The two decisions above support each other: because the identity is per workspace, the gate is paid **once per
workspace rather than once per archive**, so the recurring attention cost stays zero and the one-time cost buys
the guarantee. A show-once warning is honest but leaves the app with no evidence before it starts calling archives
restorable, and the consequence of being wrong is total.

## Why replacement is forward-only

This is a consequence, not a preference. Re-sealing the archive identity under a new code can only affect archives
written afterwards: existing archives are bytes at a destination the app may no longer reach, may not be permitted
to rewrite, and may not be able to enumerate.

**It must be said in copy for the same reason the recovery-code case must be.** A user who "changed the code" will
assume old files rotated with it. That is the same misunderstanding shape as
`f-4259822-recovery-replacement-no-forward-rotation`, in a place where the product cannot compensate afterwards.

## What `S0-6` must satisfy

1. **Archive plus saved factor, with every device, account and provider state absent, restores exactly** on a clean
   independent client — the archive's stated purpose, and the case the tip cannot currently perform at all.
2. Wrong factor, wrong root commitment, wrong workspace state and wrong generation each fail **independently**, so
   no single check masks another.
3. A paired fresh rewrap under an attacker-chosen root fails for a Local archive, not only for account packages.
4. An archive written before a factor replacement still opens with the prior factor, and the product said so.
5. An archive written after promotion opens under the account recovery identity; one written before opens under
   the retired Local factor; neither opens under the other.
6. An unconfirmed factor leaves the archive describable only as ciphertext, and no UI calls it restorable.
7. A partially written or partially verified archive is staged and discarded or resumed, never merged as a replica.

## What this reopens

PRD §§7.6–7.7/8.3; TRD §§9.3/13.8/14; rows 10/14; package and recovery generators and vectors; archive and export
UI copy; continuity tests. Row 21's early-fidelity-archive option depends on this closing.

## Rollback

Reconsider before the user is instructed to save a factor, or before archive bytes are described as portable.
After either, a change is a migration of user-held state rather than a decision.

## What this does **not** decide

- The exact sealing encoding and whether the archive keypair is X25519 for HPKE symmetry with `R_priv` or a
  distinct construction. `S0-6` selects it; `P-6` requires only that the saved factor alone opens it.
- The archive destination, cadence, and verification schedule — §9.3 calls for app-driven periodic archiving, and
  the schedule is product work outside this record.
- `RC-6`'s retirement half: the full service-signed retired package, `TerminalHandoff`, and the deletion gate are
  accepted in direction here but designed in `S0-6` and `S0-7`.
