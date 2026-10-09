# Persistent-profile migration host preflight — 2026-09-10

**The experimental CDP host is unsupported for migration.** The private preflight is implemented, but its
native probes observed old executable writes during attempted containment. No production exclusion authority
is issued, and no coordinator bridge or default-app cutover is enabled. This closes an experiment only when
its declared diagnostics finish; passing assertions must never be read as passing host acceptance.

The preparation was committed as `0d9c733`. The runner builds the unmodified predecessor application and
service worker from `7d238eecec4fe760f026ce1b68f3ca5603a9086a`, using the installed dependencies and preserving
source/build hashes. Each profile is created beneath a new test-output directory; no real profile is attached
or cloned. The observer captures/replays existing source owners under their lifecycle permit, inventories
native carriers independently and saves the diagnostic packet outside the profile. It cannot enroll/import/
select a destination, mint a factor, invoke cleanup or clear site data. Deliberate old writes and destructive
controls belong to disposable fixtures.

## Native findings

| Boundary | Measured result and implication |
| --- | --- |
| New page execution | A first-script localStorage sentinel appeared before the host called `Runtime.runIfWaitingForDebugger` on the target, although its attach event reported `waitingForDebugger: true`. This reproduced with recursive auto-attachment enabled and disabled. This candidate does not provide the required pre-execution barrier. |
| Same-process iframe | Its first script wrote a sentinel without a separate attached target. A page/worker target census cannot certify containment of its documents. |
| Dedicated, shared, blob and service worker probes | No sentinel write was observed in the 200 ms pause window; native IndexedDB writes appeared after explicit release. This finite negative observation is not universal worker exclusion or complete worker restart coverage. |
| Cached shell after browser crash | Chromium restored a maintenance URL as the old `done` application through the legacy navigation cache. An independently created reader at the same URL was the intended maintenance fixture. The restored old application changed source; current-source verification refused. Per-target service-worker bypass on the reader does not control earlier restored execution. |
| Offline/direct old assets | Retained caches/registration served the actual pinned old application offline, and it persisted an injected edit. Importing its hashed production asset directly also booted and wrote. Existing executable bytes remain a retirement obligation. |
| Frozen/history documents | A frozen document resumed and wrote. Back/forward navigation was exercised, but its pageshow marker was `load`, not BFCache restoration. BFCache exclusion remains untested; installed-window UI was not exercised in this headless host. |
| Second browser process | The final full run's second invocation exited with code 21 and no observed first-line source write. This is one profile-singleton observation, not a general second-process exclusion proof. |
| Transport | A real predecessor provider attempted reconnect after another context removed `done.sync`. A configured remote source is classified as requiring reconciliation; local replay does not establish every remote edit's delivery. |
| Conditional broadcast fallback | With native BroadcastChannel disabled, installed y-websocket 3.0.0/lib0 0.2.117 left a localStorage relay/room entry. Its decoded protocol update cold-recovered the synthetic text and remained after close. The native-broadcast control did not produce that carrier. Deployed presence is unknown; the current cleanup manifest does not cover it. |

The full report pins **Chrome/151.0.7922.34**, revision
`@782af9cb30a53f54487e5d2e44738645a8ec457c`, protocol `1.3`, the launcher hash and the actual served
`/json/protocol` body/hash. Results apply to this launch configuration and fixture, not all CDP clients,
Chromium versions or possible external host designs. Unknown targets and already-running contexts are
recorded as coverage gaps; the connection epoch is expressly not an exclusion capability.

## Source preservation and file recovery

The recovery file is exclusively created, written, synced and closed outside the browser profile. A fresh
renderer receives newly read file bytes and cold-replays them against a separate Node operation ledger.
Missing, replaced, truncated or differently bound input refuses without creating a destination. The original
file is retained across restart and source drift; it is never recaptured to silently change the binding.
Unknown source keys survive the readonly scenarios. Packet recovery is plaintext diagnostic recovery under
`markdown-system-v1`, not a fidelity archive, later-edit backup or product file-picker ceremony.

Two generated failures corrected an overly strong fixture durability assumption. First failures were saved
before shrinking; both 120-second shrink budgets expired, so neither input is claimed minimal.

| Original run / canonical input hash | Preserved observation | Corrected scope |
| --- | --- | --- |
| `directed-4` / `9af318c084ec7bdecccb8145dc94daaa68b52326cc86e1c4cc4e837433e25f9c` | Whole-browser SIGKILL after freshly seeding the profile left the recovered localStorage census empty. | Gracefully close/reopen the profile before defining the baseline for readonly persistence histories. |
| `directed-5` / `52c672b0f95bb6442a36c82022c2ea533fc413b658711b19788f5aef2dbe6ccf` | After an old edit/flush, IndexedDB comparison passed but localStorage differed after SIGKILL. A post-run hash reconstruction matches the original journal entries reappearing. | After deliberate source drift, close/reopen before defining the next on-disk carrier baseline; keep the original recovery binding and require stale-source refusal. |

Exact saved-input replays pass under these explicit baseline conditions. This does **not** establish that
successful localStorage mutation is physically durable across arbitrary whole-browser death. The separate
`unsettled-profile-crash` negative case retains that boundary: in the full run four fresh localStorage entries
became zero after SIGKILL while the external recovery file still cold-replayed the ledger. The journal
reappearance analysis is a reconstruction from the saved packet and observed hashes, not an additional
native run or evidence that the later IndexedDB edit was lost. Core encrypted runtime files were unchanged;
these observations do not retest every earlier renderer-death guarantee at whole-browser/power-loss scope.

Generated histories vary Unicode source text, day/archive/unfiled values and DB/WAL delivery partitions,
then schedule open/close/freeze/restore, real old source drift, file loss/replacement/readback, wrong origin,
controller detach and full-browser restart/kill. Every history additionally kills/reopens the browser and
cold-reads the original file. Independent carrier ledgers compare exact logical DB rows/local values/cache
response hashes/registrations after readonly operations; a text ledger checks recovered meaning. Source
drift's new capture is also checked against the original ledger plus the declared edit. This is bounded
state exploration with persisted fixture baselines, not arbitrary execution interleavings or power-loss proof.

## Executed checks and provenance

| Check | Result |
| --- | --- |
| Full directed campaign | All ten groups pass their diagnostic assertions; host disposition remains unsupported |
| Generated native histories | 60 pass, seed 8941, zero shrinking in the credited full run |
| Full-campaign controls | Seven detected for their named reasons |
| Additional history omission control | One focused native case passes; omitting the restored document's carrier is detected |
| Saved first-failure inputs | Both exact replays pass under the declared persisted-baseline conditions |
| Node harness checks | Seven new tests, including 100 generated filesystem histories, and 14 existing supervisor tests pass |
| Static checks | Typecheck, focused lint/format and diff whitespace checks pass |

The [full native report](./2026-09-10-legacy-host/full-native/report.json) records 231 process
restarts and command coverage counts. The extra [history control](./2026-09-10-legacy-host/history-control/report.json)
was added after that complete run and executed separately. Its restored-document write is explicitly induced
through CDP after history return; it tests an observer that omits that carrier, not pre-execution containment.
Both observations report history reload rather than BFCache. The only consumed source difference is this
additive campaign case, and the earlier tested campaign is archived. All full-run inputs were unchanged
through execution and all final focused-run inputs match their recorded hashes. The whole older Vitest/native
component suites were not rerun for this harness-only phase.

Controls cover after-creation-only acknowledgement, omitted worker observation, memory substituted for file
readback, different-origin substitution, ignored fallback carrier, stale epoch reuse, broad storage deletion,
and the separately added history omission. Each is caught by its named assertion; timeouts and unrelated
errors do not count. Copied module mutations are archived and never alter repository source during a run.

The runner is `pnpm storage:legacy-host`; `--case histories --replay <input.json>` replays one saved input.
It reuses the cleanup supervisor's independent deadlines and first-failure logging. Default bounds are 30 s
per call, 120 s per directed case/history, 120 s for shrinking, 10 s for each teardown resource, 20 minutes
for the generated campaign and 30 minutes overall. The campaign limit was increased after an interrupted
full attempt had passed 17 histories: its observed restart cost projected a risk of exhausting the inherited
ten-minute budget. The final generated campaign took 560.993 seconds, within that original budget; the new
bound provides headroom for the slower observed lifetimes. No test assertion or shorter deadline was relaxed. This timing is a harness observation,
not product performance acceptance.

During development, Node tests exposed a CDP disconnect-before-pending-registration race; requests now check
connection loss when registering. Failed-history browser cleanup and IPC completion were also repaired so
shrinking/teardown cannot silently keep the worker alive. Original failing reports retain their actual
failures and source snapshots; corrected reports do not overwrite them. Earlier reports' source keys lost
the first character of `src` because of a trailing-slash root calculation; the credited run normalizes the
root and verifies every input hash against its current file.

The [artifact manifest](./2026-09-10-legacy-host/provenance.json) records original paths, byte hashes and
compressed-content hashes. It preserves the full native report/events, browser protocol, tested uncommitted
harness/fixture/package snapshot, built assets, native counterexamples, first-failure inputs/diagnostics and
exact replay reports. Raw original failure inputs are retained; the copies under `test/legacy-host/regressions`
are formatted replay inputs, with logical equality checked separately. No whole browser profile is archived.
Reports retain starting HEAD `0d9c733` and their tested source hashes rather than claiming these uncommitted
files were in that commit.

## Next bounded work

Revise the host strategy around **control before profile/session execution** and preservation of unsettled
visible source work. Specify a restart procedure that cannot restore the old cached shell before control,
plus executable/transport retirement that survives controller release. Compare concrete supported platform
options against these saved falsifiers before another prototype. This experiment rejects the implemented
candidate; it does not select a production utility, a new origin, or a real migration carrier.

The coordinator stays private. Production profile access, BFCache/installed-window coverage, all applicable
carriers, remote-source reconciliation, product recovery-save/readback, cross-origin transfer, lasting old-route
retirement, whole-profile residue, platform/performance and independent review remain gates. Mandatory factor
custody and sequencing §5.4's carrier/attribution decision are unchanged. No conformance obligation or debt is
paid by this unsupported result.
