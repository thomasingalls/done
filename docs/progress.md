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


## Active slice: Remaining closed-parser conformance (`L-1`)

```yaml
gate: L-1
seat: /Users/thomasingalls/.codex/worktrees/c030/done
branch: codex/encrypted-store-contract-corrections
status: not started
blocks_on: current parser/evidence inventory before deciding missing mutation coverage
debts: consult docs/review/remediation/debts.json
updated: 2026-09-12
```

**Roadmap position.** Personal Local cutover, source cleanup and packaged offline upgrades are exercised.
Account remains at [Stage 4 §3.5](./sequencing.md#35-stage-4--the-service), item 5's internal creating-member
ciphertext round trip. The byte-contract chain C/D1–D8, aggregate audit `ec889d9`, F-15 `c10dee3` and
F-21.3 `2bbb4c6` are signed; all twelve signatures verify. The signing reminder is paused and the original
unsigned chain remains under the
[recorded backup](./account-conformance-runs/2026-09-11-signed-contract-history.json).
No real Account receipt exists. The new F-21.7 work is complete, unstaged/uncommitted.

**Completed boundary.** [F-05/F-06](./review/implementation/account-crypto-closure.md) remain closed for
the current private first-epoch byte contracts. [F-15](./review/implementation/reservation-durability.md)
is repaired under explicit strict-persistence/history assumptions; physical flush, past undercounts and
writable profile restores/clones remain outside the result. [F-21.3](./review/implementation/account-isolation.md)
is closed for shared-service admission capability isolation.

[F-21.7](./review/implementation/account-decision-composition.md) is now closed for actual service-issued
refusal/conflict handling through the browser's durable delivery, automatic sender and shared sync owners.
Real service decisions survive lost HTTP replies, fresh service connections, service/renderer death,
compaction and cold restart with original writing and exact evidence retained. No production defect
was found and no production code or valid format changed.

[Evidence](./account-conformance-runs/2026-09-12-account-decision-composition.md): 47 passing stages,
112 Node tests, 40 selected unit cases, 875 matching source pins, types, 30 vector commands,
census/map/registry, lint and format. The 24 new tests include eight process/renderer commit cuts,
16 generated retry/reopen histories and 12 generated refusal/successor arrival histories. Three source
omission controls detect false durable return and incorrect readiness. Affected service/client/native
regressions pass. Full Vitest, aggregate crypto audit, broad storage and inherited generated-sync
campaigns were not rerun for this test-only patch.

**Interpretation.** Fixture-only faulty/branched device requests make real service refusal and competing
heads reachable; they do not implement cloning or a client successor owner. No fixture acceptance key
mints the tested response. No-reseal checks begin after alternative fixture encryption. Arrival order
legitimately changes the retained proof set: refusal-first keeps both, conflict-first keeps only the head.
Send closure leaves receiving available; a competing self-stream is refused before inbound persistence
with Local editing active and the existing `operation-failed` receive diagnostic. Reopen can append a
canonical empty Yjs capture; every old capsule is required exactly. Native death is not power failure.

**Next bounded phase — remaining parser coverage (F-21.1), inventory first.**
The historical packet names `parsePromotion`, `parseAdmissionRequest`, `decodeSourceCapsule`,
`decodeSpoolEntry`, `decodeDeliveryEntry` and `decodeSubmission`. D2/D3/group C and other later phases
already add structured/parser negatives; the old blanket absence claim must not be treated as current.

- Map each parser's current accepted versions, size/resource bounds, canonical encoding, owner entry
  points and executed negative/property coverage. Credit existing evidence before selecting new cases.
- Add only missing useful mutations around valid objects/wires: nested structure, numeric/length bounds,
  truncation, canonical syntax, route/version substitutions and relevant hostile object shapes. Assert
  bounded refusal or exact valid round-trip behavior without mistaking an encoder-only rejection for
  execution of the parser under test.
- Use independently specified expectations and effective omitted-check controls; preserve shrinking
  seeds/paths for real failures. Repair only demonstrated defects, retaining compatibility and authority
  boundaries. A byte parser does not establish cryptographic authority or lifecycle eligibility.
- Run affected parser/owner/vector/type checks, preserve evidence and archive before replacing only L-1.
  This phase does not authorize real provisioning, device adoption or a personal server restart.

**Personal checkpoint.** All 21 hashes in `dist/` and `.dev/releases/17d87c2/app`, all 31 prior vector
files, historical review and L-2 are unchanged. Personal preview/relay remain stopped. No real browser,
Account, factor, operator key, pin, origin or routing change occurred. Fixtures were disposable; new
bundles stayed in memory. Unrelated root `done ` and `reviewpacket96a20401ceb88d.md` remain untouched.
A new root `review-packet-1ceb88d-393ef43.md` appeared during the run and was also left untouched.
Host VM/policy research stays stopped. The actual old second device will adopt the first workspace
with fresh custody/store/counters/credentials, without importing or merging its previous writing.

**Other gates.** F-21.6's named delivery-unit oracle, neutral-residue evidence, diagnostics/salvage,
measured maintenance/performance and accepted review follow-ups remain. General lineage, successor
checkpoints, concurrent membership, pruning/backlog scale, enrollment/device management, revocation/
rotation, clear/delete, finalization/total-loss recovery, PRF enrollment, supported platforms,
whole-profile residue, deployment/restore and independent review remain separate. L-2's historical ref
`d24732b` has no further service work to integrate.

The outcome was appended to completed.md before this rewrite; L-2 is unchanged.

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
