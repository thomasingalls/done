---
schema: 1
kind: work-item
id: S-01
status: complete
owner: root
started: 2026-08-26
updated: 2026-08-26
blocked_on: none
---

# `S-01` — adversarial scenarios

## Scope and exclusions

Replay the required crash, compromise, and lifecycle scenarios against the exact pinned lineage, recording the
initial state, ordered events, expected invariant, designed outcome, distinguishing evidence, result, and residual.
Production code, requirements, selection records, vectors, and tests are read-only. Finding disposition remains
owned by `V-01`; overall judgment remains owned by `Z-01`.

## Exact sources inspected

- Original boundary: `c6116669030eedeea3d599bca0da3547114e6930:docs/PRD.md` §§2.3–2.5, 5.3–5.4,
  6.1–6.11, 7.1–7.8, 11 and the same SHA's `docs/TRD.md` §§6.1, 7.1–7.6, 10.9–10.11,
  11.1–11.3, 13.1–13.10, 14.1–14.6, 15–16.
- Pinned end state: `9edd9300adebcec3abd2234c946f1dcccdc17eef:docs/PRD.md` at the same lifecycle,
  recovery, continuity, and security boundaries, and `:docs/TRD.md` §§6.1, 7.3–7.6, 9.3, 10.5,
  10.9–10.11, 11.1–11.4, 13.1–13.10, 14.1–14.6, 15–16.
- Exact-tip selections for rows 2–7, 9–11, and 13–16, especially
  `docs/selections/row-2-journal-aead.md`, `row-3-record-format.md`, `row-6-antireplay-retention.md`,
  `row-7-checkpoint.md`, `row-10-portable-package.md`, `row-11-enrollment-ceremony.md`,
  `row-13-device-lock.md`, and `row-15-transitions.md`.
- Exact-tip generators and checked artifacts for the journal, records, envelopes, finalization, anti-replay,
  checkpoints, packages, enrollment, device lock, recovery, head discovery, and transitions.
- Exact-tip runtime sources `src/crdt/persistence.ts`, `src/crdt/sync.ts`, and `relay/src/persistence.ts`; they are
  the predecessor plaintext/Yjs implementation and do not integrate the selected encrypted store or protocol.
- Completed `F-01`, `F-02`, `X-01` through `X-05`, and `P-01`, plus every candidate finding referenced below.
  Candidate status and severity were treated as hypotheses, not inherited verdicts.
- Primary standards used by the source seam analyses: Web Cryptography Level 2, RFC 9180, and NIST SP 800-38D,
  with their retrieval dates recorded in `X-01`, `X-02`, and the finding files. S-01 did not need a new temporal
  platform observation.

## Method

Model one durable state tuple before naming operations:

`(lineage/head, hosted state, device grant, local custody, active generation/openers, journal/batch/spool,
content/head records, checkpoints/suffixes, recovery set, terminal/export acknowledgement)`.

For each scenario below, hold all but one adversarial role honest, enumerate the ordered durable actions, and kill or
substitute at every boundary. `affirmed` means the designed outcome preserves the expected invariant on paper;
`qualified` means it does so only within an explicit trust, availability, or implementation boundary; `reopen`
means a missing or contradictory selected state admits a bad result; `unresolved` is reserved for a deliberately
deferred product or implementation choice. A generator is evidence for carrier bytes only, not for persistence or
multi-actor orchestration.

No new dynamic run was justified. The completed seam passes already ran every relevant exact-tip generator from
disposable `9edd930` archives. The pinned tip has no encrypted adapter, authorization/acceptance service, outbound
spool, lifecycle deletion worker, or restore implementation on which browser-kill injection could distinguish the
scenarios below. Re-running shared-model generators would add no independent evidence. Exact `git show`, `git grep`,
and tree inspection were used instead, without moving the checkout.

## Analysis

### Persistence-boundary replay

| Scenario | Initial state | Ordered events | Expected invariant | Designed outcome | Evidence | Result | Residual |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `P-01` startup and replay | Slot has an opener for `K_g`, encrypted journal entries, and older IndexedDB records; transport is configured | Instantiate the synchronous seal; open key store; unseal `K_g`; derive subkeys; replay journal; load content/heads; only then construct transport; kill after each step | No network state is applied before all recoverable local work, and module failure creates no editable unjournalled interval | The selected order is synchronous through journal replay and keeps transport last | Tip TRD §6.1 and §10.10; `X-02` startup machine | `affirmed` as a specification, unintegrated at tip | Authentication/unknown-version failures still need an explicit blocked/read-only repair state; ordinary runtime is predecessor code |
| `P-02` successful local write and batch | One active generation and a writable document | Yjs emits update; seal and `localStorage.setItem`; enqueue IDB batch; kill before request, during transaction, after `complete`, and before/after compare-and-remove | After a successful synchronous journal write, every kill leaves journal coverage, committed record coverage, or both | Before `complete`, the journal replays; after it, record authority exists; failed cleanup leaves an idempotent duplicate | Tip TRD §6.1; row 2; `X-02` complete kill matrix | `affirmed` for the page-kill boundary | No stronger OS power-loss durability is inferred; encrypted implementation is absent |
| `P-03` synchronous journal failure | Yjs can emit an update larger than 65,536 bytes, or storage/seal can throw | Apply mutation; seal refuses or `setItem` fails; page dies before IDB commit | An accepted local mutation is either synchronously durable or refused before mutation | The wrapper deliberately refuses oversize input, while selections provide no pre-mutation refusal, chunking, or alternate durable state; predecessor policy reports then continues | `9edd9300adebcec3abd2234c946f1dcccdc17eef:wasm/journal-seal/seal.generated.ts`; row 2; [`f-9b49b74-journal-seal-64k-gap`](../findings/f-9b49b74-journal-seal-64k-gap.md) | `reopen` | Quota, unavailable storage, traps, and bad fixed-width inputs are the same unresolved state class even where no separate finding was created |
| `P-04` two-tab sequence and trim race | Two tabs share content and `heads`; both see the same committed maximum | Both select `n+1`; encrypt before either record commit; one tab snapshots through `n+1`; concurrent writes/trim interleave; kill after any future reservation | Every AES-GCM attempt has a unique budgeted sequence and no trim deletes a record outside its snapshot | Random IVs reduce collision risk but do not allocate authenticated `seq`; no reservation, range, generation-start watermark, or trim lease is selected | Row 3; tip TRD §6.1; [`f-3bea0e6-store-sequence-allocation-undefined`](../findings/f-3bea0e6-store-sequence-allocation-undefined.md) | `reopen` | A durable allocator is straightforward but creates reservation/encrypt/commit kill states that must be selected and tested |
| `P-05` single-writer trim | Old updates exist through watermark `h` | Build covering Yjs state; commit sealed state; kill; then delete only covered updates in a second transaction; kill during deletion | Deletion never precedes authoritative coverage | Before state commit old records remain; after it, duplicates are safe; IDB deletion commits or aborts atomically | Tip TRD §6.1; row 3; `X-02` trim matrix | `affirmed` for one coherent trimmer | Multi-tab watermark and mutual exclusion inherit `P-04`; semantic checkpoint coverage is a different object |
| `P-06` inbound content/head crash | Local mark is `(k,L_k)` and a verified consecutive run through `n` is ready | Apply whole run; commit content; kill; commit encrypted `heads` mark; kill | The mark never advances beyond durable content; restart may redeliver but never omit | Content-before-head leaves idempotent redelivery after a kill; reversing the order is forbidden | Rows 5–6; tip TRD §§6.1, 7.5; `X-03` | `affirmed` abstractly | Requires an integrated all-or-none run and the sequence allocator from `P-04` |
| `P-07` outbound send and lost reply | A local delta is covered in journal/content but no accepted mark exists at source position `n` | Mint random-nonce signed `E_n`; send; service accepts; reply is lost; page dies; restart must decide what to send | Exact bytes and position survive before first send and until acceptance or authenticated refusal | The theorem requires byte-identical retry, but no encrypted outbound record, position reservation, or cleanup order is selected; local Yjs bytes cannot reconstruct `E_n` | Rows 4–6; [`f-992bc91-outbound-envelope-spool-undefined`](../findings/f-992bc91-outbound-envelope-spool-undefined.md) | `reopen` | Remote fetch is not a substitute when the old store is hostile/unavailable and does not cover a request lost before receipt |
| `P-08` device-lock local migration | `L_local` opens every retained generation; new factors are not yet authoritative | Persist `enrolling` and factor seals; stage envelopes under `L_lock`; kill after each; atomically swap envelopes, delete `L_local`, mark `locked/rotation_owed`; kill; settle rotation later | No crash state loses every opener, and the stronger forward promise begins only after rotation | Staging keeps the old opener; one transaction makes swap/delete/state all-or-nothing; post-swap remains readable but weaker until rotation | Row 13; tip TRD §13.3; `X-01`/`X-02` | `affirmed` for opener safety; `qualified` for forward custody | Normative copy loses the reachable owed state: [`f-dbfd01f-device-lock-rotation-caveat-lost`](../findings/f-dbfd01f-device-lock-rotation-caveat-lost.md) |
| `P-09` committed generation switch | Durable signed pending intent contains target wraps; `g` has journal, batch, possible outbound work, and checkpoints | Submit exact intent; persist signed winning outcome; kill before/after self-wrap open, successor `KeyEnvelope`, active marker, old-work classification, pending cleanup, checkpoint, trim, and old-key deletion | Exactly one active generation is reopenable; no old local work is lost; possibly accepted old envelopes remain byte-identical | Persist-before-send and signed mine/other/silence are sound, but local `applying` ordering is not selected | Row 15; [`f-4259822-generation-switch-local-durability-undefined`](../findings/f-4259822-generation-switch-local-durability-undefined.md) | `affirmed` for the wire verdict; `reopen` locally | The self reader-wrap makes recovery possible but does not order install, switch, cleanup, or old-carrier discharge |
| `P-10` checkpoint install and rollback | Fresh/restoring client has a candidate checkpoint, manifest, accepted-head vector, suffix, and generation opener | Verify trust/head/producer/digest/AEAD/signature/coverage; install baseline and suffix; persist content then heads; kill or fail at every step; try next checkpoint | A failed newest tuple contributes no partial authority; one complete tuple installs atomically or fallback starts clean | Field bindings are selected, but semantic snapshot/`{sv,ds}`/head coverage and an install/rollback transaction are not | Row 7; [`f-b997cdb-checkpoint-coverage-unchecked`](../findings/f-b997cdb-checkpoint-coverage-unchecked.md); `X-03` | `reopen` for coverage; `unresolved` for install transaction | A producer signature attests the tuple but cannot make mismatched coverage true |
| `P-11` clean first-deployment cutover | Known development origin contains plaintext `1:` journal and `done` IDB, including possibly journal-only work | Export; verify; import encrypted state; choose active store; delete legacy journal and DB; kill before/after every action | Every restart has either recoverable pre-cutover state or one verified encrypted state; completion leaves no plaintext | Selections separately say preserve/report legacy journal and delete old DB, but no joint restart state is selected | Tip TRD §14.6; rows 2–3; [`f-9860a0b-legacy-plaintext-repair-undefined`](../findings/f-9860a0b-legacy-plaintext-repair-undefined.md) | `reopen` | A fresh origin/manual cutover limits impact but does not define reopening the known old origin |

### Network, compromise, and lifecycle replay

| Scenario | Initial state | Ordered events | Expected invariant | Designed outcome | Evidence | Result | Residual |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `A-01` relay refusal versus silence | Source has exact `E_n`; honest acceptance service/store are behind a hostile relay | Accept `E_n` but withhold head; return unsigned refusal; alternatively genuinely refuse `E_n`; source chooses retry/re-mint | Silence preserves and resubmits identical bytes; only an authenticated statement that exact bytes were never accepted licenses re-mint | Prose states the correct rule, but no signed ordinary-refusal carrier names workspace, credential, position, digest, epoch, and never-accepted verdict | Tip TRD §7.4; row 6; [`f-745e332-envelope-refusal-carrier-missing`](../findings/f-745e332-envelope-refusal-carrier-missing.md) | `reopen` | Acting on relay error creates self-equivocation; treating every response as silence preserves integrity but can stall one credential forever |
| `A-02` service equivocation | Two honest clients share one local prefix; acceptance/authorization service is malicious | Service signs different links or epochs at the same position and gives one fork first to each client; views later meet | No cryptographic claim of global non-equivocation; each client refuses a second link, and divergence becomes detectable when views meet | First-seen plus recomputed links preserves each view; service signatures can sustain split views; no transparency/gossip/recovery rule is selected | Tip TRD §§7.5, 13.5; rows 5–7; `X-03` | `qualified`, matching the stated trust boundary | Until views meet, both forks are internally valid; compromised `K_accept` can also falsify finalization inside its certified scope |
| `A-03` authorization-only reader receives a later rotation | Service admits malicious reader `M`; row-11 ceremony never succeeds | Honest owner later rotates for another reason; it consumes service-declared remaining readers and emits wrap for `M` | Authorization alone must never cause content-key delivery | Immediate SAS correctly blocks the first wrap, but no durable client-authenticated eligibility object distinguishes `M` at another rotator | Tip TRD §§13.2, 13.6–13.7; rows 11/15; [`f-c611666-rotation-reader-eligibility-missing`](../findings/f-c611666-rotation-reader-eligibility-missing.md) | `reopen` | This converts hostile authorization into decryption from `g+1`, not merely availability/fork control |
| `A-04` simultaneous enrollment and rotation | New credential is service-admitted and a committed-SAS ceremony at epoch `e` is in progress | Rotation commits successor `e+1` before nonce reveal/wrap; honest ceremony detects changed epoch/head; rotator also decides which readers receive `K_(g+1)` | A ceremony spanning an epoch successor restarts; an uncompleted credential receives no successor key | Row 11 explicitly requires restart and its transcript detects stale epoch/head; the rotate recipient set still lacks independent success evidence | Row 11 §7; row 15; `A-03` finding | `affirmed` for honest stale-ceremony rejection; `reopen` for recipient selection | A single shared eligibility object would resolve both interrupted enrollment state and future rotation; a local success bit is insufficient |
| `A-05` stale profile restored before lock rotation settles | Profile copy holds `L_local` and `K_g`; live profile has atomically become locked with `rotation_owed` | Live device continues writing under `g`; stale copy executes origin and reads new ciphertext before later rotation | Copy protection is not claimed until the forward rotation commits | Selection records the weaker owed state, but normative copy says protection applies “from now on” unconditionally | Row 13; [`f-dbfd01f-device-lock-rotation-caveat-lost`](../findings/f-dbfd01f-device-lock-rotation-caveat-lost.md) | `qualified` construction; `reopen` copy/propagation | History remains readable by design even after rotation; this row concerns intervening future writes |
| `A-06` stale profile after successful lock rotation | Pre-lock copy on the no-PRF operational-key tier holds the same promptless device wrapping key and usable relay/account access | Live profile locks and rotates; rotation publishes its self-reader wrap; stale copy fetches wrap and opens `K_(g+1)` without `L_lock` | Every path by which that slot obtains future generations is factor-gated or excluded from the temporal promise | The local envelope is protected, but the separate operational reader credential is unchanged and receives the new key | Tip TRD §§13.3–13.4; rows 13/15; [`f-f5def83-device-lock-reader-key-bypass`](../findings/f-f5def83-device-lock-reader-key-bypass.md) | `reopen` | Attack fails on PRF-protected operational keys or after copied network authority expires; those bounds do not support tier-independent copy |
| `A-07` compromised browser origin | Honest persistent crypto state is open in a running first-party origin | Hostile same-origin script reads live plaintext, invokes non-extractable keys, signs/decrypts, exfiltrates results, or observes a factor entered during compromise | E2E and non-extractability make no confidentiality claim against code executing the key-holding origin | The TRD explicitly places same-origin code inside the boundary; non-extractability blocks raw export, not authorized use | Tip TRD §10.9 and §§13.3–13.4; WebCrypto boundary in `X-01` | `affirmed` as an honest guarantee boundary | CSP, Trusted Types, release/service-worker integrity, egress controls, and WebAuthn embedding policy are application/deployment obligations, not cryptographic rescue |
| `C-01` newest-checkpoint loss | Store retains `C_(g+1)` and `C_g` plus suffixes; newest becomes corrupt/unavailable | Restorer verifies newest and rejects it; requests second-newest; tries to unwrap `g`; applies its suffix | The required two-checkpoint policy yields a complete next-newest restore | Fallback shape is right, but row 15 may already have allowed every opener for `g` to be dropped | Tip TRD §§7.6, 11.3; row 7; [`f-b997cdb-checkpoint-key-retention-inverted`](../findings/f-b997cdb-checkpoint-key-retention-inverted.md) | `reopen` | With an explicitly retained opener and semantic coverage, the fallback works; newest loss is not inherently fatal |
| `C-02` old-generation deletion | Rotation settled, `C_(g+1)` admitted, local state trimmed under `g+1`; old journal/outbound objects and fallback `C_g` may remain | Apply current three-part deletion gate; delete `g`; later replay old carrier or lose newest checkpoint | No generation opener is deleted while any journal, outbound envelope, package, or retained fallback still needs it | Current gate checks settlement/new checkpoint/local trim only; it omits fallback opener and old local/network carrier discharge | Row 15 §7; `P-09`; checkpoint-retention finding | `reopen` | “Drop generation” may mean only one local envelope, but the required surviving object-specific unwrap path is not named |
| `C-03` total-device-loss recovery from hosted copy | No device survives; before retention expiry the user has account access, authorization service, generated code, and hosted ciphertext/wraps | Authenticate account; obtain nonce-bound signed head; unseal `R_priv`; unwrap retained generations; restore ciphertext; enroll replacement | Each of four independent recovery objects is necessary; a relay cannot replay a standing head | The four-object model, generated code, and nonce-bound head are coherent on paper | Tip TRD §§13.5, 13.8; rows 9/14/16; `X-04` | `qualified` affirmative | Missing any object is honest permanent loss; no integrated clean-device restore/service exists at the tip |
| `C-04` hostile authority at total-loss first contact | Same as `C-03`, but authorization service is malicious and the recovering device has no outside head anchor | Service signs a stale self-consistent head and withholds the successor generation/current ciphertext | Relay replay must fail; the authorization service remains first-contact authority but cannot make stale state look current content | Client nonce defeats relay replay; hidden revocation implies hidden rotation, so the stale view is a visible/availability partition rather than current-state integrity | Tip TRD §13.5; row 9; `X-04` | `qualified`, matching the stated bound | Weakest when little content distinguishes generations; package/other device can supply an outside anchor |
| `C-05` total-loss restore from a writable package | User has genuine code-sealed `R_priv`, while package writer controls all package bytes | Writer keeps genuine `R_pub`, creates attacker root/content/generation, makes a fresh HPKE wrap under attacker-chosen `info`, and signs a self-consistent package; user opens it with genuine `R_priv` | User-held recovery material authenticates the historical root, not merely a recipient | Base-mode HPKE authenticates no sender; changing `info` on an old ciphertext is an insufficient negative because the writer can rewrap | Row 10; [`f-745e332-package-root-rewrap-substitution`](../findings/f-745e332-package-root-rewrap-substitution.md) | `reopen` | A non-rewrappable root/lineage commitment protected by the user factor is still required |
| `C-06` recovery replacement after code exposure | Adversary retained old code plus old recovery envelope/wrap or `K_g`; owner still has device/account proof | Owner atomically installs new recovery set but continues writing under `g`; adversary obtains later ciphertext | Replacement of exposed read capability prevents future access after the transition | Old live service set is removed, but no forward generation rotation occurs; exact replacement payload also omits envelope/wrap bytes | Rows 14–15; [`f-4259822-recovery-replacement-no-forward-rotation`](../findings/f-4259822-recovery-replacement-no-forward-rotation.md), [`f-4259822-recovery-replacement-payload-bytes-unbound`](../findings/f-4259822-recovery-replacement-payload-bytes-unbound.md) | `reopen` | Lost-but-uncopied code is narrower and safe after deletion; the explicit exposed-code use case is not |
| `C-07` lapse, resume, and expiry | Live account enters hosted read-only/dormant state; local devices remain writable | Stop sync after grace; start one retention clock; resume before expiry, or delete ciphertext/wraps at expiry; race with retirement and crashes | Lapse never creates terminal lineage; clock starts once; expiry affects hosted material only and is resumable | State separation and twelve-month policy are coherent, but row 15 defines no lapse kind and no expiry/reseed deletion transaction | Tip PRD §6.10; rows 15–16; [`f-4259822-lapse-transition-kind-missing`](../findings/f-4259822-lapse-transition-kind-missing.md) | `affirmed` policy separation; `reopen` durable carrier; `unresolved` expiry transaction | A separate billing state machine is viable but cannot be credited until selected; backups/replicas and plan-specific ceilings remain implementation obligations |
| `C-08` expiry with divergent survivors | Hosted copy and wraps have expired; two detached devices contain divergent descendants of a common ancestor | One device resumes/reseeds first; second appears later; service must not treat the first as never-established genesis or discard the second | Surviving local replicas remain authoritative and converge; expiry is not retirement or identity reset | Requirements preserve both replicas and live lineage, but no multi-survivor reseed/install transaction is selected | Tip TRD §§13.5, 13.8, 14.5, 16; `X-04`/`X-05` | `qualified`/`unresolved` | If no device and no fidelity archive survives after hosted expiry, permanent loss is the disclosed result, not a defect |
| `C-09` migration with old service unreachable | User has a surviving device or independently held package/factor; old authority/store cannot be contacted | Verify recovered old material; create new service account, lineage, and generation; admit checkpoint as new origin; each returning device re-envelops only its own suffix | Migration isolates the old lineage, preserves attributable history, and never launders another credential's residue | New-lineage/new-generation and own-source-only suffix rules are sound; package root, checkpoint coverage, Local opener, and exact external execution remain open | Tip TRD §§14.1–14.3; rows 7/10; `X-05` | `qualified` | Old service may still call its copy live; operations known only to a never-returning credential are honestly lost |
| `C-10` retirement and deletion | Live lineage and hosted ciphertext exist; some devices may be stale/offline; no independent current export is yet acknowledged | Submit durable `retire`; commit terminal record; assemble/deliver package; catch up/note absent devices; delete hosted classes; kill at every step | Terminal state precedes deletion, and deletion cannot start until a verified-current survivor/export durably acknowledges complete evidence | Terminal-before-delete and signed retry verdict are sound, but no safe-survivor/package/catch-up acknowledgement gates deletion; record-only live→retired upgrade also lacks a re-signing rule | Tip TRD §14.4; rows 10/15; [`f-4259822-retirement-safe-survivor-gate-undefined`](../findings/f-4259822-retirement-safe-survivor-gate-undefined.md), [`f-745e332-live-retired-package-resigning-undefined`](../findings/f-745e332-live-retired-package-resigning-undefined.md) | `affirmed` direction; `reopen` deletion gate | An offline device remains a detached stale replica and must not claim retirement until terminal evidence arrives |
| `C-11` disappearance of the entire original provider account | App origin, relay, authorization, and hosted store are all unreachable; user has only material already outside that account plus local software/data | Read/edit locally; restore archive on clean device; deploy replacement client/services independently; migrate and enroll devices; repeat with newest checkpoint unavailable | Service independence requires independent material and execution, not another bucket controlled by the same operator | The continuity gate defines the correct nine tests and local-first permits continued local use, but tests 4–9 and an independently runnable replacement stack are not present | Tip TRD §11.3 and §14.5; `X-05` | `qualified`/`unimplemented` | A surviving local replica does not by itself prove clean-device recovery or replacement-service availability; a Local archive also lacks its selected portable opener |

### Combined interpretation

The replay does not support a single “crypto broken” or “crash unsafe” judgment. Three local orders survive every
enumerated page kill: journal before asynchronous record before journal removal; covering state before trim deletion;
and accepted content before the local head mark. Device-lock's stage-then-atomic-swap order also preserves an opener.
The surviving failures appear where those machines exchange authority or durable state:

1. content records do not preserve the exact random-nonce outbound envelope required after a lost reply;
2. service admission does not preserve a client-authenticated fact that a reader/recovery recipient passed human
   authentication before a later rotation;
3. a signed transition outcome does not order successor local-key installation and old work cleanup;
4. retaining two checkpoint byte strings does not retain their semantic coverage or required generation openers;
5. terminal/lapse state does not by itself prove deletion prerequisites, receipt, or resumable expiry.

Those are composition gaps. They do not erase the narrower affirmative result of the component orderings, carrier
bindings, generated code entropy, or transition signatures.

## Affirmative conclusions

- Journal → record → compare-and-remove, covering state → delete, and accepted content → local head are the safe
  page-kill directions. Duplicate coverage is deliberate and Yjs idempotency makes it safe.
- Device-lock staging plus one swap/delete/state transaction never loses the last local opener. The weaker
  `rotation_owed` state is detectable and recoverable even though its copy was not propagated accurately.
- The row-15 wire verdict survives loss, replay, duplicate, and conflict: exact pending bytes precede submission;
  unsigned errors/timeouts are silence; a matching signed outcome applies; a different signed winner rebuilds.
- An honest enrollment ceremony spanning an epoch successor is detected by the bound epoch/head and must restart.
  Immediate delivery to the typed-SAS-authenticated `W_pub` remains sound at the composition-vector layer.
- With an honest acceptance service, a hostile relay can withhold/reorder/replay but cannot forge source envelopes,
  accepted heads, final cutoffs, or transition outcomes. Availability remains intentionally outside that integrity
  result.
- Service equivocation is correctly bounded rather than claimed impossible: one view is consistent; two signed
  views are detected only when they meet.
- Total-device-loss recovery correctly keeps account access, authorization, a content factor, and ciphertext as
  four independent objects. The nonce-bound head moves replay authority from relay to authorization service.
- Lapse, hosted expiry, retirement, migration, and Local replicas remain distinct. Migration creates a new
  lineage/generation and does not pretend to retire an unreachable service; retirement's terminal-before-delete
  order is fail-closed.
- Same-origin compromise is stated honestly as inside the E2E boundary. Non-extractability is not credited as
  protection against hostile code that can invoke the key.

## Candidate or validated findings

No new finding file was needed. Every combined counterexample reduced to an existing atomic candidate, and S-01 did
not promote, merge, or otherwise dispose any candidate:

- Persistence/retry: `f-3bea0e6-store-sequence-allocation-undefined`,
  `f-9b49b74-journal-seal-64k-gap`, `f-9860a0b-legacy-plaintext-repair-undefined`,
  `f-992bc91-outbound-envelope-spool-undefined`, `f-745e332-envelope-refusal-carrier-missing`, and
  `f-4259822-generation-switch-local-durability-undefined`.
- Enrollment/custody: `f-c611666-rotation-reader-eligibility-missing`,
  `f-a073574-enrollment-recovery-key-unbound`, `f-dbfd01f-device-lock-rotation-caveat-lost`, and
  `f-f5def83-device-lock-reader-key-bypass`.
- Recovery/continuity: `f-b997cdb-checkpoint-coverage-unchecked`,
  `f-b997cdb-checkpoint-key-retention-inverted`, `f-745e332-package-root-rewrap-substitution`,
  `f-4259822-recovery-replacement-no-forward-rotation`,
  `f-4259822-recovery-replacement-payload-bytes-unbound`, `f-4259822-lapse-transition-kind-missing`,
  `f-4259822-retirement-safe-survivor-gate-undefined`, and
  `f-745e332-live-retired-package-resigning-undefined`.

`f-745e332-local-archive-portable-wrap-undefined` remains a service-disappearance/Local-restore dependency, but the
scenario replay did not add a second consequence beyond its existing high-confidence candidate. All remain for the
independent `V-01` owner to challenge.

## Disconfirmed hypotheses and null results

- **A kill after IDB commit but before journal cleanup loses or double-applies an edit:** disconfirmed. Durable
  content exists and replay is idempotent; cleanup affects duplicate work only.
- **Trim needs one atomic state-plus-delete transaction:** disconfirmed. Two transactions in state-first order make
  the intermediate state safe duplicate coverage.
- **The receiver must persist its accepted mark before content to prevent replay:** disconfirmed. That order creates
  a permanent content hole; content-first turns the kill into safe redelivery.
- **Timeout or an unsigned policy error is a definite refusal:** disconfirmed. It cannot distinguish remote
  acceptance with a lost reply; acting on it can create two signed envelopes at one position.
- **The transition client should rebuild after silence:** disconfirmed. Silence may hide a committed winning
  request; exact resubmission is the only safe wire action.
- **A ceremony may finish across a concurrent epoch successor because its key is unchanged:** disconfirmed. The
  epoch/head are intentionally in the typed transcript, so the attempt restarts.
- **Every restored pre-lock profile opens post-rotation content:** disconfirmed. The concrete bypass needs the
  no-PRF operational-key tier plus usable access to the self-wrap; PRF-gated credentials or expired access stop it.
- **Newest-checkpoint loss is necessarily fatal:** disconfirmed. The second-newest checkpoint plus suffix works if
  its semantic coverage and one authenticated generation opener remain. The surviving concern is the deletion
  predicate, not the fallback idea.
- **Hosted expiry destroys every recovery path:** disconfirmed. Surviving devices and fidelity archives outlive the
  hosted window; only total loss without either is final.
- **Migration remotely retires an unreachable service:** disconfirmed. It intentionally isolates that copy by a
  new lineage/generation and makes no remote-revocation claim.
- **Service disappearance makes an already-open local workspace read-only:** disconfirmed. Local editing remains
  available; clean-device restore, new-service deployment, and convergence are the qualified steps.
- **A compromised browser origin is supposed to be stopped by E2E encryption:** disconfirmed as a project claim.
  The tip explicitly makes that origin part of the trusted computing boundary.
- **More carrier-generator execution would decide these scenarios:** disconfirmed. The missing evidence is durable
  multi-actor integration; every relevant generator already passed its exact project-owned byte model in the seam
  passes.

## Unresolved questions

- Which durable cross-tab sequence allocator and per-generation invocation accounting gives trim a safe watermark?
- What pre-mutation state handles oversize updates, quota/unavailable `localStorage`, WASM traps, and fixed-width
  input errors without accepting an unjournalled mutation?
- What encrypted outbound spool, position reservation, signed ordinary-refusal carrier, and checkpoint-relative
  cleanup order implements exact-byte retry?
- What client-authenticated enrollment-success object binds credential, `W_pub`, authentic `R_pub`, recovery
  envelope, lineage/head, and installing device for every future rotator?
- What local `applying` order installs the successor `KeyEnvelope`, advances the active generation, preserves or
  reseals old journal/batch work, keeps possibly accepted old envelopes exact, admits a checkpoint, trims, and then
  deletes old openers?
- What independent checkpoint oracle and atomic install transaction relate real snapshot bytes, `{sv,ds}`, accepted
  heads, suffix, and fallback generation openers?
- What non-rewrappable user-held package root authenticates history, and what Local-specific opener makes the same
  format restorable without an account recovery keypair?
- Is lapse a fourth transition or a separate durable service state machine, and how do expiry, backups, divergent
  reseed, and retirement races resume after every partial deletion?
- What acknowledgement proves a current survivor/export caught up and received complete terminal evidence before
  any hosted deletion class runs?
- Which independent software/distribution/service artifacts execute continuity tests 4–9 with the whole original
  provider account unavailable?

## Completion criteria

- [x] Every scenario named in the brief is replayed: persistence kills, relay refusal/silence, service equivocation,
  stale profiles, simultaneous enrollment/rotation, newest-checkpoint loss, old-generation deletion, total loss,
  lapse/expiry, migration, retirement, service disappearance, and compromised origin.
- [x] Every row records initial state, ordered events, expected invariant, designed outcome, evidence, result, and
  residual.
- [x] Crash schedules cover startup, journal/batch, trim, accepted heads, outbound send, device-lock swap,
  transition application, checkpoint install, cutover, expiry, and retirement deletion.
- [x] Affirmative results remain separate from missing integration and candidate findings remain unvalidated.
- [x] Dynamic execution was considered and declined with a recorded evidence reason rather than silently omitted.
- [x] No production artifact, requirement, selection, vector, test, finding status, or coordinator file changed.

## Handoff

S-01's analysis is complete. Run `node scripts/review-status.mjs`; after this artifact and its session validate as
complete, claim first-ready `V-01` at `docs/review/analysis/finding-challenges.md` with a fresh session. V-01 must be
owned independently from each finding's `created_by`, challenge all 37 candidates plus the load-bearing affirmative
conclusions above, and record `challenged_by` on every finding it disposes. There is no blocker.
