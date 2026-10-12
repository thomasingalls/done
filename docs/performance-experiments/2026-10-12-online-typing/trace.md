# Read-only trace at signed 9ba0ae63

This trace explains mechanisms to test against the observations. It is not evidence that a
proposed replacement is correct, and no runtime change accompanies this packet.

## Why received writing still fences local input

`accountReceive.ts` fetches pages before enqueueing an owned remote job. That job calls
`receivePage` or `receiveGroup`. `admissionQueue.ts` holds the foreground FIFO while the
callback validates, persists, reads back and promotes those updates. Later keystrokes wait
until that job completes. The timed-flush repair intentionally preserved this ordering:
incoming remote dependencies must be durable before a subsequent local edit depends on them.

The observed remote-job spans include time awaiting the separately serialized storage tail,
crypto and IndexedDB, not only the final document application. The fetched response's network
delay precedes this FIFO job; the 75 ms proxy delay is therefore not directly a 75 ms delay
inside every remote admission. Sending and receiving can still compete for the storage tail.

## Authority checks repeat startup-shaped work

`accountReceive.ts::assertCurrent` calls `readJoinedAccount` for the measured joined device.
The latter reads/authenticates the Local claim, scans scoped custody carriers, parses the
custody and joined records, opens the factor, authenticates the custody record, then verifies
the joined marker. `withPromotionRoot` erases the factor/root afterward. The receive owner
then compares the joined payload and custody record with its retained expectations.

The direct-byte `recordEqual` repair is present. Hex work in this profile comes in part from
`recordPayload` during **authentication**, which still hex-encodes the sealed metadata into
JSON/UTF-8. Replacing equality did not remove this separate encoding path. Keep the sampled
call-tree breakdown distinct from the count of authority checks; not every sample is caused
by exactly one such check.

A possible next repair is an owner-scoped verified authority snapshot: reread and compare the
exact closed stored values at existing authority boundaries, reuse authentication only when
those values match, and invalidate on any change, handoff or close. This needs its own design
and tamper/unknown-carrier/late-completion tests. A MAC-only comparison would not establish
that the underlying row is unchanged. This packet does not authorize weakening those checks.

## Warm storage does not mean every online load is selective

`contentStore.ts::appendRecords` durably reserves a counter range before calling the supplied
`beforeCommit`. Receive callbacks use `state`, and other spool callbacks also reload state.
The warm loader compares the on-disk authenticated counter with its retained counter. During
this owned reservation, they differ, so the loader can take the full snapshot path even
though no new row has committed yet. After this reload the retained counter may once again
match the commit predecessor, allowing the append to extend the view normally.

This explains a route to the measured full physical reads; it does not attribute every read
to that route. Audit/resume invalidation and other full-record callers must remain valid.
A reservation-aware internal predecessor could avoid that particular reload, but must account
for abandoned ranges, unexpected counter changes and failed commits. A reservation is not a row.

`verifiedRecords.ts` also byte-compares prefixes on verify and on full-record projections.
The opaque selection lease avoids broad caller copies for selected consumers; it does not
turn every validator comparison into an identity check. A proof of unchanged private rows
must come from the carrier, never a caller-supplied token or an assumption that a copied array
is immutable. CPU attribution separates custody equality from these ledger comparisons.

## Goals has its own synchronous size cost

`workspaceCommands.ts::planWorkspaceText` constructs a new CodeMirror `EditorState` over
`Y.Text.toString()` for every text intent. The state supplies command semantics, including
selection, indentation and Markdown handling. `admittedEditor.ts::project` reads the accepted
text, converts the current editor document to a string, compares/scans a replacement range,
then dispatches a real view transaction.

The probe separately times plan/state creation, the whole projection, and its read/string/diff
substeps. Substeps overlap their parents. Whole projection also includes CodeMirror transaction
and live-preview work, so its total is not all string comparison. Persistent planning state and
direct projection deltas are plausible later repairs, with invalidation on remote updates,
structural commands and undo/redo. This measurement establishes their priority, not their safety.
