# done — Active slice

**This file is disposable, and that is its function.** It holds the slice of work that is active right now
and nothing else. Nothing of record value lives here: decisions go to [decisions.md](./decisions.md), and
closed work goes to [completed.md](./completed.md).

## How this file works

**Everything below the rule is replaced wholesale when the active slice changes.** Not amended, not struck
through, not archived in place — deleted and rewritten. A working document that accretes is a working
document nobody reads, and the two files that _are_ records already exist.

**One thing must happen first.** When a slice closes, write its outcome into
[completed.md](./completed.md) _before_ rewriting this file. That ordering is the only thing protecting
the record, because after the rewrite the evidence is gone.

**It grows a tree when the slice deepens.** If work goes deeper without the slice changing — an item turns
out to have four parts, one of which has three — nest it. Nesting is free and says something true about
the shape of the work. What is _not_ allowed is a second top-level slice **inside one document**: two active
slices in one document means it has stopped answering the question it exists to answer, and one of them is
really next-up.

**The file is a stream of documents, one per seat, separated by `---` as YAML separates its own.** The
original rule assumed one slice because it assumed one worker, and that assumption broke the first time two
gates ran in parallel seats — `L-1` in its worktree and `L-2` in another, neither waiting on the other,
neither with anywhere honest to say so. A seat owns its own document and edits nothing below or above the
separator, which is what keeps the wholesale-replacement rule intact per document and keeps two live sessions
out of each other's paragraphs. Each document opens with its keys, because once there is more than one the
first question is always *whose is this, and where is it running* — gate, seat, branch, status, and what
blocks it.

**One document per seat is a ceiling, not a target.** A second document is a claim that two gates genuinely
do not block each other, checkable at `action-tree.md`'s prerequisites — not a place to park work that is
really next-up. When a seat's slice closes, its outcome goes to [completed.md](./completed.md) and **its
document is deleted**, separator and all.

**Status vocabulary**, deliberately small: **not started** · **in flight** · **done** · **blocked** (which
must name what it is blocked on).

**Being wrong here is cheap.** This file is allowed to lag by a day. It is not allowed to describe a slice
that is no longer active.

---

## Active slice: Inbound codecs and first-epoch verification (`L-1`)

```yaml
gate: L-1
seat: /Users/thomasingalls/.codex/worktrees/c030/done
branch: codex/encrypted-store-contract-corrections
status: not started
blocks_on: closed inbound framing and owner-context verification
debts: consult docs/review/remediation/debts.json
updated: 2026-09-11
```

**Personal checkpoint.** The verified Local release remains `.dev/releases/17d87c2/app`, predecessor
`dist/` intact. Personal preview/relay remain stopped; origin/Tailscale routing is unchanged. The author
controls browser interaction and factors. No real Account, passkey, recovery code, operator key or authority
pin is provisioned. The actual old second device will adopt this device's workspace with fresh custody,
store, counters and credentials; its old writing will not be imported or merged.

**Committed base.** `18ceb40` contains v2 outbound preparation, `7210b7d` source capture, `7082fa7` the
witnessed spool, `81a4655` response verification, `2cb42a2` v8 delivery evidence, `96a2040` schema-4 service
decisions, `e1a5029` private HTTP transport/readback and `8dd06fb` the owned delivery/reconnect driver.
Exact source capsules, envelopes, wrappers and proof evidence survive restart/compaction; position and seal
invocation grants remain separate. Edited v5 histories need a separately verified catch-up checkpoint.

**Inbound preparation completed.** The [contract](./account-inbound.md) requires an independently admitted
semantic genesis with zero publisher links; later checkpoint baselines remain unsupported. Reader authority
is separate from publisher identity. Proposed v2 request/page framing binds both, while received progress is
per publisher and independent of visible Yjs state, outbound acceptance and local sequences. A retained
inbound event carries exact signed request/page bytes and the envelope/proof inside it. Content, event,
derived progress and witness must commit atomically before remote promotion. Pending originals survive
restart/compaction; remote input cannot become a new local source capsule. Earlier readers must refuse the
planned v9 marker before admission. The first receive bounds fit actual local batch limits.

[Evidence](./account-conformance-runs/2026-09-11-account-inbound-prep.md): 25 preparation cases, 300 generated
histories, seven effective shortcut controls, 43 primitive regressions and all 906 unit tests pass. A directed
test found and fixed mutable-input retention in the test-only candidate; original bytes are now copied
before async crypto and closure is rechecked before duplicate results. No production receiver exists yet.
The model uses synthetic authority, atomic JS assignment and previously verified event objects on restart;
it is not native storage, enrollment, complete codec or cold cryptographic replay evidence. No browser
harness ran; future native waits must explicitly await predicates. The pnpm wrapper launch stalled; the
registered Node script ran directly and its evidence is retained. No whole debt is paid.

**Next bounded build.** Implement the closed inbound event codec and proposed v2 read/page codecs alongside
unchanged v1. Implement first-epoch verification with explicit independently held owner context: baseline ID,
lineage/head, reader and publisher keys/membership, generation opener, actor bindings, prior received link
and retained high-water mark. Verify the exact request, canonical bounds, page proof, contiguous subject,
acceptance link, envelope signature/decryption and actor before returning detached original updates/evidence.
A low-level context parameter grants no membership or baseline authority on its own. Keep wire bytes owned
across async crypto and withhold late results on close, including duplicates.

Use the independent fixtures as byte expectations, not the model's fixture parser as production code.
Add malformed/trailing/noncanonical/oversized frames, request substitution, false prefix, conflicting proof,
unsupported epoch/generation/finalization, actor misuse, mutable input and cancellation tests with effective
actual guard-removal controls. Retain v1 vectors. This phase exposes no default receive path, new enrollment,
service route, writable cursor or production activation marker.

**Then:** native v9 reader-fence activation, complete stored-wire reauthentication and atomic original
content/event/witness batches under the factor-owned permit; actual abort/crash/lost-ack/cold-open tests;
ordered remote editor promotion; v2 service reader/publisher resolution and transport; Account UI/two-gate
second-device adoption. A private self-stream can use the actual admitted owner; fresh readers and extra
publishers remain synthetic until their enrollment/authority owner exists.

**Following boundaries.** General lineage advancement, successors, admitted checkpoint baselines, concurrent
writers, pruning/backlog performance, revocation/rotation, clear/delete, finalization/recovery, supported
platforms, whole-profile residue, production provisioning/deployment/restore and independent review. L-2's
historical clean ref `d24732b` has no further service work to integrate. Host VM/policy research stays stopped.
Client credentials and service state still require unrewound, unbranched histories.

This outcome was appended to completed.md before this rewrite; L-2 is unchanged.

---

## Active slice: Stage 4's first pieces — authorization, acceptance and transition integration (`L-2`)

```yaml
gate: L-2
seat: .claude/worktrees/l2-onboarding-863db1
branch: claude/l2-onboarding-863db1 # forked from claude/l1-contract-pass at 1375ee6
status: in flight # R3-4 paid; the slot verifier landed; the account service is next
plan: [sequencing.md §3.5, action-tree.md L-2]
prerequisites: S0-10 (closed 2026-08-29), especially S0-2/S0-4 — not L-1
debts: none # node scripts/check-debts.mjs --gate L-2 lifts
updated: 2026-08-29
```

**Why this runs beside `L-1` rather than after it.** `L-2`'s prerequisites are `S0-10`, especially `S0-2` and
`S0-4` — [action-tree.md](./review/remediation/action-tree.md)'s node names them and does not name `L-1`. The
two rejoin at `L-3`, which lists both. The critical-path diagram in
[sequencing.md](./sequencing.md) §4 draws Stage 4 after Stage 2 because that is the order the *product* ships
in; §5.1 already settled that the service's construction does not wait, since *ships* means someone else's
data and the author synchronizing his own devices is development. So milestones 5 and 6 are reached while
review 3b is out, and what waits for 3b's answer is exposing another person to it.

**What this slice is.** Stage 4's internal order, taken in order (§3.5): the account service, the
authenticator and the device-local slot verifier; the recovery keypair and the code ceremony; the
authorization lineage, first signed head, genesis checkpoint and promotion; device signing and wrapping
credentials; the envelope layer, relay rewrite and content-blind durable store; enrollment's two gates; the
device list; rotation, revocation, acceptance evidence and the finalization boundary. **Mostly indivisible:**
a device list that cannot revoke is worse than no device list, so nothing ships until item 8.

**What has landed.**

- **`R3-4`, first, because it was owed first** (`fbdbfb4`). `S0-9` round 3 returned member-entry uniqueness to
  `S0-2`'s homes *before `L-2` implements a verifier*, and this is that moment. A certified set carrying two
  entries under one `credential_id` is now malformed at both homes, the four map entries pinning them are
  re-pinned with every entry held, and `pnpm recipient:check` carries the sentence as a byte rule — added
  beyond the named repair because the generator's object-keyed `members` cannot express a duplicate, so no
  published negative can ever cover it. Recorded at
  [`S0-2/README.md`](./review/remediation/S0-2/README.md) and as a dated addendum on the disposition.
  **This makes one line of the `L-1` document above stale** — its *not in this slice* paragraph still says
  `R3-4` is owed. Correct then, wrong now, and the `L-1` seat's line to drop rather than this one's to edit:
  the separator only means anything if it holds when crossing it would be convenient.
- **The device-local slot verifier** (`b8c267a`), `src/account/slotUnlock.ts` — TRD §13.9, §15 row 12, item 1's
  half that needs nothing from `L-1`. The service-signed binding is verified before the key it names is used;
  refusals are values rather than messages. Held to `test/vectors/account-credential.json`, with the negatives
  rebuilt against `src/` rather than replayed, and a fifteen-mutation battery run against it — eleven caught,
  four survivors all in the compiled-in encoding set, all closed by two tests that pin the check's *position*
  rather than its presence.

**What is next, in the plan's order.** The account service and the authenticator ceremony that mints these
credentials — the two halves of item 1 the verifier does not cover — then the recovery keypair and the code
ceremony, which §3.5 puts at account creation rather than later because there is no account without it.

**Two things `L-2` needs that it does not own.** §6.5's slot index is where a verified binding is *stored*,
and it is `L-1`'s item 2; the verifier is a pure function over published bytes and did not wait for it, but
the enrollment path will. And §11.2's hostile-relay tests need `relayNetwork()` in `test/replicas.ts` able to
withhold, reorder and deliver late — §3.5 names extending it as far cheaper than a second harness, and it is
worth building before item 5 rather than during it.

**Not in this slice.** `L-1`'s document above, which this seat does not edit. `L-3` and `L-4`, and the four
registered debts at `L-4`. The live Stage 2 cutover. Review 3b's answer gates exposure, not construction
(§5.1) — and reviewer answers that constrain implementation are `L-4` gates.
