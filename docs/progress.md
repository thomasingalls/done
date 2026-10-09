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

## Product work: first-publication preparation (`L-1`)

```yaml
gate: L-1
seat: /Users/thomasingalls/.codex/worktrees/c030/done
branch: codex/first-public-deployment
status: in flight
scope: public runtime, explicit initialization and ARM64 container packaging complete; backups next
blocks_on: none
release_validation: paused by operator until after publication and explicit resumption
updated: 2026-10-09
```

The retained installation serves build `95433108`, account schema 26, at
`https://mbp.tail0e0d4.ts.net:8443/`. The graceful offline upgrade preserved the existing database
rows and service identity; backup, build and actual-origin health evidence are recorded in
[the history checkpoint](./account-history-management.md) and [completed.md](./completed.md).
Current launch commands are in [packaged development](./packaged-account-development.md).

**Product position:**

- Everyday application: packaged offline use, cached upgrades, account creation/chooser, two-way
  delivery, remembered sessions and streaming notifications are implemented.
- Device/account lifecycle: repeatable connections, other-device removal with rotation, replacement
  devices and lost-device recovery with a retained passkey plus recovery code are implemented.
- History: manual checkpoint creation/admission, authenticated receive cuts, handoff/recovery readers
  and pruning that retains two admitted snapshots with their required suffixes are implemented and
  deployed. No maintenance was run against personal writing during this upgrade.
- Operations: the public origin/configuration, explicit initialization, exclusive state ownership
  and ARM64 container are implemented. The actual running installation remains the retained
  worktree's loopback/Tailscale host. Off-host backups/restore, maintenance commands, infrastructure
  manifests and publication remain ahead under the agreed plan.

The operator selected a fresh public installation at `done.oxidationlabs.com` through `~/Code/ol-infra`;
no Tailscale account migration is required. Kubernetes/Flux, cert-manager and SOPS follow that repo.
Agreed backups: consistent SQLite snapshots without Litestream, encrypted before B2 upload, targeting
30 seconds while changed with no overlap; recent copies for five minutes, hourly for six hours, daily
for seven days. Brief sync outages are accepted. Updates, schema migrations and restores have distinct
procedures. See [the recorded plan](./public-deployment.md) for sequence and remaining environment inputs.

PR #41 is merged as `8c6005f3`, preserving all 398 signed PR commits as ancestors of main and exactly
the PR head's tree. The operator selected merge-only integration, disabling linear history while
retaining required PRs and signatures. The [signing record and crosswalk](./commit-history/README.md)
preserve the 103 rewritten identities and original evidence. Local main and the deployment branch
were fast-forwarded to the verified merge. The proposed squash-related validation adaptation is
obsolete; the existing ancestry model is retained. Automatic application-build CI passed on the PR;
the full check stayed skipped. Public runtime/initialization and container work is committed on
`codex/first-public-deployment`. Registry/B2 credentials can wait for publication; public activation
remains a separate step.

The [public runtime](./public-runtime.md) now separates explicit initialization, session-enabled API
and packaged app serving. Ordinary startup refuses absent/incompatible state; a stable SQLite ownership
transaction excludes competing processes and releases after death. Fourteen focused public/gateway
checks pass on local Node 26 and in the Node 24.18.0 ARM64 build. The two-container smoke verifies
non-root/read-only execution, explicit initialization, missing-state refusal, competing-owner refusal,
exact-origin API behavior, 34 packaged precache assets and restart durability. Signed commits
`44784d11`, `c0d36c7a` and `0485c12a` record repository reconciliation, runtime and packaging. The local
image built from exact signed source `0485c12a` passed the checks; its
[source/image evidence and build log](./development-evidence/2026-10-09-public-runtime-container.json)
are retained. Next phase: isolated consistent snapshots, encryption, B2 upload, scheduling/retention
and health reporting. No retained installation or infrastructure resource has changed; no image has
been published.

**Deferred/limited:** personal history walkthrough; automatic maintenance; local ledger/root trimming;
key retirement; account-access recovery when the passkey is also lost; recovery-code replacement;
self/last-device removal. The 4 MiB activation/recovery/native-admission bounds remain. These require
explicit scope decisions rather than being implied complete by the history work. The local backup
protects this upgrade but is not an off-host backup/restore service.

The operator directed that release validation stay paused until after a version is published; do not
resume it without further direction. Future PR/deployment commits must be signed; if signing is
unavailable, leave completed work staged and pause.

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
