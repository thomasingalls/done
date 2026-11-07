# Phase 488 — bounded published acceptance poll

Change exactly one expression in the 3,072-position grow recipe: the per-position
poll now reads `b.session.session.sync.status.send.acceptedThrough` from the Window
instead of requesting the full `compositionStatus()` graph. The initial baseline
status call remains unchanged. Inverting that expression recovers the SHA-256 of
the original phase485 recipe, independently recorded in its frozen manifest.
Every other byte, including the 1,024 individually accepted edits, exact prefix+1
assertion, 30-second per-position check, pacing, archive/Goals assertions and old
reader snapshots, remains unchanged. No app source, message limit or guard changes.

Six permanent controls pass. They read the actual recipe expression, poison the
full-status RPC and history access, test live progress beyond the old failure,
retain lagging/skipped values for the existing exact assertion, refuse absent
status and prove sensitivity when the old RPC expression is restored. Run with
pinned Node24: `node --test regression-controls.mjs`. These explicit reproduction
controls are not claimed as aggregate release-test credit. The recipe and controls
are retained beside this record for reruns; all earlier roots remain untouched.

Start the next grow run from a fresh copy of the original2,048fixture and use the
same plain470/473assets, API, setup ceiling and per-position deadlines. No failed
state is resumed. No timing credit or favorable retry is inferred.

Evidence correction to the supplied second opinion: phase487b's in-Worker hook
DID produce the saved `message-bound-guard.jsonl` row through page.on('console').
It reports1,048,620accounted bytes and36,539nodes at first violation. The first487
attempt had an incorrect private source binding and earned no guard-site credit;
that is distinct from console output being lost. Both attempts remain preserved.
The full snapshot and carrier/capture costs belong in Stage6, with a static census
of replies that can grow with history. No further optimization is built here.

No commit, push, publication or deployment.
