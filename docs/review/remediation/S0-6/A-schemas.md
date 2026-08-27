# `S0-6` Stage A — durable record schemas

**Status:** proposed for `S0-8` review · not implemented · no generator or vector consumes these yet

## 1. `RootCommitment`, sealed under the factor — closes the rewrap substitution

The anchor's problem is not what it binds but **who can produce it**. `info` binds
`(workspace, lineage, auth_root, gen)`, and every one of those is public or attacker-chosen. HPKE base mode
needs only `R_pub`, which travels in the package. So the binding stops ciphertext being *reinterpreted* and
does nothing about ciphertext being *minted*.

The repair puts one value behind the factor:

```
RootCommitment = SHA-256( LP("done/pkg-root/v1") || LP(workspace_id)
                          || LP(lineage_id) || LP(hex auth_root) )
```

**Sealed beside `R_priv`, under the same recovery code, in row 14's envelope.** The envelope's plaintext
becomes `R_priv || RootCommitment` rather than `R_priv` alone — one AEAD, one seal, no new object and no new
thing for the user to hold.

**On import, the commitment is the check.** Opening the recovery envelope yields both halves. The importer
recomputes `RootCommitment` from the package manifest's `(workspace_id, lineage_id, auth_root)` and refuses
any mismatch **before** attempting a single generation unwrap. An attacker who mints a package under
`auth_root'` cannot produce the matching sealed commitment, because sealing it requires the code.

**Why this and not HPKE auth mode.** `mode_auth` would bind the sender's static key, which is the other
textbook answer. It fails here for a product reason rather than a cryptographic one: the legitimate assembler
of a package is not a fixed identity — it may be any authorized device, or the service assembling a retired
package — so there is no single sender key an importer could pin. The factor is the one thing the *user*
holds across all of those, and it is already required to open the package at all.

**The `info` binding stays exactly as it is.** It still stops a wrap being carried across lineages or
generations, which is a different attack and a real one. This adds the check `info` structurally cannot make.

## 2. `ArchiveIdentity` — the Local opener — `P-6`

§9.3 already requires this and does not construct it: *"a purely Local archive has no account recovery
keypair, so it needs its own explicit portable wrap"*, and *"what authenticates a Local archive is the code
that opens it."* Today the generator produces one wrap, to the **account** `R_pub`, and the never-established
positive checks only a manifest signature — so `--check` passes without exercising any Local opener at all.

```
archive factor   125 bits, row 14's generator, alphabet and normalizer, unchanged
                 One per workspace (P-6), typed back once before any archive is
                 called restorable, retired to legacy at promotion.

K_archive = HKDF-SHA256(ikm = utf8(canonical code), salt = salt,
                        info = LP("done/archive/v1") || LP(workspace_id), L = 32)

ArchiveEnvelope = { v, salt(16), nonce(12), ct }
                  ct seals archive_priv || RootCommitment, tag included
                  AAD = LP("done/archive/v1") || LP(workspace_id)
                        || LP(dec v) || LP(hex archive_pub)

RootCommitment for a never-established workspace
                = SHA-256( LP("done/pkg-root/v1") || LP(workspace_id)
                           || LP("") || LP(hex archive_pub) )
```

**The empty lineage field is the one to read carefully.** Row 10 records that a Local archive has no lineage,
so both anchor fields are empty and `auth_root` names the archiving device — *"nothing external authenticates
it."* Here the archive identity's own public key takes that slot, and the commitment sealed under the factor
is what authenticates it. **A Local archive is now anchored to something, and that something is the user's
code**, which is the only authority a never-established workspace has ever had.

Generations in a Local archive are wrapped to `archive_pub` with `info` binding the same four fields, so the
import path is one path rather than two.

## 3. `RetiredPackage` — replacement, not upgrade

Row 10 says a live package *"is UPGRADED to a retired one by importing the terminal record. It is not
replaced."* **That cannot be authenticated, and the manifest's own field list is why:** `lineage_state` is
inside `P`, which the assembler signs. Change the state and the signature no longer covers the message. There
is no in-place upgrade to verify — only a live manifest with a contradicting record beside it.

```
A retired package is a COMPLETE package, assembled and signed by the service's
terminal authority, at lineage_state = 'retired'. It is not a live manifest
with a field changed, and no importer synthesises one from a terminal record.

A terminal record may be DISPLAYED beside a stale live package. It never
rewrites that package's manifest.
```

**The cost is honest and belongs in the record:** a retired package is a full re-assembly rather than a small
delta, and the service must be reachable to produce one. That is a real availability cost, and it buys the
only version of this that can be verified.

## 4. `TerminalHandoff` — the gate on destructive deletion

`retire` commits terminal lineage while hosted bytes remain. Nothing today proves any survivor actually
*received* the terminal state before those bytes are destroyed, so deletion can proceed while every remaining
copy is stale, incomplete, or absent.

```
H = LP("done/handoff/v1") || LP(dec v) || LP(workspace_id) || LP(lineage_id)
    || LP(hex terminal_head_digest) || LP(hex retired_package_digest)
    || LP(receiver_credential) || LP(hex receiver_prior_head)
    || LP(hex catchup_digest) || LP(dec known_absence_count)

  sig = Ed25519( the receiving client's signing credential ; H )
```

**"Verified-current" has exactly two forms, and neither is a timer.**

1. The receiver's own accepted head **is** the terminal head — it proves this by presenting a head it can
   already verify, and `catchup_digest` is empty.
2. The receiver verifies a **signed catch-up transcript** from its authenticated prior head to the terminal
   head, with **exact known absences** enumerated rather than summarised. `receiver_prior_head` is what makes
   the transcript checkable; `known_absence_count` is what stops "some things are missing" passing as complete.

**Only a durable `TerminalHandoff` authorizes a hosted deletion class**, and it authorizes them one class at a
time — primary objects, replicas, wraps, checkpoints, declared backups — so a partial deletion resumes rather
than restarting or over-deleting.

**A lost acknowledgement retains bytes.** That direction is deliberate: retaining data nobody asked for is a
recoverable mistake and deleting data somebody still needed is not, so the ambiguous case keeps the bytes and
the audit record says the handoff was never completed rather than claiming it was.

**An offline device is a stale detached replica until it receives terminal evidence**, and is never counted as
a survivor for this gate.

## 5. What an importer does, in order

1. Open the recovery or archive envelope with the user's code. Obtain the private key **and** the sealed
   `RootCommitment`.
2. Recompute `RootCommitment` from the manifest's `(workspace_id, lineage_id, auth_root)`. **Refuse on
   mismatch, before any unwrap is attempted.** This is the step the fresh-rewrap attack fails at.
3. Verify the manifest signature under the signer its `lineage_state` requires — the assembling credential for
   `never-established` and `live`, the terminal authority for `retired`.
4. Verify `parts_digest` and each part digest.
5. Unwrap generations; verify each wrap's `info` binds this workspace, lineage, root and generation.
6. Admit the checkpoint through `S0-5`'s path: re-derive `{sv, ds}` locally, then verify the admission and
   surface `self_admitted`.
7. Recompute every card id from its creation certificate (`S0-5`).
8. Stage everything. **A partial import is discarded or resumed and never merged as a replica.**

## Falsifier map

| # | Falsifier | Schema |
| --- | --- | --- |
| 1 | **A fresh wrap to the genuine `R_pub` under an attacker-chosen `auth_root` is refused** | 1 |
| 2 | The refusal happens at the commitment check, before any generation unwrap is attempted | 1 |
| 3 | A package whose `auth_root` matches the sealed commitment imports normally | 1 |
| 4 | The existing `info` negatives still fail — cross-lineage and cross-generation wraps are unaffected | 1 |
| 5 | **Archive plus saved factor, with every device, account and provider state absent, restores exactly** | 2 |
| 6 | Wrong archive factor, wrong root, wrong workspace and wrong generation each fail **independently** | 2 |
| 7 | A Local archive written before a factor replacement still opens with the prior factor | 2 |
| 8 | A live manifest with `lineage_state` changed to `retired` fails its assembler's signature | 3 |
| 9 | A complete retired package verifies under the terminal authority and not under the assembler | 3 |
| 10 | A terminal record alone does not upgrade a live package | 3 |
| 11 | **No hosted deletion class is authorized without a durable `TerminalHandoff`** | 4 |
| 12 | A receiver whose accepted head is the terminal head needs no catch-up transcript | 4 |
| 13 | A receiver behind the terminal head must present a verifiable transcript from its prior head | 4 |
| 14 | A forged or incomplete catch-up transcript fails, and an unenumerated absence is incomplete | 4 |
| 15 | A lost acknowledgement retains the bytes and records that the handoff did not complete | 4 |
| 16 | A stale offline replica is not counted as a survivor | 4 |
