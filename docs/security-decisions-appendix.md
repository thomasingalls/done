# Appendix — Resolving the sessions and product-security decisions

- **Status:** Recommendation for decision-making; not an implementation specification
- **Date:** 2026-08-13
- **Applies to:** [`sessions.md`](./sessions.md), especially §5.7–§5.9 and §8.1–§8.2

## A.1 Purpose

The sessions document has done the important framing work. It separates account, principal, workspace,
member, actor, device and session; states the cardinalities; and turns “research security” into a bounded
set of product choices. What remains should not be resolved by choosing a library or by asking whether a
particular primitive is secure. It should be resolved by choosing **promises**, then custody and recovery,
then the protocol that can keep those promises, and finally the evidence required to ship it.

This appendix recommends a way to close those decisions. Its proposed destination is:

1. preserve instant, offline, accountless local use;
2. make accountless pairing useful without presenting it as recovery;
3. use the existing relay for all cross-device sync rather than build a second, deliberately inferior
   transport for a free tier;
4. keep workspace content opaque to the service;
5. use a deliberately small authorization protocol around Yjs rather than migrate the document engine;
6. make recovery non-custodial, with a saved recovery secret as the portable baseline and passkey PRF as
   an enhancement rather than a compatibility requirement; and
7. require independent protocol review before implementation and an implementation audit before a public
   security claim.

These are recommendations to test, not conclusions to smuggle into the PRD. Each can be accepted or
rejected independently using the decision process in §A.3.

## A.2 Principles for making the decisions

### A.2.1 Decide user-visible failure modes before mechanisms

For every option, first complete these sentences in product language:

- If one device is lost, the user can …
- If all devices are lost, the user can …
- If the service disappears, the user can …
- If the service is compromised, the attacker can … but cannot …
- If hostile code runs at the app's origin, the attacker can …
- Removing a device means … and does not mean …

An option that cannot fill these in plainly is not ready for a protocol discussion. In particular,
“encrypted,” “passkey-backed,” and “end-to-end encrypted” are implementation descriptions, not complete
promises about recovery, metadata or hostile same-origin code.

### A.2.2 Treat safety, durability and confidentiality as separate products

The current decision set sometimes puts all three under “sync”:

- **Safety** is whether an unauthorized credential can produce an accepted future write.
- **Durability** is whether ciphertext still exists after devices are lost.
- **Confidentiality** is who can turn that ciphertext into plaintext.

A paid server copy may improve durability without improving recoverability. Key rotation can protect
future confidentiality without deleting an old replica. Authentication can reject a write without
preventing its author from reading content they already copied. Product copy and acceptance tests should
name the relevant property rather than use “secure” or “backed up” as a substitute.

### A.2.3 Minimize novel security semantics, not merely novel code

Using a standard signature primitive inside a new authorization state machine still creates a new
protocol. Conversely, adapting a reviewed delegation pattern to Yjs may be less novel than moving the
entire application to an unfinished integration. Count novelty in roots, state transitions, fork rules,
recovery and downgrade behavior—not in lines of cryptographic code.

### A.2.4 Narrow the first security claim

The first supported networked workspace should have one human principal, that principal's devices, no
human sharing and no agent member. The data model may retain the already-decided capacity for agents and
multiple memberships, but v1 should not issue an agent credential or expose capability combinations that
have not been reviewed. This removes neither the signed epoch nor per-device credentials; it reduces the
number of claims the first review has to validate.

## A.3 Decision process and order

Use short decision records with a named decider, deadline and reversal cost. Do not ask one workshop to
settle all of D-16, D-17 and D-28: the later answers depend on the earlier promises.

| Order | Decision session                                     | Required output                                                        | Exit test                                                                                                |
| ----- | ---------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1     | Threat and promise workshop                          | One-page threat boundary and the five failure-mode sentences in §A.2.1 | Product, engineering and an independent security reviewer agree that the wording is testable             |
| 2     | Tier boundary (D-16)                                 | Which network behavior is universal and which benefits may be paid     | No new transport exists solely to make a tier worse; free-tier copy has no recurring scare banner        |
| 3     | Rung-2 authority and device storage (D-17a/b)        | Who can admit/revoke and how its operational keys are stored           | Pair, lose, revoke and replace-device stories can all be narrated without an account                     |
| 4     | Account custody and recovery (D-17c/d)               | Exact all-device-loss promise, enrollment ceremony and fallback        | Every recovery object in sessions §5.7.6 has an owner and a loss outcome                                 |
| 5     | Carrier choice (D-28)                                | A protocol architecture decision record plus a disposable spike        | The chosen design meets test vectors without modifying Yjs internals or trusting unsigned document state |
| 6     | Assurance bar (D-17e)                                | Review, audit and response commitments with owners and budget          | Evidence is scheduled before claims or public sync availability                                          |
| 7     | Remaining product semantics (D-12, D-13, D-18, D-30) | Copy, state diagrams and destructive-action behavior                   | Prototype tests show that users understand loss, removal, reset and merge consequences                   |

Each decision record should include: the promise selected; rejected options and why; assumptions; the
worst credible failure; migration and rollback path; what evidence would reverse the decision; affected
decisions; and the exact PRD/TRD text to amend. Time-box research, but do not time-box review findings:
an unresolved critical finding is a stop condition, not schedule risk to accept silently.

## A.4 Recommended dispositions

### A.4.1 D-16 — use one relay path; put the boundary elsewhere

**Recommendation:** make relay-mediated, encrypted cross-device sync available wherever cross-device sync
is offered. Do not build WebRTC plus signaling, STUN/TURN and a second revocation model merely to create a
free tier. Initially keep **local-only** as the permanent no-account mode and treat pairing plus relay sync
as a product capability whose commercial boundary can change without changing the protocol.

For a launch boundary, prefer one of these, in order:

1. a limited but useful included relay allowance, with paid durable retention/recovery and higher limits;
2. a time-limited service trial followed by local-only use, with export and local data untouched; or
3. paid network sync from the outset.

Do **not** charge for the ability to escape an environment that the app knows is evictable while also
showing a permanent danger banner. If the free allowance has a server copy, state its retention and limit.
If it does not, disclose that once at the choice point and in the device screen, not as an unresolvable
warning.

This recommendation trades a small marginal hosting cost for one transport, one convergence model and one
revocation commit path. D-31 should measure encrypted bytes stored, update bandwidth, active workspaces,
retention age and support cost before choosing price or allowance. It should not delay D-16's architectural
answer.

**Validation before recording the decision:** model the 50th, 95th and 99th percentile storage and relay
cost with synthetic workloads; run the existing relay under those loads; and interview users using three
concrete offers rather than asking whether they would “pay for sync.” If a free relay allowance cannot be
supported, choose local-only versus paid relay explicitly—do not fall back to an untested P2P tier.

### A.4.2 D-17a — every paired device may administer rung 2

**Recommendation:** at the accountless paired rung, every admitted device may admit or revoke another
device. An authorization operation is signed by one currently authorized admin device; conflicts produce
competing successors, and the sanctioned-lineage rule selects the lineage on which an uncompromised device
continues. At account rung 3, the account authorization root becomes the sole administrator while device
credentials remain ordinary writers/readers.

This accepts a clear limitation: compromise of any paired device is compromise of the accountless
principal until another surviving device sanctions a lineage that excludes it. It is still preferable to
a designated admin or quorum: those turn the most common two-device loss case into lockout and force users
to manage an invisible role. Pairing UI must therefore show the complete device authorization list, make a
new admission conspicuous on all online devices and require a local user-verification gesture to display or
consume a pairing invitation.

Do not claim that this removes a malicious device's historical copy or prevents an already-compromised
device from admitting a hidden successor before revocation. The device list must derive from verified
authorization operations, not mutable CRDT roster metadata.

### A.4.3 D-17b — non-extractable WebCrypto operational keys, with modest claims

**Recommendation:** generate separate device signing and key-agreement credentials as non-extractable
WebCrypto keys and persist them in IndexedDB where supported. Use extractable keys only behind an explicit,
tested compatibility policy; never silently downgrade. Keep the authorization root separate from hot
mutation keys.

The associated promise must be narrow: non-extractability prevents accidental raw-key export through the
API and reduces misuse. It does not establish hardware backing, protect an unlocked origin from XSS, or
make a copied browser profile harmless. Compensating controls belong in the security contract: no
third-party script in the key-holding origin, a strict CSP, Trusted Types where supported, dependency and
service-worker integrity controls, short-lived scoped relay tokens, and credential rotation after an
origin compromise.

Build a compatibility spike before committing: create, clone, persist, reload and use both key types on
the minimum supported Safari/iOS, Chrome/Android, Firefox and installed-PWA paths. A browser that cannot
reliably persist the selected key material should remain local-only with clear explanation, not receive a
weaker key without consent.

### A.4.4 D-17c/d — non-custodial account recovery; saved secret first, PRF second

**Recommendation:** make the account an authentication and authorization witness plus a store for
ciphertext, the current signed authorization head and a content root wrapped by a recovery key the service
does not possess. Use a high-entropy, app-generated recovery secret (displayed as text and QR) as the
portable baseline. Offer passkey PRF wrapping as a convenience when support is positively detected, but do
not make PRF the only route or silently substitute ordinary passkey sign-in for content-key recovery.

At enrollment:

1. generate the recovery secret locally;
2. wrap the content/authorization recovery material locally with a versioned KDF/AEAD construction;
3. upload only the wrapper and non-secret parameters;
4. require the user to save and verify part of the secret before claiming all-device-loss recovery; and
5. encourage a second independently stored factor or verified encrypted export.

The account recovery screen must distinguish four results: account access restored, new credential
authorized, content key recovered, and ciphertext found. Email or support may restore the first; they must
not be described as restoring the other three. If the user loses every device and the recovery secret,
the honest outcome is unrecoverable plaintext even if the paid ciphertext copy remains.

Account deletion should require a verified export or an explicit acknowledgement that deleting the last
recovery wrapper can make server ciphertext permanently useless. Downgrade should retain the account root
during the declared grace/retention period; “stop paying” and “destroy recovery” must never be the same
action.

### A.4.5 D-17e — set the assurance bar before implementation

**Recommendation:** require all of the following for public network sync:

- a project-owned threat model and executable protocol vectors;
- a version-pinned OWASP ASVS profile for the web client, relay and deployment;
- independent review of the protocol design **before** implementation is locked;
- independent implementation and deployment audit before a general-availability confidentiality or
  authenticated-attribution claim; and
- a published vulnerability contact plus credential/key-rotation and incident-response runbooks.

The design review should explicitly cover invitation theft/replay, authorization forks, fresh-device head
discovery, downgrade, cross-workspace replay, actor substitution, interrupted rotation, recovery-wrapper
replacement and compromised-origin response. Re-review is required after changing a root, envelope,
recovery path, cryptographic algorithm suite or code-loading boundary. Routine UI changes do not require a
full protocol review.

Until the audit passes, label the feature as a limited preview and avoid the unqualified phrase
“end-to-end encrypted.” The UI may accurately say that the relay stores encrypted workspace bytes if that
specific property is continuously tested.

### A.4.6 D-28 — a small authorization layer around Yjs, not a CRDT migration

**Recommendation:** retain Yjs and build a narrow, separately versioned authorization layer around opaque
Yjs updates. Reuse reviewed protocol patterns and standard cryptographic primitives, but do not couple the
authorization truth to Yjs maps, awareness state, client ids or transaction origins.

The first protocol should contain only:

- an append-only, signed authorization operation chain with explicit predecessor(s), workspace,
  credential, capability, actor binding, key generation and protocol version;
- single-use pairing invitations that admit a newly generated device credential rather than sharing an
  existing secret;
- encrypted update envelopes bound to workspace, authorization head/epoch, signing credential, actor,
  ciphertext digest and monotonic per-credential sequence number;
- a relay-witnessed total order for account/paid authorization commits, while document content remains
  opaque; and
- authenticated checkpoints so a fresh device need not replay an unbounded history and cannot accept an
  unsigned snapshot as authority.

Authorization operations should use a dedicated store and codec. Yjs remains the document/convergence
engine inside the encrypted payload. This preserves the application's mature CRDT behavior while making
the security boundary inspectable and replaceable.

Before selecting this option finally, fund a disposable vertical spike that performs genesis, pair,
concurrent edit, revoke, rotate, reconnect-old-device and fresh-device recovery against the existing
relay. Produce deterministic cross-implementation vectors for every signed byte representation. The spike
is successful only if it demonstrates that verification happens before applying a remote update, first
sync has an authenticated head, replay is bounded, and normal local edits never await signing ceremonies or
the network.

Reject the option and revisit the carrier decision if independent review finds that the minimal layer has
grown into a general decentralized authorization framework, or if verified replay/checkpoint costs cannot
meet the existing startup and sync budgets. Do not migrate to Automerge merely to reach an adjacent auth
library until a separate spike proves feature parity, migration safety and materially lower protocol risk.

### A.4.7 D-30 — reformulate Rule 1 around cognitive burden

**Recommendation:** replace “the user never manages workspaces” with:

> Routine use never requires the user to name, locate, select or understand a workspace. The app may ask
> the user to adjudicate an irreversible collision or security transition, showing the affected content,
> devices and consequences rather than exposing transport identifiers.

This preserves the rule's intent and makes D-5, D-24 and device revocation legitimate exceptions for the
same reason: the app lacks authority to make an irreversible choice invisibly. The merge flow may say
“this device” and “your synced history”; it still need not teach the word workspace or reveal a room id.

## A.5 Close the smaller open product semantics in the same round

These do not block the protocol, but leaving them open invites implementation defaults that can cause data
loss.

| Decision                                  | Suggested answer                                                                                                                                                                                                                                                                               | Why                                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| D-12: admitted document, identity missing | Open read-only in a quarantine shell; offer **re-pair**, **export encrypted/local data**, or **start fresh after export**. Never apply or send writes under a new identity.                                                                                                                    | Preserves evidence and local availability without admitting an unauthorized writer |
| D-13: reset versus sign-out               | Separate them. **Sign out** removes account/relay sessions but preserves the encrypted local replica and device identity. **Remove this person and data from this browser** revokes if possible, exports or confirms loss, then atomically clears identity and all principal/workspace stores. | The two actions have different remote and destructive meanings                     |
| D-18: revoked device                      | Freeze sync, not local startup. Explain that access to future changes ended and old local data may remain. Offer export of the historical local copy and local deletion; do not remotely promise a wipe.                                                                                       | Matches the enforceable boundary and Rule 2                                        |
| D-6: staleness                            | Start with “last connected” timestamps, not automatic status categories. Introduce muted thresholds only after observing the distribution.                                                                                                                                                     | Avoids turning an arbitrary parameter into implied revocation                      |
| D-29: lapse retention                     | Choose and publish a fixed grace period and ciphertext retention period before accepting payment. Notify before each transition. Never retire the account root merely because billing lapses.                                                                                                  | Recovery and durability copy depend on a real duration                             |

## A.6 Required artifacts before promotion into the PRD

Section 8.2 should be considered satisfied only when the following version-controlled artifacts exist:

1. **Security promise and threat boundary.** One page, user-readable claims paired with explicit
   non-claims, including metadata visibility and the same-origin-code boundary.
2. **Custody and recovery matrix.** For every rung and loss scenario, identify who holds account access,
   authorization authority, content keys and ciphertext.
3. **Authorization state machine.** Genesis, pairing, promotion, mutation, revocation requested/committed/
   acknowledged, rotation, lapse, downgrade, deletion, fork and recovery, including interrupted states.
4. **Wire-format specification and test vectors.** Canonical encodings, domain separation, algorithm and
   version identifiers, envelope/checkpoint rules, replay bounds and crypto-agility/migration behavior.
5. **UX prototypes and copy.** Pairing, device list, unexpected admission warning, revocation, recovery
   enrollment/test, identity loss, sign-out/reset, merge adjudication and account deletion.
6. **Assurance plan.** Named ASVS version/profile, reviewer scope, audit gate, disclosure route, owners and
   funded schedule.
7. **Decision records.** Final D-16, the five D-17 selections, D-28 and D-30, with rejected options and
   consequences for D-12/D-13/D-18/D-24/D-25/D-29.

Promotion should then amend the PRD with product promises and terminology, and the TRD with the selected
architecture. The research appendix and rejected alternatives should remain in the docs history; they are
useful evidence, but they should not become normative requirements by proximity.

## A.7 Acceptance gates and rollout

### Gate 0 — no network security claim

Keep local behavior unchanged. Add no identity migration yet. Complete the threat boundary, tier decision,
custody matrix and protocol ADR.

### Gate 1 — internal protocol harness

No production data. Run deterministic vectors, generated authorization histories, fork/replay tests,
rotation interruption tests and relay snapshot inspection. Fuzz decoders and reject unknown critical
fields/versions. Independently review the design at this gate, while it is still cheap to replace.

### Gate 2 — opt-in preview

Use test workspaces or users who explicitly accept reset risk. Instrument only operational facts needed to
debug state transitions; never log plaintext, content keys, recovery secrets, PRF output or reusable device
credentials. Exercise device loss and recovery in support drills, not only happy-path pairing.

### Gate 3 — audited release

Require closure of critical/high findings, documented disposition of lower findings, rollback and key/
credential rotation drills, a recovery success-rate target, and support playbooks. Make the device list and
unexpected-device warning available before broadly enabling pairing.

### Gate 4 — expand capability

Only after production evidence should the product consider agents, multiple visible workspaces, human
sharing or stronger metadata claims. Each changes the threat model: an editing agent receives plaintext;
human sharing changes recovery and ownership; encrypted awareness changes presence behavior. Architectural
capacity is not approval to expose these features without a new decision record.

## A.8 Primary references for the review packet

The decision team should pin exact versions or commits when the work begins rather than treating these
links as evergreen approval:

- [Web Authentication Level 3 — PRF extension and security considerations](https://www.w3.org/TR/webauthn-3/)
- [Web Cryptography Level 2](https://www.w3.org/TR/webcrypto-2/)
- [OWASP Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/)
- [Keyhive](https://www.inkandswitch.com/keyhive/)
- [`@localfirst/auth`](https://github.com/local-first-web/auth)
- [Yjs document updates](https://docs.yjs.dev/api/document-updates)

These sources can supply primitives, threat prompts and prior art. None can choose the product's custody,
recovery, tier or failure promises; those remain the decisions this appendix is intended to close.
