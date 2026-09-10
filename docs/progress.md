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

## Active slice: Stage 1 — corrected encrypted-store implementation (`L-1`)

```yaml
gate: L-1
seat: /Users/thomasingalls/.codex/worktrees/c030/done
branch: codex/encrypted-store-contract-corrections
status: in flight # first account core complete; recovery/finalization next
plan: [sequencing.md §3.5, action-tree.md L-1, account-sync-prep.md, account-core.md]
prerequisites: corrected SC-01–09; historical S0-10 closure covers represented cases only
debts: consult docs/review/remediation/debts.json # component evidence does not pay whole obligations
updated: 2026-09-10
```

**Personal checkpoint.** Signed `187b636` records the completed `17d87c2` application handoff, exact-package
runner and account/sync prep. The author confirms a new edit survived lock, full close, normal reopen and
unlock, with the version unchanged. The preview is stopped at their request while account work proceeds;
relay remains off. The verified release stays in `.dev/releases/17d87c2/app`, the predecessor `dist/`
is intact, and the origin/Tailscale route are unchanged. Build and server remain in this worktree/Codex
session by request. The author controls their browser and retains the device code and external backups.

**First account core complete.** The [contract](./account-core.md) describes the private service boundary:
service-owned, purpose-bound, single-use challenges; attested-key staging and separate proof of possession;
discoverable sign-in against active fixture accounts; SQLite WAL/FULL progress and result commits; current
state/expiry/key checks after asynchronous verification; restart-safe retry lookup and typed refusals.
Accounts created here stay pending. Results confer no session, relay, admission or content authority.
The loopback adapter is not mounted in the app or relay. No personal account, passkey or content operation
occurred. The server-side WebAuthn dependency is pinned to the reviewed, age-policy-eligible 14.0.0 release.

[Preserved evidence](./account-conformance-runs/2026-09-10-account-core.md): all 30 campaign tests pass,
including a repaired competing-process confirmation race, 240 generated histories, ten real SIGKILL/reopen
cases, native virtual-authenticator ceremonies,
HTTP boundary tests and three observed acceptance controls. All 825 existing unit tests, TypeScript,
focused static checks and the isolated production build pass; the app remains within 327.2 kB of the
350 kB budget, and origin isolation passes. The full check chain was not run; no debt/matrix status changed.

**Next bounded phase.** Recovery sealing, saved-code confirmation and restart-owned account finalization,
following [the prep](./account-sync-prep.md). This must preserve the distinction between the existing
mandatory device-lock code, account passkey and newly generated content-recovery code. Local promotion,
the first authority/binding issuer and its trusted key bootstrap follow with an authenticated connection
to the confirmed recovery result. The core's immutable proof receipts are historical evidence, not current
bearer grants. No ordinary account activation or application enrollment is exposed yet.

The clean historical L-2 worktree/ref was reconciled at `d24732b`: its slot verifier/tests already match
this branch and it contains no further account service to integrate. L-2's historical checkpoint remains
untouched. The author's selected path is promotion of the writing here, then adoption on the actual second
pre-encryption device with fresh custody/credentials and no import/merge of that device's old writing.
Its cleanup remains separate.

**Remaining gates.** Recovery/promotion, signed binding issuance, encrypted relay/durable storage,
two-gate enrollment, revocation/rotation/finalization, complete product conformance, whole-profile residue,
platform coverage and independent review remain open. Before any incompatible persisted-format change,
its concrete owner needs authenticated intent, exclusion (including pre-interlock builds), restart and
recovery/rollback rules. The host VM is stopped; automatic host/policy research is not next-up. This
outcome was appended to completed.md before this rewrite. L-2 below is unchanged.

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
