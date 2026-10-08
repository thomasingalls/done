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

## Product integration: device lifecycle (`L-1`)

```yaml
gate: L-1
seat: /Users/thomasingalls/.codex/worktrees/c030/done
branch: codex/encrypted-store-contract-corrections
status: in flight
scope: durable continuation comparison complete; invitation and enrollment routing next
blocks_on: none
release_validation: paused by operator
updated: 2026-10-08
```

**Live baseline:** origin `https://mbp.tail0e0d4.ts.net:8443/`, app/proxy 53219, API 53220,
frontend `a07de792`, schema 14 and original service pin. The session/notification cutover is recorded
in [the runbook](./packaged-account-development.md#live-notification-cutover--2026-10-08).
Backup: `.dev/account-enrollment-tailnet/backups/notifications-a07de792-2FMkcz`.
No subsequent lifecycle work has been deployed. Obtain a new quiet point before restarting the retained
installation; the operator was told it could reopen after the previous cutover.

**Active:** [device lifecycle plan](./account-device-lifecycle.md). Devices and owner-preserving
navigation are implemented (`eb8c02c0`). The operator approved one unfinished connection at a time,
Resume/Cancel before another invitation, and the existing comparison ceremony. Cancel applies before
comparison approval; afterward, or when key exposure is uncertain, Remove requires forward rotation
and must explain that existing copies cannot be erased. Competing epochs restart the comparison.

The private schema-17 implementation now retains version-2 preparation, continuation admission,
commitment/reveal/approval, key delivery and candidate installation. Both existing publishers can keep
writing across admission/certification, and a newly certified publisher gets its actual entry epoch.
Exact accepted cuts and refused-parent evidence survive retries/restart. Key checkpoints:
`2fce72f1` (publisher history), `b48b25d1` (service ledger composition), `24706589` (scoped grants).

Current-head bootstrap/discovery now carries the bounded complete signed chain, with request/pin
binding, held-head ancestry and reader eligibility. It preserves the requesting publisher's ledger
interlock and final network/lifetime checks. 92 affected Node cases and type/lint/format/build/budget/
origin checks pass. All phase evidence is recorded in [completed.md](./completed.md).
Locator checkpoint is `b34440d1`. Opt-in HTTP routes and browser transport bindings now compose these
private methods; 59 affected session/notification/HTTP checks and build checks pass. Default and retained
hosts keep the routes disabled. The current product still supports only its first two devices.

HTTP composition is committed as `b9a149e2`. The continuation client key-handoff coordinator now
re-reads committed state before key-bearing sends and checks the installed seal before countersigning.
Native slot composition now preserves prior ceremony progress and binds joined approval writes to
custody atomically. 18 focused membership checks and one real packaged browser case pass, including
interrupted saves, cold reopening, equal installed keys and continued two-way writing. The new-device
product walkthrough is still required.

Native custody is committed as `fe4c2893`. Continuation admission now requires the original catch-up
checkpoint before advancing authority. A current certified member can fetch it through a distinct
read-only version-2 route; pending candidates cannot. 73 affected Node checks and build checks pass.
Historical access is committed as `fc3be561`. The browser reader now verifies all publisher prefixes
and retains its own semantic baseline admission under the current certified head. 71 affected checks
pass, including real encrypted Yjs replay through cross-publisher dependencies and interrupted saves.
Replay is committed as `12e0269c`. Native joined-device record version 2 now activates that state
through the existing restartable content/index handoff. 61 affected checks, the new native interruption
case, and the existing packaged two-device reopening/sync check pass. Native activation is committed
as `1f615fdf`. Current membership now has a separate authenticated carrier with exact local ledger
cuts; existing owners verify all retained evidence before committing and changing routes. Focused
native before/after-commit recovery, old-owner and packaged two-device checks pass. Version-2 discovery
is opt-in for the continuation host; the retained/default epoch-3 host is unchanged. Adoption is
committed as `43759e0e`. The durable version-2 comparison component now composes with the actual private
relay and key-handoff coordinator for either approver, including a lost approval reply and service
restart. 13 focused Node cases and two service integrations pass; product routing remains unwired.

**Next:** version-2 invitation/preparation routing, product ceremony and editor composition, including a real three-device check of
original/joined authority adoption and delivery;
then complete membership cancellation/removal with forward rotation/finalization, repeated later
connections and lost-device recovery. A removal control must not claim completion without the committed
transition. Checkpoint/pruning and operational deployment/restore follow lifecycle work.

**Authorization:** continue directly, with unsigned intermediate commits and end-of-phase chat summaries;
one signed checkpoint at the end of the agreed sequence. Consult the operator on product decisions.
Release validation remains paused.

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
