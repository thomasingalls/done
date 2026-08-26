---
schema: 1
kind: finding
id: f-992bc91-network-carrier-registry-stale
status: validated
type: propagated-assumption
severity: medium
confidence: high
introduced_by: 992bc9113093fe04d20df0247aa118d0f8ba365f
work_item: X-01
created_by: /root
updated: 2026-08-26
challenged_by: root-v01-20260826
superseded_by: none
---

# The suite registry still marks the selected network envelope unversioned and unselected

## Affected requirement or guarantee

TRD §13.10 and row 1 claim that every cryptographic carrier maps a version to one complete suite, authenticates that
version, and is refused rather than negotiated when unknown. The generated carrier registry is presented as the
executable, build-failing form of that agility rule.

## Original source

`c6116669030eedeea3d599bca0da3547114e6930:docs/TRD.md` §15 rows 1 and 4 leave both the suite/agility rule and
network-envelope wire format open (`OC-063`, `OC-066`). The contract requires a concrete, authenticated mapping once
both are selected.

## End-state source

`9edd9300adebcec3abd2234c946f1dcccdc17eef:docs/selections/row-4-envelope-format.md` selects network envelope
`v = 1`, AES-256-GCM under `done/envelope/v1`, and AAD/signature messages that authenticate `v`. Its exact
`test/vectors/envelope.json` exercises that carrier. Yet the same SHA's
`scripts/generate-suite-vectors.mjs` and `test/vectors/algorithm-suite.json` still publish
`network-envelope` as `version: null`, `encoding: 'unselected'`, `suite: null`, `label: null`, and `in_aad: null`,
owned by “row 4, review 3b.” No network-envelope acceptance/refusal row exists.

## First introduction and propagation

`3bea0e69469e47b790fe6214d7fbed42bcf84441` correctly creates an explicit future-owned carrier while row 4 is
open. `992bc9113093fe04d20df0247aa118d0f8ba365f` selects row 4 but does not amend the row-1 selection, generator,
or generated suite vector. Later register-aware work fixes stale cryptographic-role deferrals only; the carrier
entry survives unchanged to the pinned tip while TRD §13.10 says no role is a candidate and every carrier is mapped.

## Reachable consequence

A consumer driven by `algorithm-suite.json` has no defined suite or acceptance behavior for the selected network
carrier, while a consumer driven by row 4 treats version 1 as valid suite-1 ciphertext. More importantly, a future
suite migration cannot use the registry to decide which network-envelope versions to accept or refuse, so the
claimed no-negotiation/downgrade mechanism is not total over the protocol carrier. CI remains green while publishing
the contradictory states.

## Supporting evidence

The exact tip suite generator passes `--check`. Its `checkCarriers()` explicitly permits any `suite: null` entry that
has a nonempty `selected_by` string; unlike the repaired role-deferral check, it never resolves that owner against
TRD §15. Its acceptance loop validates only rows that already exist and does not require one for every carrier.
Exact `git diff` shows row 4's selection did not touch the suite registry, and no later relevant diff repairs it.

## Counterevidence and disconfirmation attempt

Row 4 itself is unambiguous for the current version: it fixes `v = 1`, suite-1 primitives, labels, and authenticated
fields, and its generator/vector pass. Therefore this is not evidence that current envelope ciphertext is
cryptographically ambiguous. It is a propagation and oracle defect: the artifact that claims to be the total suite
and acceptance registry omits a carrier whose independent selection happens to be precise today.

## Validation procedure

1. Read the selected/open halves of TRD §15 and require every carrier owner in the suite generator to be open if the
   carrier is null, mirroring `checkCoverage()` for roles.
2. Run the current tip: `network-envelope` must fail because row 4 is selected.
3. Populate version 1, suite 1, `done/envelope/v1`, and authenticated-version metadata, plus accept/refuse rows.
4. Mutation-test selected row 4 back to a null carrier and remove its acceptance row independently; both changes
   must fail the generator.

## Disposition

Fix the row-1 carrier registry and make its owner/acceptance coverage register-aware. Preserve row 4's independent
vectors, but do not claim carrier-wide agility is machine-checked until the generated suite artifact includes it.
