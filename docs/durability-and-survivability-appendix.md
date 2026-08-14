# done — Durability, Transport, and Service Survivability

**Status:** Architecture appendix — analysis and recommendation, not a recorded disposition  
**Date:** 2026-08-14  
**Relates to:** [sessions.md](./sessions.md) D-16, D-17, D-25, D-28, D-31 and D-32; [security-decisions-appendix.md](./security-decisions-appendix.md) A.2.2 and A.4.1

---

## 0. Why this appendix exists

There are two concerns underneath the question of whether ordinary sync should be peer-to-peer:

1. **Operating cost.** A relay carries bytes whose volume grows with use, so it is reasonable to ask
   whether devices can carry most of those bytes directly.
2. **Service survivability.** Adopting a local-first tool should not require betting that the company
   operating its hosted service will continue to exist. The desired standard is stronger than "there is
   an export button": the local app should remain useful, the data should remain intelligible, and a user
   should have a credible path to restore or continue syncing without the original operator.

Those concerns are related, but they are not the same architectural problem. P2P may reduce some hosted
bandwidth. It does not by itself make the data, application, recovery path or authorization system
independent of the service.

This appendix evaluates one proposed shape:

> Use peer-to-peer delivery as the normal sync transport, while one or more additional cloud nodes only
> receive and durably store encrypted history.

The short answer is that this is a coherent hybrid architecture, but the durable node becomes a relay in
every case where it makes ordinary asynchronous sync work. It is therefore more useful to separate the
system by responsibility than to classify the whole system as either "P2P" or "relay".

---

## 1. Separate the promises first

The security appendix already separates safety, durability and confidentiality. Service survivability
adds several more properties that product copy is otherwise tempted to compress into "local-first" or
"backed up."

| Property | The question it answers |
| --- | --- |
| **Local availability** | Can an existing installation read and write with no network or service? |
| **Synchronization** | Can changes move between devices, including devices that are not online together? |
| **Durability** | Do usable bytes remain after one or every local device is lost? |
| **Recoverability** | Does the user possess both the ciphertext and the means to turn it back into a usable workspace? |
| **Portability** | Can another program read the data, and can another installation of this program import it? |
| **Service independence** | Can the user continue after the original app origin, relay, account service or company disappears? |
| **Safety** | Can an unauthorized or revoked credential produce an accepted future write? |
| **Confidentiality** | Who can turn stored or transmitted bytes into plaintext? |

A cloud copy can improve durability without improving recoverability. P2P can provide synchronization
without providing last-device recovery. Plain Markdown can provide portability without preserving CRDT
identity or continuing sync. A cached PWA can provide local availability on one existing device without
providing a way to install the application on a replacement device.

The architecture and the eventual claim should name these properties individually.

---

## 2. When a durable node is and is not a relay

The proposed node can play three materially different roles.

| What the cloud node does | What it is | What the user gets |
| --- | --- | --- |
| Receives updates but only returns them through an explicit disaster-recovery flow | **Backup/archive** | Recovery, if the user also has the required key and restoration software |
| Returns updates missed while another device was offline | **Store-and-forward relay** | Ordinary asynchronous multi-device sync |
| Supplies an authenticated checkpoint to a new device | **Recovery and bootstrap service** | Fresh-device restoration and bounded replay |

The distinction is behavioral, not terminological. If a phone deposits a change in the morning and a
laptop retrieves it that evening while the phone is asleep, the cloud node has relayed the change. It may
have no live sockets, awareness state or document semantics, but it is still the transport between devices
that did not overlap in time.

A hybrid can nevertheless be useful:

```text
when both devices are reachable

    phone ───────────────▶ laptop
      │                     P2P live delivery
      └──────▶ durable store

when the laptop arrives later

    durable store ───────▶ laptop
                     store-and-forward catch-up
```

The durable store can remain content-blind in both cases. What changes is not its content authority but
whether it participates in the normal delivery path.

---

## 3. What P2P would and would not save

For one sender and one receiving device, the rough byte paths are:

| Design | Sender uploads | Hosted service transmits | Important exception |
| --- | --- | --- | --- |
| Relay-mediated | Once, to the relay | Once, to the receiving device | More receiving devices mean more fan-out |
| P2P with cloud archive | Once to the peer and once to the archive | Nothing for a successful live direct path | A later catch-up is downloaded from the archive |
| P2P through TURN with cloud archive | Once to TURN and once to the archive | TURN carries the peer traffic | The nominally P2P path has become metered relay traffic again |

The hybrid therefore eliminates hosted **live egress** only when the devices are online together and a
direct connection succeeds. It does not eliminate:

- ingestion of every update into durable storage;
- storage operations and retained bytes;
- egress for offline catch-up or recovery;
- signalling and authorization traffic;
- TURN traffic when a direct route cannot be established; or
- the client sending two copies when it transmits to both a peer and an archive.

This may still be worthwhile for a system with large payloads, high peer overlap or many simultaneous
recipients. It is not yet established for a small personal text document with a handful of devices.

The cost question should be answered before building the second transport. Measure, at minimum:

- update-envelope bytes per active workspace at the 50th, 95th and 99th percentiles;
- relay egress, durable-store writes, retained bytes and recovery downloads;
- the fraction of device pairs simultaneously reachable in ordinary use;
- direct WebRTC success and TURN use on the actual phone/laptop network mix;
- checkpoint frequency and size; and
- the engineering and support cost of two connection paths.

The current relay is already the simpler experiment for gathering the first half of these measurements.

---

## 4. The larger cost is a second synchronization system

Browser P2P is not only a replacement for one WebSocket send. It requires signalling, ICE negotiation,
STUN, TURN for connections that cannot be made directly, connection lifecycle handling for suspended
mobile PWAs, and a catch-up path for devices that were not awake together.

It also interacts with authorization. An encrypted, signed envelope format can and should be independent
of its carrier, but carrier independence does not remove the ordering problem:

- with a server witness, clients can agree which revocation or key-rotation commit is current;
- two offline peer groups can each accept different authorization descendants; and
- a device can create a validly signed update under an old epoch and later claim it predates revocation.

Consequently, a P2P tier that continues through service absence needs a sanctioned-lineage, quorum or
other fork-resolution rule that relay-mediated sync does not need. If P2P is allowed only while an
authorization service remains reachable, it may save content bandwidth but it is not an independence
mechanism.

P2P makes the most sense here as a later, opportunistic carrier beneath one envelope protocol. It should
not be the path on which convergence, recovery or the truth of revocation depends unless ordinary
phone-and-laptop use proves it reliable and the additional authorization semantics pass the same review
as the relay path.

---

## 5. A durable encrypted store cannot literally retain unbounded history

The current relay periodically persists one merged Yjs state with `Y.encodeStateAsUpdate(doc)`. It can do
that because it holds and applies the Yjs document. A future server that receives independently encrypted
update envelopes cannot merge their contents without decrypting them.

A content-blind durable store therefore needs a bounded recovery representation:

1. immutable, authenticated update envelopes;
2. a client-produced authenticated checkpoint;
3. a manifest binding the checkpoint to its authorization head, content-key generation and covered
   update range;
4. the update suffix after that checkpoint; and
5. retention rules for superseded checkpoints and covered envelopes.

The client must verify a checkpoint before applying it. A fresh device must be able to discover the
current authenticated head without treating an unsigned server snapshot as authority. These are already
requirements of D-28; the hybrid proposal makes them storage requirements as well as replay-performance
requirements.

This also means "store the history" should not silently imply permanent event-history retention. The
durability promise is normally satisfied by recoverable current state plus a bounded suffix. Keeping a
longer audit or version history is a separate product, privacy and cost decision.

---

## 6. One node, three nodes and correlated disappearance

Replica count answers infrastructure failure. Custody answers company failure.

Three processes, virtual machines or buckets under the same provider account, billing relationship,
domain and operator improve availability against some machine and regional failures. They do not make the
system survive closure of the account, loss of the domain, exhaustion of the company, or a deliberate
shutdown. For the hidden question in this appendix, one independently controlled copy may be more
valuable than three operator-controlled copies.

Storage redundancy and authorization consensus should also not be conflated:

- Immutable encrypted blobs can be copied asynchronously to independently controlled stores and verified
  by digest. They do not need a three-node consensus protocol merely because three copies exist.
- An authorization witness that defines one current commit is an ordering authority. Replicating or
  replacing it is a different problem with fork and succession semantics.

For ordinary hosted durability, replicated object storage plus tested backups may be sufficient. For
service independence, at least one of the following must be true:

- the user directly controls a storage destination;
- the user has an independently accessible copy that does not require the original service account;
- another operator can take custody using a published protocol; or
- the user can restore from an exported archive with software and keys already in their possession.

---

## 7. What must survive the company

The service-disappearance scenario should be decomposed rather than answered with one yes or no.

| Scenario after disappearance | Required mechanism |
| --- | --- |
| Existing device opens and edits | Complete local replica; no read or write awaits network or authentication |
| Existing paired devices exchange future edits | Replaceable rendezvous/relay configuration, plus authorization semantics that work without the former witness |
| User reads the data without `done` | Plain, documented export format |
| User installs `done` on a replacement device | Independently obtainable static application or packaged release |
| User restores after losing every device | Independently reachable ciphertext, user-held recovery material and a standalone restore path |
| User admits or revokes a device | A surviving device, quorum or recovery root can administer authorization |
| User moves to a new hosted or self-hosted relay | A signed witness-succession or workspace-migration operation |

The existing design already protects the first row and substantially protects the third. The Markdown
export is generated locally and contains ordinary files. The remaining rows need deliberate artifacts;
they do not follow automatically from local persistence or P2P transport.

### 7.1 Data continuity

Export must be paired with import. A Markdown archive preserves the user's writing even if no compatible
application survives, but without import it does not preserve continuity of this application. Import
should be tested as a migration path rather than treated only as a convenience.

The stronger recovery story should also include an encrypted fidelity-preserving archive containing the
CRDT state and the authorization/recovery material necessary to resume. The Markdown archive and the
fidelity archive have different purposes:

- **Markdown** is the permanent escape format.
- **Encrypted workspace state** is the exact restore and continued-sync format.

Neither should depend on an undocumented database layout or a live original service.

### 7.2 Application continuity

An installed PWA whose shell is still cached can continue through an outage. That is not a complete
company-disappearance story: browser storage can be cleared or evicted, a replacement device needs an
installable artifact, and an expired or lost origin may no longer serve the application.

A strong claim therefore needs an independently obtainable release: for example, a downloadable static
build with build instructions and checksums, capable of being served from another origin or packaged
locally. The exact distribution mechanism is a later decision; the requirement is that reinstalling does
not require the continued operation of the original domain.

### 7.3 Cryptographic continuity

Server-held ciphertext is not recoverable data unless the user can recover the decryption root. The
recovery secret must be user-held, portable and supported by a documented offline restore tool. Restoring
email or account access must not be described as restoring content-key access.

### 7.4 Authorization continuity

This is the hardest part and the one transport discussions easily miss. If the account service is the
sole authorization root, or the original relay is the only witness clients accept, the documents survive
but the device group cannot safely evolve after the service disappears.

The protocol needs an explicit succession event. Plausible authorities include a saved recovery root, a
quorum of surviving device credentials, or a deliberately selected transferable administration root. The
event must bind the workspace to a replacement witness without allowing an old, revoked device to create
an equally plausible successor. Selecting the authority belongs to D-17; requiring a succession story
belongs to the service-survivability promise.

---

## 8. Recommended architecture

### 8.1 Use one normal sync path

Use relay-mediated encrypted sync wherever cross-device sync is offered. It handles live fan-out,
asynchronous catch-up and fresh-device bootstrap through one convergence and failure model. Keep local-only
as a permanent mode that constructs no provider and awaits no service.

Do not build P2P first as the allegedly cheaper tier. Add it only after measured relay egress, device
overlap and direct-connect success show that it pays for the permanent second path.

### 8.2 Separate responsibilities behind the path

The first deployment may remain one small service, but its interfaces should distinguish:

- **rendezvous and connection authentication**;
- **ephemeral live fan-out and awareness**;
- **durable encrypted envelopes and checkpoints**;
- **authorization-head witnessing**; and
- **account, billing and recovery-wrapper storage**.

This makes retention, replacement and self-hosting boundaries explicit without requiring five deployed
services. In particular, ephemeral presence data need not acquire the retention policy of durable
workspace state.

### 8.3 Make the hosted service replaceable

The hosted relay should be a convenience implementation rather than the only possible custodian. The
survival package should eventually include:

- a documented, versioned envelope/checkpoint protocol;
- a small self-hosted relay and durable-store implementation;
- configurable endpoints that do not require editing workspace content;
- export and import;
- a standalone recovery/inspection tool;
- a user-held recovery secret; and
- a tested operation for moving authorization to a new witness.

A user-controlled durable destination can then be added without changing the document or authorization
formats. It may be a separate hosted provider, self-hosted storage or another adapter; choosing one is an
implementation and credential-custody decision, not a prerequisite for drawing the interface.

### 8.4 Treat P2P as an optimization or emergency capability

If added, P2P should carry the same source-authenticated encrypted envelopes as the relay. A successful
direct path can reduce live relay egress and latency. Failure should fall back to the relay without
changing document meaning.

An emergency service-absent peer mode is a distinct feature. It needs replaceable signalling and an
authorization rule for operating without the former witness. It should be specified and tested as such,
not implied by the existence of WebRTC.

---

## 9. Product claims and acceptance tests

The current honest service-disappearance claim is narrow:

> Existing local documents remain readable and writable, and no local operation awaits the service.
> Hosted synchronization, fresh-device recovery and server-held recovery material may stop being
> available.

That is meaningful local-first behavior, but it is weaker than the editor-plus-Dropbox standard.

The stronger claim should not ship until the following can be demonstrated without access to production
service credentials or the original app origin:

1. Start an existing installation with the app and relay origins unreachable; read and edit normally.
2. Export to Markdown and inspect every user-authored item with ordinary tools.
3. Import that export into a clean independently served build without silently losing frozen history.
4. Restore an encrypted workspace archive on a clean device using only the saved recovery material.
5. Start the documented self-hosted relay/store and repoint surviving devices without modifying content.
6. Adopt the replacement authorization witness and then add and revoke a device.
7. Converge edits made before, during and after the migration without accepting a revoked lineage.
8. Repeat after the durable store with the newest checkpoint is unavailable, using the documented replica
   or backup order.

Only after those tests pass is a claim like this warranted:

> If the hosted service disappears, your existing app and local data continue to work. Your data is
> available as ordinary Markdown, and the encrypted workspace can be restored and moved to another
> compatible sync service using recovery material that you hold.

---

## 10. Disposition

The proposed architecture makes sense as **P2P live delivery plus a durable mailbox**, but it does not
remove the relay role from asynchronous sync and it does not, on its own, satisfy service survivability.

For `done`, the recommended order is:

1. keep one relay-mediated sync path;
2. make its encrypted durable state checkpointed, bounded and portable;
3. finish import and independent recovery;
4. make the client, relay and authorization witness replaceable;
5. measure real bandwidth and connection behavior; and
6. add P2P only if it earns its additional transport and authorization surface.

The deepest version of the hidden question is not "can devices avoid sending bytes through this
company?" It is "what capabilities remain when this company can no longer answer?" The answer depends
less on the route ordinary update bytes take than on independent custody, portable software and a safe
way for authorization authority to outlive its first operator.
