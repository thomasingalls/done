---
schema: 1
kind: finding
id: f-9b49b74-rustcrypto-audit-version-gap
status: validated
type: guarantee-overstatement
severity: low
confidence: high
introduced_by: 9b49b743cb03cb8827682d79fc66405f458cf29b
work_item: B-02
created_by: /root
updated: 2026-08-26
challenged_by: root-v01-20260826
superseded_by: none
---

# The “audited RustCrypto crate” claim omits that the audit predates selected version `0.10.1`

## Affected requirement or guarantee

TRD §13.10 requires suite primitives to be reviewed and widely implemented. This commit states that the source
criterion is satisfied by the audited RustCrypto crate, leaving only compilation through a second toolchain open.

## Original source

`c6116669030eedeea3d599bca0da3547114e6930:docs/TRD.md` §13.10 defines “reviewed and widely implemented” as a
selection criterion. The earlier row-2 selection explicitly qualified the audit coverage of its then-selected
`@noble/ciphers` version.

## End-state source

`9edd9300adebcec3abd2234c946f1dcccdc17eef:docs/TRD.md` §13.10 calls `chacha20poly1305` audited and says the
open question begins at compilation. `:wasm/journal-seal/Cargo.lock` selects `chacha20poly1305` `0.10.1`.

## First introduction and propagation

Introduced at `9b49b743cb03cb8827682d79fc66405f458cf29b` in TRD, the row-2 selection, decision record, and WASM source
comments. Later suite-provider propagation preserves the unqualified wording.

## Reachable consequence

A reviewer can read the selected source version as independently audited and restrict review to the compiler/WASM
boundary. In fact, unreviewed source and dependency changes between the audited snapshot and `0.10.1` remain in the
trusted path. No defect in those changes is demonstrated, so the impact is assurance routing rather than a proven
cryptographic failure.

## Supporting evidence

NCC Group states that its five-person-day engagement occurred in December 2019. RustCrypto's official changelog
dates `chacha20poly1305` `0.10.1` to 2022-08-09 and records multiple major dependency/API revisions between the
2019-era release line and `0.10.1`. Sources retrieved 2026-08-21:

- https://www.nccgroup.com/research/public-report-rustcrypto-aesgcm-and-chacha20pluspoly1305-implementation-review/
- https://github.com/RustCrypto/AEADs/blob/master/chacha20poly1305/CHANGELOG.md

## Counterevidence and disconfirmation attempt

The audit is genuine, covers the RustCrypto ChaCha20+Poly1305 implementation family and cryptographic dependencies,
and reported no significant findings; external KAT agreement also supports the selected artifact's primitive
behavior. Neither establishes that the exact `0.10.1` source/dependency graph received that audit. The commit
already acknowledges the distinct source-to-WASM artifact gap, which is good counterevidence against a broader
claim that the compiled blob was audited, but it does not disclose the source-version gap.

## Validation procedure

Identify the exact audit commit(s), diff them through the locked `0.10.1` dependency graph, and have review 3a
state which portions of that delta it evaluated. Update the TRD to distinguish “project with audit history” from
“selected version audited” unless exact coverage is established.

## Disposition

Clarify the audit snapshot/version and route the source delta, compiler boundary, generated glue, and final blob as
separate review scopes.
