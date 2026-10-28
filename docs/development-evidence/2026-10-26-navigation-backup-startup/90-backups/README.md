# Phase90 — Backup cadence and quota recovery

Operator choice: one **verification cycle/hour**, including unfamiliar retained keepers; not one
individual download. New uploads remain prompt, with acknowledged receipts distinguished from verified
recovery points. Five-minute local checks cover only encrypted-copy length/SHA-256; no recovery private
key is added to the service. Exact remote readback still gates anchor credit and every prune.

A read quota pauses download/pruning until next UTC midnight, while new uploads continue. Other cap
classes conservatively pause provider work. Transient failures back off30s→1h. Failed verification
cannot be hidden by local-check success, and acknowledged uploads are not reuploaded merely because
readback failed. Lost upload replies retry the same ciphertext/name. Backoff is process-local; restart
re-verifies freshly, and can make one additional refused call. No provider cap/production config changed.

22 backup/maintenance/restore cases pass, including genuine age round trips, quota protocol response,
unknown/foreign namespaces, malformed auth/host, lost replies, corruption, unfamiliar keepers, native
shutdown and worker restart. The later cap integration adds assertions to the same existing pipeline
cases and passes7 cadence/pipeline cases. Five new cadence cases are not given aggregate qualification
credit: the new file retains an unresolved adapter obligation until separately reviewed. Two isolated
fault controls detect5min remote verification and bypassed cap backoff at the intended assertions.

A failed intermediate run exposed a Node type-strip incompatibility in a parameter-property; that
syntax was replaced with an explicit field. Another failed run lacked an actual unfamiliar retained
keeper in its new fixture; the keeper was added and the stronger three-read assertion retained.
Automatic review rejected reducing that assertion; no safe-pruning invariant was relaxed. Logs remain.

Health policy now distinguishes timely uploads from hourly verification. This deliberately permits
up to an hour of unverified new backups; failures can extend it and stay degraded. Plaintext transient
files are removed after encryption; only one private encrypted payload persists between ticks, then
is cleaned at replacement/shutdown. Restart reaps owned run-directories as before.

Development only. No release preparation, provider write, push or deployment.
