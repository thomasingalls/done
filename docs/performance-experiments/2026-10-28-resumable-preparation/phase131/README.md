# Phase131 — one inventory representation for both byte-budget checks

The read-only runner previously tested raw pretty JSON's size, whereas --record tested the
canonical formatted snapshot. New preparation test registrations cross700kB only in the discarded
raw representation; the actual retained snapshot is~662kB. Both modes now enforce the existing
700000-byte budget on the snapshot they actually use. Independent full inventory agreement remains
required in read-only mode; --record retains its explicit-write authority. No budget increase or
obligation removal. Runtime, crypto, service automation and performance gates are unchanged.

13 focused/inherited regression cases pass. The new real-runner controls test read-only success at
the formerly failing boundary, an oversized saved representation still refusing, and a smaller
but drifted snapshot still refusing. They fault only the child process's read result, never the
repo snapshot, and verify unchanged bytes afterward. Initial old-runner failure and one diagnostic
regex mismatch in the new test remain retained. New test stays uncredited;931 obligations/385
unresolved, all previous obligations preserved. This is bookkeeping repair, no release preparation.

Final13 ordinary checks pass, including authority, crypto/source census, inventory/manifest,
350KiB initial-JS budget, built-origin isolation and receipt-backed traceability. General
qualification remains blocked. The diagnostic build has resume/local automation enabled for checks,
service automation explicitly0; no release artifact, signed source or activation claim.
