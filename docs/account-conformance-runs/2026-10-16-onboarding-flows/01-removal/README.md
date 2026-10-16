# Phase 1 — truthful, resumable device removal

Base: signed `1849721ee61265b73a00aca6df8f495629dd4e9c`. Prepared overlay, not a commit.

Contract: storage SC-06/07/08; PRD v9 / TRD v8. Explicit typed confirmation authorizes one slot. Persist the intent before destructive work, retain journals/keys/index after refusal, preserve other slots, and never infer old-writer exclusion. Exit: actionable refusal for legacy/absent/read failures; automatic cold resumption of an authorized intent; terminal removal remains explicit about Start fresh.

Results on Node 24.18.0: 23 unit cases (4 new), 12 application cases (2 new), and 9 packaged Chromium cases (7 new, 2 unchanged late-reply races), all pass. Typecheck and packaged build pass. Browser storage is disposable; ports 53221/53222 are isolated from preview 8443. No real-provider walkthrough or qualification claim.

Baseline: 3/3 initial unit cases fail; the added setup-only case also fails before its repair. Cold-entry route regression returns 404. After the route repair alone, the original UI build fails five of six browser cases (legacy database/journal, absent workspace, content/journal failures); the blocked native deletion case passes. A final added read-failure case verifies no authorization is inferred. Actual databases, journals, custody rows and unrelated setup are checked, not presentation alone.

The initial browser attempt timed out on a blank HTTP 404 page; it supplies no removal-behavior evidence. Two package-manager invocations produced no output and were cancelled; direct installed binaries under pinned Node completed. An unused parameter in the new browser fixture was corrected; the initial typecheck remains. All logs are normalized, compressed, hashed; source pins cover implementation, tests, config and governing contracts.

Legacy-only carriers remain intact. The repair removes the misleading finish-removal state; it does not introduce unsafe general legacy erasure or an old-writer exclusion mechanism. Account creation classification is phase 2. Normal-CI inventory/census integration and final checks follow separately; qualification stays paused.
