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

## Active slice: Inherited factor custody and v2 credential byte bridges (`L-1`)

```yaml
gate: L-1
seat: /Users/thomasingalls/.codex/worktrees/c030/done
branch: codex/encrypted-store-contract-corrections
status: not started
blocks_on: remaining custody and checkpoint byte agreement before real Account authority
debts: consult docs/review/remediation/debts.json
updated: 2026-09-11
```

**Roadmap position.** Personal Local cutover, source cleanup and packaged offline upgrades are exercised.
Account work is at [Stage 4 §3.5](./sequencing.md#35-stage-4--the-service), around item 5's internal
creating-member ciphertext round trip. Composition is `6398e33`, descriptor bounds/versioning `4f71bac`,
fresh activation `2ba50aa`, crypto prep `9cf5c98`, first-authority A `43b42b1`, recovery B `e74fbaa`,
transport C `d098bd4`, service custody D1 `d24ca66`, Local promotion D2 `1897848`, Account ledger D3
`24bc3a4` and counters D4 `837cd14`. C and D1–D4 were committed **unsigned** at the user's request;
the existing reminder includes all five for signing later. D5 is complete and remains unstaged/
uncommitted. No real Account receipt exists; this is not Stage 4 completion or second-device enrollment.

**Completed boundary.** [D5 store/journal contracts](./account-crypto/store-journal.md) pin the current
store-name digest, store-key KDF and record AAD/shape, journal KDF/header/AAD/canonical base64, and actual
writer/ordinal carrier ownership. All six inherited stored-record and four inherited journal vectors
agree with both current runtime and independent encoders. Production sources and valid stored bytes
are unchanged. Key-envelope, custody, checkpoint and provenance work is not implied by this bridge.

**Contract corrections.** The inherited row-2 nonce claim is now explicitly finite-use and conditional
on fresh randomness; flushing does not reset lifetime q. Custody rejects malformed Unicode before name
derivation, while the low-level name helper alone does not. D4's relaxed-durability correction remains:
F-15 is open, and renderer-crash/transaction tests do not establish OS/power-loss persistence of grants.
No new runtime defect, rotation protocol or whole-WASM provenance qualification was established in D5.

[Final evidence](./account-conformance-runs/2026-09-11-account-store-contract.md): 46 stages pass with
823 matching pins. Eleven new vectors, 44 field mutations and 44 encoded omission witnesses pass.
The 160 shrinking-enabled byte histories cover 1,195 steps with no counterexample. Eight new source
controls are effective. Three new native tests verify actual custody derivation, exact raw/recovered
plaintext, writer restart, flush and eight changed fields. Eight inherited content/journal native cases
pass and detect five mutants; all 28 WASM checks, 983 units, typecheck, earlier contracts and 27 vector
commands pass. The native fixture was corrected for decrypt-only enrollment, then strengthened to compare
complete journal plaintexts; both full campaigns passed and the final one uses the strengthened fixture.
The registry has 67 specified, three open and one exclusion; the map has 66 entries/80 permitted-root
chains. F-05/F-06 remain open.

**Next bounded phase — D6: inherited factor custody, envelopes and v2 credential/metadata bytes.**
Continue [group D](./account-crypto-prep.md#4-ordered-implementation-groups-and-acceptance-gates) with
`remaining-shared-custody`:

- Pin the actual factor lock-seal and generation-envelope KDF/AAD/plaintext formats and stored parser
  boundaries, comparing inherited device-lock and row-3 key-envelope vectors to current consumers.
- Qualify actual `done/custody-credential/v2`, `done/custody-key-check/v2` and
  `done/custody-metadata/v2` messages, key correspondence, metadata authentication and custody ownership.
  Distinguish scoped identity/factor authority from a valid tag or public key supplied by the carrier.
- Add independent fixed vectors for demonstrated gaps, meaningful per-field negatives, effective source
  omission controls and shrinking-enabled tests. Exercise actual native custody creation/open/failure
  boundaries where helper agreement cannot establish the owner connection.
- Preserve valid formats; change runtime only for a reproduced defect or explicit correction. Register
  exact source/map/byte joins, run affected checks, preserve evidence and append the outcome before
  replacing only L-1. No real provisioning, personal build/server, onboarding UI or deployment here.

Later D work retains Account checkpoint/startup. Local/migration-only provenance needs an explicit
bounded disposition, not silent whole-Local qualification. The actual old second device will adopt the
first workspace with fresh custody/store/counters/credentials, without importing or merging its old
writing. Recovery byte conformance is not a built total-loss machine.

**Personal checkpoint.** Root `dist/` and `.dev/releases/17d87c2/app` retain all 21 saved hashes.
All 27 prior tracked vector files and production sources are unchanged by D5. Personal preview/relay,
browser/factors, origin/routing, historical review and L-2 are unchanged. New native bundles stayed in
memory; inherited harnesses used only disposable loopback fixtures. Host VM/policy research stays
stopped. No real Account, factor, operator key or pin was provisioned. Unrelated root files `done ` and
`reviewpacket96a20401ceb88d.md` remain untouched.

**Other gates.** F-15 invocation-grant power-loss accounting, salvage/diagnostics, parser/admission/service
negatives, performance/maintenance, lock ordering and accepted review follow-ups remain. Passkey and
workspace signing IDs are distinct namespaces. General lineage advancement, successor/checkpoint
baselines, concurrent members, pruning/backlog scale, enrollment/device management, revocation/rotation,
clear/delete, finalization/recovery, supported platforms, whole-profile residue, production deployment/
restore and independent review remain separate. Client/service histories must be unrewound and unbranched;
fresh-salt/sender constructions also require nonrepeating randomness. L-2's historical clean ref `d24732b`
has no further service work to integrate.

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
