# Encrypted-store boundary contract

**Status:** current and normative · **Decided:** 2026-09-08 · **Baseline corrected:** `af8941e`.
This is the detailed storage boundary shared by PRD §§7.1–7.2/7.10 and TRD §§6.1/6.5/13.3/13.7.
The rationale is recorded in [decisions.md](./decisions.md); the executable evidence and remaining
implementation obligations are separated in [storage-conformance.md](./storage-conformance.md).
An implementation must satisfy these rules together. Existing vectors or partial models do not certify
a rule whose state or failure schedule they do not represent.

## SC-01 — acknowledgement and the recovery boundary

Given intact completed local carriers, an **unrewound, unbranched store history**, and a valid unlock
factor, reopening after page/navigation loss must reconstruct every acknowledged local operation and
the semantic dependencies needed to integrate it, **without network redelivery**. This includes Yjs
deletion information and pending update bytes. Recovery can include a committed but not yet displayed
suffix and concurrent durable work; it does not promise byte equality with one tab's former view.

Acknowledgement is promotion into the canonical editable document and ordinary editor, export,
accepted undo history and outgoing transport. **Nothing becomes authoritative without a durable
carrier.** A successful synchronous journal append can supply that carrier; otherwise content transaction
completion must precede promotion. `whenDurable()` remains the stronger flush-to-IndexedDB boundary.

This is a page/navigation-loss contract. Relaxed IndexedDB completion is not a general promise against
OS/power loss. Storage eviction, user-authorized clear, corruption and raw profile rollback are distinct
failure conditions; refusal must never misrepresent any of them as a recovered empty document.
[IndexedDB durability semantics](https://www.w3.org/TR/IndexedDB-3/#durability-hint).

## SC-02 — receive before promotion and ordered input

Remote and cross-tab updates enter a private receive buffer, pass the validation applicable to their
transport, and complete an encrypted local content commit before application to the canonical document.
Accepted heads advance after content completion. Out-of-order updates may be durably retained pending
their dependencies; no visible integration may depend on memory-only state. A peer's “saved” message
alone is not a local durability receipt. The initial implementation persists received bytes locally
before promotion, allowing redundant idempotent storage. Stage 1 does not inherit an unimplemented
Stage 4 service's redelivery guarantee.

Local commands prepare candidates privately against recoverable canonical state. A journal refusal
forces the content batch; until it completes the candidate remains pending. **Later input cannot bypass
an uncommitted predecessor.** Queue intent, then prepare it against the resulting canonical state.
Paste/import/maintenance slices, undo and actor initialization use the same admission owner.

**Presentation disposition:** pending content is not rendered as ordinary editable document text and
does not enter ordinary copy/export, accepted undo or transport. After each input handler the editor's
document view agrees with accepted canonical state. Native IME preedit is provisional input, never an
accepted CRDT mutation; composition commits must pass admission before becoming ordinary editor text.
There is no optimistic document-preview tier in this contract. Pending input may be lost on page loss;
it must never be described as saved. Queues are byte-bounded and expose actionable storage pressure.

State vectors alone do not prove semantic coverage: deleting Yjs content need not advance its state
vector. Preserve exact update/deletion information, not a vector-only approximation.

## SC-03 — writer lifetime and local activation

Every conforming runtime capable of selecting a generation, appending its journal, or committing
content holds a **shared lifetime permit** for its owning local user slot. The selected mechanism is
Web Locks in the same storage partition. Acquire before reading current custody or deriving write keys;
hold the callback promise while the session retains that capability. No lock request occurs per
keystroke. All equivalent worker, receive and maintenance paths participate.

Before releasing, disable admission, invalidate the session capability, quiesce or abort outstanding
work, and clear cached keys. Every asynchronous continuation checks the live session capability.
Reacquisition reads current durable state and obtains a new capability; an old callback cannot reuse
its previous keys. Logical disposal is not a forensic memory-zeroization claim.

Local generation activation, custody replacement, opener retirement and destructive clear require
the **exclusive** permit. The initiating writer releases its own shared permit before requesting it;
there is no in-place upgrade. A single slot scope covers its workspace stores and common custody,
avoiding nested workspace/custody lock ordering. Permit names bind the slot unambiguously and remain
compatible across participating application versions. A format version must not silently create a
second coordination domain.

Notifications only request cooperation. **No timeout, lease expiry or lock stealing authorizes a
transition.** A suspended holder can delay completion indefinitely. Unsupported or unvalidated lifecycle
behavior refuses this write mode; it does not select an unsafe fallback. Before allowing retirement
after deployment, establish a supported-version cutover that excludes old nonparticipating writers.
Merely deploying a new bundle or receiving a BroadcastChannel message is not that evidence.
[Web Locks lifetime and exclusion](https://www.w3.org/TR/web-locks/).

Service commitment, one runtime's observation, and completed local activation are separate events.
The observing runtime stops new acknowledgements immediately. Other contexts/devices may still use
the previous generation until they observe or quiesce. Local activation is complete only after the
exclusive barrier and durable successor installation; thereafter ordinary local writes use the successor.
Do not claim instant global propagation. The IndexedDB committing transaction still validates its
generation where the commit lands and aborts into re-reservation under the successor on mismatch.
That fence protects **IndexedDB commits**, not independent localStorage appends.

## SC-04 — coverage and opener retirement

Exclusivity proves absence of live old writers, not coverage. A transition records resumable intent,
verifies the committed outcome where a service exists, durably installs the successor opener, and
authenticates/covers the old work permitted by that outcome before removing its carriers. Successor
staging is an explicit transition phase; ordinary writes may not bypass the active-generation fence.
Multi-database work uses durable progress records; a lock does not make it crash-atomic.

Retirement takes a **fresh complete reference census under exclusion**. It includes journals, pending
batches, outbound envelopes, accepted marks, retained checkpoint/fallback suffixes, packages, reader and
recovery wraps, and interrupted transitions. Every required reference retains an authorized opener.
Unknown or unreadable carriers are not absent references. A stored journal's generation is part of this
accounting and authenticated when opened. Never delete a journal entry before its exact durable
replacement completes. Preserve identity/value matching when clearing individual immutable entries.

Local activation may finish with old openers retained. Do not hold exclusion across an indefinite
network wait: a later retirement reacquires exclusion and rebuilds its census. After transition-actor
death, reacquire and revalidate current carriers; a persisted earlier census is not proof that no writer
ran in the gap. The existing settled/successor-checkpoint/local-state gates and second-newest-checkpoint
fallback remain additional conditions, not substitutes for this census.

## SC-05 — exact trim and unreadable persistence

**Trim deletes only the exact authenticated records its durably committed replacement covers.**
Read the candidate records, authenticate each, merge their actual CRDT updates, commit the replacement
state record, then delete only those observed immutable identities whose bytes still match. A changed
record aborts deletion and requires re-evaluation. A snapshot of one tab's document is insufficient when
disk contains another tab's work. A `state` kind, a high sequence or sequence uniqueness is not coverage.
Heads/outbound records are not swept as content. Concurrent replacement records are retained unless
independently proven covered; duplication after interruption is safe.

Counterexample: reserve 1, 2, 3; commit 1 and 3; state 4 covers {1,3}; commit 2 late. Deleting `<4`
loses 2 despite unique sequences. Exact deletion of {1,3} preserves it.

**Unreadable-load disposition:** malformed, unsupported or unauthenticatable persisted content/journal,
or missing required key material, refuses normal open for the affected store. Retain and report the
carrier with a typed `repair-required` outcome. Do not bind an editable document, initialize/repair
application content, connect transport, trim or retire its required keys. Diagnostics and explicitly
requested encrypted-carrier recovery remain available; no ordinary export may imply complete recovery.
Unrelated stores can operate if their ownership/custody is independently valid. Invalid inbound network
messages are rejected by receive validation; they are not first persisted as authoritative local content.

**Unreadable-trim disposition:** refuse the entire trim, delete none of its input carriers, retain key
references and enter the same repair-required state. If damage is discovered after replacement commit,
retain both replacement and old carriers. This version selects no partial-trim or automatic salvage mode.

## SC-06 — genesis and partial-state classification

Fresh genesis requires verified absence of relevant material for the requested slot/principal/workspace:
identity/binding, store index/active routing, custody/envelopes, store metadata, counter/marker, content,
journal and any creation/clear intent. Existing unrelated stores are not evidence against fresh creation;
surviving material for this identity is. A Local principal is locally created without a service-signed
account binding. Account slots still require their selected verified binding; neither substitutes for
the other's authority.

Classify open as **fresh**, **complete**, **resumable creation/migration**, **clearing/cleared**, or
**repair-required** before content initialization. Protected creation confirms an external factor;
automatic Local creation installs its authenticated mode and sealed automatic opener atomically with
the identity/custody claim. Both paths
atomically install custody and identity-bearing metadata where they share a database. Across databases,
a durable creation intent binds one immutable identity set and its expected stages. Resume only when
surviving authenticated material matches that intent. A mismatch or insufficient recovery material
refuses; missing custody beside ciphertext never authorizes reminting or an empty workspace.

Concurrent creators serialize the uniqueness claim in a transaction, retain the winning identity and
converge on its verified completed state. A losing creator must not overwrite custody or silently enroll
its own factor over the winner; it obtains the winner's valid unlock or reports the existing locked state.
No persistent edit is acknowledged until genesis is complete and recoverable. Existing legacy data
keeps its selected carrier until the explicit verified cutover commits.

## SC-07 — resumable, journal-inclusive clear

Explicit, multi-step confirmation authorizes removal of one local slot while locked or unlocked.
Decryption credentials are not required for this local erasure; account deletion and remote revocation
remain separately authorized. Acquire the slot's
exclusive permit, quiesce writers, and persist an authorized `ClearIntent` outside the content database
being removed. It binds the target identity/carriers and records progress. Normal open and new writes
refuse while it is clearing. A refused or blocked content deletion preserves the journal, required keys
and index identity; no `finally` cleanup may erase them.

After content deletion succeeds, remove the target journal namespace and derived index carriers,
then remove store-specific openers only when no retained/other-store reference requires them. Keep
the slot index entry until these phases complete so interrupted work remains discoverable. A failed
journal deletion retains its needed keys and resumes from the intent. Shared slot custody survives
unless the authorized action clears the slot and all its references. Removal is scoped by the bound
identity, never a broad origin-wide prefix.

Complete by removing the index entry and retaining a non-content terminal `cleared` marker. It prevents
silent autogenesis or resurrection on restart. Explicit creation of a new identity is a separate action.
Once the first destructive step commits, resume authorized cleanup rather than pretending rollback can
restore deleted content. Success means no target content, journal or index residue and no unnecessary
target capability; the terminal marker itself is allowed diagnostic metadata.

**Setup retirement and legacy imports, clarified 2026-10-15.** Removal also fences pending setup
metadata. Acquire slot exclusion before the per-slot setup-metadata lock; a setup metadata transaction
must never acquire a slot permit or retain its metadata lock across a network wait. Persist a new
non-secret removal epoch before erasure. A setup coordinator retains its original epoch and refuses
every later write after a mismatch, even if another tab explicitly starts a fresh Local list. The
terminal marker independently refuses writes while removal is active or complete. Notifications request
prompt disposal but do not supply this durable fence or authorize erasure.

Selected legacy imports require verified source cleanup and a fresh source-absence check under the
existing exclusion protocol before credential-free removal can start. Pending pre-selection imports
also refuse removal. Keep source, destination and provenance intact on this refusal; do not report
completion while plaintext predecessor carriers remain. The ordinary app cannot infer exclusion of
old nonparticipating writers or erase all origin storage as a substitute.

## SC-08 — automatic Local custody and opt-in copied-profile protection

New Local workspaces may open automatically. Their authenticated Local claim explicitly names this
mode; a scoped, non-exportable browser CryptoKey seals a random internal opener in the custody database.
User content remains ciphertext, but this mode makes no confidentiality claim against a copied or
executable profile. Missing or mismatched automatic custody refuses opening; it never remints keys.
The inner custody record's completed `protected` state alone does not establish external-factor protection.

Protected Local and Account workspaces require external-factor unlock at cold start. Their generated
**125-bit unlock code** is confirmed before protection becomes active; supported PRF factors add
independent seals of the same random `L_lock` for the scoped principal/workspace custody entry, with
row 13's role/slot binding. The local-user-slot-wide coordination permit does not broaden factor
authority; slot metadata can contain multiple scoped custody entries. New custody lifecycle metadata
is v2 (`creating | migrating | protected`); existing LockSeal/KeyEnvelope cryptographic bytes remain v1. User-chosen passwords
are not substituted. Hold the factor outside the copied-profile exposure domain. PRF protection assumes
the attacker lacks the enrolled authenticator capability; capability/activation/verification behavior
must be validated on the supported platform matrix. Code-only offline access needs no account or network.

In protected mode, persist only sealed openers and credentials: no promptless handle, fallback, worker/session cache,
factor redisplay copy or derived journal key may independently recover retained content or receive future
generation keys. Inventory indirect signing/bootstrap/receiving paths too. Runtime non-extractability is
useful but does not prove disk confidentiality. Opening a coordinated runtime creates live usable keys;
the promise does not resist hostile origin code after unlock or guarantee OS-wide memory/swap erasure.
[WebCrypto's key-storage limits](https://www.w3.org/TR/webcrypto/#security-considerations-authors).

The claim is protection against a copied **supported browser profile**, without its external factor or
an already unlocked runtime, through the application's persisted custody paths. Full-profile negative
tests and a planted promptless-opener positive control must substantiate the claim. A plaintext scan
alone is insufficient. Historical plaintext, older promptless copies, secure deletion of freed blocks
and arbitrary OS forensic artifacts are not covered.

Existing v1 custody without a complete seal-reservation history must migrate to a fresh custody root;
do not infer a zero count from surviving envelopes, even when that v1 entry already required a factor.
Older promptless formats remain migration input. The new authenticated automatic Local mode is the
first-run default. Its opt-in protection owner confirms a generated code, creates a fresh workspace
store and fresh custody/content/receiving keys while retaining the principal, and copies the complete
Yjs state plus acknowledged journal basis under exclusive ownership. The exact snapshot digest is
factor-authenticated; cold verification precedes source deletion, including on resume. Content, journal,
index and custody retirement have durable phases. Final selection removes the automatic opener and
installs the protected claim. No sync admission is permitted while automatic opening remains.

For older legacy custody migration, confirm a factor, stage
sealed custody, replace every promptless future-content receiver, settle the required certified-set and
generation transition, and retire predecessors through SC-03/SC-04. Non-extractable old credentials
must be replaced because they cannot be exported for resealing. Report **protection pending** until
the applicable durable completion predicates hold. A previous copy retains old keys/history; remote
devices can continue using an old generation until they observe its successor.

Factor loss cannot be repaired by account login or support identity verification. A lost last Local
factor, with no independent readable copy/archive, can be final loss. Account recovery may re-enroll a
new device through its separate user-held recovery material or surviving authorized device; it does not
bypass a locked slot. Confirm and explain the code when adding protection. Replacing factors leaves at least one
valid enrolled factor. There is no ordinary “disable lock” downgrade. Session-sharing/auto-lock UX must
not persist an unlock capability or claim every slot key is cleared while a live holder retains one.

## SC-09 — nonce accounting and supported restore

The existing random-nonce invocation budget is conditional on **one unrewound, unbranched history per
key/counter pair**. Reservations precede encryption, including abandoned invocations; `reserved[gen]`
is never reconstructed from surviving records or reset by trim. The same discipline applies to all
AES-GCM seals under a custody root: v2 metadata carries a per-root `seal_reserved` count, reserved before
every invocation across purposes, including abandoned retries; rotate the root or refuse before the
2^32nd reservation. One stored envelope per (generation, purpose) does not count all invocations. A
staged root and its count resume together after interruption. Fresh per-factor derived-key seals retain
their existing distinct-salt discipline. Store-instance binding separates keys
for independently created stores, not copies of the same store metadata.

A raw profile copy/restore duplicates `store_id`, keys and counters. Two unlocked copies or repeated
rollback can exceed the per-key budget while each local counter stays below it. Neither factors nor
Web Locks detect or coordinate that history. This limitation must accompany the accounting claim;
unannounced raw clones cannot be assumed reliably detectable by the application.

**Supported writable restore uses the application's verified import/reinstantiation path**, preserving
the selected workspace/attribution authority while minting a fresh independent `store_id`, derived
store-key scope and reservation history. Re-encrypt imported content into that instance under confirmed
factor custody. Use a fresh custody root or an existing destination root with its intact reservation
history; never install an imported custody root/counter as a second writable copy. Do not reinstall
the exported counter as the new writable counter. Raw filesystem/profile
restoration is outside the writable-recovery guarantee. If support for writable raw clones/rollback is
required later, a new accounting construction is required before claiming it; this assumption is not a
runtime detection mechanism.
