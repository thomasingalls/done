# Automatic service history — phase126, 2026-10-27

Status: **experimental implementation, default off**. `VITE_ACCOUNT_HISTORY_AUTO=1` opts a build
into this separate policy. Automatic local reduction does not enable it. No release configuration,
preview or production change is made here. [Resumable preparation](account-local-retention-resumption-design.md)
is a design; it has not solved the activation blockers below.

## Owner and policy

The composed, scoped-access Account owner schedules the existing serial `history` commands.
Development bearers, detached accounts and receive-only owners cannot acquire the capability.
The same durability/handoff and pending-promotion fences, fresh authority/custody checks,
reserved sealing invocations, exact retained attempts, independent cold replay and authenticated
responses remain. No new stored format, server endpoint or cryptographic permission is added.

An unlocked, visible, online, active/durable owner waits for ten seconds of input quiet and quiet
foreground send/receive lanes. It does not overlap manual history work or automatic local
reduction. A turn contains an inspection and at most three existing actions, rechecking readiness,
activity and newer control evidence before each. One in-flight command still owns its native task
until it settles; the scheduler cannot cancel or shorten that command by declaring it idle.

Inspect once after opening even with no new local growth, so a peer proposal can be discovered.
Resume saved publication/admission/discard intent through the existing owner. Independently verify
peer proposals. Keep a producer waiting for another device parked, and leave stale work for explicit
resolution. Never automatically discard a proposal or substitute the producer for an independent
admitting device. The existing single-member self-admission rule remains separate.

Create after **1,024 observed physical-record growth**, with at least **one hour between creations
within this owner lifetime**. These are conservative starting choices, not measured optima or a
durable cross-device quota. Growth is accumulated from already successful ledger-validation hints;
a local baseline cut must not erase growth already observed. Custody refresh invalidates the live
hint during history inspection. The policy retains numeric scheduling debt across that refresh,
then invokes a newly verified owner command. It retains no proof, keys, writing or authority from
the hint. A newly opened already-reduced account with no subsequent observed growth may not create
a snapshot immediately; inspection still discovers peer work. Persisting a global cadence or
measuring growth from service frontiers is separate work.

Only two or more snapshots schedule a prune command. That command still independently reads and
verifies **two unchanged admitted snapshots** and their parent relationship before requesting the
exact covered cut. Remember a successful pruned sequence within this owner to avoid redundant
unchanged pruning. A scheduling sequence, notification or local baseline cannot authorize pruning.

There is no new periodic catalog poll. Use the existing authenticated subscription's control and
ready hints, normal reopening, reachability/login changes and validated workspace/readiness events.
Content-only notifications do not request a new catalog inspection. Waiting/stale results park
until a meaningful control hint. A connection failure requires a new event and a minimum one-minute
retry delay, escalating to sixteen minutes; hints never erase that failure clock. Unclassified,
integrity, malformed-result or uncertain owner failures halt this policy for the owner lifetime.
Closing/locking disposes the timer, listeners and presentation port; late results cannot revive it.

The optional `devices.automaticHistory` port exposes frozen phase/reason and numeric/history-status
copies only. It is not a new permission or a public activation UI. Observer failures are isolated.
The existing explicit history controls and refusal behavior remain available.

## Activation blockers

1. Native `create`/`verify` still perform potentially long cold preparation in the storage tail.
   Quiet at entry does not guarantee responsiveness after input arrives. Do not enable unattended
   production work until preparation can pause/release ownership and preserve verified work across
   short unlocked sessions, or equivalent evidence establishes a safe bound.
2. A saved proposal awaiting another device currently pins local retirement. Reconciliation after
   independent admission clears that pin through the existing exact saved attempt. With an offline
   peer the wait can be long. Do not silently remove the pin, auto-discard manual work or weaken
   admission; an earlier cut's source/reopen dependencies need their own proof and regression slice.
3. The unchanged **2.5s peer p95 gate**, typing, catch-up competing with editing and phone short-session
   bounds still apply before activation. Tiny correctness journeys do not establish those budgets.
   No new whole-client performance acceptance or phone speedup is claimed here.

## Evidence

[Phase126 packet](performance-experiments/2026-10-27-maintenance-continuation/phase126/README.md)
retains deterministic policy cases, deliberate-fault controls, actual scoped/native browser flows,
failed attempts and ordinary source/inventory checks. The initial older bearer fixture is retained
as a rejected test apparatus; granting it history access was not the repair. General qualification
and release preparation remain paused. Nothing is signed, pushed or deployed by this phase.
