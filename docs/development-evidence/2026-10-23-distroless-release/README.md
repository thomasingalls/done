# Distroless ARM64 release evidence and bookkeeping reconciliation

This repository directory is the maintained evidence home for the image-hardening and release
preparation work. Optional tool storage does not replace the repository's runtime census,
journals, execution receipts or publication procedure. The original artifacts below are preserved
byte-for-byte, including unsuccessful attempts and their limitations.

## Current candidate

The refreshed [signed d8b3f22b candidate](signed-d8b3f22b/README.md) completes the rebuild required
by patch59. Its33 final-image cases, restart smoke, TLS and predecessor/candidate rehearsal pass;
the offline package scan retains0 critical/0 high with all lower findings recorded. The hosted
contract, inventory and adapter steps also pass. That packet owns the current image identity and
unapplied infrastructure pin. It grants no generalized qualification or deployment credit.

## Historical d1c2784b artifact and scope

The tested source is signed `d1c2784bef0ccc3ea88d99dfd82f1db3a83af384`; the local image is
`done-public:d1c2784b`, linux/arm64. [Image metadata](final-artifact/image.json) is the canonical
home of its index/runtime/config digests and saved-image hash. [Source metadata](final-artifact/source.json)
binds the clean allowlisted archive, five signed commits, Git date and unmodified build switches.
[Verification](final-artifact/verification.json) records the final checks. The saved image/source
archives remain local; no keys, databases, browser profiles or dependency trees enter this packet.

Patches54–58 are signed and pushed as7069ab9b,e86bd26c,df15fd9f,dcb4e9bb,d1c2784b. They cover
non-overlapping device-session regressions, distroless packaging, the gateway shutdown repair,
and bounded browser fixture corrections. [PR57](https://github.com/thomasingalls/done/pull/57)
contains those changes plus the earlier editor/sidebar UX work.

The initial bookkeeping delta changed no allowlisted Docker build input. The wider checks then
found two stale release-adapter count fixtures. Their three literal corrections also enter the
allowlisted test context, so the original1651-file context-equality observation is only a preliminary
result. The original image remains bound to d1c2784b, not relabeled as a newer tested source. The
required signed-source rebuild and exact-image checks are now retained in the current candidate packet.
The rollback target remains the retained51d8550d image identified in image.json.

## Historical observations retained

- All33 cases inside the final image pass at their original deadlines:16 runtime/gateway,
  5 backup,6 restore and6 maintenance. Non-root ownership, SQLite/native workers, actual age child
  processes, six old/new age round trips and12 wrong-key/tamper refusals are covered.
- The uninstrumented disposable API/app smoke passes external secret custody, exclusive ownership,
  exact-origin/session boundaries, precache bytes, accepted state across SIGKILL/restart and graceful
  stop. TLS negative/positive controls and existing Node infrastructure commands pass separately.
- The actual51d8550d frontend→candidate→predecessor→candidate rehearsal passes for protected original
  and joined profiles, queued/offline writing, wrong-code refusal, undo/redo and two-way delivery.
  It uses the candidate host Node24 backend throughout; it is not predecessor-server rollback or a
  physical-device observation.
- The earlier unit run at e86bd26c passes1,927 cases with one existing skip. The full packaged run
  retains79 passes/11 failures; the affected-file rerun retains26 passes/3 failures; the final three
  pass3/3. Every original failure has a passing rerun, not a new uninterrupted90-case run.
- The pinned offline Trivy scan of the exact final image reports0 critical,0 high,25 medium,8 low
  and1 unknown without suppressions. Exploratory AMD64 emulation failures remain recorded; this
  release artifact is ARM64 and claims no AMD64 acceptance or generalized qualification.

## Why bookkeeping needed repair

The original hosted run39972700274 failed `authority:check` with “Runtime census changed.” The
existing gate correctly rejected unreviewed source coverage. The review compares the last recorded
source5934ea7a with signed d1c2784b and independently checks every source against Git blobs and
filesystem bytes. Eleven existing hashes change and the presentation-only `MenuSection.tsx` enters:
400→401 sources. All197 domain definitions and source sites are identical. Account protocol/service
bytes, registry classifications, construction dispositions and authority-map bytes are unchanged.
The existing recorder was used only after this review; no checker, assertion, test or deadline changed.

The repaired authority gate and all18 existing census/contract/registry regressions pass. The ten
commands in CI's security-contract/vector step pass on Node24.18.0 with the repository-pinned
pnpm11.20.0. [Bookkeeping checks](bookkeeping/checks) retain the original hosted/local failure and
review/recorder results. The first host launcher used an installed pnpm12 wrapper whose registry
identity verification could not reach the registry; it entered no vector workload. That launch
failure is retained. The corrected launcher uses the already-installed pinned pnpm11.20.0 directly
and makes no dependency, lockfile or verification-policy change.

The wider checks found the execution manifest still at883 obligations/339 unresolved and two stale
exact count fixtures. Independent current collection and the retained full runtime report establish
the37-case general increase (3 admitted-text,1 card-command,8 browser workflow and25 workspace
cases) and the25-case receive-editor wrapper increase. The refreshed manifest retains every old row,
non-case contract and blocker, adds exactly nine required-but-blocked files, and remains blocked at
892 obligations/348 unresolved. The graph changes only the two edited fixture hashes. All175 adapter
tests and10 inventory tests pass; no checker, case, assertion, deadline or qualification blocker is
removed. The existing named skip stays in its denominator.

Build, origin/budget and traceability checks also pass:101 claims,28/28 current defects with
named falsifiers and9 registered debts. The local live receipts are refreshed after the final
records and after signing; archived output does not replace those tree-bound receipts.

The independent auditor's first three failed attempts are retained: an unchanged-release-selection
assumption missed the nine new blocked rows; an incomplete title mapping missed the wrapper count
retitle; and a raw reporter-state mapping expected `pending` where the retained reporter says
`skipped`. The final auditor checks those exact populations/dispositions. Two rolling scratch logs
from the initial adapter/plan run were overwritten by the passing rerun; transcript excerpts retain
their failures, but are not claimed as complete original stdout. Subsequent retained attempts use
distinct names. This limitation does not alter the original hosted error or the closed archives.

## Navigation and reproduction

- [Exploration archive](exploration/evidence.zip) retains90 entries, including the baseline scan,
  age update, native ARM64 checks, AMD64 failures, independent review, controls and initial patches.
- [Signed-source preparation archive](preparation/evidence.zip) retains88 entries, including original
  full-suite failures, controls, fixture/harness corrections and passing reruns.
- [Final exact-artifact archive](final-artifact/evidence.zip) retains38 entries, including the build,
  native checks, scan, container smoke, TLS, frontend upgrade rehearsal and compatibility results.
- [Artifact index](artifact-index.json) binds copied artifacts. Every archive's complete population
  and each member's recorded size/hash were independently checked before import; no archive code was
  executed during that check. Historical report copies retain their original scratch paths/status.
- [Reproduction helpers](bookkeeping/reproduction) retain the census and evidence-import auditors.
  Copy the `.mjs.txt` census helper to a scratch `.mjs` file, then run it with repository and scratch
  output paths plus `before`/`after`. Its source identities remain pinned to the original review.

Local `.receipts/` remains the repository's live, untracked execution-receipt home. Archived logs
describe past runs and do not certify a fresh tree. Finish documentation before refreshing those
receipts. This packet adds no aggregate qualification credit and never converts a failed attempt
into a passing one.

## Publication boundary

The operator retains both merge buttons. After the application merge, verify merged build inputs
against the tested source, publish the exact tested image to the intended private package, verify
remote index/runtime digests and authenticated pull, then prepare the infrastructure PR. The
[current unapplied pin patch](signed-d8b3f22b/infra-image-pin.patch) and
[preparation receipt](signed-d8b3f22b/infra-image-pin-preparation.json)
are local-base preparation, not a claim about a refreshed remote base or a live cluster. The original
d1c2784b pin remains unchanged as historical evidence.
Reconciliation, rollout checks and cached-client adoption follow later. No image publication,
infrastructure change, merge or deployment is performed by this bookkeeping repair.
