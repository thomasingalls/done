# Phase236 — packaged Worker asset and offline compatibility

2026-10-29. Existing precache test flags two new legitimate public modules by substring:
privateDeliveryHttp and recoveryOwner.worker. Narrow only those two hashed /assets/*.js families.
Original existing-file, HTTP200, exact-byte, manifest/icon, private-page/tooling and map checks remain.
Independent rejected examples cover private/recovery/migration pages, both source-map counterparts,
unrelated private/binding modules and non-JS suffixes. No production change or build change235.

Before one failed/two passed; after all three original cases pass. Protected Local writing accepts,
locks, cold reopens offline, admits another edit and cold reopens that edit at both public entries.
Same deadlines/cases; no old assertions removed. No qualification or performance credit. Remaining
old native outcomes and final boundary review next, then original16ms/2.5s/30s measurements.
No real staging/sign/push, preview8443, release/deploy, service automation, CUA/phone/real data.
