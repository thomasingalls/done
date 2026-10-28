# Phase86 — clarify account maintenance and backup cadence

2026-10-26. Development/discussion checkpoint after unsigned85. The operator explicitly defers
**all release preparation until a later explicit request**. Continue bounded development/regressions
and sequential patches; signing, image/release preparation, pushes and rollout are not requested.
General qualification remains paused.

## Two maintenance scopes, both relevant to synced accounts

“Local” means **stored on this device**, not a Local-only workspace. The automatic reduction owner
is the composed synced Account owner. Its authenticated baseline reduces local protocol replay,
retained rows and warm verification work while preserving current writing/undo. It needs eligibility,
unlocked/visible quiet and complete proof; enabled does not demonstrate that a reduction completed.
The earlier1,201-position desktop fixture fell from3.594s to0.141s at owner-open, not total phone
unlock-to-editor. Reuse that study to select work, not predict the operator's current phone.

Manual service-history snapshot/admission/pruning is separate. The operator confirms the actual
“Covered service history removed” outcome, so this was pruning, not just snapshot creation.
`account-service/historyCheckpoint.ts` replaces covered accepted ciphertext with service-signed
conversion receipts and older snapshot bodies with completion receipts. It retains decision/response
metadata, refusals, two admitted snapshots/suffixes and native handoff ciphertext. Device-held
generation keys are not retired by this action; the service does not receive their plaintext.
It does not rewrite an existing phone's local protocol ledger, bound all server metadata growth,
retire CRDT/attribution history, or promise an immediate smaller SQLite file. Logical payload and
catch-up/storage savings are real purposes; exact savings on this account have not been measured.

## Reported startup defect, not attributed yet

The operator reports roughly a minute **before editing is possible** on the active phone account,
after successful service pruning. Its screen sleeps after15s and locks after20s. Treat this as a
startup critical-path investigation, not ordinary live-receive throughput or a claimed expected
pruning cost. First establish whether the phone has a completed reduced local baseline; then split
unlock/KDF, grant/passkey authentication, local classification/decryption/replay and usable rendering.
Existing profile milestones are opt-in, so production diagnostics are not assumed present. No real
writing, keys or credentials are needed for numeric phase evidence. No account-specific attribution,
new phone trace or startup mechanism repair is claimed in86. A fresh broad history-depth sweep is
not the next step; use the existing study and inspect the actual slow phase.

## B2: actual retry and readback policy

`account-service/backup/worker.ts` starts immediately and ticks every30s, with overlapping ticks
coalesced. Its5s health messages are local reports, not provider calls. While capped attempts finish
quickly, this can mean about120 failed readbacks/hour,2,880/day. The earlier read-only observation
showed129 cycle failures over about64minutes and confirmed403 `download_cap_exceeded`; this packet
makes no new provider request and does not claim a new current counter measurement.

`B2Store.upload` verifies the exact uploaded version before returning it. If readback fails,
`BackupCycle` keeps the old verified anchor and does not advance its captured source version. The
next tick captures/encrypts/uploads again even if writing has not changed. Auth is also reset.
So it is not just repeated403s: new unverified remote backup objects accumulate. On a healthy idle
source, the current cycle also fully re-downloads its anchor at the five-minute retention interval.
Unfamiliar hourly/daily keepers need verification before replacing a known-good recovery copy.

The current cap, readback/health/pruning guarantees and cadence remain **unchanged**. Recommended
next bounded repair: classify known quota exhaustion separately, back off until reset/explicit retry,
retain the valid uploaded receipt for retry without another upload, and preserve native settlement,
restart/lost-reply custody, dirty tracking and exact-version verification. A separate design can
reduce redundant unchanged-object rechecks, preserving verification before deleting recovery copies.
Verifying new backups only daily is a distinct policy: uploaded data would remain unverified between
checks. It has not been selected or implemented by this discussion. No unverified upload becomes a
healthy backup or authorizes pruning.

Primary provider reference: [B2 caps](https://www.backblaze.com/docs/cloud-storage-data-caps-and-alerts)
(reset00:00GMT). Earlier provider evidence remains in infrastructure81; do not duplicate credentials
or opaque object identifiers into this app packet. Mobile drag reproduction/repair follows in87.
