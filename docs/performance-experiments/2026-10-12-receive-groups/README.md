# Grouping existing receive receipts

Working-tree repair on signed `534252e1`. No deployment or stored/wire-format change.
Release validation remains paused. The [prospective protocol](./protocol.md) fixes the comparison
and guardrails before measurements; runtime and bundle hashes are in `identity/`.

## Boundaries

The receiver prepares at most four owner-signed limit-one requests from one eligible publisher,
through a tip already observed in a verified reply. The first read and unknown-submit self
reconciliation remain single-entry. A group consumes the same four-page publisher allowance,
including earlier partial turns. Collection is sequential outside the admission/storage queues;
after 250 ms no further request starts. This is a collection stopping rule, not cancellation of
a request already in flight. No network prefetch concurrency was added.

At admission, each exact owned request and response is checked in prefix order against fresh
local authority. Each signature, acceptance proof, envelope and original update remains verified.
The group extends the existing completeness witness once per receipt and writes the original
update/heads pairs in one native transaction. Storage derives the required witness event-count
increment from the actual heads rows; the equality guard is retained. Native reservation counts
and nonce consumption still cover every record, including abandoned reservations on retry.

The group checks authority and the unchanged durable prefix before commit, checks the expiry of
all retained requests at commit, and reads back and authenticates the stored result before one
ordered editor publication. A failure after durable commit closes the owner. Input and due sending
get turns between groups; self reconciliation does not occupy the editor admission queue.

Aggregate encrypted queue bytes, plaintext commit bytes and record count remain bounded. A valid
receipt exceeding the remaining group capacity is erased and refetched after committing the
fitting prefix. Invalid evidence refuses the group rather than silently committing earlier members.
Detached, closed, superseded, expired, conflicted and changed-authority cases keep existing refusal
semantics. The internal queue framing is transient; every durable receipt is still
`done/account-inbound/v1` with its original one-entry signed page and request. No migration or
reader-first release is required for this representation.

## Focused evidence

- Four distinct original receipts write their heads in one transaction; exact original request/page
  bytes are preserved. The pre-group reader pinned at `534252e1`, forced to reference verification,
  opens and compacts those rows. The current reader then cold-opens the compacted result.
- Renderer death before and after the grouped transaction respectively recovers none or all of the
  group. A fresh retry completes the aborted case.
- Invalid late evidence, reordered replies and superseded requests retain no partial prefix.
- Expiry and changed authority during sealing refuse before the group commits.
- Both 256-record and 4 MiB boundaries cut a valid group, preserve a retryable tail and cold-open
  through the eventual complete prefix.
- Existing singleton duplicate/replay and own unknown-submit recovery remain covered separately.

The first native attempt had one incorrect expected diagnostic: reordered pages were refused as
`Invalid inbound frame`, not one of the test's initial accepted strings. The corrected assertion
also checks that the durable prefix remains unchanged. No production repair was needed for that
failure. Its failed log is preserved.

A focused count comparison includes preparation on both sides and processes four identical
position shapes using four singleton calls or one grouped call. It measures storage-only owner
work, excluding driver status/control traffic and editor publication:

| Calls | Four singleton receipts | One group |
| --- | ---: | ---: |
| Content loads | 16 | 4 |
| Read-only IndexedDB transactions | 220 | 47 |
| Read-write IndexedDB transactions | 8 | 2 |
| WebCrypto verify calls | 156 | 59 |

The two writes are nonce reservation and the atomic data/witness commit. The verification reduction
comes from sharing repeated custody/metadata work; each entry is still authenticated before and
after persistence. These counts are not elapsed-time speedups. The first count attempt excluded
preparation on the group side; it is superseded by `native-counts-final.log`, not pooled into this
table. Native count runs are not used as timing observations.

## Browser comparison

Three serial restored journeys pass using the unchanged attribution harness and private fixture:
120 cards, 12 KB Goals and 600 pending positions. The first-repair baseline's 59 bundle files match
its recorded hashes. Order: fresh baseline local, candidate local, candidate +75 ms per account
request. No builds/tests overlap these timed journeys. Small documentation reads/writes continue.

| Observation | Fresh first-repair baseline | Grouped local | Grouped +75 ms |
| --- | ---: | ---: | ---: |
| Catch-up | 248.795 s | **79.125 s** | **193.074 s** |
| Peer / own reads | 600 / 43 | 600 / 14 | 600 / 33 |
| Subsequent burst median, 12 observations | 2,340 ms | 2,344 ms | 2,349 ms |
| Subsequent burst maximum | 2,372 ms | 2,363 ms | 2,875 ms |
| Offline cold open | 7,037 ms | 7,028 ms | 6,984 ms |
| Catch-up long tasks >50 ms | 2; max 56 ms | 0 | 1; 1,189 ms |
| Post-GC heap endpoint | 19.53 MB | 19.89 MB | 19.62 MB |

Local catch-up takes **68.2% less time** (3.14 times the throughput) than the fresh baseline. The
baseline is 2.2% faster than its preceding 254.318-second observation, inside the prospective drift
threshold. The delayed candidate takes **36.1% less time** than the prior first-repair packet's
302.023-second delayed run; there is **no fresh delayed baseline**. These are individual engineering
observations, not population confidence intervals or phone/production measurements. The large local
gain and small baseline drift do not trigger an extra timing pair under the stated decision rule.

Peer request count stays at 600. Own polls and control discovery calls decline because catch-up
finishes sooner: membership/history reads respectively number 47/47, 15/15 and 35/35. The receiver's
local submit starts 1.661, 1.745 and 2.094 seconds after catch-up begins; both-way writing converges.
Complete exports match on both devices and again offline: 54,211 bytes in every journey. There are
no HTTP refusals or 429s in the primary windows. HTTP-200 abort/closed-subscription observations and
intentional offline setup failures remain in the logs; this is not a zero-network-error claim.

The added-latency condition costs another 113.949 seconds versus the local candidate. Its receiver
request-to-response-header interval union is 79.265 seconds, versus 20.480 seconds locally. This
union is not all transport time and may overlap client work. The 250 ms collection rule can also
shorten groups on slower links; the elapsed difference cannot be attributed solely to network wait.
No new per-request CPU attribution or parallel-prefetch speedup was measured.

The roughly 1.2-second delayed long task remains unattributed; a similar 1.06-second task was retained
in the previous delayed run. No new multi-second catch-up task appears, but this is not proof of
stall-free input. The key probe measures key-to-next-frame, not visible admitted text; native queue
and grouped-HTTP tests separately check input ordering and availability. Cold opening remains
roughly seven seconds, outside the 2.5-second budget, and receipt/history retention is unchanged.

## Verification and next boundary

32 focused unit checks, 17 distinct native cases, the ordinary build, TypeScript and targeted
lint/format checks pass. The final two native cases confirm local input remains admissible while a
later group HTTP request is held, a lost tail commits only the verified fitting prefix and retries,
and locking discards fetched-but-uncommitted receipts. The earlier self-binding mutation-control
limitation recorded in the first-repair packet is not rerun or claimed repaired here.

Retain the grouped implementation. It is uncommitted and unpublished at this checkpoint. Bounded
network prefetch can now be evaluated against the remaining transport cost, without changing receipt
format; it would need explicit in-flight limits and reserved sender/control capacity. This phase
implements no concurrent prefetch, checkpoint shortcut, receipt migration, local-ledger retention
or cold-open repair. Release validation remains paused.

## Reproduction and evidence

Use the existing attribution `probe/receive.config.ts` and its runbook, with
`DONE_PERF_DIST=/tmp/done-receive-groups-20261012/candidate-dist`, a fresh `DONE_PERF_RESULTS`, the
unchanged `/tmp/done-client-receive` fixture root, and `RECEIVE_DELAY_MS=0` or `75`. The baseline is
`/tmp/done-receive-first-repair-20261012/final-dist`. Recompute each summary with the attribution
`probe/analyze.mjs`; decompress a numeric archive into a scratch `result.json` first.

Focused group checks can be rerun with:

```sh
node --test --test-concurrency=1 test/account-receive/groups.test.mjs test/account-receive/groups-transport.test.mjs
node node_modules/vitest/vitest.mjs run test/receiveGroup.test.ts test/receiveSelection.test.ts test/ownedReceiveQueue.test.ts test/accountReceiveDriver.test.ts
```

`identity/` binds the source patch, new module, bundle and external raw results. `samples/` retains
numeric observations and summaries, omitting database identifiers and replacing synthetic text with
lengths. Credential-bearing fixture/deep snapshots remain external and hashed. `logs/` preserves
failed attempts and their passing replacements. `manifest.json` hashes retained packet files.
No evidence or existing temporary artifacts were deleted.
