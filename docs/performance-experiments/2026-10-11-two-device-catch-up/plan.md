# Catch-up measurement plan (fixed before the main campaign; written after one 20-position smoke run)

Source 7b6d8d9f (git archive), service probe patch only on the service; client builds: base (unmodified client),
varA (diagnostic A: no 50 ms inter-pass delay after receive progress), varB (diagnostic B: keep reading the
publisher whose last page advanced instead of rotating to an empty stream). Private ports 53781/53782.

1. Main (base): one account, two devices. Backlog targets 100, 400, 1,200 positions built by A at a requested
   150 ms key gap while B is offline; cumulative ledger about 100 / 500 / 1,700. Per-phase build cap 840 s, catch-up cap 900 s.
   Phase 2: 30 s CPU profile on B starting 4 s after B comes online, then 60 keys typed on B's own card at 150 ms.
2. Diagnostics: three fresh accounts, one backlog target of 150 positions each, order control (base), A, B. One run each.
No reruns for better numbers; smoke run 01 is not a result.

## Amendment after the main campaign (written before any diagnostic run)
The main run showed service handling time jumping about fivefold once the publisher's ledger passed about 500 positions,
so the second causal probe targets the service's verification cache bound instead of a client change.
Phase 3 of main stopped at its 840 s build cap with 170 positions (not 1,200): the writing device had slowed to about 5 s per position.
Diagnostics, one run each, fresh account, in this order:
- D0 control: base client, base service, backlog target 120 positions, 150 ms key gap.
- DA: diagnostic A client (no 50 ms inter-pass delay after receive progress), base service, same backlog.
- DC: base client, service copy with the verification cache bound lifted (1,000,000 entries, 1 GiB), backlog target 580 positions
  at a 450 ms key gap (about one key per position, to reach the ledger length quickly), build cap 660 s, catch-up cap 420 s.
- DP: base client, service copy with the cache bound lowered to 64 entries and a service CPU profile, backlog target 100, 150 ms gap.
- DB (only if inside the time cap): diagnostic B client (keep reading the publisher that just advanced), base service, backlog 120.
- DF (added before DA finished, to learn whether the receiving device is CPU-bound or waiting at a small ledger): base client,
  base service, backlog 120 at 150 ms, 25 s CPU profile on B starting 4 s after it comes online.
- Then DB as listed, if inside the time cap.
