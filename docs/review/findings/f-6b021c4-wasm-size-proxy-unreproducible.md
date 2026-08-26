---
schema: 1
kind: finding
id: f-6b021c4-wasm-size-proxy-unreproducible
status: validated
type: evidence-weakness
severity: low
confidence: high
introduced_by: 6b021c46995379be79d459432f8bc514f72dbcfc
work_item: B-03
created_by: /root
updated: 2026-08-26
challenged_by: root-v01-20260826
superseded_by: none
---

# The WASM bundle-size proxy cannot be reproduced from the commit that uses it to close the size question

## Affected requirement or guarantee

TRD §§12 and 13.10 require the synchronous journal implementation to be available before edits, fit
the initial-JS budget, and preserve the selected reviewed construction. Commit `6b021c4` claims a
purpose-built WASM category fits and reframes the remaining issue from size to assurance criterion.

## Original source

`c6116669030eedeea3d599bca0da3547114e6930:docs/TRD.md` §§10.10, 12, 13.10 and §15 row 2 require a
reviewed synchronous AEAD, no unsafe pre-seal edit window, and the low-end latency/bundle bounds.
Original-contract claims `OC-025`, `OC-050`, `OC-057`, and `OC-064` preserve those evidence and
review assumptions.

## End-state source

`9edd9300adebcec3abd2234c946f1dcccdc17eef:docs/performance.md` retains the 17.5 kB gzipped and
24.3 kB base64-inlined proxy rows. A later actual purpose-built module and checker exist at the tip,
but the historical proxy measurement is still presented as measured evidence.

## First introduction and propagation

Introduced at `6b021c46995379be79d459432f8bc514f72dbcfc` in `docs/performance.md` and
`docs/progress.md`. `ffd90e3` repeats it in working-document navigation. `9b49b74` later supplies a
different, actual RustCrypto XChaCha module whose checked artifact fits, reducing the current design
risk but not making the original proxy measurement reproducible.

## Reachable consequence

At the decision point, a reviewer cannot determine which off-the-shelf Rust/WASM package, version,
entry point, bundler input, or command produced 49.9/17.5/63.2/24.3 kB. A materially different proxy
or tree-shaking setup could have made the category appear to fit and redirected work from alternative
designs. The practical consequence is limited because the later actual 6,465-byte generated artifact
provides stronger positive fit evidence; this is an audit-trail weakness rather than a current bundle
failure.

## Supporting evidence

The exact `6b021c4` patch changes only `docs/performance.md` and `docs/progress.md`. Its locked tree
contains the named Noble and libsodium dependencies, but no bundle-pricing script, fixture, result
file, or dependency identifying the “off-the-shelf” Rust-compiled ChaCha20-Poly1305 proxy. The prose
explicitly says that proxy exposes only the narrow-nonce construction but never names it. The recorded
arithmetic can be recomputed, but the measured inputs cannot.

## Counterevidence and disconfirmation attempt

The values are internally consistent: 350.0 − 306.3 = 43.7 kB headroom; 24.3 kB leaves 19.4 kB;
149.2 kB is about 3.4 times the headroom. Noble and libsodium are locked, and the later purpose-built
artifact strongly supports the direction of the conclusion. None identifies or reproduces the proxy
row used at this commit, so the provenance gap survives while its consequence is narrowed.

## Validation procedure

Recover the exact package/version, source entry, bundler/version/configuration, raw WASM/glue bytes,
and commands used for all four rows; reproduce the minified/gzipped results from an exact `6b021c4`
archive. If those inputs cannot be recovered, label the proxy rows historical/unreproducible and use
the later actual artifact as the operative fit evidence.

## Disposition

Clarify and preserve provenance. Do not use the unnamed proxy as independent evidence once the actual
module's checked size is available.
