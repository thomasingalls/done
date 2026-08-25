---
schema: 1
kind: finding
id: f-dbfd01f-row20-closes-unvectorized-hpke
status: candidate
type: contradiction
severity: low
confidence: high
introduced_by: dbfd01f54cdfcab994ac7df2298ba0da0bbe7da9
work_item: B-04
created_by: /root
updated: 2026-08-21
challenged_by: none
superseded_by: none
---

# `The first requirements fold closes test vectors for row 1 while row 1 says HPKE has no vector`

## Affected requirement or guarantee

Original-contract claim `OC-082` requires canonical and tampered test vectors for every selected construction before
level-3 review. TRD §15 row 20 is the current register for whether that evidence gate is actually closed.

## Original source

`c6116669030eedeea3d599bca0da3547114e6930:docs/TRD.md` §15 rows 1 and 20 leave the algorithm suite and test
vectors open. `OC-051` separately warns that a selection without a concrete vector predicts review failure.

## End-state source

At `9edd9300adebcec3abd2234c946f1dcccdc17eef`, `docs/TRD.md` §15 says row 20 is closed for eighteen selected
rows, while `docs/selections/row-1-algorithm-suite.md` still contains the historical sentence “HPKE has no vector
here.” Unlike the original fold, the tip does now carry a generated HPKE vector in the package generator, so the
evidence gap has later closed even though the selection record retains its decision-time caveat.

## First introduction and propagation

`3bea0e69469e47b790fe6214d7fbed42bcf84441` selects HPKE base mode with DHKEM(X25519, HKDF-SHA256),
HKDF-SHA256, and AES-256-GCM as part of Suite 1. Its row-1 selection explicitly says there is no HPKE library or
self-verifying vector yet and assigns both to review 3b. `dbfd01f54cdfcab994ac7df2298ba0da0bbe7da9` then says
all five folded selections carry generated self-verifying vectors and closes row 20 for all five. That statement is
false at its own decision point; later package work supplies the missing HPKE implementation/vector.

## Reachable consequence

Review 3a can be told that the five-row storage package has completely discharged row 20 even though one primitive
selected by row 1 is only identified in prose. The immediate consequence is overstated review/evidence scope, not a
demonstrated cryptographic failure: HPKE belongs to 3b, is not used by Stage 1, and is exercised later.

## Supporting evidence

The row-1 record at `dbfd01f` §2 says a transcribed vector would not be self-verifying because no implementation is
selected, and §7 repeats that HPKE has no vector. At the same SHA, `scripts/generate-suite-vectors.mjs` contains KATs
for AES-GCM, HKDF, Ed25519, and SHA-256 only. TRD §15 nevertheless says “Each” of the five selected constructions
carries a generated self-verifying vector. [RFC 9180 Appendix A](https://www.rfc-editor.org/rfc/rfc9180.html#appendix-A)
does publish vectors for the selected ciphersuite, but the project correctly observed that copied bytes without an
implementation do not make its generator self-verifying.

## Counterevidence and disconfirmation attempt

I tested whether “closed for these five” could mean only the storage-facing subset of each selection. That reading
fits the review split but not the next sentence's unqualified “Each,” and row 1 deliberately selects network roles so
the cross-path suite constraint can be assessed as a whole. I also checked the pinned tip: later HPKE code reproduces
the RFC vector, reducing current risk, but later evidence cannot make the `dbfd01f` review-status statement true when
it was made.

## Validation procedure

1. At `dbfd01f`, enumerate every primitive selected by row 1 and every KAT emitted by
   `scripts/generate-suite-vectors.mjs`.
2. Confirm that no project code can encapsulate/decapsulate the selected HPKE ciphersuite at that SHA.
3. Identify the later commit that first adds an executable HPKE vector and distinguish that closure date from the
   earlier row-20 status.
4. Ask a challenger to define a narrower meaning of row 20 that is consistent with both sentences in TRD §15.

## Disposition

Clarify the historical closure boundary: row 20 was closed for the storage constructions but remained open for row
1's deferred HPKE role until the later executable vector landed.
