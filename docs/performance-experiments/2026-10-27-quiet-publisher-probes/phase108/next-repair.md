# Proposed next bounded repair: short per-publisher quiet rechecks

This investigation changes no runtime. Start the next candidate at a **750ms fixed recheck budget**,
only for a remote publisher whose actual authenticated empty reply has finished and whose exact
cursor/authority basis is still current, while fresh retained backlog is known elsewhere. This is an
engineering starting choice, not a derived worst-case guarantee or an adopted default. At fixed old
timestamps750ms removes443–453 of1026–1028 heavy quiet observations versus503–505 at1s;500ms removes
only27–38. Extra250ms deferral buys relatively little in that diagnostic. Those counts predict no
saved time or request volume once timing/hints change. Actual candidate acceptance must be measured.

Requirements:

- First/new/changed publishers stay due; conflicts stay outside quiet deferral and retain the existing
  fail-closed behavior. Actual progress or unknown/refused/expired/
  duplicate evidence must not be mistaken for a verified empty observation. Raw page framing and
  `more(page)` are not verified-empty inputs. Never reuse an old nonce-bound reply for a new request.
- Store a bounded scheduling hint, no transferable authority/proof. Bind current publisher/cursor and
  exact owner authority/baseline context. A target with known positive backlog is never deferred.
  Bind target cursor/link/context values, not aggregate receivedThrough, whole-store revision or
  detached-clone object identity, which change with unrelated work. Eviction makes a publisher due.
  Do not persist hints or infer permanent silence from device presence.
- Fixed publisher-specific expiry, with rollback forcing a read. Unrelated productive/empty work
  cannot extend it. Preserve four useful pages per turn and the original all-idle sweep/repair poll.
- Workspace content/control hints, ready/resume/reconnect and authority/history/baseline changes must
  invalidate applicable quiet hints. Capture an attempt-generation token before the network read;
  a completion from an older token cannot recreate quiet state after invalidation.
- Invalidate the new quiet hints without resetting existing own-check freshness or round-robin
  fairness on every content hint. Otherwise the change can undo100's gain. Keep pending-self,
  first-own, clock/reset/credential boundaries intact. Do not abort useful reads for an advisory hint.
- Every actual read still has fresh nonce, authorization/history/witness/signature/prefix/lifetime/
  commit checks. Hints never grant progress or override refusal backoff. No rate/capacity changes.

There are limits to this small approach. Notifications are workspace-wide; continuous writes from
one busy publisher can invalidate other quiet hints. It may therefore help stable bulk backlog more
than ongoing same-account writing. Current certified-reader selection already excludes removed
members; historical finalization is not a shortcut for these four currently certified idle writers.

A larger alternative is a mixed-publisher probe cohort. The existing batch framing and service can
carry mixed original requests, but the client owns one exact outstanding request and its grouped
verifier requires one publisher and contiguous positions. Extend that ownership/commit contract
separately if short rechecks do not pass the gate or provide useful benefit; do not bypass it.

Validation before adoption:

1. Add before/after regressions for eligibility, exact expiry, independent deadlines, hints/reset
   during an in-flight empty reply, changed cursor/head/roster/baseline, invalid/unknown outcomes,
   memory bounds, rollback, pending-self, original useful-turn fairness and all-idle completion.
2. Exercise the actual owner/callback wiring with a newly active quiet peer during retained backlog,
   both ordinary and withheld notifications. Include early/mid/late arrivals and contention; these
   two baseline samples at hot cursor33 are not a worst-case bound or peer p95 gate.
3. Rebuild both complete R/C clients and rerun the fixed original heavy/editing and non-overlap
   comparison. Retain16ms local,2.5s COMPLETE-peer p95,30s delivery,600s replay,120s continuation,
   full exports, native proofs and same-profile cold retention. Add the same-account late-writer
   latency case under real receiving/editing contention, rather than rely only on Q's separate-account
   typing series. Reject a faster bulk result that misses any latency/data gate; no outcome-driven
   extra repetitions or new quotas to rescue it.

Missing-endpoint fallback means a404 from the optional `/account/delivery/read-v2-batch` route causes
one current open workspace receiver to use individual `/read-v2` calls for all its publishers. It
keeps syncing and verifying normally. Other receivers have their own flags. Closing/reopening the
workspace creates a new receiver and probes batch support again. A successful response exceeding
aggregation space now affects only its captured publisher; that is the separate103 repair.
