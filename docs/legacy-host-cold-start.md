# Cold-start migration host — revised preparation

**Status: bounded diagnostics complete; further host research is outside the active cutover.**
On 2026-09-10 the author clarified that there is no deployed instance and selected an operator-assisted
migration through the existing private importer. See [row 21](./selections/row-21-development-cutover.md) and
[sequencing §5.4](./sequencing.md#54-what-happens-to-attribution-at-the-cutover--decided).
The VM is stopped. The experiment below and its [execution record](./storage-conformance-runs/2026-09-10-legacy-host-cold.md)
remain evidence for the measured synthetic runtime, including failed controls and coverage limits; they are
not a supported production host or permission to act on the author's browser. The rejected attachment
preflight is committed as `fbfc3ba`; the revised preparation as `f8fdf1f`. Mandatory factor custody,
authenticated coordinator effects, same-origin checks and [SC-01–09](./storage-contract.md) remain intact.

**First build (now executed): a cold-start global-execution-denial probe in a disposable policy-bearing Linux runtime.**
Install mandatory browser policy before launching the seeded profile, leave it installed across controller
and browser loss, and observe storage through a small protocol-only reader. Begin with first-script sentinels
and restart cases. Do not rebuild the 60-history export campaign until the execution boundary and observer
are demonstrably usable. A policy check after startup is evidence about configuration, not the barrier itself.

## Why this is a different mechanism

The old experiment attached after the browser had begun its lifetime. New pages could execute their first
script despite an attachment event reporting a debugger wait; same-process frames were not separate targets.
After a browser crash, restored navigation reached the old service worker before the controller owned the
page. A maintenance URL identified neither its executable nor a safe startup context.

The replacement hypothesis moves the proposed denial into browser configuration loaded at startup. CDP
becomes an observation/fixture channel; losing it must not release ordinary web execution. No allowed website
or URL grants migration authority. This is a hypothesis to falsify, not a claim that policy already covers
every page, worker, session or alternate browser process.

| Approach | Disposition for the next build |
| --- | --- |
| More attachment callbacks, per-target emulation, request interception or a maintenance URL | Retain as probes/diagnostics. They do not resolve the demonstrated interval before attachment or executable bytes already cached/in memory. |
| Cooperative web bootstrap or new service worker alone | Useful future preparation for participating builds. It cannot retroactively convert unmodified old documents into participating writers or prove their absence. |
| Origin-scoped JavaScript block | Reject as the containment boundary: the documented top-level-origin rule leaves a cross-origin embedding case. A path allowlist is not a privileged code boundary. |
| Global mandatory JavaScript denial, installed before cold launch in an isolated runtime | Selected experiment. It addresses the timing and embedding hypotheses without granting the maintenance page ordinary script execution. Worker/background coverage and readable storage remain unproven. |
| Offline filesystem source reader, with the browser never launched | Fallback if denial or debugger readback fails. It avoids web execution, but needs versioned IndexedDB/localStorage format readers, consistent closed-source acquisition and a new authenticated cleanup adapter. It still cannot recover edits already lost from memory. |
| Custom embedded browser / modified Chromium | Possible later option with substantial startup, storage-compatibility and distribution work. No reviewed implementation or compatible real-profile owner exists here. Do not assume loading a Chrome profile in another engine is safe. |

Chrome documents `DefaultJavaScriptSetting=2` as denying website JavaScript, but warns that changing policy
while running may leave ongoing tasks unaffected. Therefore this experiment installs policy while the test
browser is stopped; dynamic application cannot certify that old execution ceased.
[DefaultJavaScriptSetting](https://chromeenterprise.google/policies/default-java-script-setting/)

`JavaScriptBlockedForUrls` is evaluated against the top-level document's origin: a source-origin subframe
inside another allowed origin can still execute. The extension content-settings API also restricts HTTP(S)
patterns to wildcard paths. Neither provides a narrow maintenance-path exception that separates trusted code
from old code sharing its origin.
[JavaScriptBlockedForUrls](https://chromeenterprise.google/intl/en_uk/policies/java-script-blocked-for-urls/),
[extension content-setting patterns](https://developer.chrome.com/docs/extensions/reference/api/contentSettings)

These public sources were consulted on 2026-09-10. They are API/policy descriptions, not a matching-source
verification of the earlier Chrome 151 binary. Current Chromium's browser client delegates service-worker
permission to an embedder helper; that call site alone does not establish every startup/event path. The next
probe must pin its actual browser, effective policy and protocol and test workers explicitly.
[Chromium service-worker permission call site](https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/chrome_content_browser_client.cc)

## Runtime boundary and policy lifetime

Use a disposable Linux VM or container inside a dedicated VM, with synthetic source seeded **inside that
runtime**. No host browser profile, home directory, relay credential or production data is mounted. Keep the
browser sandbox enabled; do not substitute a root browser with `--no-sandbox`. A dedicated writable run volume
holds the test profile. A separately controlled readonly mount supplies mandatory policy to the browser's
recognized policy directory. A browser process cannot own policy removal. Keep remote debugging on a pipe
or private loopback endpoint, with no exposed network listener.

For Chrome on Linux, the documented mandatory-policy directory is `/etc/opt/chrome/policies/managed/`;
Chromium uses `/etc/chromium/policies/managed/`. Pin the chosen product and its actual policy path; verify the
mandatory policy's effective value/status and absence of conflicting JavaScript allow exceptions. Do not
write managed-pref keys into the user Preferences file and call that enterprise policy. Malformed, ignored,
recommended-only or conflicted configuration refuses startup in the launcher and fails its positive control.
[Chrome Linux policy deployment](https://support.google.com/chrome/a/answer/9027408?hl=en),
[Chromium policy locations](https://www.chromium.org/administrators/configuring-policy-for-extensions/)

The minimal candidate is mandatory `DefaultJavaScriptSetting: 2`, with no JavaScript allow exceptions and no
extensions capable of injecting code. Keep this denial independent of the controller's connection. Before
any source-profile launch, validate the immutable runtime/policy mounts and intended browser identity.
First confirm that this exact runtime recognizes policy using a **different disposable canary profile** with
first-line writes enabled as the negative control. An effective-policy read after launch cannot excuse a
source write before that read. Observe the source from its first cold launch with the same carrier oracle.

No policy or infrastructure is installed by this preparation. Docker, Podman, Lima and QEMU executables were
found on the current macOS host; that establishes neither a running service nor a compatible Linux browser.
Provisioning/pinning the isolated runtime was the first implementation step; its implementation and measured
versions are now recorded in the execution record. Do not fall back to changing the
user's macOS browser policy, cloning a profile across platforms, or using unverified user preferences when
that runtime is unavailable.

Keep external network access denied by the disposable runtime while permitting only its seeded local fixture
and relay endpoints. Test its network boundary independently; do not use a browser offline toggle as proof
that all sockets/workers are contained. Other devices and relay processes remain outside this experiment.
The global JavaScript policy alone is not a remote reconciliation or network-exclusion mechanism.

The launcher owns a process/profile lifetime; a PID file, advisory lock or epoch is not enough to exclude an
uncooperative browser. Exercise a second browser invocation and attempts to reuse the profile without the
controller. Every invocation in the supported test runtime must see the same persistent policy. Killing the
controller must leave it installed. Killing/restarting the browser must not create an unguarded startup.
A launch outside that policy-bearing runtime is unsupported; retaining policy there does not retire all
executables in a real user's wider environment. No copied encrypted writable identity is introduced.

## Observation without a script-enabled maintenance page

Do not reuse `test/legacy-host/browser.mjs` as the source observer: it is ordinary page JavaScript and would
require weakening the boundary under test. Create an inert same-origin document for the storage context;
its markup, cached shell or service-worker response must not grant execution. Do not add an exception for its
URL, send `Emulation.setScriptExecutionDisabled(false)`, or run an injected source-world export helper as an
implicit fallback.

Start with a minimal protocol facade that permits only enumerated observation/fixture commands. Use
`DOMStorage.getDOMStorageItems` for exact localStorage values and IndexedDB enumeration, metadata and paged
`requestData` for rows. Preserve exact keys/typed bytes, bounds and pagination. Values returned as
`Runtime.RemoteObject` may need bounded own-data-property inspection; object previews or truncation are not
source bytes. Refuse accessors, unsupported representations, navigation/context mismatch, detached objects,
duplicate/omitted pages or an inability to retrieve exact bytes. Release remote objects. No arbitrary
`Runtime.evaluate`/`callFunctionOn`, webpage callback or source-string evaluation belongs to this first reader.
[DOMStorage](https://chromedevtools.github.io/devtools-protocol/tot/DOMStorage/),
[IndexedDB](https://chromedevtools.github.io/devtools-protocol/tot/IndexedDB/)

The protocol's current IndexedDB implementation resolves an inspected frame/worker context and defaults its
read transaction to readonly; it also aborts an unexpected upgrade when a database disappeared after
enumeration. This supports testing an inert frame, not assuming a browser-level filesystem reader. Verify
absent-database noncreation, exact binary values and script-denied operation on the chosen build. Unknown
formats or unavailable contexts remain unsupported.
[Inspector IndexedDB implementation](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/modules/indexeddb/inspector_indexed_db_agent.cc)

The facade prohibits source mutation methods, cache/registration deletion, script evaluation and migration
owner entry points. Fixtures may intentionally write sentinels and seed old data before denial, using a
separate explicitly labeled setup/control channel. The run must show that removing policy causes these same
executables to write without changing the observer. Browser storage identifiers must bind the real source
origin/storage key, not a caller-provided replacement. Census unknown keys/stores independently of the current
cleanup manifest; preserve them and classify unsupported carriers. No raw content, relay credentials or full
protocol traffic goes into general logs; detailed fixtures remain synthetic and their artifacts are labeled.

A later readonly capture step can normalize verified protocol bytes into a source observation and cold-replay
outside the denied source runtime. It must reuse/extract the production parser/digest/packet rules with parity
coverage; manually forging a packet or trusting a new host digest is not the bridge. Existing capture and
selection/cleanup owners read their bound origin themselves. Do not disable those checks or seed plaintext in
another browser profile to pretend it is the original source. Neither a protocol census nor a verified file
is an authenticated source-cleanup capability.

## Preservation before cold launch, and after control is released

The first prototype starts from the same **clean-reopened seeded source basis** as the credited histories.
Its claim is preservation of existing logical carriers under a closed-source precondition. It cannot promise
preservation of all work visible before terminating an arbitrary live legacy session.

A future live procedure must first account for every participating document's visible/memory-only edits,
settle or separately recover them, and verify their union against a saved external ledger before termination.
The old `destroy()` and `whenDurable()` return, a quiet timer, two equal reads or graceful shutdown alone
cannot establish that inventory. The preflight already distinguishes a visible edit after WAL refusal and
observed rollback of localStorage mutations on whole-browser kill. If complete settlement/recovery cannot be
established, refuse first migration intent and preserve the live source; do not force shutdown as the remedy.
Newly recovered memory-only updates need an explicit source-binding/settlement owner before existing import
APIs can treat them as the original source. That owner is not supplied by this preparation.

Carry the saved external packet across every later restart; reread it from the file, cold-replay against the
independent ledger, and keep the factor separate and in memory. Record fresh writes lost and removed journal
entries restored by an unsettled whole-browser kill as negative observations, not as passing preservation.
A clean-close fixture boundary may qualify a test; it cannot rewrite SC-01's page/navigation-loss contract or
promote it into an OS/power-loss guarantee.

Even a successful global-denial probe would not authorize removing denial to run the modern app. Same-origin
old bundles, history documents, workers, direct assets and live transport must have a lasting, separately
verified disposition before release. Authenticated known-source cleanup does not currently retire them or
cover the broadcast fallback. Keep the source quarantined and the bridge private until that later gate is
implemented. A new-origin destination is an alternative needing its own transfer/cleanup protocol, not a
reason to edit `sourceOrigin`. Product origin and carrier/attribution choice remain undecided here.

## First bounded probe and completion rule

Add a separate private runner under `scripts/legacy-host-cold/`, reusing bounded supervision, first-failure
preservation and teardown. Retain the committed first preflight unchanged as a regression and positive
execution control. Pin runtime image digest, browser/launcher, effective mandatory policy, fixture assets,
protocol, source/harness hashes, all deadlines and the initial source ledger. Preserve the first input/error
before shrinking, distinguish runtime-unavailable from unsupported from harness-failed, and never return
production migration authority.

| Required directed case | Falsifier / independent observation |
| --- | --- |
| Source-origin first page, same-origin frame, source frame under another origin, `srcdoc`/`about:blank` descendants | Exact native sentinel is absent before and after debugger connection; removing denial produces it. An empty target list is not the oracle. |
| Actual cached predecessor and direct hashed bundle | Source rows/WAL remain exact while old bytes are retained. Run the same executables with denial removed as positive controls. |
| Crash-restored maintenance URL and ordinary history reload | Old documents may be restored, but cannot append before attachment. Do not reset session files or clear caches to make this pass. |
| BFCache, frozen document and installed window | Exercise each supported lifecycle explicitly. A reload is not BFCache and a headless tab is not installed-window coverage. Unavailable cases limit the verdict. |
| Dedicated/shared/blob workers; retained service-worker navigation and independently triggered background events | No native worker sentinel/update at any exercised boundary. A register failure or no event is not proof of containment of an already installed worker. Record trigger delivery or mark that path untested. |
| Controller detach/death, reconnect, browser kill/restart and second launch | Persistent denial survives without the controller; source bytes remain exact under the closed-source precondition. Stale sessions cannot supply a later observation. |
| Missing/malformed/ignored policy; allow exception; policy applied only after launch | Launcher refuses where detectable; native positive controls catch every falsely acknowledged acquisition. A matching config file alone cannot pass. |
| Protocol observer with scripts denied | Exact local entries, binary IDB rows, pagination and unknown values agree with the seeded carrier ledger. Missing DB stays missing; denial is never relaxed to read. |
| Network and transport | Seeded relay counters observe the declared network isolation independently; no claim about unaccounted remote participants. |

Use named controls for late-only policy installation, origin-only blocking, denial removed on disconnect,
script-enabled reader fallback, missing storage pages/binary bytes, accepting an untested worker trigger and
broad source deletion. The intended assertion must detect each control; timeout/unrelated refusal does not.
After directed cases and their positive controls work, run a bounded generated campaign over cold launch,
new page/frame/worker attempts, history restore, controller loss and restart. Begin with 20 histories and
seed 8941; require per-command coverage and a mandatory controller death plus cold browser restart in each
history. Use independent sentinel/carrier ledgers. Keep the inherited call/case/shrink/teardown bounds; set and
record a total campaign bound before running. More schedules come only after this mechanism has survived
these tests, not to compensate for a failed directed case.

This preparation is complete when the next experiment has a concrete runtime, observer, preconditions and
falsifiers. The next **implementation** is complete when those directed/generated diagnostics terminate and
preserve their evidence, including any unsupported verdict. If denial or exact readonly observation fails,
retain the counterexample and reconsider the offline reader/custom host before adding another permission
exception. If both work for the declared scope, the subsequent bounded step is readonly source/packet parity
under that denial. Enrollment/import/selection/deletion, lossless live-source acquisition, full retirement,
real profile access and default-app cutover remain separate gates. Existing conformance debts are not paid.
