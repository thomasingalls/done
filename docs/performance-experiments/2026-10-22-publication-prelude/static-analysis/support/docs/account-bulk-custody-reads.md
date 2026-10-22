# Bounded fresh custody inventory reads

2026-10-12. Base investigation signed `902806c9`. The bounded bulk reader is implemented and tested,
but **not adopted**: it failed the predeclared read-time improvement threshold. The cursor remains
the default. `VITE_ACCOUNT_BULK_CUSTODY=1` selects the experiment at build time. No stored/wire format
change. The contracts below apply to either reader; no authority check has been removed.

## The authority contract is unchanged

Every authority check still opens the known custody database, checks its layout and reads the
**complete current inventory for the slot**, under the same live task and exclusive writer permit.
The [positive authentication memo](account-authority-authentication-reuse.md) compares every key and
field against its independently owned authenticated snapshot. Any difference reaches the existing
full authentication and expected-authority checks; unknown records and clear/import interlocks remain
visible. This is not a MAC-only comparison or a delayed integrity audit.

`slotCustodyRows` is shared by original-device and joined-device custody readers, including Local
claim/startup checks that use it. Its return type, ordering, missing-database behavior and row bound
are unchanged. Other startup/clear paths calling `readScopedRows` directly keep their cursor.
The change retains fresh database open/layout/close per read; it adds no connection cache.

## Complete range, bounded results

For a nonempty string prefix `p`, the lower bound is the array `p`, inclusive. The exclusive upper
bound is a copy of `p` with a NUL code unit appended to its **last string**. Every array key whose
first elements exactly equal `p` falls in that interval, including the exact prefix key and any
number/date/string/binary/nested-array suffix. A neighboring string such as `slot + NUL` is outside.
This does not use an appended array or string suffix as a sentinel, which could miss unknown rows.
The prefix is copied before asynchronous scheduling. Empty prefixes retain the cursor fallback.

One readonly transaction issues `getAllKeys(range, 33)` and `getAll(range, 32)` immediately. The 33rd
key is an overflow sentinel: it causes the existing `too-many-scoped-control-records` refusal and
no inventory is returned. At most 32 values reach JavaScript. Otherwise key/value lengths must match
and every returned key is checked against the captured prefix before pairing them in key order.
The two requests share one native transaction snapshot, including under a competing connection's
write. Partial results are never returned. `contentTransaction` owns completion/abort; request callbacks
remain synchronous and cannot yield or release task ownership.

The returned keys/values are fresh structured-clone results. Erasing or changing one caller's result
does not mutate disk or the next caller's result. No new shared row buffers are introduced.

## Final apply and undo

The [prepared handoff](account-prepared-remote-handoff-design.md) still checks this fresh inventory at
the final editor head under a newly acquired live storage task. Captured authority/base identities
still must match. The existing synchronous canonical apply, original remote frame order, live undo
history and complete post-apply projection comparison are unchanged. Journal-before-apply and refusal
ordering are unchanged. No work crosses a forced-local-write barrier.

Cancellation still aborts and drains native work before disposal/permit release. Database version
changes close the read connection; a later unsupported layout refuses. Missing database probes abort
the creation transaction and return absent without leaving a new database.

## Evidence

[Comparison protocol and results](performance-experiments/2026-10-12-bulk-custody/README.md). Focused
unit checks compare mixed key/prefix inventories against the cursor, including 100 seeded generated
cases and explicit UTF-16 boundary strings. Native checks cover empty binary keys, 32/33 rows,
concurrent mutation, abort/drain, version changes and missing-database preservation. Prepared-receive
checks retain undo through remote admission, crash recovery and final changed-authority refusal.
Protocol verification bursts remain a separate next repair; this IO change does not remove them.
