# Private first-authority formats and evidence

2026-09-11; prep committed as `9cf5c98`, runtime still `2ba50aa`. This bounded phase specifies existing
private first-epoch bytes, joins their runtime census to the authority map, and publishes fixed vectors.
It changes no runtime message, signature version, custody state, index, server or personal installation.
No real Account is provisioned. F-05/F-06 remain open for the remaining construction groups.

## Exact bytes and the selected genesis rule

The [byte contract](./account-crypto/first-authority.md) pins primitive encodings, recursive object order,
top-level signature omission, root/factor/device roles, bootstrap observation, creating certification,
structural digests, manifest/admission, activation and the private slot-binding dependency. The field-order
schema is separate from value/cross-object validation. Pending observation uses raw JSON inside LP;
first epoch/offer/receipt use a domain plus the hex hash of their reconstructed JSON. They are not the
service's recursively sorted proof-hash JSON, nor WebAuthn's original clientDataJSON bytes.

TRD §§7.6/13.5 and rows 5/7 now specify an empty accepted-head vector at first genesis, with the member
still in certification. No network position has yet been accepted. Local history enters via the checkpoint.
An explicit member-at-zero entry hashes differently and refuses; position one still starts from zero link.
This exception changes no existing stream, successor-epoch or pruning rule. Existing private bytes stay
unchanged, including receipt v2, separate descriptor-v2 hashes and raw SV/DS rederivation.

## Source inventory and authority map

[constructions.json](./account-crypto/constructions.json) joins 17 specified constructions to exact runtime
sites/exports, numbered byte homes and their hashes, map dependencies, vector IDs and required checks.
It includes 16 open B/C/D/Local groups and one explicit non-cryptographic names group. No Account literal
or template in the existing 157-file source census disappears simply because this phase does not finish it.
Unlabelled request/completion hashes are explicit records; source hashes flag edits that require manual
review for new unlabelled primitives. A source scan cannot infer the entire cryptographic call graph.

The legacy map retains its guard/root rules, gains six private entries and sweeps the exact byte-contract
home. The checker now also consumes the source-derived construction registry. K_auth remains a service
root with availability/serialization powers, bounded by client/factor predicates. The creating key and
bootstrap-origin signer remain factor-grounded; locally rederived coverage is structural. A root signature
cannot confer recipient authority or replace device-factor release. Existing TRD §7.6/13.5 and row-7 pins
were reread and refreshed only for these initial-format/head-vector amendments; no AEAD discipline changed.

Map success reports **40 entries, 46 chains, nine swept documents**, plus **17 specified / 16 open / one
non-crypto exclusion**. Zero open map-rule entries does not imply zero unfinished Account constructions.
The registry detects missing source occurrences, exports, map edges, pins, vector cases, mandatory negatives,
tests and signer/guard mismatches. Static references are not execution evidence: the campaign actually
runs vector/runtime comparison and negative controls. The remaining groups stay visible until their own
byte, authority and evidence gates are met.

## Reproducible validation

Run `pnpm account:first-authority`, or `node scripts/account-first-authority/run.mjs` when the package-manager
launcher is unavailable. It runs installed Node tools directly, streams bounded progress, retains failures
and deadlines, and writes source hashes, command/exit summaries, logs, JUnit and control reports under
`test-results/account-first-authority/<timestamp>`. It does not build or start the personal application.
The first-authority generator also participates in `vectors` / `vectors:check`; the full campaign is in
`pnpm check`. Intentional vector changes require explicit review and updating the vector/schema/home pins.

The [published corpus](../test/vectors/first-authority.json) has 17 deterministic fixtures with public
synthetic Ed25519 seeds/keys, objects, JSON/LP/intermediate hashes and signatures. The independent encoder
imports no production serializer or protocol crypto helper. Runtime comparison exercises 399 input
mutations, distinguishing validation refusal from changed signed bytes. The 333 encoded-field omission
controls include fixed labels/tags; they operate below value validation. Six injected omissions additionally
exercise production message builders and the signature verifier. They do not claim to bypass every
composite target/semantic predicate. Nineteen registry controls demonstrate that missing obligations fail,
including negative-corpus omissions with an otherwise current aggregate vector hash.

The generated campaign runs 200 seeded, shrinking-enabled recursive property reorderings, retaining array
order. Actual verifier tests cover fixed positive proofs, a real fixed WebAuthn assertion and proof hash,
genuinely signed wrong-purpose/scope/root/key-namespace values, nested extra fields, old/mixed versions,
array order and a signed zero-position baseline. A correctly signed descriptor lie passes the content-blind
checker and fails with independently supplied coverage. Opaque dummy checkpoint/wrap/recovery ciphertext
in these fixtures is **not** an encryption or Yjs coverage vector. The existing admission-core tests and
ES256/Ed25519 slot-verifier suite are exercised as related regressions; native lifecycle campaigns remain
at their earlier recorded baselines. No full unit, native or build qualification is implied.

[Preserved run evidence](./account-conformance-runs/2026-09-11-account-first-authority.md) records the actual
results, source pins and limits. Next is group B: current recovery payload/digest/challenge vectors and
raw-export prefix assertions, with normative row-14/TRD correction. Envelope/transport and custody/ledger
groups, invocation-grant power-loss accounting, broader review obligations and real Account rollout remain.
