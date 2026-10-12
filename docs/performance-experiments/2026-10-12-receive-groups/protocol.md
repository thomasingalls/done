# Existing-receipt grouping: prospective protocol

Parent: signed `534252e1`. Release validation remains paused. No receipt-format, service API,
parallel-prefetch, retry-policy or publication change is authorized by this experiment.

## Decision and design

Compare bounded grouped receipt processing with the retained ordinary first-repair build on the
same restored synthetic pair (120 cards, 12 KB Goals, 600 pending positions). The unit of comparison
is a complete restored journey; individual positions are dependent, not independent replicates.
This is a local engineering benchmark, not an estimate for phones or the production cluster.

Prediction before implementation: four-entry groups should reduce storage/authority work per
useful position substantially, with a 25–50% shorter local catch-up than 254.318 seconds. Signature
checks and HTTP reads remain per entry, so a fourfold overall gain is not expected. Added 75 ms
per request should erode the gain relative to the earlier 302.023-second delayed run.

## Bounds and guardrails

At most four owner-signed, limit-one requests from one certified publisher; prepare future cursors
only through previously authenticated observed progress. Fetch sequentially outside admission;
stop collection after 250 ms, an unavailable/empty tail, or bounded bytes. No parallel requests.
Verify exact request binding and signatures in prefix order, extend the completeness witness once
per original receipt, then atomically append each original content/evidence pair. Preserve native
4 MiB/256-record bounds by committing a valid fitting prefix and refetching an overflow tail.
Recheck fresh authority/prefix and every retained request's expiry before commit, and perform a
fresh authenticated readback before one ordered editor publication. Input and due sending get
turns between groups. Self reconciliation stays single-entry and does not copy local plaintext.

Focused controls: atomic abort/retry and post-commit crash, late invalid/reordered/superseded reply,
expiry and authority change during sealing, size cutting, exact v1 receipts with pre-repair cold
read, and simultaneous local edits. No generalized fault or release campaign.

## Measurements and decision rule

Reuse the attribution harness unchanged. Run serially, no concurrent build/test workload, fresh
output directories, unchanged private fixture. Baseline is the retained first-repair final bundle;
run a fresh local baseline and a candidate local and +75 ms journey. Retain complete failed runs.
Compare whole catch-up elapsed time, own/peer reads, live sender progress, 12 subsequent burst
latencies, long tasks, cold reopening, heap endpoint and complete export equality.

Keep the candidate only if focused controls and exports pass, local catch-up improves at least
15%, and there is no unexplained loss of sender progress or new multi-second foreground task.
If baseline drifts >15% from 254.318 seconds, or improvement is ambiguous (<15%), repeat one matched
local pair before choosing. Short serial samples do not establish population confidence intervals.
Inspect grouped commit/load counts in a focused instrumented native test; use a diagnostic full
journey only if the ordinary gain or a guardrail needs attribution. Existing counter timers overlap.
Cold opening remains a full verification and is a guardrail, not the intended optimization.

Editorial clarification after measurement: “publication change” in the opening scope means public
deployment. One editor publication per group was already specified under Bounds and guardrails.
