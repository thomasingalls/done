# Retained Local claim authentication and migration disposition — D8

This completes the classification of the twelve labels in `remaining-local-provenance`. Four labels
are live Account dependencies and receive current byte/runtime/native evidence. Eight labels belong to
four inherited Local/migration groups outside Account acceptance; they retain explicit scope and evidence
pins, not a claim of newly completed crypto qualification. No production code or valid format changes.

## 1. The retained identity anchor and key

`localGenesisRecord` retains the immutable initial creating custody record in `[slotId,"local-genesis-v1"]`.
It names the principal/workspace, store/root, creation intent and both operational credential IDs. The
initial record is authenticated using the factor-opened root under [D6](./local-custody.md); it is never
copied over missing live custody or used to reset a reservation counter. The enclosing Local claim's v1
schema is distinct from its initial custody record's v2 schema.

`K_claim = HKDF-SHA256(root, salt=empty, info=LP("done/local-genesis-metadata/v1") || LP(slotId) ||
LP(principalId) || LP(workspaceId) || LP(rootId), L=32)`. The result is a non-extractable HMAC-SHA256 key,
with sign/verify usages. LP is the custody encoder's two-byte big-endian UTF-8 byte length plus bytes;
ill-formed Unicode and fields over 65535 encoded bytes refuse. The current claim parser requires
16-byte lowercase hex principal and workspace IDs. HMAC authenticates the message below and is retained
as a 32-byte Uint8Array; `hex(initial.mac)` is 64 lowercase ASCII hex characters, not decoded MAC bytes.
The owner clears its temporary normalized-factor and opened-root buffers in finally blocks.

## 2. Exact progress, selected-import and cleanup messages

Fresh claim message:
`LP("done/local-genesis-progress/v1") || LP(hex(initial.mac)) || LP(stage)`.
Stage is exactly `custody`, `content` or `ready`. The initial record must remain `creating` with zero
reserved seals; live custody is a separate authenticated record and must match the creation plan.

An imported claim is always `ready`. Its message is:
`LP("done/local-import-selection/v1") || LP(hex(initial.mac)) || LP(stage) || LP(JSON(tuple))`, where
`tuple = [policy,recoveryDigest,sourceOrigin,sourceDigest,planDigest,createdAt,selectionMac]` in that order.
Policy is `markdown-system-v1`; the three digests and selecting MAC are 32-byte lowercase hex. Source
origin has at most 4096 JS code units. The timestamp has the existing millisecond UTC shape and a finite
Date.parse result; it is retained provenance, not an authority clock. Keys in the input object may be
reordered; tuple order cannot. The selecting MAC is bound as provenance, not reverified with the retired
pre-active-import authenticator on ordinary Account open.

If `sourceCleanup` is present, it replaces that outer message with a wrapper around the selection bytes
and cleanup tuple. Let `S=hex(selected-import-message)` and
`C=JSON([version,intentId,databaseDigest,entries.map(e=>[e.key,e.digest]),next])`.

- v1 wrapper: `LP("done/local-import-cleanup/v1") || LP(S) || LP(C)`.
- v2 wrapper: `UTF8(JSON(["done/local-import-cleanup/v2",S,C]))`. `C` is a JSON string within the outer
  array; it is not inserted as a nested array. JSON escaping preserves lone UTF-16 code units distinctly.

Both use the same scoped `K_claim`. Presence is authenticated by choosing distinct domains. v1 is
retained for existing intents; its LP size limit can reject a structurally valid large manifest. v2
avoids that field-size ceiling and does not widen the shared v1 encoder. Tests authenticate an 81,200-byte
wrapper and show v1 refuses that payload. The parser permits versions 1/2, an intent of 16-byte lowercase
hex, a nullable database fingerprint, up to 4096 unique allowed legacy keys of at most 4096 code units,
32-byte lowercase hex entry fingerprints, and a safe integer cursor `0..entries.length+1`. Entry order
is significant; the cursor refers to that order. Cleanup is complete only at `entries.length+1`.

A claim can retain incomplete cleanup progress. Its MAC proves the retained intent/progress bytes;
it does not prove source absence, successful deletion, source exclusion or profile erasure. Account
startup does not run cleanup or require the cursor to be complete. Local clear's separate owner checks
completion and source absence. This phase preserves that existing distinction.

## 3. Actual Account consumption and native checks

Promotion preflight authenticates the ready Local claim before opening content or requesting a service
proof, then rereads and authenticates it after the proof wait. `readPromotion` also calls
`readLocalClaim`, `verifyLocalClaim` and `matchLocalCustody` before accepting an Account marker; the
marker binds the exact `claimMac`. `localCensus` compares the creation plan, live custody, content witness,
counter and selected route. `verifyAccountUnderPermit` consumes these checks before the checkpoint/replay
rules in [D7](./checkpoint.md). All four claim labels above are therefore live dependencies even after
migration finished and the plaintext source was removed.

Native tests run fresh, imported, cleanup-v1 and cleanup-v2 claims through real promotion, admission,
handoff and offline cold classification. Imported provenance is synthetically factor-authenticated for
this boundary test; the inherited migration campaigns below qualify how its owner originally created it.
The native claim MAC matches an independent factor/root/KDF/message reconstruction. Damaged MACs refuse;
omitting claim authentication permits preflight, while an existing promotion marker still refuses a
changed winning MAC. Restoring exact bytes succeeds. Generated valid-shaped provenance/cursor changes
refuse before Account access and do not rewrite storage. Pre-active-import or Local-clear rows can only
block ordinary Account use; their crypto/deletion owners are not invoked.

The claim property campaign enables shrinking for stage, import-origin and both cleanup-version/cursor
histories. Per-leaf input tests count parser refusals separately from cryptographic refusals. Encoded
omission witnesses authenticate weakened messages with real HMAC; source controls independently remove
key/progress/selection/cleanup fields. No inference of full concurrency, OS durability, forensic
zeroization or rollback protection follows from these checks.

## 4. Explicit inherited scope of the other eight labels

These remain cryptographic constructions, not non-crypto exclusions. Registry status `inherited`
means outside **current Account acceptance**, with retained historical evidence; it does not mean fresh
whole-Local or migration qualification. The checker only permits the four named groups and their exact
label sets, requires pinned scope/evidence and native boundary tests, and reports them separately.

| Inherited group | Labels and actual owners | Account boundary and retained evidence |
| --- | --- | --- |
| Local clear | `done/local-clear-authentication/v1`, `done/local-clear-progress/v1`, `done/local-import-clear/v1`; `localClearCrypto.clearAuthenticator`/clearPayload and the Local-clear owner | Account reads/parses presence through assertNoLocalClear and refuses; it never authenticates a clear intent or deletes through that owner. [Local clear](../local-clear.md), [native historical evidence](../storage-conformance-runs/2026-09-08-local-clear.md), [import cleanup integration](../storage-conformance-runs/2026-09-09-legacy-cleanup.md). |
| Pre-active import | `done/legacy-import-metadata/v1`, `done/legacy-import-progress/v1`; signImportClaim/verifyImportClaim, import and selection owners | assertNoPreactiveImport blocks on presence before Local-claim authentication. After selection, the ready Local claim authenticates the retained selecting MAC and provenance via §2, without calling this earlier authenticator. [Import](../legacy-import-preparation.md), [selection](../legacy-selection-preparation.md), [native import evidence](../storage-conformance-runs/2026-09-09-legacy-import.md), [selection evidence](../storage-conformance-runs/2026-09-09-legacy-selection.md). |
| Legacy source observation | `done/legacy-source-observation/v1`; inspectLegacySource hashes its ordered database/local observation tuple, with no secret key | Used by capture/import/selection/cleanup to detect source changes. Account does not scan or hash legacy plaintext on open. The observation alone cannot establish quiescence or defeat ABA/old writers. [Import contract](../legacy-import-preparation.md), [cleanup evidence](../storage-conformance-runs/2026-09-09-legacy-cleanup.md). |
| Cleanup fingerprints | `done/legacy-cleanup-fingerprint/v${version}`, `done/legacy-cleanup-entry`; cleanupFingerprinter derives an intent-scoped key and HMACs database/local values | The cleanup owner creates/compares fingerprints. Account only parses cleanupPayload and authenticates the enclosing claim (§2); it neither reobserves source nor calls the fingerprinter. [Cleanup contract](../legacy-cleanup-preparation.md), [native cleanup evidence](../storage-conformance-runs/2026-09-09-legacy-cleanup.md), [later packaged helper checks](../storage-conformance-runs/2026-09-10-app-upgrades.md). |

The native fixture replaces these four actual operational entry points with throwing barriers. Fresh
and imported/cleanup Account handoff plus cold startup still succeed. Direct probes invoke every barrier
to prove the controls are installed. This bounds current tested paths; it is not a universal reachability
proof. Source pins, explicit entrypoint/source-label checks and these barriers must be revisited if an
Account owner begins invoking one of these operations. The shared cleanup parser and payload encoder
are deliberately **inside** §2's evidence, despite living beside the legacy-only fingerprinter.

Historical evidence remains dated to its tested source and assumptions. D8 does not silently relabel
that evidence as a current full migration run, reopen host-exclusion research, or rebuild the author's
already-completed migration. Real second-device adoption remains a future fresh-custody procedure.

## 5. Completion boundary and aggregate review

D8 closes the last unclassified group with four currently specified claim constructions and four
explicit inherited groups. F-05/F-06 still require the aggregate closure review: source coverage,
primitive roles, exact byte homes, executed fields and effective controls across A/B/C/D1–D8, including
all inherited scope limits. Zero open groups is not sufficient. F-15, remaining parser/service/owner
findings, general lineage/checkpoint evolution, cross-device enrollment/adoption, total-loss recovery,
platform/residue/performance and deployment gates remain separate. No real Account or personal build
is provisioned by this phase.
