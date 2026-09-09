# Seeded legacy export capture — phase fourteen

Phase thirteen is committed as `e64cd2a`. This checkpoint builds the next boundary in
[legacy-migration-prep.md](./legacy-migration-prep.md): read-only capture, saved recovery bytes and cold
verification under controller-owned exclusion in a disposable browser. It is not the production
supported-version cutover, destination import, active selection, cleanup or fidelity archive. The open
sequencing §5.4 attribution/carrier decision remains open. No new release/debt payment follows.

## Capture and replay

`src/crdt/legacyExport.ts` exposes private preparation functions, absent from default application exports
and startup. `captureLegacyExport(task, { preview: 'markdown-v1' })` calls the phase-thirteen reader itself,
requires a complete dependency basis, validates a supported schema-4 projection and returns a candidate.
It does not accept a caller document, raw keys, counters, an exclusion boolean or a trusted source digest.
It reobserves the source after preparing/hashing the output and refuses detected drift. As before, repeated
matching observations do not exclude old writers or establish source authenticity.

The candidate contains two distinct plaintext byte arrays:

- **Diagnostic source recovery JSON.** `kind: done-legacy-source-recovery`, `v: 1`, observed origin,
  source-observation digest and a list of original `{carrier, id, update}` records. Journal records
  retain their exact storage key and canonical base64 update; disk records retain their numeric key and
  base64 update. Journal precedes disk, preserving the reader's order and each update's framing. IDs and
  duplicate *updates* survive; duplicate record identities refuse replay. No merging is performed. The
  four ancillary local values, including relay credentials/device names, are omitted. Their observation
  digest binds the captured census without including those values in the packet. CRDT metadata already
  in the source remains in the raw updates. This packet is not a profile restore or an encrypted archive.
- **Explicit Markdown preview ZIP.** The existing export serializer writes the master, every nonempty day
  and supported unfiled content. There is no freeze/cap filter. A fixed 1980 timestamp makes identical
  capture content byte-reproducible. The preview is an exercised adapter, not selection of Markdown as
  the real migration carrier and not a claim that Markdown preserves identities/attribution.

Separate SHA-256 digests identify both arrays. `replayLegacyExport(bytes, expectedDigest)` copies bytes
before awaiting hashing, checks the separately held digest, validates packet framing and replays original
updates in a fresh private Yjs document. It returns Markdown entries without touching origin storage or
starting application initialization, repair, transport, actor registration or a destination. The source
origin/digest are observations inside an untrusted file; its checksum is integrity relative to the caller's
expected digest, not a signature or source authority. If both bytes and expected digest can be replaced,
this mechanism does not authenticate them. The future migration owner must independently bind authority,
intent, source selection and the selected carrier policy.

Output remains in memory in production. Only the seeded harness writes synthetic packets and previews to
ignored `test-results`, with a separate digest record. It saves and rereads files, opens a fresh browser
runtime for recovery, and independently reads the ZIP through Python's standard-library `zipfile` including
CRC checking. This tests application-file persistence and replay; it does not claim a user-held verified
backup, filesystem fsync/power-loss durability, portable encrypted custody or restored writable counters.

## Supported projection and refusals

This preparatory projection accepts schema version 4 and the known meta/master/days/cards/cardLocations
roots. Earlier, newer or unknown root/schema shapes refuse; no automatic schema upgrade occurs. Text must
be plain string content with no embeds/attributes. A pinned-Yjs seam check rejects sequence content
reinterpreted as a Map root; text attributes similarly catch map entries reinterpreted as Text.
Text item kinds are checked before projection as well: pinned Yjs skips array ContentAny items in a
Text projection, which otherwise turns an unsupported array-valued master into an empty successful file. Day names
must be canonical calendar dates, giving safe ASCII ZIP paths. Card framing and canonical location references
must be supported. Archive text must parse/serialize byte-identically, with no simultaneous live sections.
Unknown shapes and pending insertion/deletion dependencies refuse while the original source stays intact.

Every retained registry card must be represented in a visible collection or in the existing unfiled
projection. A card whose canonical location points at an extant collection that omits its id otherwise
falls out of both day export and `unfiled.md`; this capture refuses `legacy-membership-needs-repair` rather
than silently exporting the omission or mutating the source to repair it. Supported locationless unfiled
cards and archive-only days are included. Card ids/authors/origins/creation times remain in the diagnostic
updates; the Markdown preview retains the existing format's deliberate omissions.

These are explicit refusal bounds, not a claim to accept every historical workspace: the source reader's
4096-row/local-entry and 16 MiB per-carrier limits still apply. Replay additionally caps the encoded packet
at 64 MiB, records at 8192 and decoded updates at 32 MiB. Reconstruction and ZIP serialization are in memory;
large-input memory/latency and streaming remain unmeasured. No malformed/unknown material is deleted.

## Controller-owned exclusion and interruption

`scripts/legacy-export/exclusion.mjs` owns one disposable Playwright context. Service workers are blocked
at context creation. The controller closes every existing page, awaits dedicated-worker closure (including
a fixture worker holding the native source DB open), checks for remaining contexts, and starts only the
pinned capture page. An observation handle is tied to the resulting controller epoch. New pages/workers,
unexpected navigation, prohibited old/remote routes, WebSockets, renderer death or page closure invalidate
that epoch; closing an unexpected page does not repair it. The context is still invalid until the controller
closes old contexts and establishes a new epoch. Source fixture reseeding explicitly ends the prior epoch.

The controller checks its handle before capture verification and again after saved-file readback, cold
replay, a final source observation and an unchanged-origin inventory. The inventory independently includes
known DB rows, localStorage, Cache Storage names and service-worker registrations. Tests verify that source
carriers remain byte-identical during capture/replay. This is not an exhaustive arbitrary-profile inventory
or forensic-residue scan. No packet, boolean or in-page function can mint a production exclusion capability.
The seeded context admits only pinned fixture code; it does not simulate hostile unlocked origin code,
unknown historical SharedWorkers, other browser profiles or remote installations.

The native schedules kill capture after the initial source digest and during output hashing, then reacquire
and recapture. Another death occurs after saving recovery bytes but before file replay. Interrupted capture
leaves either the original source or the source plus a recoverable candidate; no destination or cleanup
state exists. Truncated files and a wrong separately held digest refuse verification. Deliberate source
drift and reopened/attempted old execution paths prevent candidate verification. These are export-boundary
interruptions, not the future migration/export/import/selection/deletion kill matrix.

## Evidence and scope of the properties

`node scripts/legacy-export/run.mjs --output <fresh-directory>` freezes source/harness/guide inputs. It
runs native source storage, Web Locks, SHA-256 and renderer deaths; controlled fixture writes only seed the
source. Generated histories vary multiline/Unicode master and card text, empty bodies, ten days, Next
counts beyond three, unfiled content, an archived day, causal journal insertion/deletion, record partition,
order and duplication. A separate Node input-string ledger checks every expected file/body, and original
wire records are checked against the source update ledger held outside capture. The ZIP is read by a
separate implementation. Yjs is shared by the fixture producer and replay, so this tests capture/storage
and projection, not independent CRDT correctness.

Defaults are seed 8941 and 60 generated histories. `--seed`, `--runs`, `--path` and `--replay` support
exploration and saved JSON replay; failures save the minimized history with the fast-check seed/path. Each
history saves/reopens its candidate in a fresh runtime. Named sensitivity controls omit WAL, truncate days,
ignore pending dependencies/missing membership, ignore text item kinds/the external digest or forget observed exclusion
loss. Harness exceptions/timeouts are failures and never credited as detected source mutants.

The unit suite adds packet/shape/refusal and caller-mutation checks plus 100 generated multiline/Unicode
payloads against the independent input ledger. The default application still uses the legacy provider;
no real installation, downloaded user file or remote relay is touched by this checkpoint.

The next bounded work is the authenticated **pre-active destination/import owner**, with verified source
and carrier-policy input, confirmed factor, fresh writable key/store/counter scope and idempotent bounded
slices. It must not bypass Local genesis absence checks or install a normal ready index row early. Its
crypto/progress construction and tests need to be made concrete before selection/cleanup. Production
old-writer exclusion, real carrier/attribution choice, supported profiles and review 3a remain gates for
Stage 2; the diagnostic source packet does not satisfy the fidelity-archive choice.
