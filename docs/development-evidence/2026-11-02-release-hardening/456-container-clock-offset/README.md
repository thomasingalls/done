# Phase 456 — same-container clock sample without an app run

Start the exact454APIcontainer through its unchanged runtime, with the same image,
resource bounds and gateway child. Open no browser and send no application HTTP
request. A persistent docker-exec Node observer replies with Date.now, bracketed
by host Date.now. Sixteen samples begin60msafter runtime startup and have1–4ms
round trips. Container minus host midpoint median is−7ms(range−7.5to−6.5ms);
the conservative rounding-inclusive bracket intersection is[−8,−6]ms.

The container is behind the Mac in this fresh run. This does not confirm a lead
in455or determine yesterday's failed inequality. Preserve that uncertainty. No
clock, app source, stored data, trust or deadline change; no timed gate credit.

The operator explicitly approves one shared2minuteallowance only for excessive
future lifetime at six named boundaries. Expired-at-now checks, lifetime constants,
signatures and other predicates stay exact. Next implement and unit-test that
bounded product decision, then rerun the preserved seed on the new civil date.
