# Account decisions wrapper integration — 2026-09-15

Signed base: `d107f244`. Bounded wrapper integration, not immutable release qualification.

The exact property/native wrapper passes **18 cases** (12 Vitest, 6 native), preserving original
arguments, maxWorkers=2 and 30/120-second child bounds. Decisions takes 75.266s
under its 150-second aggregate bound. Four planning suites pass 86 cases; spool regression passes 30
in 230.171s. **134 real cases in six executions**, followed by exact decisions
receipt reuse. Every group drains. Nine reports survive checkout removal in a ten-entry inventory.
Decisions invokes no historical reader; the spool regression pins and retains `7210b7d`.

Five proof controls now pair normal and mutated verification on the same bad bytes. Signature/epoch
controls move unknown to usable refusal evidence; the link control moves unknown to acceptance;
submission controls move actual signature/subject rejection to acceptance. Retain actual response,
expected authority/subject, decoded submissions, bytes and baseline reasons. Check intended proof
changes, byte/field agreement and the wrong predecessor hash. This is structural and observational
corroboration; native/codec assertions remain signature-verification authority.

Eight generated histories retain every classified response and storage digest, original/after sources
and counters, and cold-reopened wire/sources. Require expected outcomes, unchanged inspection state and
retention of original sources and exact wire. These reports do not independently replay storage or
regenerate schedules. Five new infrastructure cases include two 160-run corruption campaigns. Eight
synthetic process runs and two deliberately omitted checks distinguish incomplete successful-looking
reports. Synthetic case claims are not additional Account executions. Planning and owned qualification
pass without a new failure; prior failures remain in their archives.

The schema 3 archive retains **241 payloads in 642,695 bytes**, below its
1,000,000-byte budget. Content-addressed 16 KiB chunks preserve original file bytes through UTF-8/base64
encoding and gzip. It retains contracts, source snapshots, receipts, case/report/log bytes, regression
reader and fault programs. Huge owned input inventories remain external hash references.

```sh
python3 docs/account-conformance-runs/2026-09-15-wrapper-account-decisions/verify.py
python3 docs/account-conformance-runs/2026-09-15-wrapper-account-decisions/verify.py --current --raw
```

Verification checks retained bytes, contracts, nonces, case domains, trace order, inventories and selected
semantics/control results. Optional flags require current/external files. It does not rerun campaigns or
independently verify signatures/storage.

**132 obligations remain: 0 test-file /82 command /50 campaign**, out of 628. Runtime/dependencies,
crypto census/vectors, F-17 debt, earlier archives and L-2 are unchanged. Next: Account delivery wrapper,
remaining qualification repairs, immutable aggregate and private human rehearsal. No personal browser,
server, relay, device or deployment operation occurred.
