# Phase 476 — restore actual fairness HTTP observations

The old fairness analyzer expects real http-result events. The hardened runtime
has no unshipped internal lab trace. Do not fill its events with an empty list
or turn absent observations into zero refusals. An isolated test-only HTTP
boundary observer now records actual status, exact request digest and bounded
content-free refusal fields. Its source is explicitly HTTP-response-boundary,
not service-internal trace. Request, response, status and callbacks pass through.
No app, canonical service, wire, limits, budgets or entry points change.

The fairness case/config and seven copied apparatus files are byte-identical to
phase461, and the original analyzer is byte-identical to frozen phase320. Its
trace-tag sanity assertion and all functional/metric guards remain. Historical
variant C is metadata for that analyzer; it does not enable a lab factor. Quiet
750ms and every release flag stay. This observer applies to fairness only.

Seven localhost controls pass: exact actual status/request hash/refusal,
binary/chunk/end bytes and callbacks, fragmented refusal, unbuffered successful
SSE-sized data, malformed refusal explicitly unavailable, observer failure
preserving HTTP and failing trace rather than returning zero, and a response
finishing before request end. The first sandbox controls failed EPERM and are
retained. The first actual-container preflight exposed the last request-end
ordering case; keep it, repair the observer and add the discriminating control.
The fresh actual-container preflight passes its declared404negative control,
request hash, no repeated trace and exact ordinary sw.js. This is no app run or
gate credit. Original API source/constraints remain exact by inverse-byte proof.

No timed journey here. Fairness will use this isolated boundary after the next
host handshake, with three replicates and the original guard/metric formulas.
The completed candidate remains27/36. Correct one phase475narrative typo here:
its README says116–118withheld notifications, while the unchanged raw records
and summary correctly contain120/117/116(range116–120). Keep its frozen patch
and evidence bytes. No effect on fault exposure or predicates.

All private checks/failures and windowed host/power records remain behind hashes.
No source copies, evidence objects, commit, push, publication or deployment.
