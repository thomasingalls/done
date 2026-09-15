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


## Active slice: General validation-runner integration — command/campaign wrappers (`L-1`)

```yaml
gate: L-1
seat: /Users/thomasingalls/.codex/worktrees/c030/done
branch: codex/encrypted-store-contract-corrections
status: in flight
blocks_on: remaining command/campaign adapters and immutable qualification; explicit F-17 RC latency debt
debts: consult docs/review/remediation/debts.json
updated: 2026-09-15
```

**Roadmap checkpoint.** Account core wrapper integration is signed and verified as `d41a0a56`.
All catalogue/test-file adapters are integrated. Counts remain **628 obligations, 291 required files,
272 general files/2,198 dispositions (11 not applicable)**. Recovery resolves one command and one
campaign row: **zero test-file /92 command /60 campaign** remain unresolved, down from 154 to 152.
These are integration counts, not a passing aggregate.

**Just completed.** The actual recovery wrapper preserves all six files, default Node concurrency,
120-second bound and five-second grace. Owned execution retains its reports and terminal census and
uses the existing persistent-profile fixture in the worker group, with pinned Chromium. Lifecycle
records now join the owned report tree when opted in; other native invocations retain the prior
fallback. The adapter checks all 25 outcomes, successful summary, source hashes, both factor-control
pairs, substituted-root evidence and three distinct clean browser lifetimes through one owned profile.
Case outcomes come from the owned Node census; JUnit/logs remain auxiliary. Lifecycle reports are
cooperative fixture observations coupled to owner group drain; virtual passkey restoration is simulated.

The final epoch passes **93 cases in six executions**: 38 planning, 25 recovery and 30 core-regression
cases, then one exact recovery receipt reuse. Recovery takes **11.900s /120s**, including 160 generated
service histories and actual browser restarts. Every group drains. Ten recovery reports and the three
lifecycle records survive checkout deletion. Four new infrastructure cases include 100 generated
profile histories, 14 breakage variants each, and directed report/missing-file controls. Five synthetic
process runs and two deliberate faults discriminate; their case/profile claims are not real executions.
The code and evidence are uncommitted.
[Evidence and verifier](./account-conformance-runs/2026-09-15-wrapper-account-recovery/README.md).

**Preserved observations.** An outdated Account-fixture planning assertion still marked already
integrated core/preparation wrappers blocked. Its failure is retained; positive resolved-contract
checks and the remaining blocked assertions now pass. Prior core browser-startup SIGABRT, older
orphan/headroom observations, report setup failures and all failure/cancellation/latency receipts
retain their evidence. No runtime repair follows from correcting the stale planning assertion.

**Next bounded phase.** Account authority wrapper integration, with its exact grouped selection,
owned reports and semantic postconditions, then other bounded wrapper families. Optional outputs in
unintegrated locations still need explicit treatment. File custody is cooperative bounded polling,
not a disk quota or hostile-code sandbox; this phase does not establish whole-profile residue bounds.

**RC selection.** R3 + membership-repair eligibility + restricted replay buffers remains the Local
repository default, signed in `83b5f157`; Account/internal defaults stay reference. Optimization
exploration is closed. The unchanged application gate remains **failed**: Android card p95 38.7ms
(<16), settled navigation 113.6ms (<100). Desktop card is 9.0ms, Android focus 35.4ms. The explicit
post-measurement product disposition accepts both misses for the RC; it is not an automated waiver
or passing receipt. [RC decision](./f17-rc-activation.md);
[open F-17 debt](./review/implementation/f17-rc-latency-debt.json).
No runtime, package/dependency, vector, crypto-census or F-17 debt changes occur in this phase.
No personal app/server, relay, deployment or device operation occurs.

**Remaining qualification.** Keep host-Python input binding, historical owner/orphan observations,
capture comparison-map/byte-length oracles, delivery-oracle headroom, R-04 whole-tree style scope,
P-06 construction prose and Q-08 artifact budgets explicit. Core-receive headroom is repaired at its
unchanged bound, with older timeouts retained. After remaining wrappers/qualification repairs, run
the immutable aggregate with failed F-17 budgets visible, then private Account rehearsal and the
human recovery/adoption milestones. [Execution roadmap](./release-validation-execution.md);
[release plan](./private-release-validation-prep.md#what-follows-validation).

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
