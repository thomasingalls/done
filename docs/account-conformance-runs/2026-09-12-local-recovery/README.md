# Authenticated read-only partial Local recovery — F-09

Eight stages pass: 1,007 unit tests (including 30 generated damage/journal histories), actual packaged
UI recovery/cancellation, custody, exact-coverage trim and packaged migration/privacy regressions.
All 909 source pins agree. The custody and trim subcampaigns write their own output directories;
their complete evidence is copied under `custody-evidence/` and `trim-evidence/`. Expected faulty
implementations fail their controls; the real implementation passes. Large/raw JSON is losslessly
gzipped with original names/hashes recorded in each `archive-files.json`.

The reader authenticates the ready Local claim and custody under exclusive slot ownership. It does
not create a normal writer, reserve nonces, encrypt, reset, restore or delete. Individually readable
content and journal frames are replayed into a detached document. Damaged frames are skipped;
missing dependencies are reported. All ZIPs explicitly say partial and cannot establish completeness.
The normal editor stays refused. Missing/corrupt custody, Account, unsupported formats or exceeded
salvage budgets refuse and retain originals. The UI clears the factor field and supports cancellation.

The native test damages only synthetic encrypted storage, observes normal refusal, cancels a recovery
queued behind another tab's exclusive permit, then uses the actual UI to download a ZIP. Independent
Python decoding finds the exact input writing, no factor and the incomplete report. The neutral logical
inventory is identical before/after; no writing/factor appears in scanned persistence or diagnostics.
Generated tests independently vary damaged bases and journal dependencies and compare all retained
carriers. This is not general Account recovery, custody-loss recovery or arbitrary-schema salvage.
No personal profile/app/recovery files or services were used.
