# `S0-6` Stage A — durable record schemas

**Standing:** home — sections here are pinned and swept by the authority map; read back by
`pnpm authority:check`.

**Status:** proposed for `S0-8` review · not implemented · consumed by the package generator since Stage D ·
**amended 2026-08-29 at the `S0-6` return** — §2's identity gains its manifest-signing half under the same
factor (`FU-02`), §4's catch-up value becomes the `CatchupTranscript` construction the gate re-verifies
(`FU-03`), §5's step 3 resolves the never-established signer through the factor, and the falsifier map
continues at rows 17–23

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

> **Amended 2026-08-29 at the `S0-6` return (`FU-02`/`A-04`/`ST-01`).** The first landing of this schema
> factor-sealed only the encryption half, and the published package positive kept verifying its manifest
> under the laptop's device key — an authority the factor never bound, exactly the disconnection `S0-9`
> convicted: a fresh wrap to the genuine public `archive_pub` could open an independently chosen generation
> key under a fabricated manifest. The identity now has **two halves under one code** — the schema below is
> the amended one — and the composed importer of §5 is run over the published package itself.

```
archive factor   125 bits, row 14's generator, alphabet and normalizer, unchanged
                 One per workspace (P-6), typed back once before any archive is
                 called restorable, retired to legacy at promotion.

archive identity = X25519 archive_pub / archive_priv     (opens the wraps)
                 + Ed25519 archive_sign_pub / archive_sign_priv
                                                         (signs the manifest)

auth_root for a never-established package
                = SHA-256( LP("done/archive-root/v1")
                           || LP(hex archive_pub) || LP(hex archive_sign_pub) )

K_archive = HKDF-SHA256(ikm = utf8(canonical code), salt = salt,
                        info = LP("done/archive/v1") || LP(workspace_id), L = 32)

ArchiveEnvelope = { v, salt(16), nonce(12), ct }
                  ct seals archive_priv || archive_sign_priv || RootCommitment
                  AAD = LP("done/archive/v1") || LP(workspace_id)
                        || LP(dec v) || LP(hex archive_pub)

RootCommitment for a never-established workspace
                = SHA-256( LP("done/pkg-root/v1") || LP(workspace_id)
                           || LP("") || LP(hex auth_root) )
```

**The empty lineage field is the one to read carefully.** Row 10 records that a Local archive has no lineage,
so both anchor fields are empty and `auth_root` names the archiving device — *"nothing external authenticates
it."* Here the archive identity's **own digest** takes that slot — both public halves, committed — and the
commitment sealed under the factor is what authenticates it. **A Local archive is now anchored to something,
and that something is the user's code**, which is the only authority a never-established workspace has ever
had — and since the `S0-6` return the anchor reaches the manifest too: the manifest verifies **only under the
committed signing half**, never under a device key or any key the package offers on its own authority. The
commitment formula and the wrap `info` are unchanged, so one importer serves all three lineage states.

**The signing half rides the commitment, not the envelope's AAD, deliberately.** The AAD binds `archive_pub`
so the sealed private halves cannot be offered beside somebody else's public key; the signing identity is
bound through `auth_root` inside the sealed commitment, because the commitment is the one value an attacker
cannot seal — and keeping it the sole carrier of the signing identity is what lets the fresh-mint negative
isolate the commitment check instead of failing twice.

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

> **Amended 2026-08-29 at the `S0-6` return (`FU-03`/`A-05`).** The first landing of this schema left
> `catchup_digest` undefined enough that the executable made it `SHA-256(LP(priorHead) ||
> LP(terminalHead))` — two public heads, computable by the stale receiver itself — beside a bare
> non-negative count, so form 2 was self-assertion wearing a signature: no transcript bytes, no chain
> proof, no signer authority, no absence identifiers, no count-to-list check. The transcript is now a
> construction, below, and every one of those five absences is a verified property.

```
CatchupTranscript T
  = LP("done/catchup/v1") || LP(dec v) || LP(workspace_id) || LP(lineage_id)
    || LP(dec source_epoch)
    || LP(dec link_count)    || for each link: LP(hex prior) || LP(hex head)
    || LP(dec absence_count) || for each:      LP(absence_id)

  sig_T = Ed25519( the lineage's certification in force at source_epoch ; T )
  catchup_digest = SHA-256(T)
```

**"Verified-current" has exactly two forms, and neither is a timer.**

1. The receiver's own accepted head **is** the terminal head — it proves this by presenting a head it can
   already verify, and `catchup_digest` is empty.
2. The receiver verifies a **signed catch-up transcript** from its authenticated prior head to the terminal
   head, with **exact known absences** enumerated rather than summarised — and the gate re-verifies what the
   receiver claims to have verified, because `catchup_digest` commits `T`'s full bytes:
   - the transcript's verifier **resolves from the lineage's client-authenticated certification in force**
     at `source_epoch` — an input, never a key read out of the answer (`FU-06`'s rule at this gate), and
     never the receiver's own credential, so neither actor can sign both parts of the receipt;
   - each link stands for a signed accepted-head record naming its predecessor: `links[0].prior` is the
     `receiver_prior_head` the receiver authenticated, `links[i].prior = links[i-1].head`, and the last
     head is the terminal head — chaining from anywhere else, a break in the middle, and stopping short
     are three separate refusals;
   - every absence is an identifier — the gaps are **named**, not counted — and `known_absence_count`,
     which the receiver signs, must equal the list the transcript carries. A count beside an empty list
     was the pre-return positive's own shape, and it is now a published negative.

**Before the destructive boundary, only a durable `TerminalHandoff` authorizes a hosted deletion class**, and
it authorizes them one class at a time — §14.7's six classes, one domain shared with the retention model — so
a partial deletion resumes rather than restarting or over-deleting.

> **Amended 2026-08-29 at the `S0-7` return** (`FU-04`; `P-4` ratified, option B with intrinsic acceptance).
> As first written, the two statements below were absolute, and composed with §14.7's inherited clock they
> contradicted row 16's ceiling — a retirement whose survivor never appeared retained bytes forever under this
> gate and twelve months under the ceiling, and the executable resolution let elapsed time impersonate the
> receiver's custody authority. The composition now changes the authority rather than the clock: the boundary
> is the retirement's own (`retired_at + RETENTION`, written once at the `cause` overwrite), what closes it is
> the owner's erasure acceptance carried in the signed `retire` payload, and a boundary erasure terminates in
> `deleted-without-receipt` — never a state a reader can take for this gate's receipt.

**A lost acknowledgement retains bytes until the destructive boundary.** That direction is deliberate:
retaining data nobody asked for is a recoverable mistake and deleting data somebody still needed is not, so
the ambiguous case keeps the bytes and the audit record says the handoff was never completed rather than
claiming it was — and what ends the ambiguity at the boundary is the owner's own signed instruction, never
elapsed time reading itself as evidence.

**An offline device is a stale detached replica until it receives terminal evidence**, and is never counted as
a survivor for this gate.

## 5. What an importer does, in order

1. Open the recovery or archive envelope with the user's code. Obtain the private key — both private
   halves, for an archive — **and** the sealed `RootCommitment`.
2. Recompute `RootCommitment` from the manifest's `(workspace_id, lineage_id, auth_root)`. **Refuse on
   mismatch, before the manifest's signer is consulted and before any unwrap is attempted.** This is the
   step the fresh-rewrap attack fails at.
3. Verify the manifest signature under the signer its `lineage_state` requires — the assembling credential
   for `live`, the terminal authority for `retired`, and for `never-established` **the archive signing
   identity that the commitment-checked `auth_root` itself commits** (amended 2026-08-29, `FU-02`): the
   verifier is resolved through the factor, and a key the package offers on its own authority — the
   archiving device's included — is consulted by nothing.
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
| 11 | **Before the destructive boundary, no hosted deletion class is authorized without a durable `TerminalHandoff` — and at the boundary, only the owner's intrinsic erasure acceptance executes, terminating in `deleted-without-receipt`** (restated at the `S0-7` return, `P-4`) | 4 |
| 12 | A receiver whose accepted head is the terminal head needs no catch-up transcript | 4 |
| 13 | A receiver behind the terminal head must present a verifiable transcript from its prior head | 4 |
| 14 | A forged or incomplete catch-up transcript fails, and an unenumerated absence is incomplete | 4 |
| 15 | A lost acknowledgement retains the bytes until the boundary and records that the handoff did not complete | 4 |
| 16 | A stale offline replica is not counted as a survivor | 4 |

The `S0-6` return continues the map (2026-08-29):

| # | Falsifier | Schema |
| --- | --- | --- |
| 17 | **A fresh wrap to the genuine `archive_pub` under an attacker-chosen root is refused at the commitment, before the signer is consulted and before any unwrap** — the account pair, at the archive | 2 |
| 18 | A manifest signed by the archiving device over otherwise-genuine fields is refused — the verifier resolves through the factor, never from the package | 2 |
| 19 | A signing key the commitment-checked `auth_root` does not derive verifies nothing, however genuine its signature | 2 |
| 20 | The envelope, wrap and manifest reconstruct from the published inputs alone, and the import restores the identity **whole** — both halves | 2 |
| 21 | A behind receiver's digest over two public endpoints authorizes nothing — the pre-return acceptance, kept as the permanent negative | 4 |
| 22 | The transcript verifies only under the lineage's certification in force — the receiver's own genuine signature is refused, and chaining from elsewhere, a broken interior link and stopping short of the terminal head are three separate refusals | 4 |
| 23 | An absence count that does not equal the enumerated list is refused, and so is an absence entry that names nothing | 4 |
