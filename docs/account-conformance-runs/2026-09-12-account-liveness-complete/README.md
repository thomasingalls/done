# Combined sync-liveness repair evidence

Parent: unsigned `902d352`; all 890 source pins match at campaign completion. All 12 stages pass:
types, instrumentation, generated coverage/memo/spool/scheduler tests, held HTTP and automatic expiry,
21 ownership/mutation tests, bounded service cache, 31 service delivery tests, 19 service inbound tests,
full/incremental native view comparison, growing history, scoped lint and format. Service coverage
includes 80 generated decision histories, 60 generated inbound histories, corruption, process death,
competing processes and authority loss. The full unit suite separately passed 999 tests in 91 files
(36.65 seconds). No full repository `pnpm check` run is claimed.

The native 24-job workload took 60,606 ms (initial measurement 256,010 ms). Terminal three-call status
median was 87.9 ms (initial 1,388 ms). These are descriptive one-host runs, not a speedup estimate for a
user population or a release-capacity threshold. All histories preserve writing across cold reopen.
Held genuine read/submission responses allowed local flush in 18.2/17.2 ms before response release;
late expiry was refused at the transaction's final write guard and recovered by automatic fresh retry.

The three editing bursts recorded 8/16/8 local admissions (the large paste spans several admissions),
and exactly 8/16/8 local send wakes. Remote promotions add no local send wake. Deterministic scheduler
checks show durable send progress expedites an idle read while preserving retry backoff and evidence
halts. The 35-position idle service census takes 1.52 ms with 13 signature verifications in the whole
request, versus the preceding phase's 25.84 ms census and 118 verifications. Current authority, fresh
SQL snapshots, all row fields, semantic history, completeness witness, and commit/signing guards
remain checked. A separate four-position service control matches warm and cold results, counts
13 versus 25 verifications, and refuses changed SQL fields/membership/response bytes after warming.

Service reuse is core-owned, with at most 512 entries and 16 MiB of accounted retained data; this is
not a measured JS heap bound. Eviction and oversized entries fall back to full crypto. Client memo
entries are pruned to the current census; the retained ledger itself is not pruned. Enumeration,
parsing, semantic replay, exact comparisons and cold verification still grow with history. Long-history
capacity, proof pruning, projection/fork cost, and platform qualification remain separate work.

`interrupted-counter-lint/` preserves the earlier partial run: it was intentionally stopped when a
test-only global counter referenced a same-named lexical const and failed lint. Its cancelled native
stage is not passing evidence. The corrected run above starts from fresh source pins.

No personal browser/profile/recovery, server, packaged app, Account, factor, pin or origin changed.
All 21 personal package files, 31 prior vectors, historical review packets and L-2 remain unchanged.
