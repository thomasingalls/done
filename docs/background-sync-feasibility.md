# Background sync and ready-on-return

2026-10-23 · UX-18 investigation · no background-sync implementation selected or enabled.
Source: cumulative UX patch50 on signed c4a66c79. [Evidence and reproduction](development-evidence/2026-10-23-sidebar-cut-background/README.md).

## Finding and recommendation

The current app does not deliberately stop ordinary sync when its window loses focus or becomes
hidden. There is no single switch to turn on continuous background sync. Start by measuring the
actual phone/window lifecycle: improving an unlocked, running client is a different change from
waking a suspended or closed client. Keep the present security model while doing that first slice.

If independent background fetching proves valuable, the most promising incremental design is a
bounded, optional encrypted inbox with a new, narrowly scoped network capability. Treat its bytes
as untrusted until the existing receive owner verifies and admits them after unlock. It can remove
some transfer time from reopening; it does not remove verification/application time or guarantee
that the browser ran a job recently. This is a proposal, not an available feature.

## What the app currently does

- [accountReceive](../src/crdt/accountReceive.ts) composes the scheduler, subscriptions and owned
  receive checks. Hiding requests an outbound flush, including a second wake after the durability
  barrier. It does not pause receiving. Its idle repair interval is roughly 60–65 seconds with a
  healthy subscription, 5 seconds without one. These intervals are not the live-hint delivery cadence.
- [notifications](../src/account/notifications.ts) keeps an authenticated fetch stream with SSE
  framing. Visibility returning wakes discovery/receiving and expedites reconnect if disconnected.
  Becoming hidden does not close the stream. These are page-owned subscriptions, not Web Push.
- [accountSyncDriver](../src/crdt/accountSyncDriver.ts) uses timers and async operations. Its gates
  concern connectivity, storage and network login; no focus/visibility gate was found.
- [networkLogin](../src/account/networkLogin.ts) renews through the live unlocked owner. Closing
  aborts networking, drops live access material and closes the vault. Network access and scoped
  grants last five minutes; remembered login has a separate absolute 30-day lifetime. See
  [session constants](../account-protocol/session.ts) and [grant scope](../account-protocol/scopedGrant.ts).
- The generated [service worker](../vite/precacheServiceWorker.ts) handles shell/assets and updates.
  It has no account push/sync job or encrypted inbox. Installing the PWA does not create one.
- LocalApp retires its owner on pagehide. An explicitly locked workspace closes live connections
  and discards keys under the [session contract](account-sessions-subscriptions.md). That boundary
  must remain distinct from merely switching applications.

These are source findings. They do not establish the cause of the operator’s device delay.

## Platform boundary

A visible but unfocused document can remain running. Hidden documents can have timers throttled;
frozen documents stop freezable callbacks, and discarded documents have no running page context.
A service worker is also event-bound and time-limited, rather than a daemon. Changing SSE to
WebSockets does not establish execution while the page is frozen or gone.
[Chrome lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api),
[Page Visibility](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API),
[Service Worker lifetime](https://www.w3.org/TR/service-workers/#service-worker-lifetime).

Capability snapshot checked on this date; detect at runtime and recheck before implementation:

| Context | One-off Background Sync | Periodic Background Sync | Web Push considerations |
| --- | --- | --- | --- |
| Chrome desktop, ordinary tab | Supported API; bounded connectivity-triggered job | Not offered to ordinary tabs | Permission/push service needed; not our existing stream |
| Chrome desktop, installed/launched app | Supported API | Supported API, browser schedules it | No promise of execution after force-quit or immediate delivery |
| Chrome Android, installed/launched app | Supported API | Supported API, browser schedules it | Physical screen-lock/power restrictions still need testing |
| Firefox desktop | Not supported | Not supported | Available with permission; silent messages have quotas and desktop delivery requires Firefox running |
| Safari macOS | Not supported | Not supported | Web Push available; user-visible notification requirement |
| Safari iOS/iPadOS Home Screen app | Not supported | Not supported | Web Push available from 16.4; permission requested through a direct gesture; user-visible notification requirement |

API support: [Mozilla SyncManager data](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/SyncManager.json),
[PeriodicSyncManager data](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/PeriodicSyncManager.json).
Chrome’s periodic API requires installation and launch as an app; engagement affects scheduling and
jobs may not run at all. A requested minimum interval is not a freshness deadline.
[Chrome periodic-sync documentation](https://developer.chrome.com/docs/capabilities/periodic-background-sync).

One-off sync retries a registered bounded job when connectivity permits; it is useful for an outbox
but does not subscribe to future remote edits. Browsers bound job duration/retries.
[Background operation restrictions](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation).

Firefox’s quiet-push quota prevents treating silent push as an unlimited continuous channel.
[Mozilla’s Firefox documentation](https://support.mozilla.org/en-US/kb/push-notifications-firefox).
For Safari, silent push for each writing change would violate its visible-notification contract;
WebKit says subscriptions can be revoked for violations.
[WebKit Web Push](https://webkit.org/blog/12945/meet-web-push/).
The iOS installation/gesture requirement is described in
[WebKit’s Home Screen support](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

## Local observation and its limits

A fresh disposable two-device account exercised the production build and real local session/
membership service. The receiver caught up while another test page was brought forward. However,
the receiver still reported **visible and focused**. That is an ordinary live-sync observation,
not proof of background behavior on the user’s device.

An initial CDP freeze request was assumed to suspend receiving; that assertion failed when new
writing appeared. A revised probe added an independent timer. The timer continued, disproving the
assumption that command success established suspension in this headless setup. The failed source,
failed log and controlled observations are retained. Do not quote its tiny return measurement as
cold-resume performance. Playwright defaults/inspection, automation polling and headless visibility
make this unsuitable for mobile power-management conclusions. No real account/profile was used.

## What each option would require

**Keep the unlocked page current.** Preserve subscriptions and bounded catch-up while the browser
runs the page. Profile whether background projection/verification is expensive and trace transport
loss, scheduler wake and authority retries on return. This needs no new retained secret or server
permission. It cannot prevent OS suspension. A SharedWorker could consolidate live tabs, but does
not provide an independent OS wake or bypass lock/owner cleanup; it is not the first proposed change.

**Encrypted background inbox.** Fetch bounded opaque records into a separate inbox; do not move
accepted frontiers, mark writing synced, rewrite canonical content or trust a notification. After
unlock, run existing authority, history, witness, authorization and storage-admission checks before
promotion. Key rotation, revocation, stale grants, duplicate/out-of-order batches and quota errors
must remain normal refusal/retry paths. This helps only the network part of catch-up.

The hard part is authorization, not copying fetch into the worker. The present workspace grant
includes submit, read, checkpoint, discover and remove; persisting it would give a background
component excessive authority. It also expires quickly, and renewal currently needs the protected
live owner. Independent fetching while locked would require an explicit new, revocable read-only
capability and a product decision about retaining that network authority on this device. It must
not expose content/decryption/signing keys or silently enable remembered unlocking.

A bounded job would need account/device binding, lifetime/size limits, cancellation generations,
pre/post-write removal checks, exclusive or safely coordinated storage ownership and cleanup on
sign-out/removal. Closing a window is not permission to continue after an explicit lock. Initial
implementation should stop such jobs on lock unless a separately approved policy says otherwise.
Periodic execution would be an opportunistic Chrome enhancement; the foreground path remains
mandatory everywhere.

**Upload already prepared envelopes.** One-off sync could retry exact durable, signed/encrypted
outbox bytes without opening plaintext. It still needs a narrowly scoped submission capability,
replay/idempotency and cancellation design. The worker must not allocate sequence numbers, create
new signing authority or re-serialize writing. This principally improves sending and is a separate
slice from ready-on-return receiving.

**Full background verification/application.** Moving the current receive owner into a worker would
require its crypto material, fresh authority/history checks, counters, admission, leases and disposal
rules to function there. Keeping content keys usable after lock would change the existing guarantee;
a short-lived in-memory worker cannot independently recover them after termination. Do not take
this route merely to avoid a spinner. Native platform integration would also need explicit OS
background-task rules and would still be bounded; no universal always-running promise follows.

## Proposed bounded sequence and acceptance

1. **Measure real lifecycle first.** Rough engineering estimate: 1–2 working days plus device access.
   Add a development-only metadata trace or diagnostic harness for visibility/freeze/pagehide,
   subscription health, wake/retry cause and accepted frontiers; never log writing, keys or tokens.
   Run ordinary/unfocused, minimized, 30-second/5-minute hidden, phone screen-lock, explicit lock,
   offline/online and cold reopen on Android Chrome and desktop Firefox/Chrome. Test Safari/iOS
   separately if included in the product target. Record actual client versions and installed state.
2. **Repair only demonstrated live/resume costs.** Estimate 2–4 days if a bounded defect emerges,
   otherwise close with evidence. Attribute server wait, download, verification, durable admission
   and projection separately. Keep the existing 2.5-second contention gate; this study does not
   replace it. Reuse existing verification/batching owners rather than introducing weaker checks.
3. **Design an optional inbox capability if transfer time justifies it.** Estimate 1–2 weeks plus
   security review and physical-device validation, with substantial uncertainty. Review the new
   network-authority/lock policy before implementation. Begin with one browser and a strict inbox
   cap; test interrupted jobs, removal races, expiry, wrong account, stale/replayed data, storage
   refusal, and ordinary foreground fallback. Add an outbox job only as a separate phase.

These are scope estimates, not measured delivery dates. The target is data already available on
return when the platform allows it. Report separately: bytes prefetched, verified/applied frontier,
last successful contact and freshness. Never show “up to date” merely because a worker ran.
Keep existing local writing immediately usable even when background delivery never happens.

No Push permission prompt, background credential, service-worker behavior or sync policy changed
in this investigation. The next justified implementation is the physical-device lifecycle trace,
not an always-on transport rewrite.
