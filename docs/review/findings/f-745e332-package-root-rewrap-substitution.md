---
schema: 1
kind: finding
id: f-745e332-package-root-rewrap-substitution
status: validated
type: implementation-hazard
severity: high
confidence: high
introduced_by: 745e332b061e0e964ae655e853f2f3b393667c66
work_item: B-02
created_by: /root
updated: 2026-08-26
challenged_by: root-v01-20260826
superseded_by: none
---

# A package writer can substitute the trust root by re-wrapping attacker-chosen content to genuine `R_pub`

## Affected requirement or guarantee

TRD §14.2 requires the vanished service's authorization root to be bound so an archive/package writer cannot
substitute it and rewrite content attribution. Row 10 claims that placing the root in generation-wrap HPKE `info`
terminates the trust chain in the user's recovery code.

## Original source

`c6116669030eedeea3d599bca0da3547114e6930:docs/TRD.md` §14.2 and §15 row 10 require an authenticated old trust
root in a portable package that does not depend on the vanished operator. Original-contract claims `OC-044`–`OC-046`
and `OC-072` preserve the continuity, restore, and historical-attribution requirements.

## End-state source

`9edd9300adebcec3abd2234c946f1dcccdc17eef:docs/selections/row-10-portable-package.md` §2 and
`:docs/TRD.md` §§13.7, 14.2 select
`HPKE.Seal(R_pub, info(workspace,lineage,auth_root,generation), K_g)` as the root anchor. The package's recovery
part carries `R_pub` and the code-sealed genuine `R_priv`.

## First introduction and propagation

Introduced at `745e332b061e0e964ae655e853f2f3b393667c66` and propagated into TRD rows 10/20, continuity tests, package
vectors, and migration/deletion reasoning. No later pinned-lineage commit replaces the anchor.

## Reachable consequence

An attacker able to write the portable package can:

1. keep the genuine `R_pub` and code-sealed genuine `R_priv` recovery objects;
2. generate an attacker authorization root, credentials, content key and replacement content/checkpoint;
3. HPKE-seal the attacker content key to genuine `R_pub` using `info` containing the attacker root;
4. issue epochs, attribution claims, head and manifest beneath the attacker root.

On total-loss restore, the user's code opens genuine `R_priv`; that private key correctly opens the attacker's new
wrap because it was encrypted to genuine `R_pub` under the same attacker-chosen `info` the package presents. All
other signatures resolve beneath the substituted root. The importer can therefore accept attacker-chosen content
and authorship as the old workspace, violating archive integrity and potentially destroying the only recovered copy.

## Supporting evidence

RFC 9180 §1 and §§4–5 define base-mode HPKE as encryption to a recipient public key; it does not authenticate the
sender. `info` influences the key schedule and binds context for a given ciphertext, but the sender chooses both.
The exact generator at
`745e332b061e0e964ae655e853f2f3b393667c66:scripts/generate-package-vectors.mjs` calls
`hpkeSeal(ephemeral, rPub, wrapInfo(base), K_G3)` using only `R_pub`, demonstrating that any package writer can
make the replacement wrap. Source: https://www.rfc-editor.org/rfc/rfc9180.html (retrieved 2026-08-21).

## Counterevidence and disconfirmation attempt

The published `substituted-trust-root` negative changes `info` while reusing the original ciphertext, so HPKE open
correctly fails. That proves context binding for an immutable sender-authenticated wrap; it does not prove who made
the wrap. Substituting `R_pub` would fail because the recovery code cannot open attacker `R_priv`, but the attack
does not substitute either recovery key. Manifest/epoch signatures do not help because their verification keys are
all selected under the attacker root.

## Validation procedure

Extend the exact row-10 generator with a paired attack vector: retain published genuine `R_pub` and code-sealed
`R_priv`; generate a new root/key/content; seal the new key to genuine `R_pub` with attacker-root `info`; construct
and verify a complete package below that root. The current design will accept it. A corrected construction must
fail before attacker-controlled content becomes an accepted workspace.

## Disposition

Reopen row 10. Authenticate the historical root with data protected directly by the user-held recovery secret—for
example, include a root/lineage commitment inside the code-sealed recovery object—or an equivalent non-rewrappable
anchor. Then add the paired re-wrap substitution vector; changing `info` on an old ciphertext is insufficient.
