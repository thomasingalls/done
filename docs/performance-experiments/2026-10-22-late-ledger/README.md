# Late live-ledger capture — phase20

**Status: HELD: scoped capture repair passes; original heavy performance acceptance remains unmet.** Base cumulative19 tree `9d4485a5c7a071618289a544364aea339645f34e`. No publication or general qualification.

## Contract and change

Ordinary inbound v2 reads first take a row-free native authority snapshot, verify its complete retained authority, independently authenticate the signed reader request and take their existing cold-lane turn. Only then do they capture the selected publisher ledger. A strict deep comparison retains every non-live native authority input, including future fields, between those snapshots. Only decision rows and the two ordinary live witnesses are outside that comparison; the fresh census and served-page verification check them. Historical boundary witnesses and all membership/removal/recovery/rotation inputs remain in the comparison.

The core authority-cache context still omits only rows; it retains every native header/witness/publisher input, verifier identity, private proof brands, copies, limits and lifecycle fences. Ordinary snapshot equality is unchanged. Fresh full ledger/witness, predecessor/served rows, final exact snapshot, owner/commit/data-version/quarantine, custody and current session/grant/completion checks, and expiry across signing/COMMIT remain unchanged. No schema, wire, client, v1, request limits16/64, attempt cap4 or deadlines change. One runtime file changes: account-service/delivery.ts.

## Discriminating evidence

The held base19 fails the genuine-write regression: four same-connection commits during request-signature verification exhaust the old read snapshots and return state-changed. The candidate accepts the fresh signed original in one attempt. Separate cases verify both original-publisher and reader-own streams with real continuation authority. Real committed writing after the fresh capture still exhausts four final guards, exposes no page, and continues with independently verified exact data after the race stops.

Fifteen appended regressions pass (12 native,3 continuation); every old test byte is retained. They cover no early prefix capture; account/passkey/recovery/promotion/future-column changes; exact harmless retained-authority byte changes; fresh-row corruption; real late commits; closed verifier ownership; current grant authorization; and completed signed removal rotation. Five implementation omissions are detected independently: restore early capture, omit authority comparison, omit final guard, omit final grant, and omit a future header field. Whole-AST review restores the original complete delivery module after exactly removing the reviewed import/helper/reordered capture and new comparison. The helper is independently checked against every non-live/future field, including Maps. Types/lint pass.

## Matched heavy-load outcome

Fixed R,C,C,R. Reference=held19 runtime, candidate=late capture only. Same110 uninstrumented c117 client assets/coordinated-2000, genuine H6/M2/Q2 accounts and1024/256/32 seeded histories, four Chromium processes/ten contexts,1CPU/1GiB/zero swap,120 trusted focused keys500ms apart. Complete peer p95 target stays2500ms and local p95 stays16ms; original30s delivery,600s history and120s continuation bounds stay intact.

| Run | Local p95 ms | Complete peer p95 ms | Quiet read409 | Quiet429 | H replay600s | Slowest H s |
|---|---:|---:|---:|---:|---|---:|
|1-R|6.7|26277.2|1|0|pass|310.8|
|2-C|7.2|12403.3|0|0|pass|322.4|
|3-C|6.2|7108.2|0|0|pass|295.6|
|4-R|5.6|17304.3|1|0|pass|265.2|

Each run retains its original gates in analysis.json. Timing observations within a journey are dependent; four whole journeys support a descriptive comparison for this workload, not a population significance estimate or a general supported-tenant count. Read error JSON is observed in the same small external HTTP wrapper in all four arms, with exact request SHA256; successful binary pages are not decoded there. Native and client implementations are uninstrumented. The common error observer was declared before freezing, so compare these fresh arms rather than substituting old phase18 timings.

All persistence guards and the independent native proof audit must pass separately from performance acceptance. Guaranteed offline pending writing is saved for5s, remains absent from its offline peer, then survives lock/full writer-process close and the same real persistent profile reopening offline without reinjection. Whole Markdown archives match, and every prior encrypted heads/outbound key+value remains byte-identical (additional records are permitted). Original and pending writing automatically converge after load clears/reconnect, with reverse writing, Undo/Redo, account isolation and peer cold offline reopening. This establishes the exercised graceful-close boundary, not arbitrary power-loss durability. The native OpenSSL checker independently verifies exact envelope/wrapper/head/prefix evidence, every seed row, H/M immutability and only new Q writing.

## Failures, fixtures and limits

Affected native/session/history comparison: reference387 cases/370 pass/17 fail; candidate402 cases/385 pass/17 fail, exactly15 added cases and no new failures. Full failure names are retained in affected-comparison.json. An existing cold-wait cache-clear failure reproduces both on reference and candidate and singly on reference. The prior16 full-suite failures remain unresolved; do not describe these checks as a clean full suite.

The first reference copy lacked Git lookup for an old maximum-wire-size fixture. Its failed log remains; the final reference/candidate affected comparison supplies only read-only access to the existing common Git objects for the exact pinned4bb09042 historical source. Old tests were not changed to make it pass. The metadata reviewer initially expected only the direct native row to change; its independent follow-up also checks that both wrapper consumers add exactly the same12 case IDs, keep all old cases and retain every other field. The initial focused native comparison assertion failed on that fixture while the shell proceeded to the separately gated benchmark; all measured source/client/limits stayed frozen, all four journeys are retained, and the final full comparison resolves the machinery difference. These are focused development checks; general qualification remains paused.

A first broader run also hit sandbox-denied local HTTP listeners. Its reference/partial candidate logs remain; only that owned comparison process tree was stopped, then the same frozen suites were rerun with explicit loopback permission. No measured journey was replaced or old test edited. New fixture mistakes are preserved: a post-capture interleaving recursively triggered its own append (only owned worker6936 was terminated; an appending fence fixes that new fixture); a removal test initially prepared removal without completing rotation and incorrectly expected revocation (the corrected new case completes the genuine signed rotation); the first AST reviewer selected the decode try instead of the serving loop (corrected explicit selection). An idle metadata waiter was restarted before any command to fix a shadowed source-count variable. None changes a measured application journey or an old assertion.

Planning metadata retains all400 source identities except the reviewed delivery hash/coordinates, all197 domain labels/kinds/paths and97 construction status/contract bytes. All882 obligations and338 unresolved blocks remain; the existing native stage retains its original9 cases/deadline/process policy and enumerates12 added cases; its parent campaign and nested consumer enumerate exactly the same12 additions, retaining all their old cases. The continuation file stays blocked for separate adapter review. Focused functional passes do not provide aggregate release credit.

Physical Firefox/Android/WAN, indefinite overload/churn, an arbitrary history-size bound, hard crashes and production capacity remain outside this case. Native write-side authority verification/publication and receiver prelude costs are separate possible next targets; this repair does not change them. No rates, retry clocks or security promises were relaxed.

## Reproduction and state

Use protocol.md, measurement-identity.json, run-plan/receipts, analysis/read-refusals/native audits, source/mutation/evidence/metadata reviews and reproduction scripts. All original failures remain. Start from cumulative19, use a fresh private reproduction root and the documented synthetic fixture/hash; never point the importer at personal profiles. The container image is a dependency carrier; actual server source is mounted read-only and identified independently. The public packet excludes native DBs, profiles, codes, keys, tokens and generated UI error snapshots; exact known-value scanning after decompression is limited coverage, not universal DLP.

Canonical20 is prepared after19 and already applied, unstaged/uncommitted, in the current cumulative checkout. Do not reapply there. Apply sequential patches only in a separate clean checkout, sign when available, and keep publication separate. No real staging/signature/commit/push, preview8443, merge/deploy or general qualification.
