| Case | Time here, 5 runs, ms | Instrumented, 3 runs, ms | toEqual on a byte array of 1 KiB or more | toEqual on an object holding one | toEqual on smaller byte arrays | other toEqual |
|---|---|---|---|---|---|---|
| inboundStaleTurnControl.test.ts:4 | 1799 to 2029 (median 1843) | 1756 to 1767 | — | — | — | 0 ms (0%), 6 calls |
| inboundPageCodec.test.ts:26 | 1806 to 1829 (median 1810) | 1761 to 1773 | 864 ms (49%), 72 calls, up to 12,258 B | 843 ms (48%), 72 calls, up to 11,483 B | — | — |
| inboundMixedReplay.test.ts seed406 | 1233 to 1252 (median 1238) | 1220 to 1240 | — | — | 277 ms (22%), 874 calls, up to 389 B | — |
| inboundMixedReplay.test.ts seed407 | 1378 to 1399 (median 1381) | 1356 to 1380 | — | — | 297 ms (22%), 964 calls, up to 389 B | — |
| inboundMixedReplay.test.ts seed408 | 1157 to 1238 (median 1166) | 1144 to 1159 | — | — | 267 ms (23%), 866 calls, up to 389 B | — |
| workspaceAdmission.test.ts:1256 (account-snapshots) | 1026 to 1051 (median 1033) | 1014 to 1047 | — | — | — | 28 ms (3%), 5796 calls |
| workspaceAdmission.test.ts:1256 (account-text) | 918 to 946 (median 924) | 927 to 973 | — | — | — | 27 ms (3%), 5796 calls |
| workspaceAdmission.test.ts:1256 (local-handoff) | 908 to 945 (median 927) | 933 to 935 | — | — | — | 28 ms (3%), 5796 calls |
| workspaceAdmission.test.ts:1256 (local-snapshots) | 895 to 906 (median 901) | 888 to 911 | — | — | — | 27 ms (3%), 5796 calls |
| workspaceAdmission.test.ts:1256 (reference) | 1010 to 1024 (median 1016) | 1009 to 1013 | — | — | — | 30 ms (3%), 5796 calls |
| inboundMixedReaders.test.ts:124 | 1402 to 1430 (median 1418) | 1352 to 1393 | 939 ms (68%), 62 calls, up to 24,591 B | — | — | 0 ms (0%), 6 calls |
| preparationReceiptJournal.test.ts all72 | 1269 to 1362 (median 1306) | 1264 to 1292 | 850 ms (66%), 72 calls, up to 12,258 B | — | — | 1 ms (0%), 72 calls |
