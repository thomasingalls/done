# Cold-start policy/observer experiment — 2026-09-10

**The implemented bounded diagnostics pass; this is still an unsupported production migration host.**
Mandatory global JavaScript denial survived the exercised startup, controller-loss and browser-restart cases
while a protocol-only reader recovered exact native carriers. The experiment does not issue authority, bridge
the private coordinator, settle arbitrary live source work or retire old executables permanently.

Preparation is committed as `f8fdf1f`. The credited run is
`test-results/legacy-host-cold/2026-09-10T06-43-14-597Z`, starting from that HEAD with the archived uncommitted
harness. Its [report](./2026-09-10-legacy-host-cold/privilege-hardened/report.json) records clean exits for every phase.
The earlier CDP-attachment preflight and its counterexamples remain unchanged.

## Runtime and observation boundary

A dedicated Lima 2.2.0 VZ VM ran Debian 13 on aarch64 with four CPUs, 4 GiB memory and a 12 GiB disk. Its image
URL and SHA-512 digest are pinned in `scripts/legacy-host-cold/lima.yaml`. Plain mode has no host filesystem
mounts, SSH agent forwarding or container runtime. All browser profiles were created from synthetic fixtures
inside the VM; none was copied from a host browser. Only this VM was stopped at completion.

The measured browser is **Chrome/152.0.7977.82**, Debian package `152.0.7977.82-1~deb13u1`, revision
`@d04cdb24d67b081f6cf80200ffc5233f44b61109`, protocol version `1.3`. Reports preserve the kernel, package versions,
browser executable/launcher hashes, command line and effective policy DOM. Chromium's sandbox page reported
namespace and Seccomp-BPF protection enabled and an adequate sandbox. Browser/controller processes ran as
UID 1000, without `--no-sandbox`. The browser user-agent's x86_64 token is not the guest architecture evidence.
The packages are now pinned in the provisioning script; future availability is not assumed.

Root supplied a readonly bind mount at `/etc/chromium/policies/managed` before browser launch, containing exactly
`DefaultJavaScriptSetting: 2` in denial phases. A different canary profile first checked effective Platform /
Machine / Mandatory / OK status and first-script behavior. The controller's attempted policy write failed with
a filesystem permission error. Final runtime review also found that the Lima guest account has passwordless
sudo: ordinary file refusal alone was insufficient. The credited process tree inherits Linux `NoNewPrivs=1`;
`sudo -n true` fails explicitly because of that flag in every main phase. The browser sandbox and complete
directed/generated campaign pass with this restriction. The earlier full run without that restriction is
preserved as preceding evidence, not the credited privilege boundary. Controller death did not remove the mount. The root namespace watchdog and
policy mount outlived the child controller. This controls the dedicated runtime only; it says nothing about
launching a real user's profile elsewhere.

Each browser phase had a separate network namespace containing only loopback. An independent Node TCP attempt
to the documentation address `198.51.100.1:9` returned `ENETUNREACH`. Seeded HTTP/worker notifications and old-app
WebSocket upgrade attempts were counted inside that namespace. No browser offline toggle supplies this network
claim, and no claim covers remote devices or unaccounted transports.

The reader uses DOMStorage, IndexedDB enumeration/metadata/paged rows, bounded own-data-property inspection of
Uint8Array values, and cache response metadata/body hashes. It checks origin/frame/loader/storage-key binding,
counts, duplicate pages, supported values, total size and changing metadata. It refuses evaluation, function
calls, source deletion, execution-setting changes and migration entry points. Every source read in denial
runs with the global policy unchanged. Inert fixture pages retain their service-worker bypass through the
read; separate documents exercise the retained cached app. This census is neither an atomic snapshot across
stores nor a general browser-profile serializer. It does not inventory every registration/carrier or create
an authenticated source packet.

## Native results

| Diagnostic | Credited observation |
| --- | --- |
| Source page and same-/foreign-origin frames | First-script sentinels remain absent under global denial; the same executables write in the allowed control. `srcdoc` and `about:blank` descendant probes also have working controls. |
| Origin-only blocking | A source frame inside the other origin writes its native localStorage sentinel. The narrower policy is rejected as the boundary. |
| Binary/source observer | Five separately seeded profiles pass clean-reopen checks. Each includes 23 generated binary rows with numeric/Unicode keys, exact legacy DB/WAL values and unknown local material. Cached-app profiles additionally cold-replay the fixture's master text against the independent input ledger. Repeated canary reads leave absent databases absent. |
| Dedicated/shared/blob worker attempts | Allowed controls write native IDB sentinels; denial prevents the initiating page scripts in the exercised windows. This is not evidence about arbitrary already-running workers. |
| Retained service-worker fetch | Allowed control proves installation and a completed fetch-triggered IDB write. Denial observes no write, but independent delivery under denial is unproven and recorded as `trigger-unproven`. No background event delivery is credited. |
| Controller death/reconnect | A separate CDP-connected child is SIGKILLed. A markup refresh reaches the fixture with all debugger connections closed while the browser remains alive. Denial preserves exact carriers; the allowed control writes. A stale connection refuses later commands. |
| Browser crash/startup/session restore | First navigation occurs before debugger connection with policy already installed. Carrier comparisons pass under the clean-reopened source precondition. Session files/caches are not erased to force the result. |
| Cached predecessor and direct asset | The actual app/worker built from `7d238eecec4fe760f026ce1b68f3ca5603a9086a` remains cached. Allowed offline maintenance and direct-bundle controls boot and store the injected text, verified by fixture-only Yjs cold replay. Denial preserves source/cache census through these attempts and a crash-restored maintenance navigation. |
| History/frozen document | Back navigation and frozen/active commands were exercised. Actual BFCache restoration and installed windows remain unproven. |
| Second browser invocation | Exited 21 with a profile-singleton refusal and no fixture navigation in all three policy cohorts. This is a measured refusal, not general profile ownership or successful second-process containment. |

The denied and allowed directed cohorts each pass 15 cases; the origin-only cohort passes 14. Cases include
their canary. All 20 generated sequences pass with seed 8941. Command coverage is: page 8, frame 15, foreign
frame 11, srcdoc 7, blank 13, dedicated worker 6, shared worker 13, blob worker 14 and history reload 10. Every
sequence additionally kills a controller and cold-restarts the browser: 20 of each, with exact carrier checks.

These are 20 generated command sequences over the same preserved synthetic source, not 20 independent production
profiles or exhaustive interleavings. Inputs and executed prefixes are saved before a failure can unwind.
Native shrinking is disabled to avoid reusing a contaminated profile; no minimal counterexample is claimed.
The separate Node property checks do shrink byte/pagination failures. Newly generated test pages are closed
between sequences to bound resource use; source carriers, caches and session files are not reset.

## Controls, repairs and limits

Four native invalid-policy controls—missing, malformed, outside the recognized directory and an explicit allow
exception—produce first-script writes when the refused configuration is intentionally used for a canary.
The real launcher check rejects each before any source profile opens. Recommended-only configuration is also
rejected, and the browser reports Recommended / OK, but an attempted normal user default override did not
produce a write. That is configuration-refusal evidence only; its execution override control remains unproven.
The earlier failed recommendation control is preserved, not relabeled as a successful write control.

The Node harness checks forbidden script-enabled observer fallback, missing binary bytes/pages, duplicate
pages, moving contexts/metadata, unsupported values, broad deletion in the carrier oracle, late/recommended/
non-readonly configuration and refusal to accept an unproven worker trigger. Four native write-producing
policy controls plus these checks do not fill every proposed native mutation. Actual dynamic late installation
and removal of root-owned denial during a running browser are not exercised. Allowed controller-loss execution
and the controller's failed policy write are narrower observations. Full background, BFCache and installed-window
coverage remains open; no green skip pays those obligations.

Development found and retained harness failures:

- A timed-out polling loop continued scheduling work after reporting failure. The replacement stops at its
  deadline; a subprocess regression checks clean exit. Root/host watchdogs independently bound native phases.
- A blob worker committed its sentinel but its relative notification URL failed. The notification now uses the
  fixture's absolute URL. Service-worker writes use `waitUntil`; the trigger returns an inert successful page.
- Target URL changes preceded committed-frame readiness. Navigation now waits for the frame, without pausing
  execution or supplying a script-permission exception.
- Cached startup raced a supposedly inert allowed baseline. Setup closes its old documents, cold-reopens and
  retains the observation page's worker-bypass session until that page closes. The reader continues to reject
  changing source. A later allowed-control race changed native update count from 4 to 7 during a read: the
  allowed control now records that refusal and waits for a complete read, then verifies the exact injected
  text. Denied reads never retry source drift. The final run needed no such retry.
- Renaming a policy file to `.txt` did not produce a working ignored-policy control. The corrected fixture
  places the file outside Chromium's recognized directory. Its original failed report is retained.

These repairs do not establish lossless shutdown of arbitrary visible/memory-only legacy work. The source basis
is explicitly clean-reopened. Nor does temporary denial authorize enabling the modern application while old
bundles, caches, workers, routes or transports remain usable. Neither the production parser/digest/packet bridge
nor an authenticated cleanup adapter is implemented here.

## Verification and evidence

Seven new Node tests pass, including 200 generated byte cases and 100 paged-inventory cases. The combined new,
prior-host and cleanup-supervisor suite passes all 28 tests. The installed `tsc -b --noEmit`, focused lint/format,
shell syntax and diff checks pass. The `pnpm typecheck` wrapper separately failed registry identity verification
under restricted network access; its installed compiler was invoked directly, without changing package-manager
verification settings. Earlier full Vitest/component-browser campaigns were not rerun for this private harness.

The credited full run took about 87 seconds. Declared bounds are 30 seconds per operation upper bound (15-second
CDP calls; 10-second polling), 120 seconds per directed case/history, ten minutes per guest phase, ten seconds
per browser teardown and 30 minutes overall. A separate root watchdog bounds each namespace. This timing is a
harness observation, not product performance acceptance.

The [artifact manifest](./2026-09-10-legacy-host-cold/provenance.json) preserves eight successive instrumented run
reports, first failures/ledgers/observations, exact guest bundles, the shared built assets and the final tested
source snapshot. Every credited input hash and collected artifact hash was checked. Earlier setup smoke probes
remain exploratory; their whole profiles are not archived or credited. Current source hashes, rather than the
starting HEAD alone, identify the tested implementation. The author profile and earlier preflight artifacts
were untouched. No runtime/conformance matrix/debt status was changed.

## Next bounded work

Proceed to **readonly source/packet parity under the same denial**, in synthetic fixtures only: extract/reuse
the existing production parsing, digest and packet rules; compare protocol bytes and cold replay against the
current source path and independent ledger. Preserve current origin checks, factor custody and private-owner
boundaries. Do not hand-build a trusted packet or invoke coordinator effects from this census.

Production adoption remains gated on the unproven worker/lifecycle/control paths, live-source settlement,
platform/profile ownership, real recovery save/readback, remote reconciliation, lasting executable/transport
retirement, full residue, carrier/attribution choice in sequencing §5.4 and independent review. This completed
experiment pays none of those whole obligations.
