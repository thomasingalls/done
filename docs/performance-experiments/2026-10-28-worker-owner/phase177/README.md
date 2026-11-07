# Phase177 — actual Worker receiving, original network login and Window acknowledgment

2026-10-29. Transport original frames in64KiB parts, retaining native10MiB wire and4MiB staged bounds.
Closed schemas, exact ordering/offset/count/done, one-shot consumption and erasure cover interruption.
The Worker executes original prepareRead/fetchPage/receivePage verification and durable persistence;
a scoped incarnation/monotone flight streams only the original verified update bytes. The real
Window controller.prepare stages them into its existing FIFO. Final receiveFinish retains the
actual fresh native task through receiveApply/Window acknowledgment before completedRead advances.
Unknown/missing HTTP data stays unrecorded. Replays, wrong phases and uncertain handoffs refuse/drain.

Optional original NetworkLogin is constructed inside the Worker and keeps network session/grant
secrets there. Its original signed challenge is fulfilled by the Window passkey endpoint and checked
by existing crypto; no extra passkey assertion is needed. Existing opaque Page login/promotion/
recovery objects remain refused pending genuine ceremony ownership. Baseline and manual authority
refresh share the actual flushed Window fence/native reservation/fresh-context/rebind/ACK mechanism.
This explicit manual bridge can hold the FIFO during HTTP; it is not the final automatic sync path.

Full2375unit cases/one existing skip,81focused cases,98metadata and type/lint/format pass.20 rebuilt
actual-account Chromium cases pass, retaining all17 old Worker/Page walkthroughs. Three new cases
use a separate joined Page sender: wait until each new SourceCapsule id/index is covered by verified
spool positions at/below acceptedThrough, close that sender, receive real signed updates in the
Worker, retain local Undo and cold-open exact writing on the original Page path; mutate a confirmed
nonempty page signature and refuse without progress; drop the actual receiveApply call, close/drain
the genuine native flight and cold-replay its committed original exactly once. Network cases use
one original passkey assertion. No shared memory or source transforms. Every included source body
matches the checkout.32 owned containers are absent; private factors/profiles are excluded.

Keep all failed attempts: an invalid private-server/continuation combination refused before startup;
a peer context lacked baseURL; its physical Local identity differed from logical Account identity;
a late fetch patch did not affect ScopedTransport's captured transport; an empty page mutation did
not establish nonempty-signature failure; an idle sender could still be waiting for a publication
batch, so acceptedThrough advancing was insufficient to prove the new edit uploaded. The final
source-frame coverage check replaces that inadequate test predicate, without a fixed delay. Earlier
attempt logs/receipts/hashes remain; not all earlier private build/driver preimages were retained, so
only the final build has the complete emitted-source identity check. The initial large-byte unit
comparison timed out at the unchanged5s deadline: exact native Buffer equality avoids JS structural
comparison overhead. Initial type/syntax/audit declaration-count errors also remain in the packet.

Independent audit retains entire native receive/mirror-material/rebind/runtime files byte-for-byte,
all17 original native cases in14 top-level declarations including loops,198crypto domain assignments
and every prior obligation row.436runtime sources;957 obligations/411 unresolved. Two new test files
remain required/uncredited. No default app activation or performance credit. Next fix the concrete
joined-mirror physical/logical scope assumption, then original sync/workspace composition, automatic
preparation, fresh ceremonies, Local/app/offline ownership. Only then unchanged16ms input/2.5s peer/
all-marker/30s measurements. No preview/staging/signing/push/release or service automation.
