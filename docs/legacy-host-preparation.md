# Legacy migration host preparation

**Status: diagnostic preflight implemented; the tested host candidate is unsupported.**
The [2026-09-10 execution record](./storage-conformance-runs/2026-09-10-legacy-host.md) preserves native
first-script page/frame writes and a crash-restored cached old application at a maintenance URL. These
counterexamples block a coordinator bridge. The contract below records the experiment's original requirements;
its statements about the "next" fixture describe that preparation, not unexecuted work. The readonly history
oracle now explicitly begins after a clean profile reopen; separate whole-browser-kill counterexamples
retain the unsettled localStorage boundary rather than claiming that acknowledgement forces disk persistence.

The next experiment is specified in [cold-start host preparation](./legacy-host-cold-start.md): mandatory
global execution denial before browser startup, followed by protocol-only storage observation in a disposable
policy-bearing runtime. It remains untested and carries no production migration authority.

**Preparation baseline.** The private coordinator is committed as
`7d238ee`; its [native evidence](./storage-conformance-runs/2026-09-09-legacy-coordinator.md) establishes the
bounded seeded composition. The next build is a persistent-profile **preflight**, limited to exclusion,
source preservation and recovery-file readback. It receives no destination enrollment, import, selection,
source-cleanup or Local-clear authority. Passing it would permit planning the host/coordinator bridge, not
automatic production cutover. [SC-01–09](./storage-contract.md), [sequencing §§3.2–3.3/5.4](./sequencing.md)
and [action-tree L-1](./review/remediation/action-tree.md) retain their existing scope and gates.

## What the current executable paths establish

The [source inventory](./legacy-host-sources.json) pins inspected repository files at `7d238ee`, predecessor
files at `af8941e`, and installed dependency source versions/hashes. These are reproducible starting fixtures,
not an inventory of all builds actually deployed on the author's devices. No new browser experiment was run
for this preparation. Dependency findings below are conditional static paths until the preflight reproduces
them with the corresponding build and browser configuration.

| Path | Observed behavior | Consequence for the host |
| --- | --- | --- |
| `src/main.tsx`, `src/ui/useStore.ts`, `src/crdt/index.ts` | Default startup imports/mounts the legacy application and opens `LEGACY_STORE`, then attaches sync | A future maintenance bootstrap must choose its owner before importing/mounting this path. A migration refusal cannot fall back to the legacy provider. |
| `src/crdt/persistence.ts` | Old writers use IndexedDB and the synchronous `done.pending-update.done.` journal without the new lifecycle permits | Taking the new Web Lock does not stop an old executable. The existing [native counterexample](./legacy-migration-prep.md) remains decisive. |
| The same persistence adapter | A failed synchronous journal write is reported while the document and pending memory queue can retain the edit; `destroy()` does not await a successful flush | Closing every old tab can lose visible work that never reached a carrier. Exclusion acquisition is not itself a lossless source-capture procedure. |
| `src/pwa.ts`, `vite/precacheServiceWorker.ts` | Production installs a precached worker; navigations prefer cached `index.html`; activation deletes every cache except its current cache | Server maintenance responses alone cannot retire the old cached shell. Do not reuse the existing activation handler as a scoped cache-cleanup owner. |
| `src/crdt/sync.ts`, `src/crdt/yjs.ts` | A live controller retains its configuration; websocket sync also enables cross-tab broadcast by default | Removing `done.sync` in another tab does not stop that controller, its existing connection or its broadcast channel. |
| `y-websocket` 3.0.0 and `lib0` 0.2.117 | Without native `BroadcastChannel`, the fallback writes base64 protocol messages to localStorage at `serverUrl + '/' + roomname`, when localStorage is available; closing the fallback does not remove the key | This conditional unencrypted carrier is outside the current source reader's fixed ancillary list and legacy WAL prefix. Detect and classify it before production cleanup; do not delete arbitrary URL-shaped keys. |
| `relay/src/auth.ts`, `relay/src/server.ts`, `relay/src/persistence.ts` | Authentication is checked on upgrade; room files persist Yjs updates; there is no migration reconciliation/cutoff protocol | Relay configuration and a connected/synced indicator do not identify every device's unsent work. Relay files and live sockets need their own eventual disposition. |
| `src/crdt/export.ts` | The existing download helper creates a Markdown ZIP and clicks a download link | It provides neither the diagnostic recovery packet nor evidence that a saved file can be read back. |
| Import, selection, cleanup and coordinator owners | Bind and check the original source origin; selection/cleanup observe that origin's source directly | The implemented composition is same-origin. A new deployment origin needs a separately specified transfer/cleanup handshake. |

The fallback channel can carry document updates, though a particular retained last message may instead be
sync or awareness metadata. We have not established that any deployed profile used it or retains content in
that key. The next fixture must exercise both native broadcast and the fallback, examine exact bytes and
record the result. Until an applicable carrier has a supported reader and authenticated cleanup disposition,
the host must return unsupported-carrier; a terminal known-source manifest cannot certify its absence.

## Keep host control, source preservation and destination authority separate

The unmodified legacy application has no cooperative migration stop protocol. An in-page flag, service-worker
update, lock, empty client list or matching source digest cannot establish continuous exclusion. In particular,
the Service Worker draft's client census is filtered by storage key and document state; window enumeration
skips documents that are not the active document of their browsing context. Claiming clients changes their
controller; it does not replace their executing document. We therefore cannot treat this API as an inventory
and termination barrier for every old document that might resume. This is a design inference from the
[Service Worker algorithms](https://w3c.github.io/ServiceWorker/#clients-matchall), requiring browser-specific
falsification rather than a stronger claim about every engine's behavior.

The candidate for the next experiment is an **external controller of a disposable persistent Chromium
profile**, with control installed before any source-origin executable may run. Investigate CDP target
auto-attachment and pre-execution pausing; the protocol exposes `waitForDebuggerOnStart` for newly attached
targets and requires recursive handling for related children. An after-the-fact `targetCreated` callback
does not supply that property. These are candidate mechanisms, not a proven whole-profile barrier.
Pin the actual browser build and protocol, enumerate which target types are covered, and refuse when coverage
cannot be established. [CDP Target domain](https://chromedevtools.github.io/devtools-protocol/tot/Target/)

This is not a decision to require a desktop migration utility for every user. Chrome's documented restriction
from version 136 on remote-debugging switches for its default data directory also means a test controller
cannot simply be advertised as attaching to everyone's existing Chrome profile. Use a disposable custom
profile for feasibility; production access, supported platforms and distribution remain open.
[Chrome remote-debugging changes](https://developer.chrome.com/blog/remote-debugging-port)
Do not work around this by cloning a real writable encrypted profile: that neither excludes the original
profile nor preserves the protocol's writable-identity/counter assumptions.

The prospective control lifetime has these requirements:

1. Establish ownership of the test browser process/profile and install interception before admitting a
   source-origin page, worker or restored session. Census existing execution contexts as well as new ones.
   An unknown target, unsupported pause mechanism or second uncontrolled process fails acquisition.
2. Preserve a separately measured durable source basis before terminating seeded old contexts. Track pending
   visible edits separately. A live procedure must first recover or durably settle those edits, or refuse;
   waiting a fixed flush interval or calling the old `destroy()` method is insufficient.
3. Admit only the pinned maintenance fixture while continuously containing predecessor executables and
   transport. Cover offline caches, direct old assets, history restoration, worker startup and new windows.
   Request interception alone does not stop code already in memory or execution loaded from cached bytes.
4. On loss, invalidate the epoch immediately and stop new dispatch. In a future coordinator bridge, cancel
   the owner and await native draining; already issued IndexedDB deletion can still settle. An observation
   callback cannot undo an effect or establish that nothing executed before the callback.
5. After renderer or browser restart, reacquire control and reread the saved packet. Never restore authority
   from a persisted epoch, host status file or old callback. After any eventual cutover, retiring old routes
   must survive release of the controller; this lasting retirement is a later acceptance gate.

The preflight records these as attempted/measured properties and can finish with **unsupported**. A timeout,
empty census, unavailable test feature or absent callback cannot be reported as successful exclusion.

## Recovery file and factor ownership

Use the existing `done-legacy-source-recovery` v1 diagnostic packet and explicit `markdown-system-v1` policy.
The owner captures immutable input bytes, keeps the expected digest separately and uses the existing cold
replay/plan checks for origin, source digest, policy and dependency completeness. Existing refusal bounds,
including the 64 MiB import input ceiling, remain. The packet is plaintext and omits ancillary credentials;
it is neither a full fidelity archive nor a backup of later destination edits.

For the first prototype, the external harness writes the packet to an explicit file outside the browser
profile, closes it, terminates the capture renderer, opens the file again and supplies its newly read bytes
to a fresh replay renderer. No shared in-memory packet object may stand in for this disk boundary. Compare
the replayed meaning to an independent operation ledger, not solely to the packet's own digest or receipt.
Retain the original file through every restart; loss or replacement refuses maintenance without recapture
from a partly deleted source or reminting destination state.

The later product ceremony must own save completion and actual readback. A browser download needs explicit
file reselection and replay; a supported filesystem handle can instead close its writer and request a fresh
file snapshot. `getFile()` represents the file's current state on disk, with later changes potentially making
that snapshot unreadable; a previously retained `File` is not a fresh readback.
[File System Standard](https://fs.spec.whatwg.org/#api-filesystemfilehandle-getfile)
Cancellation, truncation, wrong-file selection and denied access must all preserve source and refuse any
first intent. Test both the save and the cold read. This preflight's harness-owned file proves the storage
boundary only; it does not implement browser picker UX or establish support across browsers.

Before intent, the separate digest checks byte identity, not hostile-source authenticity. After intent,
the authenticated component claim binds all resumed inputs. A persisted path or digest is only a locator or
hint. The human retains the mandatory factor separately and supplies it in memory after restart; do not put
it in the packet, browser storage, command arguments, environment variables or diagnostics. The preflight
does not mint a factor or destination identity. Its later bridge must reuse the coordinator's ceremony.

An external plaintext recovery copy must be explicit in the eventual product flow. Preserve it instead of
promising automatic or forensic deletion. No new plaintext browser carrier is allowed for packet, preview,
factor or decoded content. Ordinary selected Local unlock may still succeed without this packet under its
own recovery owner; missing input blocks migration maintenance, not all access to selected edits.

## Origin, transport and carrier boundaries still owed

Same-origin maintenance is the first controlled fixture. The Stage 2 move to the first real deployment may
cross origins. That needs a destination import and source cleanup handshake whose authority survives the
move; changing `sourceOrigin` or removing its checks would invalidate the current contract. Resolve the
actual deployment/carrier/attribution choice under sequencing §5.4 and review 3a before a live move.

Before a production final capture, identify the intended source set across devices, profiles, origins and
relay rooms, reconcile recoverable edits, then prevent further old transport. A complete Yjs dependency
basis proves integration of the captured input, not delivery of every remote edit. The relay's current
configuration and status cannot certify this inventory. Cutting off a route must address existing sockets
as well as reconnects and cross-tab channels. The first preflight uses only seeded controlled participants;
an unaccounted configured remote source refuses rather than silently becoming a Local-only migration.

Inventory browser carriers independently of the current cleanup manifest: the legacy DB/WAL/ancillary keys,
the conditional broadcast fallback, installed workers and caches, and any other attributable storage found
in the profile. Inspect unknown keys/stores without disclosing their contents in diagnostics. Unknown
material remains untouched and blocks claims about its cleanup. Relay files are a separate carrier scope.
The first preflight deletes no source records, storage keys, caches, registrations or other site data.
It must test containment with the old cached executables still present. Broad origin/profile clearing cannot
substitute for exclusion, authenticated scoped cleanup or a recoverable saved copy.

Whole-profile residue acceptance, including the declared storage/cache/session surfaces and supported browser
versions, still belongs to full cutover validation. The current known-source cleanup pass and this static
inventory do not pay that obligation. The existing debt records and conformance matrix remain unchanged.

## First bounded implementation and falsifiers

Add a private `scripts/legacy-host/` runner and `test/legacy-host/` maintenance fixture. Reuse the bounded
cleanup/coordinator supervisor, event log, native deadlines, first-failure preservation and teardown checks.
Use the same disposable persistent profile across full browser restarts. Existing fresh-context campaigns
that block service workers cannot establish persistent cached-shell behavior. Build and hash the pinned
predecessor shell, install its real worker in a preparation stage, seed external-ledger data, then freeze
the expected logical carriers before the preflight under test. Keep baseline fixture preparation distinct
from post-acquisition exclusion assertions. Fixtures may create data; the preflight may only read it.

Prototype outputs are a bounded diagnostic report, carrier hashes/counts, external recovery file and native
replay evidence. Report browser/protocol/build hashes, profile ownership, attempted target coverage, epoch
transitions, first unexpected execution, refusal causes, restarts and teardown. Redact relay credentials,
device names and source text; do not dump raw browser protocol traffic. These reports are observations and
must not become a new durable migration cursor, cleanup permit or production success marker.

| Required native case | Discriminating observation |
| --- | --- |
| Pinned legacy page attempts a WAL append during the new lock; containment removed as control | The actual old writer can append without containment; the candidate host prevents execution during its measured epoch or reports unsupported. |
| First executable statement writes a sentinel; open a new tab, frame or worker | No first-line write after acquisition. Closing on `targetCreated` after the write must fail the oracle. Include both unmodified old application behavior and small adversarial target probes. |
| Installed cached shell, offline navigation, direct old hashed asset and full process restart | Existing executable bytes remain present but cannot write during a claimed epoch. A recreated fresh profile does not count as this test. |
| Back/forward restoration, frozen/resumed page, dedicated/shared/blob worker, service-worker restart, installed window where supported | Exercise actual target behavior and report each capability separately. An unexercised feature is unsupported coverage, never a green skipped test. |
| Second process, host detach/death, new renderer between inspections | Profile/control loss invalidates observations. No old epoch authorizes a later capture; restart reacquires before source execution. |
| Successful old WAL/DB writes versus injected WAL failure with a visible memory-only edit | Recover the external durable ledger. Distinguish the missing volatile edit and refuse a claim to preserve all visible legacy work. |
| Native broadcast versus forced dependency fallback, configured relay and reconnect | Observe the fallback's exact key/message carrier; preserve it and report unsupported-carrier under the current manifest. Do not infer remote reconciliation from local replay. |
| Save cancelled, truncated/replaced file, wrong origin/policy/digest, source drift and missing dependency | No destination carriers or deletion. Cold reread/replay refuses for the intended cause and all source bytes remain recoverable. |
| Passing capture, save, process death and independent readback/replay | Replayed meaning equals the external ledger; declared source carriers remain logically byte-exact and unknown storage survives. Internal browser DB file layout need not be byte-identical. |

Directed cases come first. Then generate bounded schedules over open/close/freeze/restore, old local write,
source drift, packet save/replacement/readback, host loss and restart. Keep an independent operation ledger
and carrier ledger; neither host callback counts nor returned status can be the sole oracle. Require coverage
counts for each command/boundary, preserve the first counterexample before shrinking, and replay any found
failure from disk before broadening. Choose/report seed, run count and time budget in the implementation;
there is no generated or native acceptance evidence from this preparation.

Require named controls for after-creation-only interception, missing worker/history coverage, stale epoch
reuse, replacing file readback with memory bytes, accepting a different-origin packet, ignoring the fallback
carrier and broad prefix/site-data deletion. A timeout or unrelated refusal is not detection. The destructive
controls operate only in disposable seeded profiles and must be caught by exact carrier preservation.

The first build is complete when all directed cases and declared generated schedules terminate, controls
are detected for their intended reasons, evidence survives process loss, source preservation/cold readback
hold, and every unsupported mechanism is explicit. If pre-execution containment fails, preserve that
counterexample and report the host candidate unsupported; do not wire it into the coordinator. Only a
demonstrated supported scope can advance to a separate host/coordinator bridge. Default bootstrap, lasting
old-route retirement, real recovery UX, cross-origin transfer, full residue and live cutover remain later
bounded work.
