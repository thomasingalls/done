# Admission coverage bounds and signature versioning

2026-09-11, L-1. Bounded correction of review F-03 and the descriptor portion of F-21.

The v1 manifest and SemanticAdmission each put raw lowercase-hex coverage in a u16 UTF-8
length-prefixed field. A 32,767-byte descriptor fits; 32,768 bytes fails. This limits history,
not visible writing. The immutable `6398e33` reproduction produces a 41,618-byte state vector
from 12,000 synthetic writer incarnations and a 39,750-byte delete set from 12,000 separated
deletions. Both checkpoints are under 216 kB and both signatures refuse. Delete sets can
coalesce; the finding does not establish monotonic growth under every edit history.

## Selected correction, before implementation

Both signed objects advance to **v2**, with `done/cp-manifest/v2` and `done/cp-admit/v2` domains
and decimal version `2`. Replace each raw descriptor LP field with lowercase hex SHA-256 of
its **decoded opaque bytes**, separately and in the same field order. No hash of the hex text,
no concatenated SV/DS hash, no caller-supplied digest accepted in lieu of the raw descriptors.
The raw fields remain in the closed transport objects. The manifest digest hashes the complete
v2 signed message. Exact fixed-order request, completion and service receipt binding remains.
Checkpoint encryption/AAD stays v1; it is an independent format. Yjs derivation stays
`yjs-13.6.31-sv-ds-v1`, including the empty state-vector suffix in DS encoding.

The private adapter caps **SV bytes + DS bytes at 16 MiB**, inclusive, matching the current
genesis coverage budget. Both must be nonempty canonical even-length lowercase hex. Check
these limits before hashing and before the client writes admission-requested or contacts the
admission service. Manifest and derived pairs are bounded separately and then must match.
Their four hex occurrences total at most 64 MiB, fitting the existing 72 MiB completion/receipt
transport budget with fixed metadata. Genesis still has its independent 16 MiB snapshot bounds.
This is a parser/work ceiling, not a browser performance guarantee or unlimited-history promise.

Every client restorer still decrypts, fully materializes and derives both descriptors. All raw
bytes must agree with manifest and admission. The content-blind service verifies certified
signatures, structure and internal agreement; it cannot prove semantic truth. A correctly signed
lie may pass that service and must fail client replay. No trim/authority rule changes.

## Private compatibility disposition

No real Account receipt exists. New clients/services **refuse v1 completions and receipts**, mixed
versions and unknown versions. They never reinterpret signatures, re-sign old progress, rewrite
an admitted service row, or automatically reset a workspace. Synthetic completed fixtures must
be recreated explicitly. Retained pre-completion requests/offers can resume into v2 because they
do not yet bind a completion encoding. A requested client whose service already admitted v1 also
refuses. An offered/receipted v1 client carrier refuses before mutation, including later v4-v9 owners
that embed it. Old readers refuse the nested v2 objects even though the enclosing carrier number
is unchanged. Local-only installations and unsent genesis candidates are unaffected.

## Verification boundary

Run immutable v1 exact-boundary and real Yjs-history reproductions. Publish updated row-7 vectors
and per-field elision checks, plus independent OpenSSL/LP checks against production v2 builders.
Exercise generated histories, both sides of old and new bounds, canonical parsing, both signed
versions, correctly signed independent SV/DS lies, omitted-field and semantic-check controls.
Native tests carry long histories through genesis, HTTP admission, saved receipt and cold replay,
with refusal leaving the previous carrier intact. Retain genesis/admission and composed send/receive
regressions. Preserve the personal packages and historical annotated review unchanged.

Fresh account assertions, the remaining crypto registry/recovery alignment, power-loss invocation
accounting, Account UI, real provisioning, enrollment and rollout remain separate gates.

## Completed outcome

Implemented and validated on 2026-09-11. [Preserved evidence](./account-conformance-runs/2026-09-11-account-admission-bounds.md)
records the reproducible old ceiling, v2 implementation and generic row-7 vectors, generated properties,
independent signed-lie controls, native cold replay and affected regressions. This work remains private;
the fresh activation assertion and other gates above still precede real Account admission.
