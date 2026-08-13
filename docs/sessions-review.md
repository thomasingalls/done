# Review — `docs/sessions.md` draft v12

**Reviewer:** Claude (agent session)
**Date:** 2026-08-13
**Subject:** `docs/sessions.md` draft v12, all 27 dispositions recorded
**Method:** full read; every claim the document makes about this repository checked against the
source; cross-read against `docs/PRD.md` v8 and `docs/TRD.md`.

This is a review artifact, not a specification. It records what should change and why; `sessions.md`
draft v13 is where the decisions live.

---

## 0. Disposition

The author's answers, recorded so this document does not sit in the repository advocating positions
that have already been settled. Everything accepted is in `sessions.md` v13.

| Finding                                     | Disposition                                                                                              |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| §2.1 Cost inversion in D-16                | **Accepted** as a finding; D-16 stays deferred. The third option and the inversion are now recorded in it |
| §2.1 "No server" imprecision               | **Accepted, with a correction to the correction** — see below. Fixed everywhere in §5.1.1                |
| §2.2 Rung 2 usability                      | **Accepted** as a test to run before rung 2 is treated as a tier                                         |
| §2.3 Agents get the whole document         | **Accepted as a mention**, not a treatment. It is a future maybe and belongs to the agent document       |
| §2.4 D-28, the protocol carrier            | **Accepted, fully.** Now a tracked decision, §5.8.1                                                     |
| §2.5 Billing lifecycle                     | **Accepted and decided**: grace period, then read-only. D-29                                            |
| §3.1 D-2's "never"                         | **Accepted**; the fix is applied as written                                                             |
| §3.2 State space                           | **Accepted**; §3 rebuilt on principal × device × epoch                                                  |
| §3.3 D-25's warning never clearing         | **Accepted**; context durability and tier durability are now separate                                   |
| §3.4 D-6 staleness scope                   | **Accepted**                                                                                             |
| §3.5 D-8 dedup dependency                  | **Accepted**                                                                                             |
| §3.6 Export before discarding              | **Noted, deliberately not acted on.** A nit; D-26's text is unchanged                                    |
| §4 `crypto.subtle.sign` precision          | **Accepted**; sentence trimmed                                                                           |
| §4 TRD §10.6                               | **Accepted**; added to §9's amendment list                                                              |
| §5 Legal and operational surface           | **Deferred deliberately**, and now says so in §10 — important, but not while it would dictate the tech  |
| §5 Today's deployment                      | **Accepted**; §2.4 now records the installation, the export → import plan, and the versioning gap       |
| §5 Rule 1's third exception                | **Accepted**; opened as D-30 rather than answered                                                       |
| §5 Awareness leakage                       | **Accepted**; its own row in §8.1                                                                       |
| §7 Split the document now                  | **Declined for now.** Revisions land first; a split is considered afterwards                            |

**Two corrections to this review, from the author and from the code.**

1. **"No server" was never meant to mean "no coordination server."** The intent behind rung 2 was to
   avoid *metered relay bandwidth wherever technically possible* — not to avoid servers, which would be
   incoherent in an app served over the web. §2.2's factual point stands and the language was worth
   fixing, but the review read an architectural error into what was shorthand. `sessions.md` §5.1.1 now
   states the precise version and bans the loose one.

2. **The freeze does not block merges, and §3.6 overstated.** `writable()` gates the app's own write
   paths; replication is not among them — remote updates arrive through `Y.applyUpdate` and never
   consult `isFrozen`, so a frozen day merges normally today. What the review found is narrower and
   more useful: *import* does not exist yet, and if it is built on the app-level side of that line, the
   author's export-dev → import-prod migration plan silently drops every day older than three. That is
   in `sessions.md` §2.4 and §6.

---

## 1. Verdict

The document is in better shape than its own §8.2 admits, and its remaining problems are not the
ones it is watching.

**Every factual claim it makes about this codebase is correct.** That is unusual and it matters,
because the document's persuasive weight rests on the parts nobody can check — the crypto, the
protocol, the cost model — and the parts that _can_ be checked are the evidence for taking those
seriously. §4 below records the audit, including two places where the reasoning is looser than
the conclusion.

The problems worth spending on are these, in order:

1. **The free/paid boundary in D-16 is already wrong, and three other decisions have been built
   on top of it.** The relay in `relay/` already delivers the capability D-16 nominates as the
   paid tier. The free tier as drawn requires building a second, harder transport whose defining
   property is that it is worse. §2.1.
2. **Rung 2 is probably not a usable product**, and its stated technical premise — no server in
   the path — is not true. §2.2.
3. **"Edit implies read" plus agent membership is a privacy statement the document never makes.**
   For a document whose subject is responsibly serving real users, this is the most conspicuous
   silence in it. §2.3.
4. **The state space (§3, §4.1–4.6) predates the ontology (§1.1) and was never re-derived**, so
   it still describes a hole that D-4 says does not exist and omits the axis D-12 makes decisive.
   §3.2.
5. **D-2's central rule is contradicted three times by the document's own later decisions.** §3.1.

And one process finding: **§8.2's "not ready to promote" is too coarse.** Roughly half the
register is single-principal product work, blocked by nothing, describing defects that are
shipping right now. Holding it behind a security contract that needs professional review is a
sequencing error, not caution. §7.

---

## 2. Findings that should change a recorded decision

### 2.1 The relay you already have is the paid tier

D-16 nominates the billing boundary: **server-intermediated sync — "getting updates without
needing another of your devices online at the same time."** Free is "direct device-to-device
while both are online."

`relay/src/server.ts:1-10` states the relay's purpose in its own words:

> this process exists because two devices that are never online at the same time still have to
> exchange bytes.

And `relay/src/persistence.ts:8-13`:

> The relay's job is to hold what one device sent until the other connects […] Without a file, a
> restart in that window means the phone's morning edits wait for the phone to come back before
> the laptop can see them.

So the paid capability is built, running, four dependencies, no native code, and its unit cost is
a small file per room plus a socket. Whereas the free tier requires, from nothing:

- a WebRTC transport (§2.2 — plus signalling, STUN, and TURN for the 10–20% D-16 already counts);
- a second connection-establishment path;
- a second set of failure modes, on the case most likely to fail (phone-to-phone across carriers);
- and, per D-26, **a second revocation semantics** — "sanction and discard" exists only because
  free sync is peer-to-peer.

That inverts the usual shape. The free tier is not the cheap version of the paid one; it is a
more complex thing built specifically to be less useful, and every line of it is a line the paid
tier does not need. D-16 counts TURN bandwidth as "the cost risk." The larger cost is two
transports maintained forever, and it is not counted anywhere.

**The coupling is the real problem.** §5.1.1 says pricing is undecided — "Pricing could sit
elsewhere […] and nothing in this document should be read as having decided it." But D-16's
table, D-19's ladder, D-26's per-tier answers and §5.7.7's collapse analysis all assume free = P2P
and paid = server. D-26 in particular is *entirely* a consequence of that boundary: the whole
sanctioned-lineage design exists to handle a divergence that only forms without a server in the
path. So the document says the boundary is open while four decisions have already been shaped
around one position.

**What to do.** Add the option D-16 never lists: **server-intermediated sync for everyone, with
the paid boundary somewhere else** — retention depth, workspace count, agent members, or simply
"pay if you want it hosted." That option ships what exists, deletes D-26's free-tier branch
entirely, deletes the TURN cost question, deletes the two-transport maintenance burden, and
leaves the ladder's rungs intact as _capability_ rungs (local → paired → account) without
attaching a transport to each. It costs the "free cross-device sync" story. That is a real cost
and it may be the wrong trade — but it is not currently on the table, and it should be, because
the version on the table is the expensive one.

### 2.2 Rung 2's premise is not true, and rung 2 may not be a product

Two problems, one factual and one about use.

**Factual.** §5.1.1 describes rung 2 as "no account, no server in the sync path," and D-26 calls
the free tier "the tier whose defining property is that there is no server in the path." A
browser cannot do peer-to-peer without a signalling server: SDP offers, answers and ICE
candidates need an always-on rendezvous point, and under this design that same server is where
pairing and authorization traffic would land too. So rung 2 has a mandatory server; what it lacks
is a server that _relays content_. That distinction is worth stating precisely, because D-14's
first half — may the relay decide who connects — arrives at rung 2 as well, and the document
currently reads as though it does not.

**About use.** Rung 2 syncs only while both devices are awake and connected simultaneously. The
motivating device pair is a phone and a laptop; the motivating workflow is typing into Done
throughout the day. A phone in a pocket has a suspended PWA and no background WebRTC. So the
realistic rung-2 experience is: edits do not appear on the laptop until you deliberately open the
app on both devices at once and wait. D-19 already records that rung 2 "buys convenience"; the
convenience it buys over rung 1 is real but thin, and D-16's plan — "build free/direct sync and
paid/server-intermediated sync first, then measure" — will measure adoption of something that may
be too awkward to adopt. That is not evidence about pricing.

**What to do.** Before rung 2 is treated as the free tier, establish that it is a usable product
at all: the test is whether a week of ordinary phone-and-laptop use converges without the user
consciously performing a sync. If it does not, rung 2 is a pairing *mechanism* (which D-19 still
needs, for the accountless trust root) rather than a *tier*, and D-16's boundary has to move
anyway — which is §2.1's conclusion arrived at from the other side.

### 2.3 Edit implies read, so every agent gets the whole document

§5.7.2 establishes, correctly, that under D-20's single symmetric content key an edit-capable
member must hold the key, and holding the key is read access: "the agent feature may offer read
and read+edit; it must not promise cryptographic write-only isolation."

The product consequence is never stated. Agents are the reason membership attaches to a principal
or agent rather than to an account (§1.1); agent authoring assistance is PRD Phase 6. So
connecting one means handing your complete task list — every day, the whole master list, all
history — in plaintext to whatever process runs that agent, and in the ordinary case that is a
third-party model provider. Meanwhile D-20 records as a consequence that "server-side anything
that reads content becomes impossible, permanently and by construction," and adds, "That is
probably a feature."

Those two facts sit four pages apart and are in tension. The relay is blinded by construction;
the agent is not, and the agent is the thing that ships later with a marketing page. A document
about responsibly offering this to real users should say so plainly, in D-20 or in §9's PRD
amendment for §11.4:

> Content encryption blinds the relay. It does not blind an agent member: under one symmetric
> document key, edit implies read, so an agent granted edit holds the plaintext of the entire
> workspace and so does whatever service executes it. Granting agent membership is disclosure of
> the whole document, and the interface must say that at the moment of granting.

There is a design response available if that is unacceptable — the proposal/approval shape §5.7.2
already sketches, where the agent signs a proposal a read-capable device validates and encrypts —
and the document correctly notes it means the agent cannot work while your device is offline.
Either answer is fine. The silence is not.

### 2.4 D-20, D-27 and the epoch force a CRDT question that is not tracked as a decision

§5.8 is accurate: Keyhive and `@localfirst/auth` are the serious prior art, both are
Automerge-adjacent, "nothing equivalent exists behind this app's seam," and therefore a real
authorization story is "bespoke, server-side, or a reason to re-examine the CRDT choice."

That was a fair thing to record as an implication when D-20 and D-27 were open. They are now
**Decided**, and so is the signed authorization epoch (§8.1 lists it as a fixed requirement).
Which means the choice is no longer hypothetical: this app has committed to building a signed
delegation chain, per-credential key wrapping, epoch commitment and signed mutation envelopes on
a stack that supplies none of them, against the grain of a library ecosystem where the work is
happening elsewhere. That is the largest engineering risk in the document by a wide margin, and
it is recorded as an "implication, none of which is a decision."

TRD §10.1 already treats a Yjs v13 → v14 migration as planned debt, which is sometimes read as
covering this. It does not: v14 does not bring an authorization layer.

**What to do.** Promote it to a tracked decision — call it D-28, "what carries the authorization
protocol" — with the options being *bespoke on Yjs*, *adopt the Automerge stack and pay the
migration*, *server-enforced (D-14's full "yes") with a thinner client protocol*, and *reduce the
promise* (drop D-27 to advisory, keep D-20). Give it a trigger rather than a date: the decision
is forced the moment §8.1's contract is drafted, because the contract cannot be written without
knowing what implements it.

### 2.5 The billing lifecycle is missing, and at rung 3 it is a security event

§4.7 enumerates ladder transitions and §4.8 enumerates security and recovery. Neither contains a
row for **the account lapsing** — payment failure, expiry, voluntary downgrade, suspension.

That is not a billing detail here, because of §5.7.2's constraint: at rung 3 the account is the
**only** authorization root, and D-24-in-reverse (S36) says "deleting an account means
re-introducing your devices," so demotion from rung 3 to rung 2 costs the pairings. Compose those
two and a failed credit card is an event that severs a user's devices from each other and
requires them to re-pair every device — with both present, per D-19 — or lose the group.

The doc's other promotion path got careful treatment precisely because "promotion paths are where
local-first products lose data" (D-24). Demotion driven by a billing event is the same hazard with
worse timing: it happens to people who are not paying attention, by definition.

**What to do.** Add S51–S53 (subscription lapses with devices online; lapses with a device
offline; deliberate downgrade) and answer, in D-24 or a new decision: does a lapse retire the
account root, or does the account root persist read-only while billing is delinquent? A grace
period during which the authorization root stays valid and only server sync stops is the obvious
humane answer and it needs to be a recorded decision, because the alternative falls out of an
ordinary implementation.

---

## 3. Internal contradictions

Concrete, small, and each fixable in a paragraph.

### 3.1 D-2's rule is contradicted three times by this document

D-2 decides: "the device is never disclosed to anyone else and never reflected back at you." Then:

- **§1.3** assigns "last synced from ⟨x⟩" to the device level, and §7's worked example keeps it:
  "'Last synced from phone' may still name the device." That is the device reflected back at you.
- **D-22** decides merged content shows provenance, explicitly answering "which of my devices put
  this here." That is the device reflected back at you, deliberately, as a feature.
- **D-18** decides devices are enumerable in a UI, and §1.4 calls that list the irreducible
  security surface. That is the device reflected back at you, unavoidably.

D-2 also says "the two live reasons to keep the device level at all" are telling carets apart and
session invalidation. There are at least four.

**Fix:** narrow D-2's claim to what it is actually protecting — *the device is never disclosed to
another principal, and never appears in the ordinary presentation of who is present or who wrote
something* — and list the three deliberate exceptions, since each of them is decided elsewhere in
the same document. "Never" is doing rhetorical work the decision cannot support.

### 3.2 The state space was never re-derived after the ontology changed

§3 and §4.1–4.6 are v1 material. §1.1's principal, D-4's ruling and D-12's epoch all arrived
later, and the enumeration was extended (§4.7, §4.8, honestly labelled as additions) rather than
rebuilt. Three consequences:

- **§3.2 cell C is described as "the hole."** D-4 decides that claiming an existing actor never
  happens; §5.2 then says the real question was discovery, not claiming, and makes it D-19. So
  the cell labelled "Rejoin — the same person on a second device, with the actor already in the
  document" describes a transition the document has ruled out. The actual cell C is "new actor,
  new device, **existing principal**" — pairing — and the matrix has no axis for the principal.
- **§3.1 says "the interesting space is actor × device."** After D-12 it is at least principal ×
  device × authorization epoch, because the epoch is what decides whether an arrival may silently
  re-mint. That is an arrival-time property and the arrival matrix does not show it.
- **S7, S29 and S30 are all listed as raising D-12**, but D-12's answer splits on epoch 0 versus
  epoch > 0, and none of those three rows says which they are. S7 (reinstall on a known device) is
  the interesting one precisely because it is either, depending on whether the device had ever
  been paired.

**Fix:** rebuild §3.2 on principal × device with the epoch as the third axis, and add the epoch
column to §4.1's table. It is an hour's work and it would have caught the next two findings.

### 3.3 D-25's warning never clears on the free tier

D-25 decides the app warns "prominently and persistently" when durability is not guaranteed, and
adds the right constraint: "A warning that can never be cleared is noise rather than information,
so the escape hatch matters." The escape hatch is granting storage persistence, or "the route to
server-side durability — which is the same funnel D-16 identifies as the paid capability."

But D-16's own table gives rung 2 a durability of "none — the group is it," and D-19 records that
rung 2 has no recovery story at all. So for every free user, durability is permanently not
guaranteed, the condition never clears, and the only escape hatch is payment. D-25's stated test
for noise is met by D-25's own output.

The two conditions are different in kind and the document treats them as one:

| Condition                                                        | Clears?                      | Honest treatment                        |
| ---------------------------------------------------------------- | ---------------------------- | --------------------------------------- |
| This browser context is not durable (`persisted()` false, S29/S30) | Yes — grant, or move context | Persistent warning; it is a real defect |
| This tier holds no server copy (rungs 1–2)                       | No — it is what the tier is  | Stated once, at pairing; not a banner   |

**Fix:** split them. The first is D-25 as written. The second is a property of the plan, belongs
in the pairing flow and the device list, and must not be a recurring banner — both because it is
noise and because a permanent unclearable warning whose only remedy is payment reads as a dark
pattern regardless of intent, which is exactly the thing a document about responsible service
should not ship by accident.

### 3.4 D-6's staleness belongs to D-18's screen, not D-2's lists

D-6 decides "a device not seen for some interval may be muted rather than removed." D-2 decides
every list shows one entry per **person**, with the device never surfaced. A person-level list has
nowhere to put a per-device staleness state: if three of your five devices are stale you are still
exactly one "You."

The resolution is already available in the document — §1.4 and D-18 identify one device screen
that serves three jobs — but D-6 is written as though it governs the roster and the peer list.

**Fix:** say that D-6 governs the device list (D-18) and the authorization roster, and that the
person-level surfaces D-2 governs have no staleness state because they have no device in them.

### 3.5 D-8's deduplicated peer list has the dependency D-21 spells out for colour

D-21 does this analysis well for carets: all of your carets share your colour, colour comes from
the actor, actors are per device, therefore "all of your carets" holds within one device only
until a principal exists, "deferred by dependency rather than by choice."

The identical argument applies to D-8's other half — "the peer list is deduplicated: it answers
whether someone is present, not how many times" — and is not made. Deduplicating requires knowing
which awareness states are the same *person*. Today `sync.ts:341-345` builds the peer list from
awareness device names, which is why it says `Mac, Mac`. Deduplicating by device id is available
now (`index.ts:161` publishes it) and fixes the two-tabs case; deduplicating by person is not
available until pairing, and two genuinely different Macs would collapse wrongly if you dedupe by
name.

**Fix:** one sentence in D-8 mirroring D-21's — dedupe by device id now, by principal after D-19,
never by name.

### 3.6 "Export before discarding" buys less than D-26 claims

D-26 offers export as the thing that "takes the sharpest edge off" discarding B's divergence:
"hand B's user a file of what was discarded, then discard it […] for roughly the cost of one
existing call."

The export half is right — `exportEntries` and `downloadExport` exist in `src/crdt/export.ts`.
The implied return path does not:

- **Import is specified but not implemented.** TRD §9 defines the format and the round-trip
  requirement; there is no import function in `src/`.
- **Even implemented, it could not restore most of what was discarded.** The freeze is permanent
  three days after a day's date (PRD §6, `src/crdt/freeze.ts:26-29`), and every collection write
  goes through `writable()` in `src/crdt/moves.ts:99`. A divergence older than the freeze window
  can never re-enter the days it came from, by design and with no escape hatch.

So the mitigation is an archive, not a restore: the user gets a markdown file of work that can
never go back into the app. That may still be the right call — it is much better than silent loss
— but D-26 should say what it is, because "turns irreversible loss into a file on disk" reads as
though the loss were reversible.

---

## 4. The code claims, checked

Every assertion `sessions.md` makes about this repository, verified. This is the part of the
document a reviewer can actually falsify, and it holds up.

| Claim                                                                | Where                            | Verdict                                                                  |
| -------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------ |
| `resolveActor` mints a fresh id and registers `{human, 'You', random}` | `src/crdt/actors.ts:142-179`     | Correct                                                                  |
| `ActorKind` is already `human \| agent \| system`                    | `actors.ts:20`                   | Correct                                                                  |
| `SYSTEM_ACTOR_ID = 'system'`, a constant                             | `actors.ts:48`                   | Correct                                                                  |
| Every `localStorage` access is wrapped and swallows its error        | `src/lib/localStore.ts:15-37`    | Correct, and deliberately documented as such                             |
| `DB_NAME` is `'done'`; nothing passes `dbName` outside tests         | `persistence.ts:17`, `index.ts:66,141` | Correct — only `test/sync.test.ts` and `test/store.test.ts` pass it |
| `RelayPolicy` is one shared token plus a room allowlist              | `relay/src/auth.ts:24-29`        | Correct; also `token: ''` means open, guarded by an env opt-in           |
| The token travels as a query parameter because `WebSocket` takes a URL | `relay/src/auth.ts:67-73`        | Correct, and the code says so in the same words                          |
| A stable random device id already exists in `done.device`            | `actors.ts:65-73`                | Correct — `newId()`, no device-derived material                          |
| `newCard` records `author`                                           | `src/crdt/days.ts:118-123`       | Correct                                                                  |
| `exportEntries` and `downloadExport` exist                           | `src/crdt/export.ts:25,75`       | Correct                                                                  |
| SW calls `skipWaiting()` on install, `clients.claim()` on activate   | `vite/precacheServiceWorker.ts:22-38` | Correct                                                             |
| Activate deletes the previous cache; fetch falls through to network  | same, `:31-53`                   | Correct — the "old tab, evicted chunk" residual case is real             |
| `useStore` calls `persisted()` on mount                              | `src/ui/useStore.ts:55-56`       | Correct                                                                  |
| The peer list counts awareness states and says `Mac, Mac`            | `src/crdt/sync.ts:341-345`       | Correct — filters only its own `clientID`, so its own second tab is a peer |
| The journal is a synchronous localStorage write-ahead log            | `src/crdt/persistence.ts:36-107` | Correct                                                                  |
| TRD §4.8's origin claim, corrected in this branch                    | `docs/TRD.md:347-354`            | Correct — the correction is present and accurate                         |
| `y-codemirror.next` renders remote carets as decorations             | `src/crdt/yjs.ts:18`, `createEditor.ts:87` | Correct                                                        |

**Two places where the reasoning is looser than the conclusion.**

1. **§5.6.2 on signing and the keystroke path.** "`crypto.subtle.sign` returns a promise, so it
   cannot run inside a synchronous input handler at all." It can be *called* there; what it cannot
   do is *complete* before the handler returns. The conclusion — signing cannot sit on the
   keystroke → paint path, and could not be put there by accident — is right, and the load-bearing
   argument for it is the one in the same paragraph: the trust boundary is where bytes leave the
   device. The promise sentence overstates and should be trimmed, in a document that has
   repeatedly earned credit by correcting exactly this kind of thing.

2. **TRD §10.6 is now wrong and is not in §9's amendment list.** It says permissions are
   unenforceable in this architecture and that "introducing real enforcement would mean giving the
   relay schema awareness and update validation, which forfeits the 'dumb pipe, no authority'
   property." D-20 disproves the second half outright: content encryption with key rotation
   excludes a member entirely client-side, and D-20 makes a point of it — "a relay forwarding
   ciphertext is exactly as dumb as one forwarding plaintext." §9 correctly lists PRD §11.4, which
   makes the same claim in product language, but its technical twin is left standing. Add it.

---

## 5. Gaps

Beyond the decision-level findings in §2:

- **No operational or legal surface, and no statement that its absence is deliberate.** §10 lists
  what is out of scope and it is all engineering. For a document whose purpose is "responsibly
  offer this to real users," the missing rows are: what the relay logs and for how long; deletion
  on request, and what deletion means when other devices hold replicas that cannot be reached;
  breach notification; jurisdiction and where ciphertext sits. Most of these are small under D-20
  — a service that cannot read content has a genuinely short privacy policy, which is a selling
  point worth harvesting — but "short because we thought about it" and "absent" look identical
  from outside. Note the instinct is already in the code: `relay/src/auth.ts:113-126` exists
  solely to keep the token out of access logs.

- **No decision about today's deployment.** The ladder starts at rung 1 (local, no sync). The
  author is not on it: two or more devices, sync configured by hand, shared bearer token, no
  principal, no epoch, an unencrypted document sitting in the relay's data directory. Every other
  transition in this document is treated as a data-loss hazard deserving a decision; the first one
  the project will actually perform — the existing document meeting the new trust root — is not
  enumerated. It is D-5-shaped and it is the one that happens first.

- **Rule 1 has a third exception nobody names.** D-5's "stop and ask, with a preview, and never
  merge without confirmation, plus merge · theirs · ours · abort" is the most demanding piece of
  workspace management in the product. It is well justified by irreversibility, and §1.4's
  corollary already concedes that security cannot be hidden — but the corollary is written about
  security surfaces only, and D-5 is not one. Either widen the corollary or say that Rule 1 governs
  *routine* management and yields to irreversibility.

- **The awareness leak is flagged and left.** D-20's third cost — presence carries names, colours
  and cursor positions in the clear, so the relay learns who is editing what and when — is
  correctly identified as needing "a deliberate answer rather than a default," and then does not
  get one, and is not in §8.1's contract table. It should be a row there: encrypt awareness, or
  state the metadata exposure in the threat boundary. Right now it is neither.

---

## 6. What to keep

Calibration, so the findings above are read at the right weight. These are the parts that should
survive any rewrite unchanged:

- **The self-correction discipline.** Withdrawing the roster test in D-12 rather than patching it,
  correcting the private-browsing mechanics, correcting `extractable: false`, correcting the
  "actor and device are one fact stored twice" claim, and fixing TRD §4.8 in the branch. A
  document that visibly retires its own arguments is one you can trust the rest of.
- **§5.7's decomposition of D-17.** Turning "research security" into six named selections, a
  threat table with an explicit *not promised* column, and ten acceptance tests is the correct
  shape for that gate and it is better than most production threat models.
- **Rule 1 and Rule 2.** Both are portable, both settle cases the document does not contain, and
  Rule 2 in particular ("never promise anything about a remote device that cannot be kept") is the
  rule most products in this category get wrong.
- **D-24 and the one-authorization-root constraint.** The account adopting a prior identity, and
  exactly one functional root at a time, are the two things an ordinary implementation gets wrong
  by default. Both are identified, and the reason each is dangerous is written down.
- **§5.4.1's capacity-versus-surface distinction.** "Building the 1:1 as an invariant would make
  human sharing a rewrite; revealing only the home workspace makes it a feature" is the single
  most valuable sentence in the document.
- **§1.1's principal.** The whole document turns on noticing that the grouping identity precedes
  the account, and that it must, because rung 2 groups devices without one.

---

## 7. Suggested next actions

In order, and the first one is the point.

1. **Split the document and promote half of it now.** §8.2 says "not ready to promote," and the
   reason given is entirely the security contract. But D-2, D-3, D-4, D-6, D-7, D-8, D-9, D-15,
   D-21, D-22 and D-25 are single-principal product work that depends on no gate, and several
   describe defects shipping today: the duplicate "You" per device (§2.2a), `Mac, Mac` in the peer
   list, silent identity reissue where storage is denied (§2.2d), and a durability warning that is
   honest and invisible at once (D-25). Those belong in the PRD this week. What stays behind is
   the service half — the ladder, D-14, D-16 through D-20, D-24, D-26, D-27 — which is genuinely
   gated on D-17 and now also on §2.1 and §2.4.
2. **Re-open D-16 with the option in §2.1 on the table**, before anything WebRTC-shaped is built.
   It is the cheapest decision to change now and the most expensive to change later.
3. **Answer §2.3 in one paragraph** and put it in D-20. It costs nothing and it is the promise a
   real user would most want made explicitly.
4. **Rebuild §3 on principal × device × epoch** (§3.2), which will also close §3.4 and §3.5.
5. **Add D-28** (§2.4) and the billing-lifecycle scenarios (§2.5). Neither needs an answer yet;
   both need to be visible in the register rather than living inside a prose implication.
6. **Then** commission the security review §5.7.8 asks for. Its scope is much clearer than it was
   two drafts ago, and D-28's answer changes what is being reviewed — so it is worth having before
   the reviewer starts, not after.
