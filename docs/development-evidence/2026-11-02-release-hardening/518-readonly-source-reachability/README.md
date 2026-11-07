# Phase 518 — read-only reachability before a carryover decision

**Date:** 2026-11-07. Evidence and documentation only. No timed run, app run, new journey, app change, gate change, signing, push or deployment. The operator replaced 517’s blanket 36-journey rerun handoff with this audit and a stop. Earlier phase records remain unchanged. No carryover or acceptance credit is granted here.

## Independent byte proof

Both ordinary manifests contain 125 files. Every original manifest size and SHA-256 matches the saved served bytes. Logical filenames and references are normalized using the exact manifest filename correspondence, not arbitrary identifiers. Every date replacement is an individually checked `VITE_APP_COMMIT_DATE` property. The two preparation-verifier values were independently recomputed from the respective frozen source roots and release flags (467 inputs each):

- 470: `2b63e3f7abb51e0f550607902f93969e09a4ec1b409088762b3514edfd6bb244`.
- 510: `d16587590c27b534a893b1b41f2777c8f04ef12f5269a4914c0769a8c8188fbd`.

After those declared normalizations: 32 files are raw-identical; 40 more executable/other assets are identical; seven executable files have exactly one insertion each. Removing that exact insertion reproduces the old normalized bytes, with no other difference. They are **six Worker files plus `deviceDataRemoval`**, rather than seven files named Worker.

| Logical asset | Exact added minified bytes |
|---|---|
| `assets/accountOwner.worker-HASH.js` | `a&&y(),` |
| `assets/deviceDataRemoval-HASH.js` | `a&&y(),` |
| `assets/enrollmentOwner.worker-HASH.js` | `a&&T(),` |
| `assets/firstDeviceOwner.worker-HASH.js` | `i&&w(),` |
| `assets/localOwner.worker-HASH.js` | `a&&y(),` |
| `assets/localStartup.worker-HASH.js` | `a&&y(),` |
| `assets/recoveryOwner.worker-HASH.js` | `a&&y(),` |

The insertion is the source statement `if (logical) clearView();`. The source inverse proof removes exactly its two comment lines and that statement from frozen 510 `contentStore.ts` to recover frozen 470 bytes. The 45 source maps are derived outputs: their source lists match, and only `contentStore.ts` source content changes, by those same exact three lines. Mapping/name/output-file changes are recorded separately. The service worker’s generated version, precache paths and integrity values also change; every integrity value matches actual saved file bytes, its precache and integrity key sets agree, and its executable template is byte-identical after replacing those three generated declarations. This does not pretend raw `sw.js` or source maps are identical. Extra native-tool assets are excluded from the **ordinary** 125-file manifests.

`bundle-proof.json`, `derived-proof.json` and `verifier-identities.json` preserve the full inputs, normalizations, offsets, inverse proof and digests. A slow first diff utility was interrupted; a standalone service-worker regeneration produced a different version because function `toString()` after Node strip-types differs from the bundler’s transform. Those utility attempts are retained, not app failures. The final proof verifies the exact generated template and every precache hash instead.

## Reachability contract

The new catch is on the warm path and requires an existing `baselineReuse`. The latter is seeded only after a full authenticated read with `metadata.reduced()` true; the metadata accessor recognizes only `history === "baseline-plus-suffix"`. An installed **complete** baseline is insufficient. The catch also requires a nonempty logical projection from `advance`, followed by a throwing fresh check. A reduced end state establishes possible reachability, not evidence that this catch actually ran.

A new `createContentOwner` starts with `openedView`, `warm` and `baselineReuse` unset. Its first load cannot take the warm branch and performs a full read. `clearView()` discards both continuation and retained projection, so the next successful load must reauthenticate from storage. The fresh-check, exact-evidence and erasure guards are retained.

## All 24 non-maintenance journeys

The ten unique serialized fixture start states were restored **only into disposable inspection copies**, using the already pinned storage serializer, then read natively. The 33 saved native end profiles were copied before opening them. No original browser profile was opened. The existing native inspector’s `savedDigest` function was reused unchanged, alongside the existing native `meta/counter` read seam from the native-resumable case. All transactions used by inspection are readonly; all network/app requests were fulfilled by an inert page, with service workers blocked. Every source storage-file inventory is byte-identical before/after, all 43 native before/after digests match, and no page was service-worker controlled. This is syntax/metadata observation, not new authentication or permission.

All ten start states are revision **0**, counter v2, complete history. They are referenced individually for every journey in `nonmaintenance-reachability.json`. The full native observations and byte inventories are in `native-inspection.json`, `inspection-plan.json` and the per-profile source inventories. Original codes and writing are not emitted by the observer.

`0/C` = revision 0, complete; `1/C` = revision 1, complete; `1/R` or `2/R` = baseline-plus-suffix.

| Run | Start actors (all 0/C) | Every saved end | Finding |
|---|---|---|---|
| 474-r1-native-context | H0 | main: 1/C | complete baseline; reduced gate false |
| 474-r1-native-resumable | H0 | main: 2/R | reduced-path candidate |
| 474-r1-native-deep | H1, H0 | main: 0/C | saved states exclude reduced path; ephemeral end gap |
| 474-r2-native-context | H0 | main: 1/C | complete baseline; reduced gate false |
| 474-r2-native-resumable | H0 | main: 2/R | reduced-path candidate |
| 474-r2-native-deep | H1, H0 | main: 0/C | saved states exclude reduced path; ephemeral end gap |
| 474-r3-native-context | H0 | main: 1/C | complete baseline; reduced gate false |
| 474-r3-native-resumable | H0 | main: 2/R | reduced-path candidate |
| 474-r3-native-deep | H1, H0 | main: 0/C | saved states exclude reduced path; ephemeral end gap |
| 475-r1-late-normal | H1, H2 | H1: 0/C; H2: 0/C | saved states exclude reduced path |
| 475-r1-late-withheld | H1, H2 | H1: 0/C; H2: 0/C | saved states exclude reduced path |
| 475-r2-late-normal | H1, H2 | H1: 0/C; H2: 0/C | saved states exclude reduced path |
| 475-r2-late-withheld | H1, H2 | H1: 0/C; H2: 0/C | saved states exclude reduced path |
| 475-r3-late-normal | H1, H2 | H1: 0/C; H2: 0/C | saved states exclude reduced path |
| 475-r3-late-withheld | H1, H2 | H1: 0/C; H2: 0/C | saved states exclude reduced path |
| 477-r1-fairness | H0, H1, H2, H3, H4, H5, M0, M1, Q0, Q1 | Q0: 1/R; Q1: 0/C | reduced-path candidate; ephemeral end gap |
| 477-r2-fairness | H0, H1, H2, H3, H4, H5, M0, M1, Q0, Q1 | Q0: 1/R; Q1: 0/C | reduced-path candidate; ephemeral end gap |
| 477-r3-fairness | H0, H1, H2, H3, H4, H5, M0, M1, Q0, Q1 | Q0: 1/R; Q1: 0/C | reduced-path candidate; ephemeral end gap |
| 478-r1-goals-desktop | H2 | main: 0/C | saved states exclude reduced path |
| 478-r1-goals-mobile4x | H2 | main: 0/C | saved states exclude reduced path |
| 478-r2-goals-desktop | H2 | main: 0/C | saved states exclude reduced path |
| 478-r2-goals-mobile4x | H2 | main: 1/R | reduced-path candidate |
| 478-r3-goals-desktop | H2 | main: 1/R | reduced-path candidate |
| 478-r3-goals-mobile4x | H2 | main: 1/R | reduced-path candidate |

**Nine positive reduced-path candidates:** all three native-resumable runs; all three fairness runs; Goals `r2-mobile4x`, `r3-desktop`, and `r3-mobile4x`. The native-resumable case explicitly removes history before fresh input and Undo/Redo. The other reduced end states do not identify exactly when reduction occurred; saved statuses were not retained for those Goals/fairness owners. They cannot be cleared by this audit.

The three native-context runs violate the literal revision-zero condition, but remain complete-history v3 baselines, installed explicitly by their case. They cannot seed the reduced warm continuation, so they are not reduced-path candidates. Twelve runs satisfy the literal all-saved-states-at-zero condition.

**Saved-profile coverage limits:** the three native-deep runs save the receiving browser’s end (all 0/C), but not their ephemeral H0 publisher’s end. Fairness saves Q0/Q1 ends; H0–H5 and M0/M1 are ephemeral and have no saved end snapshots. Their start states are inspected; their absent ends are not manufactured or assumed unreduced. Fairness is already in the nine positive candidates. The three native-deep runs therefore have a separate whole-journey exclusion gap; this audit does not declare their unsaved publisher histories unreachable. The operator can decide how to treat that gap.

## All 12 maintenance journeys

The six old-maintenance records are phase 470’s first normal plus phase 471’s remaining five; the six grown records are phase 472’s accepted runs, including its preserved harness retry. No attempt is dropped or rerun. All recorded writer installation starts follow both the last measured key and the latest peer-marker appearance. The six grown reader installation starts also follow both. The six old readers’ complete saved presentation traces through measured traffic have no installation, readback or completion event and no overflow; their later completion time was not captured, so no exact old-reader commit timestamp is invented.

The source emits `installing` immediately before `removePlannedLocalHistory` and `readback` after it returns. `complete` is withheld until removal succeeds. The table uses those saved presentation observations, not a claimed IndexedDB transaction timestamp. Original renderer/host clock brackets, all absolute timestamps, all three marker appearances and full stage transitions remain in the referenced results. The multi-second separations are reported without sub-millisecond timing claims.

| Run | Writer installing after last key / peer marker (s) | Reader installing after last key / peer marker (s) |
|---|---:|---:|
| 470-r1-old-maintenance-normal | 26.084 / 25.356 | no install through measured traffic |
| 471-r1-old-maintenance-withheld | 29.871 / 28.619 | no install through measured traffic |
| 471-r2-old-maintenance-normal | 34.594 / 33.800 | no install through measured traffic |
| 471-r2-old-maintenance-withheld | 33.119 / 31.355 | no install through measured traffic |
| 471-r3-old-maintenance-normal | 25.569 / 24.853 | no install through measured traffic |
| 471-r3-old-maintenance-withheld | 28.949 / 28.119 | no install through measured traffic |
| 472-r1-grown-normal-harness-retry | 32.860 / 31.897 | 39.128 / 38.165 |
| 472-r1-grown-withheld | 35.405 / 34.078 | 61.589 / 60.263 |
| 472-r2-grown-normal | 38.093 / 37.100 | 37.987 / 36.994 |
| 472-r2-grown-withheld | 37.468 / 35.526 | 61.353 / 59.411 |
| 472-r3-grown-normal | 31.542 / 30.694 | 43.238 / 42.390 |
| 472-r3-grown-withheld | 31.761 / 31.004 | 62.224 / 61.468 |

There is **no maintenance timing exception** in these saved traces. All 12 cases close the original contexts and create fresh same-profile owners for ordinary offline cold reopening, without storage reinjection. The old cases assert exact archives for both profiles; the grown cases additionally preserve each owner’s cold start/end and exact-archive outcome. The new owner’s first content load is a full read, as above. The old fixtures do not save the reader’s post-measurement maintenance completion trace; that is a coverage qualification, not a failed cold or timing predicate.

## One unmeasured effect of 508

**Post-reduction typing cost remains unmeasured:** how often continued typing on an already reduced device reaches the particular interruption after a nonempty logical advance, how often the resulting view discard forces full reauthentication, and the resulting input and peer latency. The statement does not run on every edit or on the first cold read. No numerical frequency, amortized cost or reduced-device typing performance is inferred from these old passes or from the new unit controls.

## Operator handoff — stop

No rerun is scheduled or started. The nine positive candidates and the three separate native-deep end-coverage gaps are the unresolved non-maintenance cases from this audit. The three complete-history native-context exceptions have a static exclusion; the maintenance timing traces meet the requested check with the coverage qualifications stated above. These are reachability findings, not waived gates, app failures, new performance passes or a declaration that the new catch ran. The operator decides whether and how to carry the 36 old passes onto source 510. That decision replaces 517’s blanket rerun next-step; 517 and all earlier evidence stay immutable.

Sequential documentation patch 518 follows 517. The real index stays empty. Stop for the operator; no release clearance is claimed.
