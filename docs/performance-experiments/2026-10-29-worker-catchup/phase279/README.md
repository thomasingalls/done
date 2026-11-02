# Phase 279 — deep single-entry request trace

2026-10-30. Original joined actor1 case at exact275 client/released flags/default16session64process
runs once and fails original30s at451received/zero receive failures. No normal comparison or date
refresh. Full bounded trace has249HTTPrequests, zero dropped/malformed;230readHTTPcalls carry589
signed requests, all limit1.120batchHTTPcalls:110status200/10status429.110singleHTTPcalls:109status200/
one pending at snapshot. Hot publisher480signed requests spans requested after5..444; remaining109
are other publishers (not all self). These are requested units, not completed-position counts.

Node request-start at and response headersAt retained for the complete trace, no response bodies.
Batch header wallp50=44.240ms/p95=65.969ms; singlep50=12.836ms/p95=54.062ms. Consecutive readHTTP
header-to-next-request wallgap p50=51.956ms/p95=304.994ms, with overlap permitted. These include
network, service, scheduler and verification waits; no exclusive CPU attribution. Trace starts
before owner opening, not exactly at the30s catch-up wait. No favorable retry or throughput claim.

The trace confirms single-entry requests remain even in four-request batching. Next bounded repair
must preserve all original signed request/page binding, per-entry signatures/links/coverage, native
atomic commit and readback, replayability, byte/record bounds and four-position fairness. It must
retain single-entry self reconciliation and cope with supported large entries without indefinite
retry. Durable receipt/replay currently supports only one entry, so enabling only a wider request
is incorrect. Old readers/evidence and current release/rollback boundaries need explicit handling.

Both own containers and browser processes are absent. Original failures/gates preserved, no
production limit/source change, release preparation, preview, computer use or personal data.
