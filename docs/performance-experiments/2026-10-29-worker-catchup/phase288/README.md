# Phase288 — bounded range preparation counterexamples

2026-10-30. Eight new regressions exercise bounded preparation against the existing full-range
verifier:7fail/1pass as expected. Preserve all earlier full-range4/8 tests and their all-or-nothing
record-bound assertion. New API must prepare at most the remaining four-position native allowance;
reusing downloaded originals on a later turn requires fresh independent native prefix/link,
authority, lifetime, expiry, history and original signatures. Stored evidence stays indexed and
byte-exact. An invalid selected entry returns no partial selected prefix. An unselected tail is
not yet verified; no proof or progress may be inferred from it. No retained old-event shortcut.

A valid prefix can fit the unchanged native byte/record cap even when the whole downloaded page
cannot. Bounded preparation may return that prefix and erase unused plaintext. A page too large
to represent even one indexed receipt may select fresh narrower work without any result or
progress. This is an unverified size scheduling hint, never authority. Invalid scope/signature/
link within selected work still fails. Keep the existing full-range API strict and unchanged.

Next implement this preparation boundary first, then wire bounded raw-tail ownership and an
eight-entry planner in another phase. Native four-position/fairness, clean Worker size fallback,
deep8 and stale-tab/rollback remain unestablished. The new test is intentionally red and cannot
receive aggregate credit; conservative registry/manifest reconciliation follows implementation.
No gate/limit/backoff/flushing change, normal comparison, release work, computer use or real data.

Initial new-fixture attempts included an old-event retained opener in what should be a fresh
forward context; corrected the fixture to match native forward state without weakening the
explicit retained-evidence refusal. Initial patch replay caught normalization of a surplus blank
line at the end of the raw log; the unregistered failed artifact/attempt remain archived. The
repo log keeps all diagnostic lines with one final newline; raw bytes remain in private artifacts.
