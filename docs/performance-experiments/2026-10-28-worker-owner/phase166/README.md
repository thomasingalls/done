# Phase166 — admitted Window mirror, verified worker I/O

2026-10-28. Add an internal Window mirror that uses the **existing** admitted workspace, command
preparation, Undo/Redo, pending/predecessor handling and synchronous sealed journal. Compose it with
the phase165 native cohort and a genuinely authenticated account owner in an isolated dedicated
worker experiment. The default application still executes on the page, and existing Account/joined
factories stay exclusive. This slice establishes the ownership/admission boundary; it does not yet
fix the reported Goals/refocus stalls or qualify performance.

## Contract and implementation

`createWindowAccountMirror` requires the actual live opaque Window coordinator and a closed opening
bound to its incarnation, slot, principal, workspace, store, root, generation and capture route.
Capture inputs/methods before the first await. Receive only domain-separated **journal subkeys**,
including necessary retained journal generations. No root, content-generation or signing private key
crosses to the Window. Register erasure before awaiting; consume the incoming copies and dispose
owned journal/WASM buffers during close. Native coordinator exclusion stays held through Window
admission drain, worker stop, real member release and local cleanup; failure keeps the fence.

The trusted composition must obtain the opening from the ordinary verified worker owner. This
constructor is not an authenticator, and a native lock ticket is not decryption authority. Do not
expose its key input to service responses, UI hints or untrusted callers. The retained lab getter is
explicit instrumentation after real authentication, not a new production key-export API.

The Window synchronously prepares commands and appends through the real journal owner. A sealed
append admits locally in that handler, regardless of worker scheduling. Quota/unavailability keeps
the operation pending behind its predecessors until an actual worker commit. Existing uncertainty,
receipt and recovery semantics remain; no RPC acknowledgment substitutes for the journal. Generic
remote input refuses rather than bypassing the signed-page receiver. Authority/maintenance and
network receive remain worker-integration work beyond this slice.

Extract only the structural `AdmissionCarrier` type from the existing queue; installed TypeScript7
emits **byte-identical** comment-free JavaScript for old/new admissionQueue. No old queue runtime,
command semantics or test assertion changes. The new recovery projection is applied only after
complete original worker authentication: copy original state/update identities and bytes and all
pending journal entries, leaving private ledger/outbound metadata with its owner. It grants no
proof/coverage credit. A full-versus-projected replay oracle includes pending structs/deletions.

## Results

- Full regression run: **2,256 pass, one existing skip**,195 files. Final focused run45 pass,
  including17 new mirror/projection cases. The native coordination slice separately retains its
 20 Chromium/Firefox cases and two detected missing-anchor mutation controls.
- **Eight actual-account Chromium cases pass**, zero retries, one worker, original180s deadlines.
  Ordinary unlock/passkey verifiers, native IndexedDB/Web Locks, real source capsules, real journal
  codec and original admitted workspace execute. A virtual authenticator supplies genuine signed
  assertions for a fictional first-device v9 account; neither authentication nor signatures are
  stubbed. This does not establish a real-provider/phone walkthrough.
- While the worker is deliberately held, a Window command changes accepted text, seals a real
  journal entry and sends **zero worker requests within the handler**. Undo/Redo remain original.
  Input also succeeds during16 real verified owner status reads. This is a causal isolation proof,
  not a16ms timing result or a benchmark of full Goals DOM/IME.
- Wrong code, a corrupted genuine passkey signature and a stale opening incarnation refuse and
  release native permits. Window navigation and worker termination after a sealed edit reopen
  exactly once. Journal quota keeps text unaccepted until the native commit. A committed fallback
  with its acknowledgment withheld stays pending; after hard worker loss, normal recovery restores
  it exactly once. Hard termination earns **no** graceful worker-memory erasure credit.
- Graceful close observes all instrumented Window WASM memories zeroed and two raw worker journal
  buffers cleared; actual native permits drain. This is not physical erasure proof for all
  non-extractable CryptoKeys/process memory. All10 disposable containers are removed.
- Every case reopens the same persisted profile in the **unchanged shipping frontend**, with fresh
  ordinary factors/passkey and exact original writing plus the intended single edit.86 old assets
  remain byte-identical; source maps reconcile200 included repository sources. Independently
  reconstruct all five worker-only transformed modules and check actual launch/input identities.
- Typecheck, default application build/budget/origin-isolation, lint/format, admission/authority/WASM
  checks and98 metadata cases pass. Six diagnostic bridge-boundary cases pass; four corrupted-evidence
  audit controls refuse. New source census420,198 unchanged domain labels/templates. Two new test
  rows remain required/uncredited:940 obligations/394 unresolved; every old manifest row is retained.

## Failures retained

The first real-account attempt passes authentication then refuses the full recovery message.
The final fixture census observes full recovery beyond the unchanged4MiB lab bridge bound, versus
50,159 accounted bytes for exact admitted content. Do not infer the first attempt's unrecorded
numeric census. Project **after** original verification; never raise the bound or skip checks.
The initial and corrected test failures, type/format failures and audit construction mistakes remain
in [the reports](reports) and [notes](review-construction-failures.md). Formatting the new test after
planning snapshotting correctly causes one stale-input refusal; independently isolate that sole
changed hash and refresh it, preserving the failed check and all old obligations.

## Reproduction and remaining boundary

[Identities](identities.json), [independent audit](review.py), [result](review.json),
[final native receipt](reports/native-mirror-03/receipt.json.gz),
[full tests](reports/phase166-unit-full.log.gz), [inputs](inputs.json).
Source carriers under `reproduction/` restore the exact private loopback lab at the recorded root.
Use the fictional fixture/prepared frontend from phases155/162/163, never real account data; hashes
are recorded, factors/credentials/profiles are deliberately absent. Restore the dependency links
and source-equivalent Node24.18 container as described in phase163 reproduction. Build with failure
propagation, then run `node --test wire.test.mjs` and `python3 run.py <fresh-output-name>`. The launcher
checks lab input/complete asset identities before testing. Preserve failures. `python3 review.py`
checks retained results against the fictional writing, source transformations, old rows and current
inputs; it grants no aggregate acceptance.

The shared-memory storage bridge and isolation headers are **lab-only**, not a selected browser
requirement. Only the worker waits on that mailbox. The product still needs its ordinary asynchronous
journal/storage bridge and bounded/streamed bootstrap strategy before activation. The actual Goals
adapter, joined-device routes, generation/authority changes, automatic maintenance, network receive,
IME/suspension and full peer workload remain subsequent integration gates. Retain16ms input,
2.5s peer/all-marker and30s delivery gates without performance credit here. Service automation stays
off; qualification stays paused. Freeze sequential166 after165. No staging/signing/push, preview8443
change, release preparation or deployment.
