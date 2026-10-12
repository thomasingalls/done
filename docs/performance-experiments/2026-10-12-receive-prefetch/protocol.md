# Bounded receive prefetch: prospective protocol

Parent: signed `54811c93`. Release validation remains paused. Preserve the existing single-entry
request, receipt and storage formats, ordered authentication, and one atomic commit per group.
No service change, release campaign, publication or personal-device access.

## Design and predictions

Reuse the grouping experiment's immutable synthetic pair: 120 cards, 12 KB Goals and 600 pending
positions, with simultaneous writer and receiver editing, subsequent live bursts and offline reopen.
A complete restored journey is the experimental unit; positions are dependent observations.
Use the retained grouping bundle as baseline and the unchanged attribution harness on private ports.

Two concurrent reads should primarily improve the +75 ms condition (previously 193.074 seconds),
by overlapping network waits and collecting more receipts within the unchanged 250 ms launch window.
Predict 20–40% shorter delayed catch-up; local catch-up (79.125 seconds) may improve only 0–15%.
The 600 useful requests and per-entry signatures remain; this is not a request-count optimization.

Bound outstanding requests to two and the publisher turn to four. Reserve space before launching
using the maximum supported single-entry envelope/proof and conservative canonical frame overhead;
retained pages plus reservations must fit the existing 4 MiB queue limit. HTTP chunk copies and
canonical parsing have separate bounded transient overhead. Refuse unsupported larger responses;
do not reduce the existing supported 512 KiB envelope limit. Stop launching after 250 ms, process
already launched replies in cursor order, and cancel/drain unwanted tails. No missing reply may be
bridged. Unverified hints may shorten collection only. Keep self reconciliation singleton and let
input and due sending run between groups. Byte collection cannot grant progress or authority.

## Focused controls

Exercise inverted completion order, absent first/middle replies, malformed or incorrectly bound
later replies, cancellation with late arrivals, error/drain cleanup, byte reservation, launch-window
expiry, single flight, concurrent local input and cold reopen. Existing grouping tests cover request
expiry, authority change, native commit bounds, crash/retry and unchanged receipt readback.
Use focused controls, not a generalized fault matrix.

## Measurement and decision

Before timed runs, complete focused checks and build once. Run a fresh delayed grouping baseline,
a candidate delayed journey and a candidate local journey serially with no parallel build/test work.
Retain full failed runs. Record catch-up, useful/own reads, writer progress and acceptance intervals,
live burst delay, long tasks, cold open, heap endpoint, HTTP refusals and complete export equality.

Accept only with passing safety controls and exports, at least 15% shorter delayed catch-up, no
unexplained loss of writer progress, and no new multi-second foreground task. Repeat one matched
pair if delayed baseline drifts >15% from 193.074 seconds or gain is ambiguous (<15%). Local timing
is a regression guard: investigate/repeat if >15% slower than 79.125 seconds. Small serial samples
are engineering evidence, not phone/production estimates or population confidence intervals.
