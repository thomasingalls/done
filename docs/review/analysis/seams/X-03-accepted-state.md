---
schema: 1
kind: work-item
id: X-03
status: complete
owner: /root
started: 2026-08-25
updated: 2026-08-25
blocked_on: none
---

# `X-03` — accepted state

## Scope and exclusions

Independently re-derive the pinned end state's envelope authentication, client-owned/accepted positions,
per-credential link marks, service-signed heads and final cutoffs, checkpoint coverage/fallback, and outbound
retention. Challenge refused writes, lost replies, same-position forks, split service views, two checkpoint producers,
old-generation deletion, a hostile relay, and a hostile authorization service separately. Carry forward X-02's
joint questions about successor-`KeyEnvelope` durability and already-journalled/batched deltas at a committed
generation switch.

Enrollment/recovery ceremony details, long-term attribution/portability, and broad platform/evidence population
belong to X-04 through X-06 except where they directly determine accepted-state safety. Production requirements,
selections, generators, vectors, tests, application code, and relay code remained read-only. The pinned tip is a
specification/composition-evidence snapshot; its application and relay still implement predecessor plaintext/Yjs
surfaces, so no accepted-state behavior is credited as integrated.

## Exact sources inspected

- Original boundary: `c6116669030eedeea3d599bca0da3547114e6930:docs/PRD.md` §§5.3–5.4, 6.5, 7.3–7.5,
  7.12 and the same SHA's `docs/TRD.md` §§6.1, 7.3–7.6, 11.2–11.3, 13.5–13.7, 15; original claims
  `OC-010`–`OC-011`, `OC-017`–`OC-018`, `OC-027`, `OC-029`–`OC-033`, `OC-039`, `OC-066`–`OC-069`,
  and `OC-077`.
- Pinned end state: `9edd9300adebcec3abd2234c946f1dcccdc17eef:docs/PRD.md` §§5.3–5.4, 6.5, 7.3–7.5 and
  `:docs/TRD.md` §§6.1, 7.3–7.6, 11.2–11.3, 13.5–13.7, 15–16; end-state claims `E-05`–`E-09`.
- Exact tip selection records for rows 3–7, 9, 11, and 15, with emphasis on
  `row-4-envelope-format.md`, `row-5-finalization.md`, `row-6-antireplay-retention.md`,
  `row-7-checkpoint.md`, and `row-15-transitions.md`.
- Exact tip generators/vectors for envelope, finalization, antireplay, checkpoint, and transitions; the row-3 record
  carrier and generated record artifact were checked for the local `heads`/outbound-state boundary.
- Exact diffs/cards for `a073574fcb90f9f2a70fa1be2bae5dc1d9c364f3`,
  `992bc9113093fe04d20df0247aa118d0f8ba365f`, `b997cdb6bfaabc0e73cbecbb444dc0df84044d71`,
  `745e332b061e0e964ae655e853f2f3b393667c66`, and `4259822828060fe2b9592fa525cd9a17170af285`,
  plus completed foundation/batch analyses and X-01/X-02's explicit cross-seam handoffs.
- Every existing finding touching envelope carriers, accepted heads, checkpoint coverage/attribution, sequence
  allocation, rotation reader eligibility, or generation/key retention.
- Disposable exact `9edd9300adebcec3abd2234c946f1dcccdc17eef` archive `/tmp/lineage-x03.tNRK9i`, Node
  `v26.7.0`: envelope, finalization, antireplay, checkpoint, and transition generators all passed `--check`.

## Method

Inventory actors and durable objects first, then derive outbound, inbound, checkpoint, and generation-switch machines
without importing the commit-card verdicts. At each network/durability boundary, distinguish “never received”,
“received but unacknowledged”, “accepted but locally unmarked”, and “definitely refused”; kill before and after each
local write; then introduce one hostile role at a time. For checkpoints, compare head vectors as partial states rather
than timestamps and ask which exact bytes let a fresh restorer prove snapshot/coverage/suffix correspondence. Only
after those attempts compare the selected prose, generators, vectors, and inherited findings.

| Relevant claims/rows/commits | Reconstructed invariant | Actors and durable state | Scenario or counterexample | Evidence | Conclusion |
| --- | --- | --- | --- | --- | --- |
| `OC-010`–`OC-011`, `OC-066`; row 4; `992bc91` | Every accepted envelope has one source, one actor, one credential-owned position, and bound clear/sealed bytes | Source client, relay, receiver; exact envelope bytes, epoch/gen, credential key | Change each trusted field; replay in another workspace; batch across actor/epoch/gen | Exact row-4 format and 21 negatives; exact `--check` | `affirmed` as encoding, `qualified` as system — the two binding lists are coherent, but the network carrier registry is stale and no layer is integrated. Strongest challenge: nonce/digest circularity; the source signature independently binds both. |
| `OC-032`, `OC-067`; row 5; `a073574` | A client admits only a gap-free per-credential prefix ending at its locally recomputed link under a signed head; `final` closes future positions | Receiver, authorization/acceptance service; `(seq,link)`, `K_accept` certificate, epoch/checkpoint vectors | Deliver a genuine signed alternate head at the same position; withhold an intermediate envelope; send a valid unaccepted old-epoch envelope | Exact finalization equations, fork/beyond-head negatives, hostile-relay test specification | `affirmed` within one view, `qualified` globally — first-seen and recomputed links reject later alternatives, but two service-signed views diverge until views meet. Strongest challenge: two clients receive different valid forks first; neither can prove its view globally canonical. |
| `OC-024`, `OC-032`; rows 3/6; `745e332` | Apply/persist a complete accepted run before advancing its encrypted local mark | Receiver and local store; content records, `heads` record, global store sequence | Kill after content commit but before mark, and reverse the order | Exact TRD §6.1/row-6 order; antireplay demonstration; X-02 kill matrix | `affirmed` abstractly — content-first leaves safe idempotent redelivery; mark-first creates a permanent content hole. Strongest challenge: duplicate replay after the kill; Yjs idempotency and identical links preserve state. Sequence allocation remains X-02's reopened implementation joint. |
| `OC-011`, `OC-068`; rows 4/6; `992bc91`, `745e332` | Exact outbound bytes and position survive until acceptance/refusal and through the second-newest checkpoint | Source client; own mark, exact pending/retained envelopes, checkpoint floor | Service accepts but reply/page is lost; relay forges a refusal; old provider is unavailable | Retention prose and self-equivocation vector; exact tip store inventory/search | `reopen` — no authenticated ordinary-refusal carrier and no durable outbound spool/order are selected. Strongest challenge: rebuild from the local journal; it preserves the delta but not random nonce, batch, digest, signature, or accepted link. |
| `OC-033`, `OC-069`; rows 5/7; `b997cdb` | One full authenticated snapshot starts at an accepted-head vector and every omitted accepted operation appears in its retained suffix; fallback is atomic | Producer, content-blind store, restorer; checkpoint, manifest, `{sv,ds}`, heads, suffix, generation wraps | Sign independent coverage bytes; advance heads beyond snapshot; corrupt newest; publish from two producers with different observed vectors | Exact row-7 carrier and negatives; existing checkpoint-coverage finding | `reopen` for semantic coverage, `unresolved` for publication/concurrent selection — field binding works, but the oracle does not relate snapshot, coverage and accepted heads, and no admission/selection transaction exists. Strongest challenge: a valid producer signature over a mismatched tuple; current checks accept the model because the constants are independent. |
| `OC-033`, `OC-077`; rows 7/15; `b997cdb`, `4259822` | Every retained fallback checkpoint remains decryptable, and `g` is deleted only after all local/remote carriers that need it are discharged | Rotating client/store; `KeyEnvelope`s, reader/recovery wraps, two checkpoints/suffixes, local trim | Admit `C_(g+1)`, satisfy trim, delete `g`, then lose newest and open `C_g` | Row-7/15 retention prose and vectors | `reopen` — the rule's subject is inverted (“drop a checkpoint” instead of retain its key), while row 15's three-part gate omits retained-checkpoint openers. Strongest challenge: a durable recovery wrap may preserve `g`; the sources do not make that object-specific condition mandatory. |
| `OC-029`, `OC-077`; row 15; `4259822` | A verified outcome is the only generation switch; a durable successor opener and every pending old delta/envelope survive the local `applying` state | Initiator, service, excluded/remaining devices; pending intent/payload, outcome, successor key/wraps, journal/batch/outbound spool | Kill at outcome, successor-envelope install, active marker, pending cleanup; retain an old-gen journal delta or unacknowledged envelope | Exact row-15 signed messages/three-way rule; row-3 key envelope; X-02 handoff | `reopen` locally, `affirmed` for abstract verdicts — signed mine/other/silence decisions are coherent, but their local durability composition is absent. Strongest challenge: recover `K_(g+1)` from the durable self-wrap; viable, but no selected order installs it before new writes or cleans old carriers. |
| `OC-027`, `OC-029`, `OC-032`; rows 5/11/15 | Relay compromise and authorization-service compromise stop at different boundaries | Hostile relay; hostile authorization service; honest client; service-admitted and ceremony-approved readers | Withhold/reorder/forge responses as relay; sign split heads/admit reader `M` as authorization service, then rotate | Component split, head signatures, row-11 transcript, row-15 wrap map; `f-c611666-rotation-reader-eligibility-missing` | `qualified` for relay, `reopen` for hostile authorization — an honest acceptance service limits a relay to availability, but a malicious authority can fork views and later receive `K_(g+1)` through missing reader-eligibility state. Strongest challenge: immediate delivery to `M` is refused; delayed unrelated rotation still wraps to it. |

## Analysis

### Actors, authority, and durable state

| Actor/domain | May authoritatively do | Must not be treated as authoritative for | Durable state relevant to this seam |
| --- | --- | --- | --- |
| Source client/credential | Sign its own exact envelope; mint its own next position; produce a checkpoint container | Service acceptance, another source's actor/history, global fork resolution | Own outbound envelopes/position; operational signing/wrapping keys; local content/head records |
| Receiving client | Verify authorization, source signature, chain and head against its own mark; apply one admitted run | A head's carried link without local recomputation; missing evidence as refusal | Per-credential `(seq,link)` vector; content records; remembered authorization head |
| Authorization service | Serialize/sign epochs and transition outcomes; certify `K_accept`; admit/revoke credentials | Content decryption, source signatures, user-mediated reader eligibility | Epoch lineage, committed-transition table, credential/capability roster |
| Acceptance signer | Sign live/final heads over the accepted per-credential chain | Source authorship or content semantics | One accepted `(seq,link)`/cutoff per credential and signed heads |
| Relay/durable store | Validate opaque envelope hash/signature and retain/deliver envelopes/checkpoints/suffixes | Acceptance/refusal, actor/capability semantics, checkpoint plaintext or coverage truth | Accepted ciphertext, checkpoints/manifests, retained suffixes, transport state |
| Checkpoint producer | Seal one snapshot and sign its manifest/observed head vector | Re-sign another source, make a missing accepted operation true, select the globally canonical fork | Snapshot, manifest, its observed accepted vector |
| Key/local stores | Make accepted marks, generation openers, journals and content survive browser kills | Service acceptance or current authorization by presence alone | `KeyEnvelope`s, pending transition, journal, content and `heads` stores |

The central distinction is three kinds of authenticity. The device signature says who made an envelope. The
acceptance head says which gap-free envelope prefix the service accepted. The checkpoint producer signature says one
device attested a container. None substitutes for the other two, and none by itself proves a single global service
view.

### Outbound envelope machine and lost replies

The protocol needs this durable machine even though the selected documents stop at the wire object:

```
local covered deltas
  -> reserve own position n and mint exact E_n
  -> persist E_n before first send
  -> submit/resubmit identical E_n while outcome is unknown
       accepted head covering n -> verify, persist own mark, retain E_n by checkpoint floor
       authenticated never-accepted refusal for E_n -> re-mint the same content at n
       anything else -> silence; preserve E_n and wait
```

| Kill/reply point | Required surviving state | Safe restart | Pinned selection |
| --- | --- | --- | --- |
| Before position/envelope persistence | Journal/content delta | Mint once after restart | Position reservation/spool not selected. |
| After exact persistence, before first send | Exact `E_n`, its covered deltas, `n` | Submit identical bytes | Required by theorem; carrier/order absent. |
| After send, before service receipt | Exact `E_n` | Retry identical bytes; service treats duplicate bytes idempotently | Retry behavior is implied by no-re-mint, not selected or vectored. |
| After acceptance, before reply/head | Exact `E_n`, old own mark | Retry/retrieve head and recompute the same link | Safe only with exact bytes; local journal cannot reproduce them. |
| After head verification, before mark commit | Exact `E_n`, old mark | Redelivery/replay; then mark | Same safe duplicate direction as inbound content-before-head. |
| After mark commit | Retained `E_n`, new mark | Continue at `n+1`; clean only below second-newest checkpoint | Retention depth selected, storage/cleanup transaction absent. |

The single position is not defective: it is what lets a client compute the chain without a service-supplied index.
Its cost is a strict exactly-once-byte discipline. Row 15 demonstrates that discipline for transition intents but
does not propagate it to ordinary envelopes. New findings
[`f-992bc91-outbound-envelope-spool-undefined`](../../findings/f-992bc91-outbound-envelope-spool-undefined.md)
and [`f-745e332-envelope-refusal-carrier-missing`](../../findings/f-745e332-envelope-refusal-carrier-missing.md)
record the two missing halves.

An authenticated ordinary refusal cannot be inferred from a non-final head at `n-1`: the service may accept `n`
later. A final head proves the credential has ended and therefore does not create a useful re-mint path. Row 15's
signed outcome cannot be repurposed because its subject is a transition `(lineage, kind, target)`, not a particular
envelope `(workspace, credential, n, digest)`.

### Inbound admission, finalization, and crash order

For one credential with local mark `(k,L_k)`, an inbound run `E_(k+1)..E_n` is admissible only if:

1. each envelope's version/workspace/credential/epoch/generation/position/digest/signature verifies and its sealed
   actor/action is authorized by the referenced epoch;
2. positions are exactly consecutive from `k+1`;
3. every `L_i` is recomputed from the receiver's `L_(i-1)`, the envelope epoch/digest and fixed chain framing;
4. a certified `K_accept` signature covers `(workspace, credential, n, L_n, head_epoch, final)`; and
5. the head is checked against recomputed `L_n`, never merely against the link it carries.

The receiver applies the whole run or none of it, commits resulting content records, and only then replaces the
encrypted `heads` record. A kill in between causes redelivery of already-applied idempotent Yjs updates and the same
links. Reversing the order creates a mark beyond durable content and makes the missing operation permanently
inadmissible. This direction is a strong affirmative conclusion and survives X-02's storage kill matrix.

`final: true` means no position above `n` may ever be accepted for that credential. It does not erase positions at or
below `n`, past copies, or offline content authored before a device observed the transition. The revocation commit is
therefore correctly the conjunction of successor epoch, client-produced new-generation wraps, and finalized cutoff;
the interface may not call a queued request or relay error “revoked”.

### Refusal, gaps, and two forks

The receiver's “hold or refuse” cases have different meanings:

| Input | Decision | Consequence |
| --- | --- | --- |
| Valid envelope above a missing position | Hold | Availability until the gap arrives or a valid checkpoint baselines above it. |
| Consecutive envelope but no covering head | Hold | Availability bounded below by head cadence. |
| Invalid signature/AAD/capability or workspace | Refuse/report | No content application or mark advance. |
| A second link at/below the held position | Refuse as equivocation/replay | No extra accepted log is needed; successor arithmetic suffices. |
| Authenticated final head at the held cutoff | Finalize credential | Later positions are permanently inadmissible; pre-cutoff accepted work remains. |

With an honest acceptance signer, a hostile relay can reorder, replay, suppress, or delay. Reordering creates a gap;
replay lands at/below the mark; suppression withholds the head; none creates accepted content. Its integrity attack is
to forge a refusal and induce re-mint, which the prose correctly forbids but the missing refusal carrier leaves
unimplemented.

A hostile/compromised acceptance or authorization service can sign two heads for different links at the same
credential/position. If both reach one client, first-seen wins and the second is evidence of equivocation. If client
A sees fork X first and client B sees fork Y first, each view is internally valid and each later refuses the other.
The epoch and checkpoint head vectors force a long-lived fork to include authorization/checkpoint state too, but do
not prevent it. Detection begins when views meet; no transparency/gossip or fork-recovery rule is selected. This is
an explicitly bounded, `qualified` conclusion rather than a newly hidden defect.

### Checkpoint production, two producers, and restore

A usable checkpoint tuple is:

```
encrypted full Yjs content-root snapshot under K_cp(g)
+ producer-signed manifest(epoch, epoch_head, g, ciphertext digest, sv, ds,
                           accepted-head-vector digest, producer)
+ the sorted accepted-head vector itself
+ every accepted envelope after that vector
+ an opener/wrap for g
```

The framing, AEAD, digest, signature, separate `sv`/`ds` fields, producer identity, and head-vector canonical sort are
well pinned. They do not prove the semantic equation “this decrypted snapshot contains exactly the accepted state
through this head vector, including these insertions/deletions”. The existing
[`f-b997cdb-checkpoint-coverage-unchecked`](../../findings/f-b997cdb-checkpoint-coverage-unchecked.md) survives:
the generator's snapshot is text and its `SV`, `DS`, and heads are independent constants. A valid producer signature
can therefore attest a mismatched tuple under the exercised oracle.

Two honest producers at the same epoch/generation may observe different accepted prefixes. If vector A dominates B,
A is the natural newer baseline; if each is ahead on a different credential, the vectors are incomparable. Either
checkpoint can still be complete when paired with the suffix from its own vector, but “newest” and “second-newest”
are not derivable from wall-clock time and the selected store has no authenticated checkpoint-admission/order carrier.
Row 7 acknowledges that service/client selection is Stage 4 work. Until it is selected, publication atomicity,
concurrent choice, local acknowledgement, and retention cleanup remain `unresolved`, not silently inferred from the
manifest signature.

Restore must verify the authorization anchor/head/generation, producer authorization, ciphertext digest and AEAD,
manifest signature, semantic `{sv,ds}` coverage, and the relationship between snapshot and accepted-head baseline
before applying anything. It then applies one full baseline and its verified suffix, persists the resulting content
and head vector atomically in the safe content-before-head direction, and only then exposes transport. A failure at
any step must discard the attempted install and try the next-newest tuple; partial checkpoint state must never merge
with local state as though a replica held it. The exact durable install/rollback transaction is not selected.

### Generation switch and old-generation deletion

The remote row-15 verdict machine is coherent:

```
persist exact signed intent/payload before network
  silence -> resubmit identical bytes
  signed outcome naming my id -> apply committed successor
  signed outcome naming another id -> discard candidate and rebuild against winner
```

Unsigned errors/timeouts remain silence, correctly preventing a relay from inducing key discard. The service's
at-most-one table and signed outcome make a lost response resolvable. The local `applying` state needs a further
order that the selection does not give:

1. retain the full pending payload, including a recoverable self reader-wrap or staged successor key;
2. verify/persist the winning outcome;
3. unwrap `K_(g+1)` and durably install its row-3 `KeyEnvelope` before making `g+1` active or accepting a new write;
4. classify old journal/batch/outbound objects: cover/reseal unminted deltas under `g+1`, preserve exact possibly
   accepted `g` envelopes until acceptance/authenticated refusal, and keep `g` available for uncleared journal data;
5. durably advance the active epoch/generation and only then clean the pending transition;
6. retain `g` until settlement, successor checkpoint admission, current-generation local trim, old-journal/outbound
   discharge, and every retained fallback checkpoint's opener condition all hold.

The pending payload's self-wrap makes recovery implementable without persisting raw `K_(g+1)`, but it does not choose
this order. New
[`f-4259822-generation-switch-local-durability-undefined`](../../findings/f-4259822-generation-switch-local-durability-undefined.md)
records that joint. New
[`f-b997cdb-checkpoint-key-retention-inverted`](../../findings/f-b997cdb-checkpoint-key-retention-inverted.md)
records the separate fallback issue: the supposed mirror rule says not to drop a *checkpoint* whose generation is
needed, while the required invariant is not to drop a *generation opener* needed by any retained checkpoint. Row
15's exact three-part gate repeats the omission.

### Hostile relay versus hostile authorization service

| Threat actor | Can do under the selected design | Cannot do without another compromise | Result |
| --- | --- | --- | --- |
| Hostile relay/store, honest services/clients | Withhold/reorder envelopes, heads, checkpoints, wraps and outcomes; replay old valid objects; forge unsigned transport errors; expose visible metadata | Forge a source envelope, accepted head, final cutoff, epoch, or transition outcome; create decryptable content | Integrity is preserved by hold/refuse if authenticated refusal is implemented; availability and durable-store service remain vulnerable. |
| Compromised `K_accept`, honest epoch authority | Sign alternate accepted links/final flags within certified key scope | Sign a source envelope or successor authorization epoch; decrypt without a reader key | Split accepted views and false acceptance/finalization evidence within the epoch; detection only when views meet. |
| Hostile authorization service | Admit credentials, certify acceptance keys, fork epochs/heads, choose transition winner, withhold state | Produce honest device signatures or learn `K_g` merely from authorization | The design explicitly trusts its integrity for a canonical lineage; confidentiality is intended to remain separate. |
| Hostile authorization service plus missing reader-eligibility state | Admit reader `M`, let row-11 delivery fail, later include `M` among remaining reader keys at an unrelated rotation | — | Existing high/high candidate `f-c611666-rotation-reader-eligibility-missing` survives: delayed authorization-only key delivery breaks the intended confidentiality separation. |

The strongest attempted disproof of the reader-eligibility finding is the row-11 ceremony: it does prevent immediate
delivery to service key `M`. It creates no durable, client-authenticated success artifact that a different future
rotating device can consult. Row 15's wrap map accepts credential ids and opaque wraps without such a proof, so the
delayed path remains reachable.

### Evidence boundary

The five exact-tip generators establish deterministic encodings, field/signature failures, chain arithmetic,
canonical sorting, self-equivocation demonstrations, and transition verdicts under their project model. They do not
run an authorization/acceptance service, persist an outbound envelope, inject browser kills, derive a real Yjs
checkpoint coverage tuple, select concurrent checkpoints, install a successor local key, or delete/fallback across
two generations. No claim above treats those missing executions as passing evidence.

## Affirmative conclusions

- The row-4 envelope's two authenticity lists are structurally correct: AAD binds every non-circular clear field,
  while the source signature reaches nonce and ciphertext digest. One actor per envelope preserves attribution
  granularity across batching.
- A per-credential accepted hash chain plus a client-recomputed terminal link gives gap detection and prefix evidence
  that independent receipts or a numeric high-water mark cannot. One signed head can safely amortize evidence over a
  whole run.
- One persisted `(seq,link)` per credential is sufficient within one view. No accepted-envelope log is needed to
  refuse a second link at or below the mark.
- Content-before-head persistence is the correct crash direction. A kill leaves duplicate idempotent coverage rather
  than an accepted operation below an advanced mark.
- `final: true` is a useful public cutoff and correctly communicates exclusion without content access; it does not
  promise history erasure, remote wipe, or immediate propagation to offline writers.
- The signed row-15 mine/other/silence rule is coherent. Identical resubmission after silence, discard/rebuild after a
  signed competing winner, and no timeout-based key discard are the correct abstract fail-closed decisions.
- A hostile relay with an honest acceptance/authorization service is limited to availability and metadata if clients
  hold on gaps/missing heads and accept only authenticated evidence. This conclusion is contingent on filling the
  ordinary-refusal carrier gap.
- The checkpoint carrier authentically binds the fields it declares, and retaining two checkpoint/suffix tuples is
  necessary rather than ornamental. The reopened conclusions concern semantic coverage, admission/order, and key
  interlock, not the AES-GCM/Ed25519 field encodings.

## Candidate or validated findings

- New, medium/high:
  [`f-745e332-envelope-refusal-carrier-missing`](../../findings/f-745e332-envelope-refusal-carrier-missing.md).
  The design requires an authenticated ordinary-envelope refusal but row 15 authenticates only transitions.
- New, medium/high:
  [`f-992bc91-outbound-envelope-spool-undefined`](../../findings/f-992bc91-outbound-envelope-spool-undefined.md).
  Exact envelope bytes/positions have no selected pre-send persistence, lost-reply retry, or retention cleanup state.
- New, medium/high:
  [`f-b997cdb-checkpoint-key-retention-inverted`](../../findings/f-b997cdb-checkpoint-key-retention-inverted.md).
  The retention rule names dropping a checkpoint rather than retaining every generation opener its fallback needs,
  while row 15 permits old-generation deletion after only one successor checkpoint.
- New, medium/high:
  [`f-4259822-generation-switch-local-durability-undefined`](../../findings/f-4259822-generation-switch-local-durability-undefined.md).
  The abstract `applying` state omits successor-key installation and old journal/batch/outbound handling.
- Existing candidates surviving direct X-03 challenge:
  [`f-c611666-rotation-reader-eligibility-missing`](../../findings/f-c611666-rotation-reader-eligibility-missing.md)
  and [`f-b997cdb-checkpoint-coverage-unchecked`](../../findings/f-b997cdb-checkpoint-coverage-unchecked.md).
- Existing candidates inherited but not duplicated:
  [`f-992bc91-network-carrier-registry-stale`](../../findings/f-992bc91-network-carrier-registry-stale.md) qualifies
  suite/carrier totality; [`f-3bea0e6-store-sequence-allocation-undefined`](../../findings/f-3bea0e6-store-sequence-allocation-undefined.md)
  qualifies `heads` persistence; [`f-b997cdb-attribution-self-replacement`](../../findings/f-b997cdb-attribution-self-replacement.md)
  qualifies the checkpoint content root and belongs primarily to X-05.

All remain `candidate`; X-03 does not pre-empt V-01's independent validation/challenge.

## Disconfirmed hypotheses and null results

- **A local accepted log is needed to reject replay/equivocation:** disconfirmed. Exact-successor arithmetic refuses
  positions at/below the mark, and the retained link plus a head checked against the recomputed successor handles the
  boundary case.
- **A content commit followed by a crash before head persistence loses an accepted operation:** disconfirmed. The
  operation is durable and redelivered; Yjs application and link recomputation are idempotent.
- **Independent signed receipts are equivalent to the accepted chain:** disconfirmed. Any subset of receipts is
  well formed; the chained terminal link is what proves the gap-free prefix.
- **A hostile relay can make an honest receiver apply an unaccepted old-epoch envelope:** disconfirmed when the
  acceptance service is honest. The relay cannot manufacture the signed chain head; missing evidence holds.
- **Replaying an old valid head advances a client:** disconfirmed. A head below the local mark adds no successor;
  one ahead still requires every intervening envelope/link.
- **Rolling back the encrypted local heads record alone creates a new accepted fork:** disconfirmed. It causes
  idempotent redelivery; exploitation still needs a second service-signed link and falls inside the disclosed split-
  service-view bound.
- **`final: true` should discard pre-cutoff content:** disconfirmed. Accepted CRDT operations may have later work
  built on them; finality closes future positions and does not adjudicate history.
- **Two credentials using the same numeric position or digest collide:** disconfirmed. Workspace and credential are
  in both chain/head framing; positions are per credential.
- **A checkpoint producer signature alone proves snapshot coverage:** disconfirmed. It authenticates the attestation,
  not the semantic relationship among snapshot, `{sv,ds}`, accepted heads, and suffix.
- **A wall clock can safely choose between concurrent checkpoints:** disconfirmed. Head vectors are the evidence;
  clocks are not, and vectors may be incomparable.
- **The transition outcome itself durably installs the target key:** disconfirmed. Its bytes contain only the
  committed intent id and lineage fields; local key recovery/install depends on separately persisted payload/wraps
  and an unselected `applying` order.
- **The exact generated artifacts are stale:** disconfirmed. All five relevant `--check` commands passed in the exact
  tip archive under the recorded Node version.

## Unresolved questions

- What exact signed object proves an ordinary envelope at `(credential,n,digest)` was never accepted, which key signs
  it, and how is replay/substitution rejected?
- Which encrypted local store persists exact outbound envelopes and position reservations before send, and when may
  accepted envelopes be removed relative to the second-newest checkpoint?
- Does an identical outbound resubmission receive the same acceptance result idempotently after a lost reply, and
  what service record enforces one accepted digest per credential/position?
- How are held gaps/heads represented across restarts, and which user-visible state distinguishes withheld evidence
  from corruption or finalization?
- What service-signed checkpoint admission/order object tells devices which two checkpoints and suffixes are retained,
  especially when producer head vectors are incomparable?
- Which producer/restorer algorithm relates a real Yjs snapshot's insertion/deletion coverage to the accepted-head
  baseline, and what independent oracle tests malicious or buggy producers?
- What atomic local transaction installs a checkpoint and head vector or rolls the attempt back before transport?
- Which exact generation opener (local envelope, device reader wrap, or recovery wrap) must survive for every retained
  checkpoint, and when can each copy be deleted?
- During a committed switch, how are successor `KeyEnvelope`, active generation, pending transition, old journal
  entries, unflushed batches, and old pending/accepted envelopes ordered across kills?
- What durable, client-authenticated reader-eligibility object lets any future rotating client exclude a service-only
  admitted credential whose enrollment delivery never succeeded?
- How are service fork evidence, user notification, and safe recovery handled when two clients' first-seen views meet?
- What accepted-head and checkpoint cadences satisfy remote-visible latency, gap retirement, first-sync, and retained-
  suffix costs once a service exists?

## Completion criteria

- [x] Actors, authoritative/durable objects, outbound/inbound/finalization/checkpoint/generation-switch machines are
  reconstructed from pinned Git objects.
- [x] Refusal, lost reply, two forks, two checkpoint producers, old-generation deletion, hostile relay, and hostile
  authorization-service scenarios are challenged separately.
- [x] X-02's successor-key-envelope and old journal/batch joints are carried through the committed transition.
- [x] Every trace-table conclusion is classified `affirmed`, `qualified`, `reopen`, or `unresolved` and names its
  strongest disconfirmation attempt.
- [x] Four new findings, two surviving cross-seam findings, affirmative conclusions, and null results are persisted
  without changing production artifacts.
- [x] Exact-tip relevant artifact checks, session handoff, checkpoint summary, and final validator are complete.

## Handoff

X-03 is complete. Run `node scripts/review-status.mjs`, then claim `X-04` by creating
`docs/review/analysis/seams/X-04-lifecycle.md` and a fresh session without moving the checkout. Carry X-03's exact
generation-switch `applying` order and reader-eligibility joint into enrollment/recovery/revocation lifecycle work;
leave checkpoint semantic coverage and outbound/refusal carrier candidates for later propagation/validation. There
is no blocker.
