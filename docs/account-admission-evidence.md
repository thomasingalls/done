# Admission coverage and size evidence — F-21.2

2026-09-12. Baseline: signed `3b0a1ba54ead617bf1c994fffbaa1844b4a59eec`.
This phase tests the remaining client-owned receipt and size boundaries. It changes no production
behavior, byte format, limit, registry or vector. No real Account is created.

## Inventory before adding tests

The historical F-21.2 absence claim is partly stale. Credit these existing tests:

| Existing evidence | What it establishes | Remaining distinction |
| --- | --- | --- |
| `account-admission-bounds/protocol.test.mjs` | v2 hashes decoded SV/DS; real inclusive 16 MiB combined limit; correctly signed lies pass content-blind service but fail supplied client coverage; effective semantic/hash omissions | Supplied expected descriptors are not the browser owner's cold replay |
| `account-admission-bounds/native.test.mjs` | Real long writer/deletion histories exceed the former LP limit; signed lying retained offers refuse; lowered 32-byte limit refuses before requested/send | Offered completion is not a receipted resume; the lowered bound is explicitly a fixture |
| Group A `account-first-authority/formats.test.mjs` | Signed descriptor lie and supplied expected coverage | Same protocol-level distinction |
| `account-genesis/native.test.mjs` | Native genesis commit/restart, correctly signed stale checkpoint/coverage/wrap/actor forgeries, generated histories | No actual 16 MiB owner snapshot edge |
| D7 `account-checkpoint-contract/native.test.mjs` | Independently reconstructed checkpoint bytes; selected/active startup source completeness, effective omissions | Startup coverage differs from admission receipt coverage |
| `account-admission/native.test.mjs` | Native admission commits/cuts, lost replies, invalid signature control and generated replay/retry | Does not isolate all cold receipt coverage checks |
| Parser conformance | Nested genesis parser minima/maxima | Parser acceptance alone does not establish pre-seal/pre-write owner behavior |

The historical LP refusal no longer exists. Current `promotionAdmission` calls `coverageParts(parts)`
before `admission-requested` or `begin`. `promotionGenesis` bounds the encoded update before checkpoint
encryption; the candidate parser also bounds ciphertext later. These are distinct side-effect boundaries.

## New receipt evidence

Build a real encrypted Local document with disk and journal updates, prepare genesis, and stop after the
owner retains its offered completion. The test opens its synthetic local factor, signs a false SV or DS
with the actual retained signing credential, and authenticates the altered offered carrier. The service
then issues a receipt through its real HTTP challenge/activation/finish flow for that completion.
It cannot know the encrypted document's coverage. Empty-document descriptors provide well-formed but
incorrect coverage for the nonempty source (including a deletion for DS cases).

Independent Node/OpenSSL checks verify receipt and completion signatures, decrypt the checkpoint and
rederive SV/DS using the pinned Yjs encoder. Protocol verification without expected local parts succeeds.
The client owner must refuse against its own replay at three call sites:

- `begin` returns a committed receipt after a lost reply;
- `challenge` returns a committed receipt, reaching the final-answer verifier (not a new assertion);
- an authenticated `admission-receipted` carrier is cold-opened.

The receipted carrier is deliberately planted by a test-only factor-owning helper; the normal owner did
not persist the wrong receipt. Refusal must preserve the full storage census. The effective control
removes only the local-parts argument at the retained-receipt call: signatures still verify, but the
owner incorrectly returns the lying receipt. Returning to the real bundle must refuse again. Generated
histories vary disk/journal placement, text edits and arrival order; each uses a fresh disposable fixture.

The final-answer case specifically exercises challenge's already-committed-receipt reply. Other guards
bind a fresh activation challenge and retained completion, so this does not claim a service can substitute
a false completion after an otherwise correctly bound fresh activation. Corruption remains refused;
the tests do not implement salvage of a genuinely wrong committed service receipt.

## New size evidence

Actual Yjs text updates are retained in batches below the 4 MiB content-batch bound. Their replay encodes
to exactly **16 MiB − 1**, **16 MiB**, or **16 MiB + 1** bytes. No limit or encoder is changed. Allowed
sizes seal once and cold retry returns the exact candidate without sealing or writing again. The larger
snapshot refuses before checkpoint encryption or any write. Omitting the early guard causes actual
checkpoint encryption before the later candidate parser refuses. This is an effective side-effect
control, not evidence that removing one guard makes an oversized candidate persist. Source hashes,
text length, retained carriers and cold replay remain exact; temporary sealed inputs are zeroed.

Combined SV/DS raw-byte boundaries are separately tested at the real **16 MiB ± 1** and exact limit,
with either descriptor holding most bytes. Here descriptors are **injected at the verified-genesis
callback**: they are not a constructed 16 MiB Yjs coverage history. Candidate authentication and source
replay run normally; the injected values isolate the admission preflight. Over-limit input must cause
zero requested writes and zero `begin` calls. Removing that one preflight permits both before later
checks could run. Removing the injection allows the retained source to complete real admission.
The existing bounds campaign separately supplies real long Yjs histories and full protocol-limit evidence.

## Execution and limits

Run `pnpm account:admission-evidence`. The runner pins the executed sources, retains per-stage logs,
JUnit counts and generated seeds/results, rejects skipped tests and bounds each child process. It also
runs the credited bounds/A/D7/genesis/admission regressions, type checking, registry/map/census checks,
all vectors, lint and format. New bundles are built in memory, with disposable Chromium and loopback
services only. Personal files and stopped servers are retained unchanged.

Generated success is bounded evidence, not a proof of all histories. Test seams are not production
APIs. This campaign does not qualify power loss, other platforms, general successor checkpoints,
large-history performance, real enrollment capacity, deployment or whole-profile plaintext residue.
