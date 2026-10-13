# Local retention: reader-first compatibility and rollback

2026-10-13. Base: signed `e2e5337a`. This phase prepares a compatible packaged reader;
it does not enable conversions, publish an image or touch personal profiles. General release
validation remains paused. The [2026-10-14 publication handoff](./account-local-retention-publication.md)
now records the tested reader image and its compatible local rollback alias; remote publication and
pull verification remain pending.

## Capability boundary

The packaged defaults are `VITE_ACCOUNT_BASELINE_READ=1`,
`VITE_ACCOUNT_BASELINE_INSTALL=0`, and `VITE_ACCOUNT_RETENTION=0`.
Reading an authenticated baseline does not authorize creating, replacing or removing one.
The private installer requires its separate installation flag; private removal requires all three.
The storage owner enforces those write restrictions as well as the composed Account owner.
There is no new application action, automatic conversion, cadence or implicit upgrade at open.

The existing reduced representation is unchanged: counter **v5**, carrier
**`done/local-baseline-carrier/draft-3`**, and `history: baseline-plus-suffix`.
Its encrypted payload, authenticated pointer, journal era, chunk binding and absolute suffix
sequences retain their existing meanings. v1/v2 ordinary stores remain ordinary. Earlier private
v3/v4 anchors retain complete-history semantics; missing rows never turn them into reduced stores.
No schema migration, receipt change or service protocol change is introduced here.

The reader capability reaches original and joined cold/live owners, startup classification,
checkpoint installation, native membership sources, rotation and detached/uploaded-history readers.
It still requires the complete fresh custody/authority check, baseline authentication and independent
replay. Reader-only reduced owners retain warm/incremental reuse and interruptible semantic audits;
ordinary owners retain their existing bounded row audits. Reacquisition/resume invalidation remains.
Normal suffix writes preserve the baseline and journal era. Journal-before-apply, restored-pair
refusal, prepared receive fencing, final authority checks and the live UndoManager are unchanged.

## Publication order

1. Commit and publish the **reader-only** build with the defaults above. Record its exact image
   digest and source identity in the publication handoff. That compatible image must remain
   available as the rollback target before any writer release. The publication handoff records the
   prepared container; it has not yet been published.
2. Let the normal application-update flow install that reader. Updating the service does not
   prove that every cached client has updated. A future conversion must be initiated only by a
   capable, exclusively owned client, with its existing compatibility fences intact.
3. Design and verify the product conversion action, eligibility, capacity/refusal presentation and
   scheduling separately. The current private writer can prepare/replace/remove history in tests;
   that is not authorization to activate it in public builds.
4. Only then publish a writer-enabled application, retaining the compatible reader image and this
   rollback contract. Each device has its own local representation; one converted device does not
   require all peers to convert.

## Rollback rules

Before any local conversion, ordinary profiles still permit the previous application image.
After conversion, rollback must preserve **reader capability**. Disabling new conversions is safe;
disabling the reader is not a supported rollback for a reduced profile. Redeploy the recorded
compatible reader image and use the normal waiting-service-worker update path. Offline clients
continue using their cached version until an update is available.

An incompatible cached predecessor must refuse rather than replay a suffix as complete history.
Its refusal does not restore deleted evidence. Do not delete the baseline, clear browser storage,
reset the device-lock code or manufacture missing history to get around that refusal. Return to a
compatible application. Recovering from an actual backup is a separate procedure and must respect
the existing journal/database pairing and nonce-safety limitations.

The predecessor can report this refusal as a generic unlock failure. That old UI cannot be
corrected by the new reader bundle; operators must not interpret it as evidence of a wrong code.
The focused rollback fixture observes the underlying refusal separately from its UI.

## Evidence and remaining scope

The [focused packet](./development-evidence/2026-10-13-local-retention-reader-rollout/README.md)
records exact commands, results and source identities. The packaged journey uses separate disposable
original/joined profiles, actual waiting service workers, a private conversion build and a frozen
predecessor runtime. It checks ordinary creation/sync, reader rollback, offline edit/reopen,
undo/redo, checkpoint continuation and refusal before returning to a compatible reader. The
lifecycle continuation uses reduced profiles with converters absent alongside a new ordinary peer.

The 4 MiB baseline capacity, unavailable-history presentation, public conversion trigger/cadence,
remaining initial-conversion admission wait and current-phone measurements are separate work.
This compatibility phase makes no new performance claim and does not resume release validation.

The reload-heavy lifecycle fixture also exposed a separate session limit: renewals returned
`429 capacity` after a deliberately lost removal reply, leaving its durable attempt pending.
The service retains at most eight live access tokens per remembered login, each lasting up to five
minutes. A succession of short-lived owners/reopens can consume that allowance. The final fixture
restarts the disposable backend at the lost-reply boundary, retaining the same SQLite/custody and
checking actual restart recovery; it does not claim uninterrupted recovery from that capacity limit.
No service limit or timeout was raised. That evidence remains historical. The subsequent
[session-liveness repair](./account-session-renewal-window.md) removes the restart workaround and
rotates the oldest token within the same authenticated login. It keeps all reader/conversion defaults
and local representation checks unchanged.
