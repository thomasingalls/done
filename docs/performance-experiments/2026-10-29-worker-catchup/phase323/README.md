# Phase 323 — idle-check coalescing and bounded read-ahead

**Lab evidence only. No landing, hardening, acceptance credit, release preparation or deployment.** Every attempted journey, failure, raw result and 5-second external host log remains. Gates and deadlines are unchanged.

## Cold-stop control

The first action was the requested single profiled 0 ms control with the Page profiler session retained until after cold. With the same frozen phase-322 app assets it drained in 16.869 s and passed Undo and exact cold opening. This supports the operator-supplied CDP/WebAuthn-session explanation for 322; it does not erase that failure or independently establish the Chromium implementation as its unique cause. The initial control used the old fixture link before the UTC-Nov 1 refresh; its input map freezes source/assets/apparatus but did not capture a separate immutable fixture hash. No performance gain is inferred from its faster time.

The later Worker profile also passed cold with the Browser CDP control retained; the old Worker target ended naturally at original owner close. Both raw profiles and lifetime fields are retained. Direct Page handoff A and the 75 ms block were dropped as directed.

## Confirmed scheduling and chosen treatments

Across the full observation windows of 322’s three 50 ms runs, single reads were 210/222/207 with 16.521/17.733/16.469 s summed time to headers. The data moved in 128 batches each with 12.286/11.297/11.358 s summed header time. Filtering strictly through the final commit gives 207/217/202 singles and 14.176/15.160/14.013 s; post-drain probes explain the difference. Four idle publishers keep cursor 1; the own-publisher cursor stays 2. Sums are elapsed waits, not CPU. See [idle traffic](./idle-traffic-confirmation.json).

`receiveSelection.completed` rotates publishers after a native G8 turn. When the 750 ms empty-proof budget expires, a quiet publisher becomes eligible; the single-flight receive/sweep path serializes its preparation, HTTP request, verification and original Window flight. An empty result leaves its cursor unchanged, so the cycle repeats during a long drain. The 15–20 s idle interval is a separate post-drain mechanism.

**E here means phase 323 idle-check coalescing**, not the earlier signature-parallelism factor. It fetches due-soon quiet originals in spare slots of a productive batch and consumes them at the original selector turn. This avoids separate HTTP turns; it does not parallelize the server’s sequential batch verifier. Proof age is conservatively dated at request start, never consumption. Original 750 ms eligibility, hint invalidation, first discovery, own 5 s checks, G8 selection/commit fairness and send yielding remain. The 750 ms budget is eligibility, not a new guaranteed wall-clock deadline.

**B uses the permitted one-batch option:** at most 4 signed reads of up to 8 positions, within the existing wire/session budget. It starts from the current transport and preserves the byte-exact `460fefd8` two-concurrent individual fallback. No two-concurrent-batch variant was built. Native commit turns stay G8, signed-chain order is unchanged, and local edits see committed state only. The bounded cache owns original request/page bytes, not proofs, cleartext or trust. Every admitted entry still opens and verifies with the existing expiry/authorization/ledger/witness/current-state/commit checks. Full-prefix comparison remains V0; F is absent.

## Frozen screen: every deep run

Three journeys per cell in mixed blocks, same build 2 and genuine UTC-Nov 1 fixture. 50 ms is response-delivery fault injection, not a WAN model or acceptance gate. 0 ms means no added delay. One failed replicate fails an applicable cell. Input and peer p95 are unexposed in this closed-sender deep workload.

|Run|Added delay|E/B|Drain s|Positions at 30 s|30s gate|Cold|Read units|Messages at observed drain|Charged bytes|
|---|---:|---|---:|---:|---|---|---:|---:|---:|
|eb50-r1-E0B0|50ms|00|44.779|728|diagnostic only|exact|478|7728|1909881|
|eb50-r1-E1B1|50ms|11|24.799|1025|diagnostic only|exact|287|6872|1709758|
|eb50-r1-E1B0|50ms|10|33.388|1008|diagnostic only|exact|479|7752|1915898|
|eb50-r1-E0B1|50ms|01|28.947|1025|diagnostic only|exact|276|6680|1664782|
|eb50-r2-E0B1|50ms|01|28.979|1025|diagnostic only|exact|274|6648|1657285|
|eb50-r2-E1B0|50ms|10|33.756|992|diagnostic only|exact|482|7776|1921126|
|eb50-r2-E1B1|50ms|11|25.253|1025|diagnostic only|exact|288|6892|1715414|
|eb50-r2-E0B0|50ms|00|45.685|704|diagnostic only|exact|482|7796|1926658|
|eb50-r3-E1B0|50ms|10|33.389|1000|diagnostic only|exact|476|7702|1904322|
|eb50-r3-E0B0|50ms|00|45.607|704|diagnostic only|exact|481|7776|1921126|
|eb50-r3-E0B1|50ms|01|29.903|1025|diagnostic only|exact|281|6762|1684414|
|eb50-r3-E1B1|50ms|11|25.825|1025|diagnostic only|exact|286|6901|1720652|
|eb0-r1-E0B0|0ms|00|18.682|1025|pass|exact|360|6114|1535800|
|eb0-r1-E1B1|0ms|11|20.184|1025|pass|exact|270|6728|1682178|
|eb0-r2-E1B1|0ms|11|19.921|1025|pass|exact|276|6798|1695374|
|eb0-r2-E0B0|0ms|00|18.578|1025|pass|exact|360|6100|1529938|
|eb0-r3-E0B0|0ms|00|18.663|1025|pass|exact|360|6098|1528486|
|eb0-r3-E1B1|0ms|11|20.473|1025|pass|exact|276|6786|1688536|

At 50 ms the median drains are 45.607 s plain, 33.389 s E, 28.979 s B and 25.253 s E+B. All 12 are functional/cold-exact. E+B is selected by the predeclared median/tie rule; no simpler arm was within 10% of it. At 0 ms, however, E+B’s 20.184 s median is 8.1% slower than plain 18.664 s. All six pass the unchanged 30 s predicate and cold. This is a latency tradeoff, not a universal speedup.

B raises the measured logical receive-index charge from about 8.6 MB to 14.3 MB at 1025 positions, while appended plaintext bytes fall only about 7%. These are logical charges and record payload sizes, not measured disk occupancy. No index fallback or read-budget refusal is observed in the deep screen. Exact original-page hash duplicates are zero; that counter does not prove the absence of overlapping ciphertext in differently signed/re-fetched pages. The original interior-cut/maintenance/cold probe also passes with the new actual 7/8 wire widths; its old “range-four” title is not the measured width.

The new cache stays within 4 MiB shared reservations and 32 requested logical positions; old request expiry, cancellation/context/clock-rollback checks and the 4 active/session limit remain. This is not a new multi-account fairness qualification. Wider pages require a fresh beyond-index-limit study before landing; the old P4 3072-position results are not credited to B8.

## Worker attribution

The 0 ms E+B Worker profile spans 20.089 s, with 10.013 s sampled idle. It drains in 20.023 s and passes cold. Largest mapped self-sample families include recovery.ts hex encoding/decoding 2.272 s, verifiedRecords.ts 1.358 s, inboundTransport.ts 1.320 s, startupStorage.ts 0.953 s, accountAuthority.ts 0.456 s, plus 0.467 s GC and 1.311 s native/unknown. Mapped Yjs self samples are about 19 ms. These identify record-handling costs; they do not independently prove the cause of the 0 ms regression.

CPU samples are Worker-thread self time, including the short start/stop brackets; async crypto, storage, network and Window waits can appear idle. Inclusive rows overlap. These numbers do not sum to exclusive wall-time attribution or retrospectively explain every millisecond of 313. The wall-stage partition uses fixed precedence over overlapping spans; zero exclusive handoff time does not mean its flight was removed. Roughly 2.7–3.0 s remains unattributed in the unprofiled 0 ms runs. Exact source maps and full CPU nodes are in [profile analysis](./worker323-profile-analysis.json) and [stage analysis](./stage323-analysis.json).

Page-message counts split by call/reply and method in [50ms methods](./eb50-methods.csv),[0ms methods](./eb0-methods.csv),[live methods](./live323-messages.csv) and [withdrawal methods](./removals323-messages.csv). Bytes are existing logical channel charges, not serialized V 8/transfer sizes. Drain snapshots are sequential Window/Worker observations and can include a few exchanges after the exact final commit. Window exchanges per position are not a target.

## Live-writing comparison

Three normal journeys each, baseline versus E+B, same build 2, original 120 keys at 500 ms, three markers, two receivers, archive/Undo/offline-cold guards. This is card typing, not the 80 wpm Goals-paragraph workload or a physical Android result.

|Run|Input p95 ms|Peer p95 ms|Worst marker ms|Keys after H1 drain|Post-drain p95 ms|Read units during typing|Messages through delivery window|Measured predicates|Cold|
|---|---:|---:|---:|---:|---:|---:|---:|---|---|
|live323-r1-E0B0|3.6|766.4|682.7|52|699.2|1498|27350|pass|exact|
|live323-r1-E1B1|4.2|789.3|806.3|59|681.9|1284|27775|pass|exact|
|live323-r2-E1B1|4.3|835.2|881.7|56|716.7|1287|27824|pass|exact|
|live323-r2-E0B0|3.7|763.6|740.3|48|738.7|1499|27360|pass|exact|
|live323-r3-E0B0|3.6|779.3|732.9|52|663.7|1489|27214|pass|exact|
|live323-r3-E1B1|3.4|781.5|772.4|61|653.8|1290|27911|pass|exact|

All six live journeys pass their measured 16 ms input/2500 ms peer/every-marker and functional/cold predicates. E+B uses about 14% fewer typing-window read units; peer latency is not improved in this normal test. R activations are retained, including nonzero normal runs; no claim of zero normal-traffic cost. Full quiet-read counters and budget refusals are in the analysis. Tokens are the existing budget units in the recorded server-epoch interval, not CPU work or logical positions.

## Timing withdrawals, three replicates each

All 12 use the same build 3 and genuine 2048-position winning-P1 history, with hints withheld. Only two lab source files differ from build 2 to add a default-off zero-priority-delay mode; the default full stack remains SY11. A separate build 3 default-stack control drains 20.552 s, passes 30 s and cold. Its single run is a functional check, not performance-equivalence evidence. The original unexecuted 60 s-Yoff draft is retained: it was a rollback, not removal of the 10 s wait. Actual `noRetryDelay` uses SY1N, zero extra priority `notBefore` delay while retaining the 10 s activity quiet period, readiness/new-event rules and 60 s for every other interruption. 133 focused tests and strict TypeScript pass.

Roff removes adaptive repair only; base idle reconciliation stays. quietOff defers already-proven quiet peers only during a known backlog, retaining first discovery, hints, own checks and productive G8. Original writer wait, per-owner absolute 120 s diagnostic observation and all cold steps remain. The grown>=60 overlap predicate is unchanged. A completed child process is not automatically a passing latency/overlap cell.

|Run|Drain s|Input p95 ms|Peer p95 ms|Worst marker ms|Overlap keys|Post-drain keys/p95 ms|Read units during typing|Failed original predicates|Cold|
|---|---:|---:|---:|---:|---:|---|---:|---|---|
|removals323-r1-full|69.195|7.2|1572.5|1565.6|110|10/1885.4|796|none|pass|
|removals323-r1-Roff|69.141|6.7|16798.8|15150.0|110|10/19301.5|787|peer2500ms, everyMarker2500ms|pass|
|removals323-r1-quietOff|40.128|6.5|22726.9|25517.8|52|68/2002.2|522|peer2500ms, everyMarker2500ms, overlap60|pass|
|removals323-r1-noRetryDelay|70.144|7.6|1518.2|1437.7|112|8/2014.4|815|none|pass|
|removals323-r2-quietOff|40.106|8.1|22911.6|25717.1|52|68/1949.2|522|peer2500ms, everyMarker2500ms, overlap60|pass|
|removals323-r2-full|68.634|6.2|1612.5|1542.1|109|11/2070.5|801|none|pass|
|removals323-r2-noRetryDelay|69.681|5.7|1526.2|1088.3|111|9/1910.9|812|none|pass|
|removals323-r2-Roff|69.795|11.5|13639.1|12528.3|111|9/16141.3|785|peer2500ms, everyMarker2500ms|pass|
|removals323-r3-Roff|68.147|7.4|14961.5|12377.8|108|12/17465.5|769|peer2500ms, everyMarker2500ms|pass|
|removals323-r3-noRetryDelay|68.652|6.9|1662.7|1677.3|109|11/2068.5|805|none|pass|
|removals323-r3-full|69.140|7.1|1603.3|1921.6|110|10/2112.3|801|none|pass|
|removals323-r3-quietOff|40.087|6.0|22702.2|25478.2|52|68/1950.5|522|peer2500ms, everyMarker2500ms, overlap60|pass|

|Run / owner|Completion after last key s|Endpoint at 120 s|Attempts / interrupted|Peak map MB /33.554432|Peak durable payload MB /33.554432|Capacity refusals|Cold|
|---|---:|---|---:|---:|---:|---:|---|
|removals323-r1-full / reader|115.720|completed-within120s|11/5|31.3|27.6|0|exact|
|removals323-r1-full / writer|95.399|completed-within120s|11/5|30.7|25.8|0|exact|
|removals323-r1-Roff / reader|—|cutoff|13/5|29.7|29.9|0|exact|
|removals323-r1-Roff / writer|75.329|completed-within120s|10/3|30.7|25.4|0|exact|
|removals323-r1-quietOff / reader|97.987|completed-within120s|10/4|31.5|27.5|0|exact|
|removals323-r1-quietOff / writer|102.027|completed-within120s|11/5|30.7|24.9|0|exact|
|removals323-r1-noRetryDelay / reader|75.273|completed-within120s|22/16|30.9|27.3|0|exact|
|removals323-r1-noRetryDelay / writer|52.279|completed-within120s|9/3|30.7|24.5|0|exact|
|removals323-r2-quietOff / reader|99.469|completed-within120s|10/4|31.4|27.7|0|exact|
|removals323-r2-quietOff / writer|80.140|completed-within120s|10/4|30.7|25.7|0|exact|
|removals323-r2-full / reader|—|cutoff|12/7|27.0|27.0|0|exact|
|removals323-r2-full / writer|99.907|completed-within120s|12/6|30.7|25.1|0|exact|
|removals323-r2-noRetryDelay / reader|76.455|completed-within120s|22/16|31.0|28.0|0|exact|
|removals323-r2-noRetryDelay / writer|52.826|completed-within120s|9/3|30.7|25.1|0|exact|
|removals323-r2-Roff / reader|102.440|completed-within120s|12/4|31.2|30.2|0|exact|
|removals323-r2-Roff / writer|117.494|completed-within120s|14/7|30.7|26.5|0|exact|
|removals323-r3-Roff / reader|118.559|completed-within120s|13/5|31.3|25.5|0|exact|
|removals323-r3-Roff / writer|95.905|completed-within120s|11/4|30.7|27.1|0|exact|
|removals323-r3-noRetryDelay / reader|76.277|completed-within120s|22/16|31.1|28.1|0|exact|
|removals323-r3-noRetryDelay / writer|47.753|completed-within120s|7/1|30.7|25.5|0|exact|
|removals323-r3-full / reader|90.587|completed-within120s|9/3|31.1|27.4|0|exact|
|removals323-r3-full / writer|96.014|completed-within120s|11/5|30.7|25.3|0|exact|
|removals323-r3-quietOff / reader|96.472|completed-within120s|10/4|31.5|27.4|0|exact|
|removals323-r3-quietOff / writer|59.065|completed-within120s|8/2|30.7|24.6|0|exact|

Per-owner job names, interruption conditions, scheduled retry clocks, actual/censored waits, map families, saved-delta counts and journal peaks remain in [owner analysis](./removals323-owners-analysis.json),[owner table](./removals323-owners.csv),[retry clocks](./removals323-retries.csv) and [interruptions](./removals323-interruptions.csv). Journal peaks are observed import/disposal snapshots; an active journal can be a lower bound. Durable bytes are saved delta payload, not encrypted disk use. Native completion timestamps and one-second observer timestamps have distinct meanings. Reader completion by 120 s remains a diagnostic; it is not silently added to or substituted for the original writer wait.

The full stack and noRetryDelay each pass every original measured predicate in 3/3 grown runs. Roff fails peer/every-marker in 3/3; its post-drain p95 is 16.14–19.30 s across 9–12 exposed keys. quietOff fails peer/every-marker and grown overlap in 3/3: its 40.09–40.13 s drain is faster than full 68.63–69.19 s, but early writing waits 22.70–22.91 s p95. Its later post-drain keys recover to about 1.95–2.00 s with R. Thus quiet rounds still discover a live writer during another publisher’s backlog, and R still repairs withheld hints after the drain.

noRetryDelay keeps peer p95 at 1.52–1.66 s and both owners complete within 120 s in 3/3. Reader completion is 75.27–76.45 s after the last key; full-stack reader completion is 90.59/115.72 s with one censored at 120 s. Writer completion is 47.75–52.83 s versus 95.40–99.91 s full. noRetryDelay readers make 22 attempts/16 interruptions each, versus 9–12 attempts/3–7 interruptions full. Attempt count alone is not evidence of higher CPU: aggregate replay elapsed spans are about 20.8–23.2 s for noRetryDelay versus 22.0–28.7 s full, and spans include awaits; unfinished spans at a cutoff are excluded lower bounds, not measured zero. No separate noRetryDelay CPU or phone-battery profile was taken.

All 24 owner observations have zero new starts during typing or reader drain. No capacity refusal or native maintenance trace overflow is observed. Peak preparation map is 31.472 MB and peak durable payload is 30.212 MB against 33.554432 MB; the latter occurs in Roff, not a different cap. These results do not close the larger-history capacity issue. All 18 live/grown typing-to-delivery budget windows show zero budget refusals; full observed account responses are 200 plus pending long-lived requests.

## Limits and landing work, separately

All runs remain lab-only and earn no credit. All failed predicates stay in the tables. The 5 s external host logs preserve Firefox/WindowServer/system activity, so these are matched same-host comparisons, not isolated-host estimates or broad significance claims from three replicates. No build/heavy analysis ran during the timed blocks. No physical-phone or multi-account-fairness claim is made.

The first fresh seed failed at the real UTC date boundary after H’s history generation; the failed date assertion, logs and attempt remain. A separate after-midnight seed passed. No fake clock/date-assertion edit was used. The actual H saved master has 5000 characters, despite a 13000 Goals request in the recipe; M has 4157. Treat the recipe fields as requested settings, not actual document-size evidence. Cause is not established here. See [fixture verification](./fixture323-verification.json).

- **E:** harden original-request ownership, quiet-age/hint/cancellation/clock fences and continuous multi-publisher/multi-account fairness. Coalesced HTTP turns are not fewer logical verification obligations.
- **B:** harden raw-cache/tail/wire reservations, cancellation erasure, request/response matching, expiry and interior cuts. Resolve logical index amplification and rerun past its cap, plus multi-account contention, before choosing a production width.
- **Retry removal:** show the zero-delay arm’s replay/attempt cost and preserve quiet/new-event/readiness and all non-priority fences. A faster finish does not establish acceptable phone battery/CPU behavior. No retry or guard hardening was started.
- **Existing S/Y:** PreparationCapacity still escapes as owner-error/halted, not parked. Mapping it to skipped/capacity remains a landing requirement. Reopening resets the in-memory halt and authenticates/matches/replays the retained journal under the fresh owner; it can refuse again if still over capacity. No saved journal is promoted to persisted trust.
- **P:** operator format decision, old-tab fence, rollback, v 2 conversion, handoff versions and final schema remain open. Current Page cold success is on the updated lab reader, not backward compatibility with the released reader. V remains excluded from the candidate; F never lands.

All 1552 canonical source inputs match the start map, signed HEAD remains `0ab9cbc8` and the real index is empty. Only evidence/docs are prepared. See [independent check](./independent323-check.json),[artifact index](./evidence-index.json) and [copy verification](./evidence-check.json). No commits, merge, publication, preview replacement or deployment.

Patch preparation: the first unregistered patch failed exact forward replay because Git removed one extra blank line at this report EOF. The failed artifact is retained; only the new report ending is normalized. See [preparation record](./freeze-preparation.md). No runtime or measured result changed.
