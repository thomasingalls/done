# Compaction yielding to foreground input

2026-10-11. Bounded repair and focused checks complete on the working tree identified in
[`identity/builds.json`](./identity/builds.json). Nothing in this packet authorizes publication or
resumes release qualification. Baseline runtime is the deployed `203a0655`; the branch base is
main's merge `e948c52a`. See [the prospective protocol and additions](./protocol.md).

## Change and safety boundary

Previously, input arriving during automatic compaction waited for the complete operation.
Admission now requests interruption when local/remote input or a durability barrier arrives.
It still waits for the active owned operation to settle before admitting that work. A fresh
maintenance attempt runs after durable idle; no prior deletion proof is reused.

The maintenance task checks before effects and async operations and yields periodically before
starting async work. It retains the writer's lifetime and native settlement ownership. An in-flight
crypto result reaches its cleanup scope; a guarded transaction callback can abort; a transaction
that already committed stays committed. Only the explicit interruption error restores the idle
retry threshold. Integrity/generation failures retain their prior refusal behavior.

The final deletion census uses paired bulk key/value reads in the same all-store transaction.
Every stored key, record byte and counter field is still compared, followed by the journal check.
Deletion remains restricted to the initially covered content records. Reservation counters never
rewind, and a cancelled attempt can leave a burned reservation or safe duplicate snapshot.

This is cooperative interruption, **not** concurrent admission or a split preparation/commit
architecture. It makes the existing serialized operation give way at safe boundaries. The flush
policy, storage format, Yjs completeness rule, keys, authority checks and exact coverage are unchanged.

## Results

Serial matched observations on this Mac, baseline/candidate then candidate/baseline:

| Observation | Baseline, pair 1 / pair 2 | Candidate, pair 1 / pair 2 |
| --- | --- | --- |
| Packaged Account collision, key event to visible text | 188.5 / 180.5 ms | 30.7 / 24.8 ms |
| Native mechanism collision, submit to admission | 100.6 / 89.4 ms | 5.8 / 3.9 ms |
| Native mechanism quiet compaction | 138.3 / 119.8 ms | 94.1 / 81.2 ms |

The Account collision improves by **83.7% / 86.3%**, exceeding the prospective 50% target in
both pairs. This is four deliberately scheduled collision observations, not a population p95 or
a phone/display-latency guarantee. The ordinary preceding keys remain around 20–28 ms in these runs.

The application uses the retained synthetic receiver from the previous packet: 120 cards, 12 KB
Goals and 600 received positions. Three separately flushed keys take its 125 content records
through the maintenance threshold. The fourth key arrives about 29–34 ms after the maintenance
timer starts. In both candidate runs a second idle attempt follows interruption. The added second-pair
physical census finds one content state, all 662 heads, and 147 outbound rows; baseline retains the
state plus the late update, with the same head/outbound counts. All four runs recover the edited
card on a cold offline reopen. The generic mechanism fixture separately checks the entire synthetic
text and retention of all 1,200 non-content rows on reopening. It has no Account ledger validator.

No browser long task was recorded in these timed observations. This is evidence for the collision
repair, not a reproduction or claimed elimination of the previous roughly one-second stalls.
Synchronous Yjs work, whole-history comparison/copying, the current native transaction and journal
flush can still delay typing. Continuous activity can defer discretionary compaction until idle.

The separate quiet Account diagnostic captures three keys, their flushes and actual compaction.
It samples 456.7 ms active CPU across that interval; `sameBytes` accounts for 95.1 ms self time,
verified-record verification for 37.6 ms, and GC for 26.3 ms. Those are **whole-interval** figures,
not exclusive compaction costs. They support further investigation of retained-history comparison
and allocation, but do not justify weakening the final byte census. Raw CPU profile, aggregate and
the referenced baseline source maps are retained under `profiles/`.

## Focused verification

- **51 unit tests pass** across admission, exact-coverage compaction and maintenance task ownership.
  Includes the existing generated idle/flush histories, interruption by local/remote/barrier work,
  settlement before admission, subsequent idle completion, and preserving an already known integrity
  failure. Carrier cases interrupt before work, after reservation/sealing, after committed publication,
  and during the deleting transaction's census; retries preserve writing and nonce accounting.
- **Eight native Chromium cases pass**, explicitly selected with no mutants: union preservation,
  late reserved commits, concurrent compactors, changed bytes at deletion, newly damaged records,
  deletion abort, close/drain, and the final journal recheck. The existing runner labels its adapter
  `content-trim:full`; the retained report lists only the eight selected cases. No release inventory,
  mutation campaign or general release-validation run was performed.
- Both native mechanism pairs and both packaged Account pairs pass, including cold recovery.
- Typecheck, changed-source lint, Yjs patch/runtime checks, production build, origin isolation and
  initial-JS budget pass. Initial JavaScript remains 136.7 kB gzipped against 350 kB.

## The preceding sync incident

Both real devices on `203a0655` showed `send:`/`receive:network-unavailable`; lane retry and reopening
did not help. Their only visible request was session `begin`, returning HTTP 200 / `challenge`.
The Account menu offered **Reconnect sync**. The user performed the account-passkey check on both
devices and confirmed bidirectional sync resumed. No browser storage was cleared.

That establishes a network-login blocker, not its original cause or an expired-session diagnosis.
The `begin` request is optional prewarming and does not establish a remembered login. Transport
currently collapses an unavailable authorization capability into a generic unknown/network result.
**Open follow-up:** surface sign-in-required distinctly and direct the sync warning to Connect/
Reconnect sync; ordinary lane retry cannot obtain a passkey assertion. This phase records that UI
defect but does not change login policy or transport error classification.

The incident's 15 existing login client tests pass. A disposable packaged `sessions.spec.ts` baseline
failed earlier, while opening the second editor, before testing reconnect. That fixture uses the
older configuration without membership continuation; the refusal's exact cause was not diagnosed
here. Its failure is retained and is not evidence for or against the real-device reconnect result.

## Retention, reproduction and next work

`samples/` retains every timed outcome and the separate diagnostic. `checks/` holds the focused
logs/native report. `identity/` pins the baseline, candidate runtime bytes and tested bundle and
retains the runtime patch, including the new file. `manifest.json` hashes the packet. Disposable
credentials, browser snapshots and service databases remain outside Git. The first mechanism pair's
receipt records were reduced to status and removal count before retention, matching the updated
probe; no store identities or text are retained in those samples.

The original synthetic Account fixture remains external at
`/tmp/done-client-receive/candidate-1/deep-received-fixture.json`. Reproduction of that application
comparison needs that fixture; the native mechanism fixture rebuilds itself from public source.
The protocol records commands, ports, order and instrument changes. The raw CPU profile includes
ordinary code paths and source URLs, not a heap snapshot. Its aggregation uses the existing
`2026-10-10-account-consumers/probe/lib.mjs` source-map helper, excluding per-key normalization.

This slice is ready for review/commit. Publication is a separate step. Remaining foreground work
is to measure flush collisions and synchronous comparison/merge costs; moving preparation off
the queue or into a worker should follow evidence of the remaining stall. Local Account history
retention and deep-received cold-open costs remain separate work. Release qualification stays paused.
