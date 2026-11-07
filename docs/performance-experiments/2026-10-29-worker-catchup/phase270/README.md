# Phase270 — red regression for existing authenticated baseline projection

2026-10-30. Existing localBaselineReplay constructs authenticated logical recovery with leading
state{seq:0,gen:positive} at baseline decode/replay, not a new on-disk ciphertext record. Existing
copyAccountMirrorRecovery preserves that identity; existing Workerreader rejectsseq<1. Native269
failure maps exactly to that headerguard after actual covered-history removal. No check should
be skipped or sequence renumbered to hide this disagreement.

Nine new regression cases run against unchanged productparser: both valid leadingzero snapshot
cases fail at observedguard129, seven negative/disk cases pass. Include snapshotfragmented400k,
exacttail/journal/identity, originalmessagebounds/received-byte erasure; snapshot-onlyzero; rejected
updatezero/laterstatezero/repeatedzero/negative/fractional/zerogen; ordinarydiskrecordparser still
requirespositive. These are transport regressions after native authentication, not crypto mocks or
replacement for actualcold maintenancecase. Newfile only formatted, bytes held with this checkpoint
until repair phase so cumulativecode does not acquire standalone failingtests. Oldtests untouched.

Repair bound: acceptseq0onlyforindex0state, retain all other integer/gen/shape/order/offset/size/
count/cancellation/lifetime checks and erasure. No change to producer/native verification, custody,
freshness/history/witness/commit, on-disk format, cursor/receipt/proof, synchronousjournal or mixed
owner fencing. After fix add these exact cases, full affectedchecks/bookkeeping and originalnative
maintenancecold walkthrough. Keep old failure evidence and original15s/180s deadlines. Contextcold
repeatedbaselineperf remains separate. No releaseprep/sign/push/deploy/CUA/phone/realdata.
