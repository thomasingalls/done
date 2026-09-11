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

## Active slice: Local promotion authentication and deterministic identities (`L-1`)

```yaml
gate: L-1
seat: /Users/thomasingalls/.codex/worktrees/c030/done
branch: codex/encrypted-store-contract-corrections
status: not started
blocks_on: versioned promotion MAC/digest byte agreement before real Account authority
debts: consult docs/review/remediation/debts.json
updated: 2026-09-11
```

**Roadmap position.** Personal Local cutover, source cleanup and packaged offline upgrades are exercised.
Account work is at [Stage 4 §3.5](./sequencing.md#35-stage-4--the-service), around item 5's internal
creating-member ciphertext round trip. Composition is `6398e33`, descriptor bounds/versioning `4f71bac`,
fresh activation `2ba50aa`, crypto prep `9cf5c98`, first-authority A `43b42b1`, and recovery B `e74fbaa`.
Group C transport is staged, uncommitted. D1 service custody is complete, unstaged. No real Account receipt
exists; this is not Stage 4 completion or second-device enrollment.

**Staging boundary.** The user's requested distinction is preserved: 114 group C files are staged,
including evidence/checkpoint. D1 changes to shared files are unstaged on top. The exact staged patch
hash is retained in [D1 evidence](./account-conformance-runs/2026-09-11-account-service-custody/staged-transport-boundary.json).
Do not restage D1 or commit either phase without the next user instruction. Unrelated root files remain
outside both phases.

**Completed boundary.** [D1 service custody](./account-crypto/service-custody.md) pins the current root
and acceptance key schedules, AAD, seals and provider key formats. Both creators now assert exact
Ed25519 PKCS#8/SPKI exports. Acceptance creation checks close before generating a key and clears its
export if public-key extraction, random draws or derivation fail. Focused failures reproduced before
repair. Valid persisted bytes, signatures and versions remain unchanged.

[Final evidence](./account-conformance-runs/2026-09-11-account-service-custody.md): all 39 stages pass,
with 771 matching input pins. Eight fixed cases, 39 substitutions/24 omissions, 19 AEAD refusals,
16 export mutations, eight production guard controls and 200 shrinking-enabled cold-open histories pass.
All 14 authority regressions (160 generated/40 native histories, SIGKILL/competing setup), 69 service/
transport/inbound tests, 983 units, typecheck, retained A/B/C contracts and all 23 vector commands pass.
The map joins 51 specified records, six open and one exclusion through 52 entries/59 chains. F-05/F-06
remain open. Memory cleanup is a claim about owned buffers, not provider/GC erasure or host restore safety.

**Next bounded phase — D2: local promotion authentication and identities.** Continue
[group D](./account-crypto-prep.md#4-ordered-implementation-groups-and-acceptance-gates) with only
`remaining-local-promotion`:

- Read the actual v1–v9 promotion payloads and parsers, their MAC-key derivation, authenticated fields,
  carrier ordering/canonicalization, source/slot/custody identities and deterministic lineage/attempt hashes.
  Separate historical compatibility from the current writer. Do not infer new authority from a valid MAC.
- Specify exact bytes and fill fixed-vector gaps with independent reconstruction against actual encoders,
  parsers and authentication owners. Exercise every version/field, nested arrays and signatures, genuine
  correctly authenticated semantic lies, property-order rules and effective omission controls.
- Register exact source/map/vector joins without silently closing capsules, counter witnesses, startup
  or all Local work. Retain A/B/C/D1 evidence and fix runtime only where a reproduced defect or explicit
  contract correction warrants it. Keep this phase unstaged relative to the user's chosen boundary.
- Run affected regressions, preserve final evidence and append the outcome before replacing L-1.
  This phase does not authorize real provisioning, onboarding UI or deployment.

Later D slices own encrypted Account capsules/spool/inbound/delivery, counter-v2 witness coupling,
inherited custody/store/journal bridges and checkpoint/startup qualification. Migration-only scope needs
an explicit disposition, not a silent claim of whole-Local requalification. The actual old second device
will adopt the first workspace with fresh custody/store/counters/credentials; it will not import or merge
its old writing. Recovery byte conformance is not a built total-loss machine.

**Personal checkpoint.** Root `dist/` and `.dev/releases/17d87c2/app` retain all 21 saved hashes.
Personal preview/relay, browser/factors, origin/routing, historical review and L-2 are unchanged. Native
bundles were built in memory. Host VM/policy research stays stopped. No real Account, factor, operator
key or pin was provisioned. Unrelated root files `done ` and `reviewpacket96a20401ceb88d.md` remain untouched.

**Other gates.** Invocation-grant power-loss accounting, salvage/diagnostics, parser/admission/service
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
