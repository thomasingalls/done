---
schema: 1
kind: finding
id: f-a073574-enrollment-recovery-key-unbound
status: validated
type: implementation-hazard
severity: high
confidence: high
introduced_by: a073574fcb90f9f2a70fa1be2bae5dc1d9c364f3
work_item: X-04
created_by: /root
updated: 2026-08-26
challenged_by: root-v01-20260826
superseded_by: none
---

# Enrollment authenticates the new reader key and head but not the recovery public key the reader later trusts

## Affected requirement or guarantee

Enrollment must keep authorization separate from decryption: a malicious authorization service may admit a
credential but must not cause an honest client to deliver a content generation to a key the service controls. The
same boundary has to cover the recovery recipient that every later rotation uses, not only the new device's first
reader wrap.

## Original source

`c6116669030eedeea3d599bca0da3547114e6930:docs/PRD.md` §§6.3, 7.3–7.4 and the same SHA's `docs/TRD.md`
§§13.2, 13.5–13.7 (`OC-016`, `OC-027`, `OC-029`) separate service admission from person-mediated content-key
delivery and require clients to wrap each future generation to the workspace recovery public key. The enrollment
ceremony and authentic distribution of its key material were open.

## End-state source

At `9edd9300adebcec3abd2234c946f1dcccdc17eef`,
`docs/selections/row-11-enrollment-ceremony.md` authenticates the workspace, epoch/head, both credential ids, and
the new device's `W_pub`; its transcript contains no `R_pub`, recovery-envelope digest, or authenticated package
digest. The HPKE carrier is described as a wrap of `K_g` to `W_pub`. `docs/TRD.md` §13.5 does not list `R_pub` in
the signed epoch, while §§13.7–13.8 require the enrolled device to trust `R_pub` for every later recovery wrap.
Ordinary enrollment explicitly does not ask for the recovery code, so the new device cannot authenticate `R_pub`
by opening the code-sealed `R_priv` envelope.

## First introduction and propagation

`a073574fcb90f9f2a70fa1be2bae5dc1d9c364f3` selects the enrollment transcript and first wrap without a recovery-
key binding. `992bc9113093fe04d20df0247aa118d0f8ba365f` later adds the epoch head but not `R_pub`. Rows 9, 10, 14,
and 15 then make recovery state and future rotation concrete without adding a person- or client-authenticated
recovery-key delivery object.

## Reachable consequence

1. A malicious authorization service admits an honest new credential and supplies that new device an attacker-
   controlled `R_pub` plus a matching opaque recovery envelope.
2. The row-11 ceremony still succeeds: the existing device authenticates the genuine new device's `W_pub` and
   current epoch head, then delivers `K_g` to that device. Neither typed symbols nor wrap `info` covers `R_pub`.
3. The new device stores the substituted recovery material as workspace state.
4. Later it performs an unrelated legitimate rotation or revocation and follows §13.7 by wrapping `K_(g+1)` to
   the `R_pub` it was given.
5. The service opens that wrap with its attacker-held `R_priv` and decrypts the new generation.

Authorization alone has then caused delayed key delivery through the recovery recipient. The consequence is
workspace confidentiality loss from that generation forward, not merely denial of recovery.

## Supporting evidence

Exact-tip searches find `R_pub` in promotion, rotation, recovery, package, and inventory sections but not in the
row-11 transcript, generator, or vector. `scripts/generate-enrollment-vectors.mjs` says the wrap plaintext is the
content key and pins only the transcript-derived HPKE `info`; its field inventory has no recovery material. The
authorization epoch payload in TRD §13.5 binds credentials, capabilities, generation, acceptance key, and accepted
heads, but not the recovery public key.

## Counterevidence and disconfirmation attempt

An existing device could send genuine `R_pub` and the sealed recovery envelope inside a transcript-bound encrypted
enrollment payload. That would close the path if the exact payload, its sender, and the install order were selected
and checked. The pinned sources specify only a `K_g` wrap, do not bind a payload digest in the transcript, and give
no schema or vector for recovery material on this path. Fetching the material from the service is not independent
authentication, and asking for the recovery code would contradict the ordinary-enrollment flow.

## Validation procedure

1. Enroll device `B` from honest device `A` while a malicious authorization service substitutes only `R_pub` and
   its matching sealed envelope.
2. Require the current row-11 ceremony and first `K_g` delivery to complete unchanged.
3. Have `B` later rotate while retaining all legitimate reader recipients.
4. Assert that no wrap to the substituted recovery key is emitted or accepted, using only durable state `B` can
   authenticate independently of the service.
5. A corrected construction should bind the authentic recovery material into the human-authenticated enrollment
   payload or an equivalent client-authenticated object and reject the substitution before rotation.

## Disposition

Reopen the enrollment/recovery-recipient joint. Define and test authentic `R_pub` and recovery-envelope delivery to
ordinary new devices before allowing them to originate a rotation.
