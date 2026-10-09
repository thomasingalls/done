# Yjs delivery order and pending snapshot handoff

Core repair phase 3 pins a local patch to Yjs 13.6.31. In `integrateStructs`, every encountered cross-client
missing dependency records its current lower-bound clock before following the available reader. That reader
can start after the needed dependency. Recording only its later same-client gap loses an earlier wake-up
and can strand a cycle after all original records arrive. The patch moves the existing `updateMissingSv`
call outside the no-reader branch in source, ESM and CJS. A second change checks retry conditions after
merging newly parked records, including when no pending union existed before the call. Wake-ups satisfied
later in that integration pass are retried before returning. It changes no wire encoding or record format.

The saved seven-record case loses the wake-up at client 102 clock 0, retaining only clock 5. Arrival of
102's initial record therefore does not retry client 103's waiting item, which would unblock 102's next
item. The patch retains the earlier lower bound. It does not reorder, redeliver or discard original records.
The pinned runtime fork and projection publication checks remain in place.

`pnpm-workspace.yaml` and `pnpm-lock.yaml` install `vendor-patches/yjs@13.6.31.patch`, including transitive
Yjs peers. The unchanged upstream source maps are no longer referenced by the patched distributions;
built application maps point to those distributions. `yjs:check` verifies the patch and installed file
hashes, lock/workspace pins, peer resolution and the saved failure in separate ESM/CJS processes before build. The patch must be reevaluated on any Yjs upgrade.
This is a local repair, not an upstream release or upstream-reviewed fix.

Pending snapshots still use the existing Yjs state-update encoding and the existing scoped workspace
channel. With the wake-up repair, receivers must retain unresolved structs and deletion sets and integrate
them when the missing original basis arrives. Receiver-local edits, history and exports must remain
consistent. A donor's departure must not require another snapshot or redelivery of snapshot-covered
originals. Accepted snapshots pass through ordinary encrypted receive admission before publication.

## Verification

`test/yjsDelivery.test.ts` exercises the wake-up itself, all 5,040 orders of the saved seven original
records, and 3,000 generated original/handoff/concurrent histories. The string and nested-object inventories
come from independent input ledgers. The Node campaign translates scalar positions into UTF-16 offsets
so emoji operations do not split surrogate pairs; invalid Unicode is outside that delivery alphabet. Concurrent authors share an array and object map while owning separate
text roots; convergence of arbitrary concurrent edits to the same text position is not independently proved.

`node scripts/yjs-delivery/campaign.mjs` repeats the saved exhaustive case and larger generated campaigns.
It covers reordered and duplicate originals, early tails, up to four additional pending snapshot hops,
receiver-local state, and concurrent text/nested-object sources. Every intermediate apply must leave no
parked retry whose lower bound is already satisfied. A failing property shrinks and saves its
history; `--replay` repeats saved input. `--mutant missed-wakeup` reverses the patch only in a frozen runtime
and must reproduce precisely the saved 78 failing orders. Source documents cross the test boundary only
as bytes; the baseline encoder and the isolated test runtime do not exchange live Yjs objects.

`node scripts/yjs-delivery/run.mjs` uses native custody, IndexedDB, localStorage, admission, CodeMirror and
BroadcastChannel. Both recipients open before the donor obtains its pending records, excluding shared-disk
startup as a false handoff success. A later accepted update on the same sender channel serves as a FIFO
sentinel. Both initial snapshot and hello-response paths are exercised, alongside the saved ready-wakeup history. The donor closes before the
remaining original basis arrives. An isolated browser-context recovery case starts with only the received
snapshot, kills the renderer after a journalled local command, then reopens and supplies the missing basis.

Native mutation controls remove the earlier wake-up, omit draining a newly parked ready wake-up, drop
pending snapshot structs/deletions or omit the hello response. The saved native generated history pins
an observed canonical/projection bookkeeping mismatch with equal pending bytes; the repair retains the
strict projection check and drains satisfied wake-ups in both documents. Only named assertion failures count as detection; unexpected errors and timeouts do not.
Generated native histories save the first failing input without shrinking. The unit and Node properties
shrink. One Chromium host and these alphabets do not establish supported-platform, input-to-paint, memory,
malicious-update or general CRDT acceptance. Migration and compaction policies are unchanged.

```sh
node scripts/yjs-delivery/campaign.mjs --runs 50000 --output test-results/yjs-delivery/new-campaign
node scripts/yjs-delivery/campaign.mjs --mutant missed-wakeup --output test-results/yjs-delivery/new-control
node scripts/yjs-delivery/run.mjs --runs 100 --output test-results/yjs-delivery/new-native
node_modules/.bin/vitest run test/yjsDelivery.test.ts
```

Use fresh output directories and set `CHROMIUM_PATH` for native runs when needed. `--case` selects a native
case and `--replay` takes a saved JSON history. Frozen reports pin source, fixtures, patch, lockfile and the
installed Yjs files. Installation, ESM/CJS resolution and the checked-in patch are separate deployment checks.
The primary implementation reference is [Yjs's pinned encoder](https://github.com/yjs/yjs/blob/v13.6.31/src/utils/encoding.js).
Patch installation follows [pnpm's documented exact-version mechanism](https://pnpm.io/cli/patch).
