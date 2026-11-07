# Phase 328 — distinguish the running and completed preservation logs

Evidence bookkeeping only. Patch327 remains immutable; this sequential correction changes no application, test, guard, run, source identity, trace, gate or measurement.

The phase327 preservation script captured its own redirected log before its final print, when that log was empty. A later step added the completed log at the same compressed destination without removing the earlier index entry. The index therefore had both empty and final hashes against one overwritten copy path. The final verification caught the mismatch; the freezer had already finished before it could be stopped.

Retain the empty snapshot at a distinct path, explicitly marked reconstructed from its recorded empty raw/gzip hashes, and keep the completed log at its final path. Deterministic gzip bytes match the original recorded compressed hash exactly. Recheck all212 source/raw/compressed copies independently. The earlier209-copy check described the pre-print snapshot; the corrected check now covers the final212 entries. No scientific result or failure is replaced or regraded. Patch326 and patch327 hashes stay unchanged. No landing, hardening, credit or release work.
