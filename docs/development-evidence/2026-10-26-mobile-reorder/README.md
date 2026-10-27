# Phase87 — mobile grip and sustained card dragging

2026-10-26. Development repair after86; release preparation is explicitly on hold. No image/release
preparation, commit, push, preview8443 replacement, merge or deployment. All profiles/data are disposable.

## Contract and reproduction

Keep the visible reorder grip on mobile, preserve touch/pen body hold-and-drag, ordinary pre-hold
scrolling/navigation and guarded Done unlock. Reordering still uses the existing single admitted
operation on release; no writes while moving, no write on cancellation, no frozen/neighbor-day editing.

The previous touch test teleported and released without yielding a painted frame. Its short cards
did not exercise native scrolling. Added tests use actual CDP touch input in an overflowing, scrolled
list with a held contact and eight frame-separated moves. The predecessor fails all six grip/body
cases across Next/Done/Scheduled. The grip is hidden by a fine-pointer media query. The separate body
trace is `gotpointercapture → pointercancel → lostpointercapture` after movement; the pointercancel is
non-cancellable. Pointer capture does not replace native-scroll arbitration.

An initial new fixture lacked overflow and its unconditional cleanup sent touchCancel after touchEnd,
masking outcomes. Preserve that first failure, but do not credit it as a correct body reproduction.
The corrected red2/3 fixtures establish the cancellation before the repair.

## Repair and evidence

Show the grip for all pointer types, with a44px minimum coarse-pointer target and `touch-action:none`
from the start. Claim its pointer in capture phase before the shell gesture recognizer. Preserve
keyboard movement. For static-body holds, install a scoped non-passive native touchmove listener
before the gesture starts; prevent native scrolling only after reorder is armed. Ordinary movement
before the hold remains native. Multiple contacts cancel; secondary pointers cannot replace the
primary ownership record. The listener is removed during editing/unmount and never processes editor
input. Existing cancelled/lost-capture cleanup and the release-only CRDT path remain.

Full affected browser file:16 passes/24 explicitly non-applicable platform cases, zero retries. All24
old cases and23 old named dispositions remain. Eight new authored cases expand to16 project cases:
eight actual Android cases and eight explicit desktop NAs. New sustained grip/body cases work in all
three sections; native pre-hold scrolling and cancellation/restart pass. Existing desktop grip,
short-card touch, day navigation and Done unlock tests pass.20 existing focused reorder/gesture unit
cases pass; TypeScript/lint/scoped format pass. This is Chrome156/Pixel emulation, not a physical phone
or iOS walkthrough, and no native scroll-latency claim is made by a functional scrolling assertion.

The complete browser report is independently joined to every static case identity/outcome. Planning
now selects2,560 general cases (2,544+16); the reordered file has40 cases (24+16). Register exactly the
eight new desktop NAs. An initial metadata run fails its old23-disposition expectation; update that
one exact count to31, preserving rejection/corruption assertions/deadlines.35 affected metadata/registry
cases then pass. The initial preservation script hit Node's1MiB child-output limit on the manifest;
its bounded16MiB retry checks all24 old cases, all23 old dispositions, unchanged domain sites and all
old qualification blocks. Do not treat the first apparatus error as a passing review.

Crypto census changes only `src/ui/Card.tsx`'s source hash:410 sources/197 domains, unchanged labels/
classifications.908 obligations/363 unresolved blockers remain. No backup policy, Account startup
verification, content format, crypto, permissions, freeze or undo mechanism changes. Startup delay
and backup cadence are diagnosed/queued in86, not repaired by a card gesture patch.

Primary platform reference: [Pointer Events](https://www.w3.org/TR/pointerevents3/#the-touch-action-css-property).
Normal repository bookkeeping/checks are development hygiene, not release authorization. Final
source/metadata and patch-application identities are recorded outside the checkout alongside87.
