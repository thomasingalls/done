# Bounded same-shape audit

Search src/crdt, src/account and account-service for previous/productive selection, owner-level
availability/unsupported state, invalidation and last-lane scheduling. This is a targeted source audit,
not a claim of exhaustive whole-program equivalence or a security audit.

- receiveSelection: proved publisher-order-dependent fresh own-check reuse; repaired100, real wiring
  and frozen whole-client comparison101/102. Its remaining previous-publisher streak/capacity is
  intentionally sequential: four useful pages per turn, preserving every non-self fairness turn.
- receivePageTransport + accountReceive: one owner-wide unavailable flag combines absent route and
  successful aggregate overflow. The latter is payload-specific. Existing policy deliberately safe,
  yet needlessly broad. Follow up with two-publisher falsifier and separately bounded repair.
- accountSyncDriver: independent lane deadlines/failures/positions; shared last only breaks due-lane
  ties fairly. No verified fact from one lane is invalidated by another lane's quiet result.
- finalApplyGate: available is a single-use, authority-bound commit capability, consumed/expired on
  use. Do not turn it into a reusable scheduling cache.
- accountAuthority: owner-scoped retained authority/control inventory; any relevant control-row change
  invalidates the proof by contract. Excluding rows without a separate dependency proof weakens it.
- publisherTips: local publication invalidates the affected publisher key; unknown external SQLite
  data_version changes invalidate all owned captures because their affected scope is not established.
  That is a necessary external-authority freshness boundary, not a quiet-peer scheduling hint.
- notifications + receive driver: per-account liveness/idle cadence and per-operation backoff; hints
  do not advance proof and cannot override a refusal's retry floor. Retry-floor optimization remains
  a distinct flow-control/liveness question, with no policy change here.

Previously measured bulk custody cursor replacement failed adoption; retain that evidence. No new
stack sample or this audit enables it. No release preparation or production/preview change.
